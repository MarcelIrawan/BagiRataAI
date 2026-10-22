/**
 * BagiRata domain module.
 *
 * The single place where the Tim / Periode model, the v1 -> v2 migrator and
 * every money derivation live. It is pure: no DOM, no localStorage, no Intl,
 * no clock, no network, no imports. Callers pass in ids and timestamps; this
 * module only answers questions and returns numbers or refusals.
 *
 * Vocabulary follows GLOSSARY.md. Read docs/adr/ before changing a rule.
 */

export const SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'bagirata.v2';
export const LEGACY_STORAGE_KEY = 'bagirata.v1';

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
    activePeriodeId: null,
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
  if (next.activeTimId === timId) {
    next.activeTimId = null;
    next.activePeriodeId = null;
  }
  return next;
}

export function findAnggota(tim, memberId) {
  return (tim.members || []).find((m) => m.id === memberId) || null;
}

export function findPeriode(tim, periodeId) {
  return (tim.periods || []).find((p) => p.id === periodeId) || null;
}

export function periodeIndex(tim, periodeId) {
  return (tim.periods || []).findIndex((p) => p.id === periodeId);
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

/** The one open Periode of a Tim, or null. */
export function openPeriodeOf(tim) {
  return (tim.periods || []).find((p) => p.status === 'open') || null;
}

/** Index of the Periode that represents the Tim's current position. */
export function currentIndex(tim) {
  const periods = tim.periods || [];
  const open = periods.findIndex((p) => p.status === 'open');
  return open >= 0 ? open : periods.length - 1;
}

export function participantsOf(tim, periode) {
  const ids = (periode && periode.participants) || [];
  return (tim.members || []).filter((m) => ids.includes(m.id));
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
 * A Tim always starts with exactly one open Periode: creating a Tim is also
 * how you start recording costs (spec user story 2).
 */
export function createTim({ id, name, members, holderId, now, periodeId, label }) {
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
    periods: [],
    handovers: [],
    archivedAt: null,
    createdAt: now,
  };
  tim.periods.push(makePeriode({ id: periodeId, label, openedAt: now, participants: roster.map((m) => m.id) }));
  return tim;
}

export function makePeriode({ id, label, openedAt, participants }) {
  return {
    id,
    label: label ? String(label) : null,
    status: 'open',
    openedAt: openedAt || null,
    closedAt: null,
    participants: [...(participants || [])],
    bills: [],
    deposits: [],
    saldoAwalByMember: {},
    snapshot: null,
    reDerivedAt: null,
  };
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
 * this Nota, otherwise to the first Anggota in roster order (ADR-0006).
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

/** Konsumsi of one Anggota in one Periode. */
export function konsumsi(tim, periode, memberId) {
  return (periode.bills || []).reduce((sum, nota) => {
    const { rows } = notaBreakdown(nota, tim);
    const row = rows.find((r) => r.memberId === memberId);
    return sum + (row ? row.total : 0);
  }, 0);
}

/** Kontribusi of one Anggota in one Periode: signed Setoran + paidBy amounts. */
export function kontribusi(tim, periode, memberId) {
  const deposits = (periode.deposits || [])
    .filter((d) => d.memberId === memberId)
    .reduce((sum, d) => sum + rupiah(d.amount), 0);
  const paid = (periode.bills || []).reduce((sum, nota) => {
    const rows = paidByOf(nota, tim).filter((row) => row.memberId === memberId);
    return sum + rows.reduce((s, row) => s + rupiah(row.amount), 0);
  }, 0);
  return deposits + paid;
}

export function setoranTotal(periode, memberId) {
  return (periode.deposits || [])
    .filter((d) => d.memberId === memberId)
    .reduce((sum, d) => sum + rupiah(d.amount), 0);
}

/**
 * Saldo Awal: hand-entered for a Tim's first Periode, otherwise read from the
 * chain. Never stored on later Periodes (ADR-0013, ADR-0021).
 */
export function saldoAwal(tim, index, memberId) {
  if (index <= 0) {
    const first = (tim.periods || [])[0];
    if (!first) return 0;
    const value = (first.saldoAwalByMember || {})[memberId];
    return isFiniteNumber(value) ? rupiah(value) : 0;
  }
  return saldoAt(tim, index - 1, memberId);
}

export function handEnteredOpening(tim, memberId) {
  const first = (tim.periods || [])[0];
  if (!first) return 0;
  const value = (first.saldoAwalByMember || {})[memberId];
  return isFiniteNumber(value) ? rupiah(value) : 0;
}

/** Running Saldo at a Periode: Saldo Awal + Konsumsi - Kontribusi. */
export function saldoAt(tim, index, memberId) {
  const periode = (tim.periods || [])[index];
  if (!periode) return 0;
  return saldoAwal(tim, index, memberId) + konsumsi(tim, periode, memberId) - kontribusi(tim, periode, memberId);
}

export function saldoNow(tim, memberId) {
  const index = currentIndex(tim);
  return index < 0 ? 0 : saldoAt(tim, index, memberId);
}

/**
 * Settlement rows for a Periode.
 *
 * - open  -> recomputed live, labelled a preview by the UI.
 * - closed with a snapshot -> read from that snapshot (ADR-0004).
 * - closed and re-derived (an earlier Periode was reopened) -> Saldo Awal comes
 *   from the corrected chain, the Periode's own movement stays frozen from the
 *   snapshot, and the row says it was re-derived (ADR-0020).
 */
export function settlementRows(tim, periode) {
  const index = periodeIndex(tim, periode.id);
  // Participants only: the Settlement of a Periode never names a
  // non-participant, not even one carrying a Saldo (ADR-0014).
  const participants = participantsOf(tim, periode);

  if (periode.status === 'closed' && periode.snapshot) {
    const snapshot = periode.snapshot;
    const reDerived = Boolean(periode.reDerivedAt);
    return participants.map((member) => {
      const stored = (snapshot.rows || []).find((row) => row.memberId === member.id) || {};
      const konsumsiValue = rupiah(stored.konsumsi);
      const kontribusiValue = rupiah(stored.kontribusi);
      const awal = reDerived ? saldoAwal(tim, index, member.id) : rupiah(stored.saldoAwal);
      return {
        memberId: member.id,
        name: member.name,
        status: member.status,
        isHolder: member.id === tim.holderId,
        saldoAwal: awal,
        konsumsi: konsumsiValue,
        kontribusi: kontribusiValue,
        saldo: awal + konsumsiValue - kontribusiValue,
        handEnteredAwal: index === 0 && handEnteredOpening(tim, member.id) !== 0,
        source: reDerived ? 're-derived' : 'snapshot',
        asOf: snapshot.at || periode.closedAt || null,
        reDerivedAt: periode.reDerivedAt || null,
      };
    });
  }

  return participants.map((member) => ({
    memberId: member.id,
    name: member.name,
    status: member.status,
    isHolder: member.id === tim.holderId,
    saldoAwal: saldoAwal(tim, index, member.id),
    konsumsi: konsumsi(tim, periode, member.id),
    kontribusi: kontribusi(tim, periode, member.id),
    saldo: saldoAt(tim, index, member.id),
    handEnteredAwal: index === 0 && handEnteredOpening(tim, member.id) !== 0,
    source: 'preview',
    asOf: null,
    reDerivedAt: null,
  }));
}

/** Live running balances for the whole roster at the current position. */
export function currentBalances(tim) {
  const index = currentIndex(tim);
  if (index < 0) return [];
  const periode = tim.periods[index];
  return (tim.members || []).map((member) => ({
    memberId: member.id,
    name: member.name,
    status: member.status,
    isHolder: member.id === tim.holderId,
    saldoAwal: saldoAwal(tim, index, member.id),
    konsumsi: konsumsi(tim, periode, member.id),
    kontribusi: kontribusi(tim, periode, member.id),
    saldo: saldoAt(tim, index, member.id),
  }));
}

/**
 * Holder Net at a Periode: every other Anggota's positive Saldo minus every
 * Kredit. Running, Tim-wide; the Holder's own Konsumsi is not a debt.
 */
export function holderNetAt(tim, index) {
  if (index < 0) return 0;
  return (tim.members || [])
    .filter((m) => m.id !== tim.holderId)
    .reduce((sum, m) => sum + saldoAt(tim, index, m.id), 0);
}

export function holderNet(tim) {
  return holderNetAt(tim, currentIndex(tim));
}

/** Sum of positive balances from non-Holders, for display alongside Holder Net. */
export function outstandingAt(tim, index) {
  if (index < 0) return { owed: 0, credit: 0 };
  let owed = 0;
  let credit = 0;
  for (const member of tim.members || []) {
    if (member.id === tim.holderId) continue;
    const saldo = saldoAt(tim, index, member.id);
    if (saldo > 0) owed += saldo;
    else if (saldo < 0) credit += Math.abs(saldo);
  }
  return { owed, credit };
}

/**
 * Kas Holder: signed Setoran across the whole Tim minus the amount the Holder
 * personally contributed as Pembayar. Tim-wide, never per Periode (ADR-0019).
 */
export function kas(tim, uptoIndex = null) {
  const limit = uptoIndex === null ? (tim.periods || []).length - 1 : uptoIndex;
  let total = 0;
  (tim.periods || []).forEach((periode, index) => {
    if (index > limit) return;
    for (const deposit of periode.deposits || []) total += rupiah(deposit.amount);
    for (const nota of periode.bills || []) {
      for (const row of paidByOf(nota, tim)) {
        if (row.memberId === tim.holderId) total -= rupiah(row.amount);
      }
    }
  });
  return total;
}

/**
 * Cara Bayar Paling Ringkas: greedy largest-debtor / largest-creditor
 * matching. Returns [] when no debtor and creditor pair exists. Never stored
 * (ADR-0011, ADR-0018).
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

function closedRefusal(periode) {
  return fail(
    'PERIODE_CLOSED',
    'Periode ini sudah ditutup. Buka kembali periode, perbaiki datanya, lalu tutup lagi.'
  );
}

export function validateNota(tim, periode, nota) {
  const errors = [];
  const items = nota.items || [];

  if (items.length === 0) {
    errors.push({ code: 'NOTA_NO_ITEMS', message: 'Nota harus punya minimal satu item.' });
  }

  const pemilihIds = new Set((periode.participants || []).map(String));
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
      if (!pemilihIds.has(String(memberId))) {
        errors.push({
          code: 'NOTA_PEMILIH_NOT_PARTICIPANT',
          message: 'Ada item yang dibebankan ke orang yang bukan peserta periode ini.',
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
    if (!pemilihIds.has(String(payer.memberId))) {
      errors.push({
        code: 'NOTA_PEMBAYAR_NOT_PARTICIPANT',
        message: 'Ada pembayar yang bukan peserta periode ini.',
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

export function addNota(tim, periodeId, nota, now) {
  const periode = findPeriode(tim, periodeId);
  if (!periode) return fail('PERIODE_NOT_FOUND', 'Periode tidak ditemukan.');
  if (periode.status !== 'open') return closedRefusal(periode);

  const validation = validateNota(tim, periode, nota);
  if (!validation.ok) return refusals(validation.errors);

  const next = clone(tim);
  const target = findPeriode(next, periodeId);
  const record = {
    ...clone(nota),
    occurredAt: nota.occurredAt || now,
    createdAt: nota.createdAt || now,
  };
  target.bills.push(record);
  return accepted(next);
}

export function updateNota(tim, periodeId, nota, now) {
  const periode = findPeriode(tim, periodeId);
  if (!periode) return fail('PERIODE_NOT_FOUND', 'Periode tidak ditemukan.');
  if (periode.status !== 'open') return closedRefusal(periode);

  const existing = (periode.bills || []).find((b) => b.id === nota.id);
  if (!existing) return fail('NOTA_NOT_FOUND', 'Nota tidak ditemukan.');

  const validation = validateNota(tim, periode, nota);
  if (!validation.ok) return refusals(validation.errors);

  const next = clone(tim);
  const target = findPeriode(next, periodeId);
  const index = target.bills.findIndex((b) => b.id === nota.id);
  target.bills[index] = {
    ...clone(nota),
    occurredAt: nota.occurredAt || existing.occurredAt,
    createdAt: existing.createdAt || now,
  };
  return accepted(next);
}

export function removeNota(tim, periodeId, notaId) {
  const periode = findPeriode(tim, periodeId);
  if (!periode) return fail('PERIODE_NOT_FOUND', 'Periode tidak ditemukan.');
  if (periode.status !== 'open') return closedRefusal(periode);
  const next = clone(tim);
  findPeriode(next, periodeId).bills = findPeriode(next, periodeId).bills.filter((b) => b.id !== notaId);
  return accepted(next);
}

export function addSetoran(tim, periodeId, setoran, now) {
  const periode = findPeriode(tim, periodeId);
  if (!periode) return fail('PERIODE_NOT_FOUND', 'Periode tidak ditemukan.');
  if (periode.status !== 'open') return closedRefusal(periode);

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

  if (!(periode.participants || []).includes(setoran.memberId)) {
    return fail(
      'SETORAN_NOT_PARTICIPANT',
      'Anggota ini bukan peserta periode berjalan. Tambahkan dia sebagai peserta dulu untuk mencatat Setoran atau Pengembalian.'
    );
  }

  const next = clone(tim);
  findPeriode(next, periodeId).deposits.push({
    id: setoran.id,
    memberId: setoran.memberId,
    amount,
    note: String(setoran.note || '').trim(),
    at: setoran.at || now,
  });
  return accepted(next);
}

export function removeSetoran(tim, periodeId, setoranId) {
  const periode = findPeriode(tim, periodeId);
  if (!periode) return fail('PERIODE_NOT_FOUND', 'Periode tidak ditemukan.');
  if (periode.status !== 'open') return closedRefusal(periode);
  const next = clone(tim);
  findPeriode(next, periodeId).deposits = findPeriode(next, periodeId).deposits.filter((d) => d.id !== setoranId);
  return accepted(next);
}

/* ------------------------------------------------------------------ *
 * Periode lifecycle
 * ------------------------------------------------------------------ */

export function openNewPeriode(tim, { id, label, openedAt }) {
  const alreadyOpen = openPeriodeOf(tim);
  if (alreadyOpen) {
    return fail(
      'PERIODE_ALREADY_OPEN',
      `Tim ini masih punya periode terbuka ("${alreadyOpen.label || 'tanpa label'}"). Tutup dulu sebelum membuka periode baru.`
    );
  }
  const defaults = activeMembers(tim).map((m) => m.id);
  if (!defaults.includes(tim.holderId)) defaults.unshift(tim.holderId);
  const next = clone(tim);
  next.periods.push(makePeriode({ id, label, openedAt, participants: defaults }));
  return accepted(next);
}

export function renamePeriode(tim, periodeId, label) {
  const periode = findPeriode(tim, periodeId);
  if (!periode) return fail('PERIODE_NOT_FOUND', 'Periode tidak ditemukan.');
  if (periode.status !== 'open') return closedRefusal(periode);
  const next = clone(tim);
  findPeriode(next, periodeId).label = label ? String(label) : null;
  return accepted(next);
}

export function setParticipants(tim, periodeId, memberIds) {
  const periode = findPeriode(tim, periodeId);
  if (!periode) return fail('PERIODE_NOT_FOUND', 'Periode tidak ditemukan.');
  if (periode.status !== 'open') return closedRefusal(periode);

  const roster = new Set((tim.members || []).map((m) => m.id));
  const wanted = [...new Set(memberIds || [])];
  const stranger = wanted.find((id) => !roster.has(id));
  if (stranger) {
    return fail('PARTICIPANT_NOT_IN_ROSTER', 'Peserta periode harus diambil dari roster Tim.');
  }
  if (!wanted.includes(tim.holderId)) {
    return fail(
      'HOLDER_REQUIRED_IN_PARTICIPANTS',
      'Holder selalu jadi peserta periode ini dan tidak bisa dikeluarkan.'
    );
  }

  const removed = (periode.participants || []).filter((id) => !wanted.includes(id));
  for (const memberId of removed) {
    const member = findAnggota(tim, memberId);
    const consumed = konsumsi(tim, periode, memberId);
    if (consumed !== 0) {
      return fail(
        'PARTICIPANT_HAS_KONSUMSI',
        `${member ? member.name : 'Anggota'} sudah punya konsumsi ${consumed} rupiah di periode ini, ` +
          'jadi tidak bisa dikeluarkan dari peserta.'
      );
    }
  }

  const next = clone(tim);
  findPeriode(next, periodeId).participants = (tim.members || [])
    .filter((m) => wanted.includes(m.id))
    .map((m) => m.id);
  return accepted(next);
}

export function setSaldoAwal(tim, periodeId, memberId, amount) {
  const index = periodeIndex(tim, periodeId);
  if (index !== 0) {
    return fail(
      'SALDO_AWAL_NOT_EDITABLE',
      'Saldo Awal periode ini dibaca dari periode sebelumnya, bukan diisi manual.'
    );
  }
  const periode = findPeriode(tim, periodeId);
  if (periode.status !== 'open') return closedRefusal(periode);
  if (!findAnggota(tim, memberId)) return fail('ANGGOTA_NOT_FOUND', 'Anggota tidak ditemukan.');

  const next = clone(tim);
  const target = findPeriode(next, periodeId);
  target.saldoAwalByMember = target.saldoAwalByMember || {};
  const value = rupiah(amount);
  if (value === 0) delete target.saldoAwalByMember[memberId];
  else target.saldoAwalByMember[memberId] = value;
  return accepted(next);
}

export function closePeriode(tim, periodeId, at) {
  const periode = findPeriode(tim, periodeId);
  if (!periode) return fail('PERIODE_NOT_FOUND', 'Periode tidak ditemukan.');

  const index = periodeIndex(tim, periodeId);
  const rows = participantsOf(tim, periode).map((member) => ({
    memberId: member.id,
    saldoAwal: saldoAwal(tim, index, member.id),
    konsumsi: konsumsi(tim, periode, member.id),
    kontribusi: kontribusi(tim, periode, member.id),
    saldo: saldoAt(tim, index, member.id),
  }));

  const next = clone(tim);
  const target = findPeriode(next, periodeId);
  target.status = 'closed';
  target.closedAt = at;
  target.snapshot = { at, rows: clone(rows), kas: kas(tim, index) };
  target.reDerivedAt = null;
  return accepted(next, { snapshot: target.snapshot });
}

/**
 * Reopening any Periode. Reopening an earlier one re-chains every later one:
 * only reDerivedAt marks are stored, no balance is rewritten (ADR-0020).
 */
export function reopenPeriode(tim, periodeId, at) {
  const index = periodeIndex(tim, periodeId);
  if (index < 0) return fail('PERIODE_NOT_FOUND', 'Periode tidak ditemukan.');
  const periode = tim.periods[index];
  if (periode.status !== 'closed') {
    return fail('PERIODE_NOT_OPEN_CLOSED', 'Periode ini belum ditutup, tidak ada yang perlu dibuka.');
  }

  const otherOpen = (tim.periods || []).find((p) => p.status === 'open');
  if (otherOpen) {
    return fail(
      'PERIODE_ALREADY_OPEN',
      `Periode "${otherOpen.label || 'tanpa label'}" masih terbuka. Tutup dulu sebelum membuka periode lain.`
    );
  }

  const next = clone(tim);
  const target = next.periods[index];
  target.status = 'open';
  target.closedAt = null;
  target.snapshot = null;

  const cascade = [];
  next.periods.forEach((later, laterIndex) => {
    if (laterIndex <= index) return;
    if (later.status === 'closed') later.reDerivedAt = at;
    cascade.push({
      periodeId: later.id,
      label: later.label,
      index: laterIndex,
      status: later.status,
      lastDerivedAt: later.snapshot ? later.snapshot.at : null,
    });
  });

  return accepted(next, { cascade });
}

/** The Periodes whose opening balances a reopen of this Periode would change. */
export function cascadePreview(tim, periodeId) {
  const index = periodeIndex(tim, periodeId);
  if (index < 0) return [];
  return (tim.periods || [])
    .map((periode, i) => ({ periode, i }))
    .filter(({ i }) => i > index)
    .map(({ periode, i }) => ({
      periodeId: periode.id,
      label: periode.label,
      index: i,
      status: periode.status,
      lastDerivedAt: periode.snapshot ? periode.snapshot.at : periode.reDerivedAt || periode.closedAt || null,
    }));
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

  const open = openPeriodeOf(next);
  if (open) open.participants.push(record.id);
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
  next.handovers.push({
    fromId: tim.holderId,
    toId,
    at,
    note: note ? String(note).trim() : '',
  });
  next.holderId = toId;
  const open = openPeriodeOf(next);
  if (open && !open.participants.includes(toId)) open.participants.push(toId);
  return accepted(next);
}

/** Who was holding the cash at a given moment, from the append-only log. */
export function holderAt(tim, at) {
  let holderId = tim.handovers.length > 0 ? tim.handovers[0].fromId : tim.holderId;
  for (const event of tim.handovers) {
    if (!at || String(event.at) <= String(at)) holderId = event.toId;
  }
  return holderId;
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
 * A Tim can be hard-deleted only while it holds no history. Evaluated live,
 * never cached (ADR-0017).
 */
export function canDeleteTim(tim) {
  const notaCount = (tim.periods || []).reduce((sum, p) => sum + (p.bills || []).length, 0);
  const setoranCount = (tim.periods || []).reduce((sum, p) => sum + (p.deposits || []).length, 0);
  const handEntered = (tim.periods || []).some(
    (p) => Object.values(p.saldoAwalByMember || {}).some((value) => rupiah(value) !== 0)
  );
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
 * Migration: bagirata.v1 -> bagirata.v2
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

function migrateTeam(team, index) {
  const createdAt = team.createdAt || null;
  const closedAt = team.closedAt || (team.status === 'closed' ? createdAt : null);
  const members = (team.members || []).map((member, memberIndex) =>
    createAnggota({
      id: member.id,
      name: member.name,
      colorIndex: Number.isInteger(member.colorIndex) ? member.colorIndex : memberIndex,
      joinedAt: createdAt,
    })
  );
  const periode = {
    id: `${team.id}__periode_1`,
    label: null,
    status: team.status === 'closed' ? 'closed' : 'open',
    openedAt: createdAt,
    closedAt: team.status === 'closed' ? closedAt : null,
    participants: members.map((m) => m.id),
    bills: (team.bills || []).map((bill) => migrateBill({ holderId: team.holderId }, bill)),
    deposits: (team.deposits || []).map((deposit) => ({
      id: deposit.id,
      memberId: deposit.memberId,
      amount: rupiah(deposit.amount),
      note: deposit.note || '',
      at: deposit.createdAt || null,
    })),
    saldoAwalByMember: {},
    snapshot: null,
    reDerivedAt: null,
  };

  const tim = {
    id: team.id,
    name: team.name || `Tim ${index + 1}`,
    members,
    holderId: team.holderId || (members[0] && members[0].id) || null,
    periods: [periode],
    handovers: [],
    archivedAt: null,
    createdAt,
  };

  if (periode.status === 'closed') {
    const timWithPeriode = { ...tim };
    const rows = participantsOf(timWithPeriode, periode).map((member) => ({
      memberId: member.id,
      saldoAwal: 0,
      konsumsi: konsumsi(timWithPeriode, periode, member.id),
      kontribusi: kontribusi(timWithPeriode, periode, member.id),
      saldo: saldoAt(timWithPeriode, 0, member.id),
    }));
    periode.snapshot = { at: closedAt, rows, kas: kas(timWithPeriode, 0) };
  }

  return tim;
}

/**
 * Pure function of the parsed old store. Idempotent: a v2 store comes back
 * unchanged. The old key is never touched by this function.
 */
export function migrateV1(oldStore) {
  if (!oldStore || typeof oldStore !== 'object') {
    return createStore(null);
  }
  if (oldStore.version === SCHEMA_VERSION || Array.isArray(oldStore.tims)) {
    return oldStore;
  }

  const tims = (Array.isArray(oldStore.teams) ? oldStore.teams : []).map((team, index) =>
    migrateTeam(team, index)
  );
  const activeTim = tims.find((t) => t.id === oldStore.activeTeamId) || null;
  return {
    version: SCHEMA_VERSION,
    tims,
    activeTimId: activeTim ? activeTim.id : null,
    activePeriodeId: activeTim ? activeTim.periods[0].id : null,
    savedAt: null,
  };
}
