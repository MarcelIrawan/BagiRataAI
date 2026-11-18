/**
 * BagiRata domain module (simplified).
 *
 * Model: Tim → members, holderId, openingBalances, notes[], setorans[]
 * No Periode, no cascading balances, no handover log.
 * All arithmetic is pure: no DOM, no localStorage, no Intl, no clock, no network, no imports.
 */

export const SCHEMA_VERSION = 3;
export const STORAGE_KEY = 'bagirata.v3';
export const LEGACY_STORAGE_KEY = 'bagirata.v2';

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** Money is whole rupiah. Anything else is read as zero. */
export function rupiah(value) {
  return isFiniteNumber(value) ? Math.round(value) : 0;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function refusals(errors) {
  const list = Array.isArray(errors) ? errors : [errors];
  return { ok: false, errors: list, message: list.map((e) => e.message).join(' ') };
}

export function accepted(tim, extra = {}) {
  return { ok: true, tim, ...extra };
}

function fail(code, message, details) {
  return { ok: false, code, message, ...(details ? { details } : {}) };
}

/* ------------------------------------------------------------------ *
 * Records
 * ------------------------------------------------------------------ */

export function createStore(now) {
  return {
    version: SCHEMA_VERSION,
    tims: [],
    activeTimId: null,
    savedAt: now || null,
  };
}

export function findTim(store, timId) {
  return (store.tims || []).find((t) => t.id === timId) || null;
}

export function upsertTim(store, tim) {
  const next = clone(store);
  next.tims = next.tims || [];
  const index = next.tims.findIndex((t) => t.id === tim.id);
  if (index >= 0) next.tims[index] = tim;
  else next.tims.push(tim);
  return next;
}

export function removeTim(store, timId) {
  const next = clone(store);
  next.tims = (next.tims || []).filter((t) => t.id !== timId);
  if (next.activeTimId === timId) next.activeTimId = null;
  return next;
}

export function findAnggota(tim, memberId) {
  return (tim.members || []).find((m) => m.id === memberId) || null;
}

export function holder(tim) {
  return findAnggota(tim, tim.holderId);
}

export function isHolder(tim, memberId) {
  return tim.holderId === memberId;
}

export function activeMembers(tim) {
  return (tim.members || []).filter((m) => m.status !== 'keluar');
}

/* ------------------------------------------------------------------ *
 * Creation
 * ------------------------------------------------------------------ */

export function createAnggota({ id, name, colorIndex, joinedAt }) {
  return {
    id,
    name: String(name || '').trim(),
    colorIndex: Number.isInteger(colorIndex) ? colorIndex : 0,
    status: 'active',
    joinedAt: joinedAt || null,
    leftAt: null,
  };
}

/**
 * A Tim starts with members, a holder, optional opening balances, and empty notes/setorans.
 */
export function createTim({ id, name, members, holderId, now, openingBalances }) {
  const roster = (members || []).map((m, index) =>
    createAnggota({
      id: m.id,
      name: m.name,
      colorIndex: Number.isInteger(m.colorIndex) ? m.colorIndex : index,
      joinedAt: m.joinedAt || now,
    })
  );
  const tim = {
    id,
    name: String(name || '').trim(),
    members: roster,
    holderId,
    notes: [],
    setorans: [],
    openingBalances: openingBalances || {},
    archivedAt: null,
    createdAt: now,
  };
  return tim;
}

/* ------------------------------------------------------------------ *
 * Nota arithmetic
 * ------------------------------------------------------------------ */

export function itemsSubtotal(items) {
  return (items || []).reduce((sum, item) => sum + itemLineTotal(item), 0);
}

/** One line's money. The UI must never multiply qty by price itself. */
export function itemLineTotal(item) {
  return rupiah(item.qty) * rupiah(item.price);
}

export function notaGrandTotal(nota) {
  return (
    itemsSubtotal(nota.items) +
    rupiah(nota.tax) +
    rupiah(nota.service) -
    rupiah(nota.discount)
  );
}

/** The Pembayar of a Nota; a Nota written before payer lists existed is Holder-paid. */
export function paidByOf(nota, tim) {
  if (Array.isArray(nota.paidBy) && nota.paidBy.length > 0) return nota.paidBy;
  return [{ memberId: tim.holderId, amount: notaGrandTotal(nota) }];
}

export function paidByTotal(nota) {
  return (nota.paidBy || []).reduce((sum, row) => sum + rupiah(row.amount), 0);
}

/**
 * Per-Anggota breakdown of one Nota: item share plus proportional
 * tax/service/discount. Each member's total is rounded; the leftover rupiah
 * (Sisa Pembulatan) goes to the Holder when the Holder consumed something on
 * this Nota, otherwise to the first Anggota in roster order.
 */
export function notaBreakdown(nota, tim) {
  const items = nota.items || [];
  const subtotal = itemsSubtotal(items);
  const tax = rupiah(nota.tax);
  const service = rupiah(nota.service);
  const discount = rupiah(nota.discount);
  const grandTotal = subtotal + tax + service - discount;

  const shareByMember = new Map();
  for (const item of items) {
    const assigned = item.assignedTo || [];
    if (assigned.length === 0) continue;
    const share = itemLineTotal(item) / assigned.length;
    for (const memberId of assigned) {
      shareByMember.set(memberId, (shareByMember.get(memberId) || 0) + share);
    }
  }

  const rows = (tim.members || [])
    .filter((m) => shareByMember.has(m.id))
    .map((member) => {
      const itemShare = shareByMember.get(member.id);
      const proportion = subtotal > 0 ? itemShare / subtotal : 0;
      const rowTax = tax * proportion;
      const rowService = service * proportion;
      const rowDiscount = discount * proportion;
      return {
        memberId: member.id,
        subtotal: itemShare,
        tax: rowTax,
        service: rowService,
        discount: rowDiscount,
        total: Math.round(itemShare + rowTax + rowService - rowDiscount),
      };
    });

  const allocated = rows.reduce((sum, row) => sum + row.total, 0);
  const residual = grandTotal - allocated;
  if (residual !== 0 && rows.length > 0) {
    const consumedIds = rows.map((row) => row.memberId);
    const recipientId = consumedIds.includes(tim.holderId) ? tim.holderId : rows[0].memberId;
    rows.find((row) => row.memberId === recipientId).total += residual;
  }

  return { rows, itemsSubtotal: subtotal, grandTotal };
}

/** Konsumsi of one Anggota: sum of their share across all Nota. */
export function konsumsi(tim, memberId) {
  return (tim.notes || []).reduce((sum, nota) => {
    const { rows } = notaBreakdown(nota, tim);
    const row = rows.find((r) => r.memberId === memberId);
    return sum + (row ? row.total : 0);
  }, 0);
}

/** Kontribusi of one Anggota: signed Setoran + paidBy amounts. */
export function kontribusi(tim, memberId) {
  const deposits = (tim.setorans || [])
    .filter((d) => d.memberId === memberId)
    .reduce((sum, d) => sum + rupiah(d.amount), 0);
  const paid = (tim.notes || []).reduce((sum, nota) => {
    const rows = paidByOf(nota, tim).filter((row) => row.memberId === memberId);
    return sum + rows.reduce((s, row) => s + rupiah(row.amount), 0);
  }, 0);
  return deposits + paid;
}

export function setoranTotal(tim, memberId) {
  return (tim.setorans || [])
    .filter((d) => d.memberId === memberId)
    .reduce((sum, d) => sum + rupiah(d.amount), 0);
}

/** Saldo Awal: hand-entered on Tim creation, never changes. */
export function saldoAwal(tim, memberId) {
  const value = (tim.openingBalances || {})[memberId];
  return isFiniteNumber(value) ? rupiah(value) : 0;
}

/** Running Saldo: Saldo Awal + Konsumsi - Kontribusi. */
export function saldoNow(tim, memberId) {
  return saldoAwal(tim, memberId) + konsumsi(tim, memberId) - kontribusi(tim, memberId);
}

/** Settlement rows for the whole Tim (all active members). */
export function settlementRows(tim) {
  const participants = activeMembers(tim);
  return participants.map((member) => ({
    memberId: member.id,
    name: member.name,
    status: member.status,
    isHolder: member.id === tim.holderId,
    saldoAwal: saldoAwal(tim, member.id),
    konsumsi: konsumsi(tim, member.id),
    kontribusi: kontribusi(tim, member.id),
    saldo: saldoNow(tim, member.id),
    handEnteredAwal: saldoAwal(tim, member.id) !== 0,
    source: 'live',
  }));
}

/** Live running balances for the whole roster at the current position. */
export function currentBalances(tim) {
  return (tim.members || []).map((member) => ({
    memberId: member.id,
    name: member.name,
    status: member.status,
    isHolder: member.id === tim.holderId,
    saldoAwal: saldoAwal(tim, member.id),
    konsumsi: konsumsi(tim, member.id),
    kontribusi: kontribusi(tim, member.id),
    saldo: saldoNow(tim, member.id),
  }));
}

/**
 * Holder Net: every other Anggota's positive Saldo minus every Kredit.
 * Running, Tim-wide; the Holder's own Konsumsi is not a debt.
 */
export function holderNet(tim) {
  return (tim.members || [])
    .filter((m) => m.id !== tim.holderId)
    .reduce((sum, m) => sum + saldoNow(tim, m.id), 0);
}

/** Sum of positive balances from non-Holders, for display alongside Holder Net. */
export function outstandingAt(tim) {
  let owed = 0;
  let credit = 0;
  for (const member of tim.members || []) {
    if (member.id === tim.holderId) continue;
    const saldo = saldoNow(tim, member.id);
    if (saldo > 0) owed += saldo;
    else if (saldo < 0) credit += Math.abs(saldo);
  }
  return { owed, credit };
}

/**
 * Kas Holder: signed Setoran across the whole Tim minus the amount the Holder
 * personally contributed as Pembayar. Tim-wide.
 */
export function kas(tim) {
  let total = 0;
  for (const deposit of tim.setorans || []) total += rupiah(deposit.amount);
  for (const nota of tim.notes || []) {
    for (const row of paidByOf(nota, tim)) {
      if (row.memberId === tim.holderId) total -= rupiah(row.amount);
    }
  }
  return total;
  }

  /**
   * Cara Bayar Paling Ringkas: greedy largest-debtor / largest-creditor
   * matching. Returns [] when no debtor and creditor pair exists.
   */
  export function minimalTransfers(rows) {
    const debtors = (rows || [])
      .filter((row) => row.saldo > 0)
      .map((row, order) => ({ memberId: row.memberId, name: row.name, amount: row.saldo, order }))
      .sort((a, b) => b.amount - a.amount || a.order - b.order);
    const creditors = (rows || [])
      .filter((row) => row.saldo < 0)
      .map((row, order) => ({ memberId: row.memberId, name: row.name, amount: -row.saldo, order }))
      .sort((a, b) => b.amount - a.amount || a.order - b.order);

    if (debtors.length === 0 || creditors.length === 0) return [];

    const transfers = [];
    let d = 0;
    let c = 0;
    while (d < debtors.length && c < creditors.length) {
      const amount = Math.min(debtors[d].amount, creditors[c].amount);
      if (amount > 0) {
        transfers.push({ fromId: debtors[d].memberId, toId: creditors[c].memberId, amount });
      }
      debtors[d].amount -= amount;
      creditors[c].amount -= amount;
      if (debtors[d].amount === 0) d += 1;
      if (creditors[c].amount === 0) c += 1;
    }
    return transfers;
  }

  /* ------------------------------------------------------------------ *
   * Write-time validity
   * ------------------------------------------------------------------ */

  export function validateNota(tim, nota) {
  const errors = [];
  const items = nota.items || [];

  if (items.length === 0) {
    errors.push({ code: 'NOTA_NO_ITEMS', message: 'Nota harus punya minimal satu item.' });
  }

  const participantIds = new Set(activeMembers(tim).map((m) => m.id));
  const withoutPemilih = items.filter((item) => (item.assignedTo || []).length === 0);
  if (withoutPemilih.length > 0) {
    errors.push({
      code: 'NOTA_ITEM_NO_PEMILIH',
      message:
        `${withoutPemilih.length} item belum punya pemilih. ` +
        'Gunakan "bagi rata ke semua peserta" untuk membagikannya.',
      count: withoutPemilih.length,
    });
  }

  for (const item of items) {
    for (const memberId of item.assignedTo || []) {
      if (!participantIds.has(String(memberId))) {
        errors.push({
          code: 'NOTA_PEMILIH_NOT_PARTICIPANT',
          message: 'Ada item yang dibebankan ke orang yang bukan anggota aktif.',
          memberId,
        });
      }
    }
  }

  const grandTotal = notaGrandTotal(nota);
  if (grandTotal < 0) {
    errors.push({ code: 'NOTA_NEGATIVE_TOTAL', message: 'Total nota tidak boleh negatif.' });
  }

  const payers = nota.paidBy || [];
  const payerSum = paidByTotal(nota);
  if (payers.length === 0 && grandTotal !== 0) {
    errors.push({
      code: 'NOTA_NO_PEMBAYAR',
      message: 'Nota harus punya minimal satu pembayar.',
    });
  }
  for (const payer of payers) {
    if (!participantIds.has(String(payer.memberId))) {
      errors.push({
        code: 'NOTA_PEMBAYAR_NOT_PARTICIPANT',
        message: 'Ada pembayar yang bukan anggota aktif.',
        memberId: payer.memberId,
      });
    }
    if (rupiah(payer.amount) <= 0) {
      errors.push({
        code: 'NOTA_PEMBAYAR_AMOUNT',
        message: 'Jumlah pembayaran setiap pembayar harus lebih dari nol.',
      });
    }
  }
  const remainder = grandTotal - payerSum;
  if (remainder !== 0) {
    errors.push({
      code: 'NOTA_PEMBAYAR_UNFUNDED',
      message:
        remainder > 0
          ? `Pembayar masih kurang ${remainder} rupiah dari total nota.`
          : `Pembayar kelebihan ${-remainder} rupiah dari total nota.`,
      remainder,
    });
  }

  return { ok: errors.length === 0, errors };
}

export function addNota(tim, nota, now) {
  const validation = validateNota(tim, nota);
  if (!validation.ok) return refusals(validation.errors);

  const next = clone(tim);
  const record = {
    ...clone(nota),
    occurredAt: nota.occurredAt || now,
    createdAt: nota.createdAt || now,
  };
  next.notes.push(record);
  return accepted(next);
}

export function updateNota(tim, nota, now) {
  const existing = (tim.notes || []).find((b) => b.id === nota.id);
  if (!existing) return fail('NOTA_NOT_FOUND', 'Nota tidak ditemukan.');

  // Preserve paidBy from existing if not provided in update
  const notaToSave = {
    ...clone(nota),
    paidBy: nota.paidBy && nota.paidBy.length > 0 ? nota.paidBy : existing.paidBy,
    occurredAt: nota.occurredAt || existing.occurredAt,
    createdAt: existing.createdAt || now,
  };

  const validation = validateNota(tim, notaToSave);
  if (!validation.ok) return refusals(validation.errors);

  const next = clone(tim);
  const index = next.notes.findIndex((b) => b.id === nota.id);
  next.notes[index] = notaToSave;
  return accepted(next);
}

export function removeNota(tim, notaId) {
  const next = clone(tim);
  next.notes = next.notes.filter((b) => b.id !== notaId);
  return accepted(next);
}

export function addSetoran(tim, setoran, now) {
  const amount = rupiah(setoran.amount);
  if (amount === 0) return fail('SETORAN_ZERO', 'Jumlah setoran tidak boleh nol.');
  if (amount < 0 && !String(setoran.note || '').trim()) {
    return fail(
      'SETORAN_NOTE_REQUIRED',
      'Pengembalian (setoran negatif) wajib punya catatan: jelaskan uangnya untuk apa.'
    );
  }
  if (setoran.memberId === tim.holderId) {
    return fail(
      'SETORAN_HOLDER',
      'Setoran adalah uang antara Holder dan anggota lain. Holder tidak bisa jadi salah satu pihak.'
    );
  }
  const member = findAnggota(tim, setoran.memberId);
  if (!member) return fail('SETORAN_NOT_MEMBER', 'Anggota tidak ada di roster Tim ini.');
  if (member.status === 'keluar') {
    return fail('SETORAN_MEMBER_LEFT', 'Anggota yang sudah keluar tidak bisa setoran.');
  }

  const next = clone(tim);
  next.setorans.push({
    id: setoran.id,
    memberId: setoran.memberId,
    amount,
    note: String(setoran.note || '').trim(),
    at: setoran.at || now,
  });
  return accepted(next);
}

export function removeSetoran(tim, setoranId) {
  const next = clone(tim);
  next.setorans = next.setorans.filter((d) => d.id !== setoranId);
  return accepted(next);
}

/* ------------------------------------------------------------------ *
 * Roster lifecycle
 * ------------------------------------------------------------------ */

export function addAnggota(tim, anggota, now) {
  const name = String(anggota.name || '').trim();
  if (!name) return fail('ANGGOTA_NO_NAME', 'Nama anggota wajib diisi.');

  const next = clone(tim);
  const record = createAnggota({
    id: anggota.id,
    name,
    colorIndex: Number.isInteger(anggota.colorIndex) ? anggota.colorIndex : next.members.length,
    joinedAt: anggota.joinedAt || now,
  });
  next.members.push(record);
  return accepted(next);
}

export function setAnggotaStatus(tim, memberId, status, at) {
  const member = findAnggota(tim, memberId);
  if (!member) return fail('ANGGOTA_NOT_FOUND', 'Anggota tidak ditemukan.');

  if (status === 'keluar') {
    if (member.id === tim.holderId) {
      return fail(
        'ANGGOTA_IS_HOLDER',
        'Holder tidak bisa keluar sebelum menyerahkan peran Holder ke anggota lain.'
      );
    }
    const saldo = saldoNow(tim, memberId);
    if (saldo !== 0) {
      return fail(
        'ANGGOTA_SALDO_NOT_ZERO',
        `${member.name} masih punya saldo berjalan ${Math.abs(saldo)} rupiah ` +
          `(${saldo > 0 ? 'utang ke Holder' : 'kredit dari Holder'}). ` +
          'Selesaikan dulu dengan Setoran atau Pengembalian supaya tidak ada saldo yang hilang.',
        { saldo }
      );
    }
  }

  const next = clone(tim);
  const target = findAnggota(next, memberId);
  target.status = status === 'keluar' ? 'keluar' : 'active';
  target.leftAt = status === 'keluar' ? at : null;
  return accepted(next);
}

export function handoverHolder(tim, { toId, at, note }) {
  if (tim.holderId === toId) {
    return fail('HANDOVER_SAME', 'Orang itu sudah jadi Holder.');
  }
  const target = findAnggota(tim, toId);
  if (!target) {
    return fail('HANDOVER_NOT_ON_ROSTER', 'Holder baru harus anggota roster Tim ini.');
  }
  if (target.status === 'keluar') {
    return fail('HANDOVER_MEMBER_LEFT', 'Anggota yang sudah keluar tidak bisa menerima peran Holder.');
  }

  const next = clone(tim);
  next.holderId = toId;
  return accepted(next);
}

/* ------------------------------------------------------------------ *
 * Tim lifecycle
 * ------------------------------------------------------------------ */

export function archiveTim(tim, at) {
  const next = clone(tim);
  next.archivedAt = at;
  return accepted(next);
}

export function unarchiveTim(tim) {
  const next = clone(tim);
  next.archivedAt = null;
  return accepted(next);
}

/**
 * A Tim can be hard-deleted only while it holds no history.
 */
export function canDeleteTim(tim) {
  const notaCount = (tim.notes || []).length;
  const setoranCount = (tim.setorans || []).length;
  const handEntered = Object.values(tim.openingBalances || {}).some((value) => rupiah(value) !== 0);
  return {
    ok: notaCount === 0 && setoranCount === 0 && !handEntered,
    notaCount,
    setoranCount,
    handEntered,
  };
}

export function deleteTim(store, timId) {
  const tim = findTim(store, timId);
  if (!tim) return fail('TIM_NOT_FOUND', 'Tim tidak ditemukan.');
  const check = canDeleteTim(tim);
  if (!check.ok) {
    return fail(
      'TIM_HAS_HISTORY',
      'Tim yang punya nota, setoran, atau saldo awal manual tidak bisa dihapus. Arsipkan saja.'
    );
  }
  return { ok: true, store: removeTim(store, timId) };
}

/* ------------------------------------------------------------------ *
 * Migration: bagirata.v2 -> bagirata.v3 (flattens Periode)
 * ------------------------------------------------------------------ */

function migrateBill(team, bill) {
  const items = (bill.items || []).map((item) => ({
    id: item.id,
    name: item.name || 'Item',
    qty: rupiah(item.qty) || 1,
    price: rupiah(item.price),
    assignedTo: Array.isArray(item.assignedTo) ? [...item.assignedTo] : [],
  }));
  const nota = {
    id: bill.id,
    merchant: bill.merchant || 'Nota',
    items,
    tax: rupiah(bill.tax),
    service: rupiah(bill.service),
    discount: rupiah(bill.discount),
    occurredAt: bill.occurredAt || bill.createdAt || null,
    createdAt: bill.createdAt || null,
    paidBy: [],
  };
  // Data written before payer lists existed: the Holder paid the whole Nota.
  nota.paidBy = [{ memberId: team.holderId, amount: notaGrandTotal(nota) }];
  return nota;
}

function migrateDeposits(deposits) {
  return (deposits || []).map((deposit) => ({
    id: deposit.id,
    memberId: deposit.memberId,
    amount: rupiah(deposit.amount),
    note: deposit.note || '',
    at: deposit.createdAt || deposit.at || null,
  }));
}

function migrateTeam(team, index) {
  const createdAt = team.createdAt || null;
  const members = (team.members || []).map((member, memberIndex) =>
    createAnggota({
      id: member.id,
      name: member.name,
      colorIndex: Number.isInteger(member.colorIndex) ? member.colorIndex : memberIndex,
      joinedAt: createdAt,
    })
  );
  const holderId = team.holderId || (members[0] && members[0].id) || null;

  // Flatten all periods into one Tim, or use v1 team's direct bills/deposits
  const allBills = [];
  const allDeposits = [];
  let openingBalances = {};

  // v2: team has periods
  if (Array.isArray(team.periods) && team.periods.length > 0) {
    for (const periode of team.periods) {
      allBills.push(...(periode.bills || []).map((bill) => migrateBill({ holderId }, bill)));
      allDeposits.push(...migrateDeposits(periode.deposits));
      if (!openingBalances && periode.saldoAwalByMember) {
        openingBalances = { ...periode.saldoAwalByMember };
      }
    }
  }
  // v1: team has bills and deposits directly
  else {
    allBills.push(...(team.bills || []).map((bill) => migrateBill({ holderId }, bill)));
    allDeposits.push(...migrateDeposits(team.deposits));
    // v1 has no saldoAwalByMember concept
  }

  // Sort by occurredAt/createdAt
  allBills.sort((a, b) =>
    String(a.occurredAt || a.createdAt).localeCompare(String(b.occurredAt || b.createdAt))
  );
  allDeposits.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return {
    id: team.id,
    name: team.name || `Tim ${index + 1}`,
    members,
    holderId,
    notes: allBills,
    setorans: allDeposits,
    openingBalances,
    archivedAt: null,
    createdAt,
  };
}

/**
 * Pure function of the parsed old store. Idempotent: a v3 store comes back unchanged.
 * The old key is never touched by this function.
 */
export function migrateV2(oldStore) {
  if (!oldStore || typeof oldStore !== 'object') {
    return createStore(null);
  }
  if (oldStore.version === SCHEMA_VERSION || (Array.isArray(oldStore.tims) && oldStore.tims[0]?.notes)) {
    return oldStore;
  }

  // Migrate from v2 (with periods) or v1 (teams)
  let tims = [];
  if (Array.isArray(oldStore.tims)) {
    // v2 store with periods
    tims = oldStore.tims.map((team, index) => migrateTeam(team, index));
  } else if (Array.isArray(oldStore.teams)) {
    // v1 store
    const v2Store = { ...oldStore, tims: oldStore.teams };
    tims = v2Store.tims.map((team, index) => migrateTeam(team, index));
  }

  const activeTim = tims.find((t) => t.id === oldStore.activeTimId) || null;
  return {
    version: SCHEMA_VERSION,
    tims,
    activeTimId: activeTim ? activeTim.id : null,
    savedAt: null,
  };
}