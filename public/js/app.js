/**
 * BagiRata app shell (simplified).
 *
 * Views: home, create, tim, upload, loading, editor
 * No Periode, no Settlement screen, no handover log.
 * One-off mode = Tim that isn't persisted.
 */

import {
  addAnggota,
  addNota,
  addSetoran as addSetoranDomain,
  archiveTim,
  canDeleteTim,
  createTim,
  deleteTim,
  findAnggota,
  findTim,
  handoverHolder,
  holderNet,
  isHolder,
  itemLineTotal,
  kas,
  konsumsi,
  kontribusi,
  notaBreakdown,
  notaGrandTotal,
  outstandingAt,
  paidByOf,
  paidByTotal,
  removeNota,
  removeSetoran,
  rupiah,
  saldoNow,
  setAnggotaStatus,
  settlementRows,
  unarchiveTim,
  updateNota,
} from './domain.js';

import {
  colorOf,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatRupiah,
  formatSignedRupiah,
  fromDateInputValue,
  toDateInputValue,
  whatsappSafe,
} from './format.js';

import { nowIso, uid } from './ids.js';
import { loadStore, saveActive, saveStore } from './storage.js';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

let store = loadStore();
let view = 'home';
let history = [];
let activeTimId = null;
let oneOff = null;
let draft = null;

const SECTIONS = [
  'homeSection',
  'createTimSection',
  'timSection',
  'uploadSection',
  'loadingSection',
  'editorSection',
];

const $ = (id) => document.getElementById(id);

function icons() {
  try {
    window.lucide?.createIcons();
  } catch (error) {
    /* icons are cosmetic */
  }
}

function currentTim() {
  if (oneOff) return oneOff.tim;
  return findTim(store, activeTimId);
}

/** Persist a Tim; one-off mode is in-memory only and never touches storage. */
function commitTim(tim) {
  if (oneOff) {
    oneOff.tim = tim;
    return;
  }
  store = { ...store, tims: store.tims.map((t) => (t.id === tim.id ? tim : t)) };
  saveStore(store);
  saveActive(store, activeTimId);
}

function commitStore(nextStore) {
  store = nextStore;
  saveStore(store);
  saveActive(store, activeTimId);
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

function render() {
  if (view === 'editor' && !draft) view = oneOff ? 'upload' : 'tim';
  SECTIONS.forEach((id) => $(id)?.classList.add('hidden'));

  const section = {
    home: 'homeSection',
    create: 'createTimSection',
    tim: 'timSection',
    upload: 'uploadSection',
    loading: 'loadingSection',
    editor: 'editorSection',
  }[view];

  if (section) $(section)?.classList.remove('hidden');

  $('headerBackBtn').classList.toggle('hidden', view === 'home');
  $('headerBackBtn').classList.toggle('flex', view !== 'home');
  $('headerHomeBtn').classList.toggle('hidden', view === 'home');
  $('headerHomeBtn').classList.toggle('flex', view !== 'home');
  $('headerResetBtn').classList.toggle('hidden', view !== 'editor');
  $('headerResetBtn').classList.toggle('flex', view === 'editor');

  if (view === 'home') renderHome();
  if (view === 'create') renderCreateTim();
  if (view === 'tim') renderTim();
  if (view === 'upload') renderUpload();
  if (view === 'editor') renderEditor();

  icons();
}

function navigate(next, { replace = false } = {}) {
  if (!replace && next !== view) history.push({ view, activeTimId });
  view = next;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
  let previous = history.pop();
  while (previous && previous.view === 'editor' && !draft) previous = history.pop();
  if (!previous) {
    goHome();
    return;
  }
  view = previous.view;
  activeTimId = previous.activeTimId;
  render();
}

function goHome() {
  const wasOneOff = Boolean(oneOff);
  oneOff = null;
  draft = null;
  history = [];
  activeTimId = null;
  view = 'home';
  if (!wasOneOff) saveActive(store, null);
  render();
}

function openTim(timId) {
  activeTimId = timId;
  const tim = findTim(store, timId);
  if (!tim) {
    showModal({ title: 'Tim tidak ditemukan', body: '<p>Tim ini sudah tidak ada.</p>' });
    goHome();
    return;
  }
  saveActive(store, activeTimId);
  navigate('tim');
}

/* ------------------------------------------------------------------ *
 * Home
 * ------------------------------------------------------------------ */

function renderHome() {
  store = loadStore();
  const tims = store.tims.filter((t) => !t.archivedAt);
  const archived = store.tims.filter((t) => t.archivedAt);

  const list = $('timsList');
  if (tims.length === 0) {
    list.innerHTML =
      '<p class="text-sm text-[#9C6F44] italic">Belum ada Tim. Buat Tim untuk kelompok yang makan bersama berulang kali.</p>';
  } else {
    list.innerHTML = tims
      .map((tim) => {
        const holder = findAnggota(tim, tim.holderId);
        const net = holderNet(tim);
        const notaCount = tim.notes.length;
        return `
          <button onclick="openTim('${tim.id}')" class="w-full text-left bg-[#FAF6F0] border border-[#E6CCB2] rounded-xl p-4 hover:border-[#D4A373] transition flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="font-bold text-[#3D312A] truncate">${escapeHtml(tim.name)}</p>
              <p class="text-xs text-[#9C6F44] mt-0.5">
                ${tim.members.length} anggota · ${notaCount} nota · ${tim.setorans.length} setoran · Holder: ${escapeHtml(holder ? holder.name : '-')}
              </p>
              ${net !== 0 ? `<p class="text-[11px] mt-1 text-[#6F4E37]">Holder Net ${formatRupiah(net)}</p>` : ''}
            </div>
            <i data-lucide="chevron-right" class="w-5 h-5 text-[#6F4E37] shrink-0"></i>
          </button>`;
      })
      .join('');
  }

  $('archivedCount').textContent = archived.length > 0 ? String(archived.length) : '';
  const archivedList = $('archivedTimsList');
  if (archived.length === 0) {
    archivedList.innerHTML = '<p class="text-sm text-[#9C6F44] italic">Belum ada Tim yang diarsipkan.</p>';
  } else {
    archivedList.innerHTML = archived
      .map((tim) => {
        const holder = findAnggota(tim, tim.holderId);
        const { owed, credit } = outstandingAt(tim);
        return `
          <button onclick="openTim('${tim.id}')" class="w-full text-left bg-[#FAF6F0] border border-[#E6CCB2] rounded-xl p-4 hover:border-[#D4A373] transition flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="font-bold text-[#3D312A] truncate">${escapeHtml(tim.name)}</p>
              <p class="text-xs text-[#9C6F44] mt-0.5">Holder: ${escapeHtml(holder ? holder.name : '-')} · ${tim.notes.length} nota</p>
              ${
                owed !== 0 || credit !== 0
                  ? `<p class="text-[11px] font-semibold text-amber-800 mt-1">Saldo berjalan belum nol — ditagih ${formatRupiah(owed)}${credit !== 0 ? ` · kredit ${formatRupiah(credit)}` : ''}</p>`
                  : '<p class="text-[11px] text-[#9C6F44] mt-1">Tidak ada saldo berjalan.</p>'
              }
            </div>
            <span class="text-[10px] font-semibold uppercase tracking-wide bg-[#F3ECE0] text-[#6F4E37] px-2 py-1 rounded-full shrink-0">Arsip</span>
          </button>`;
      })
      .join('');
  }
}

/* ------------------------------------------------------------------ *
 * Create Tim
 * ------------------------------------------------------------------ */

let draftMembers = [];

function startCreateTim() {
  draftMembers = [];
  $('teamNameInput').value = '';
  $('draftMemberInput').value = '';
  navigate('create');
}

function renderCreateTim() {
  const list = $('draftMembersList');
  if (draftMembers.length === 0) {
    list.innerHTML = '<span class="text-xs text-[#9C6F44] italic">Tambahkan minimal 2 anggota.</span>';
  } else {
    list.innerHTML = draftMembers
      .map((member, index) => {
        const color = colorOf(member.colorIndex);
        return `
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-sm ${color.bg} ${color.text} ${color.border}">
            <span>${escapeHtml(member.name)}</span>
            <button onclick="removeDraftMember(${index})" class="hover:opacity-75"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
          </span>`;
      })
      .join('');
  }

  $('holderSelect').innerHTML =
    draftMembers.length === 0
      ? '<option value="">— pilih setelah menambah anggota —</option>'
      : draftMembers.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
}

function addDraftMember() {
  const input = $('draftMemberInput');
  const name = input.value.trim();
  if (!name) return;
  draftMembers.push({ id: uid('m'), name, colorIndex: draftMembers.length });
  input.value = '';
  renderCreateTim();
  icons();
}

function removeDraftMember(index) {
  draftMembers.splice(index, 1);
  draftMembers.forEach((member, i) => {
    member.colorIndex = i;
  });
  renderCreateTim();
  icons();
}

function confirmCreateTim() {
  const name = $('teamNameInput').value.trim();
  const holderId = $('holderSelect').value;
  if (!name) return showModal({ title: 'Nama Tim wajib diisi', body: '<p>Beri nama Tim supaya mudah dikenali.</p>' });
  if (draftMembers.length < 2) {
    return showModal({ title: 'Anggota kurang', body: '<p>Tambahkan minimal 2 anggota.</p>' });
  }
  if (!holderId) return showModal({ title: 'Holder belum dipilih', body: '<p>Pilih satu pemegang dana.</p>' });

  const tim = createTim({
    id: uid('tim'),
    name,
    members: draftMembers,
    holderId,
    now: nowIso(),
    openingBalances: {},
  });

  store = { ...store, tims: [...store.tims, tim] };
  saveStore(store);
  draftMembers = [];
  activeTimId = tim.id;
  saveActive(store, activeTimId);
  showToast('Tim dibuat.');
  navigate('tim');
}

/* ------------------------------------------------------------------ *
 * Tim screen
 * ------------------------------------------------------------------ */

function renderTim() {
  const tim = currentTim();
  if (!tim) return goHome();

  const holder = findAnggota(tim, tim.holderId);
  $('timTitle').textContent = tim.name;
  $('timSubtitle').textContent = `${holder ? holder.name : '-'} sebagai Holder · ${tim.members.length} anggota · ${tim.notes.length} nota · ${tim.setorans.length} setoran${tim.archivedAt ? ' · diarsipkan' : ''}`;

  $('timActionBar').innerHTML = `
    ${tim.archivedAt
      ? `<button onclick="unarchiveCurrentTim()" class="text-xs font-semibold text-[#6F4E37] bg-[#F3ECE0] hover:bg-[#E6CCB2] px-3 py-2 rounded-lg border border-[#E6CCB2] transition flex items-center gap-1"><i data-lucide="archive-restore" class="w-3.5 h-3.5"></i> Keluarkan dari arsip</button>`
      : `<button onclick="archiveCurrentTim()" class="text-xs font-semibold text-[#6F4E37] bg-[#F3ECE0] hover:bg-[#E6CCB2] px-3 py-2 rounded-lg border border-[#E6CCB2] transition flex items-center gap-1"><i data-lucide="archive" class="w-3.5 h-3.5"></i> Arsipkan</button>`}
    ${canDeleteTim(tim).ok
      ? `<button onclick="deleteCurrentTim()" class="text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg border border-red-200 transition flex items-center gap-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus</button>`
      : ''}
  `;

  const kasValue = kas(tim);
  $('kasHolderValue').textContent = formatRupiah(kasValue);
  $('kasHolderHint').textContent = `Uang yang seharusnya dipegang ${holder ? holder.name : 'Holder'} sekarang: cocokkan dengan dompet, bukan error.`;

  const net = holderNet(tim);
  $('holderNetValue').textContent = formatRupiah(net);

  // roster with balances
  const roster = $('rosterList');
  roster.innerHTML = tim.members
    .map((member) => {
      const color = colorOf(member.colorIndex);
      const saldo = saldoNow(tim, member.id);
      const saldoClass = saldo > 0 ? 'text-amber-800' : saldo < 0 ? 'text-emerald-700' : 'text-[#9C6F44]';
      const isCurrentHolder = isHolder(tim, member.id);
      const statusLabel = member.status === 'keluar' ? 'keluar' : '';
      return `
        <div class="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-[#E6CCB2]/60">
          <div class="flex items-center gap-2 min-w-0">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${color.bg} ${color.text}">${escapeHtml(member.name)}</span>
            ${isCurrentHolder ? '<span class="text-[10px] font-semibold uppercase text-[#6F4E37]">Holder</span>' : ''}
            ${statusLabel ? `<span class="text-[10px] font-semibold uppercase text-amber-700">${statusLabel}${member.leftAt ? ' · ' + formatDate(member.leftAt) : ''}</span>` : ''}
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold ${saldoClass}">${isCurrentHolder ? 'posisi ' : ''}${formatRupiah(saldo)}</span>
            ${
              isCurrentHolder
                ? ''
                : member.status === 'keluar'
                  ? `<button onclick="reactivateAnggota('${member.id}')" class="text-[11px] font-semibold text-[#6F4E37] border border-[#E6CCB2] px-2 py-1 rounded-lg hover:bg-[#F3ECE0]">Aktifkan</button>`
                  : `<button onclick="markAnggotaKeluar('${member.id}')" class="text-[11px] font-semibold text-[#9C6F44] border border-[#E6CCB2] px-2 py-1 rounded-lg hover:bg-[#F3ECE0]">Keluar</button>`
            }
          </div>
        </div>`;
    })
    .join('');

  // handover (simplified, no log)
  const candidates = tim.members.filter((m) => m.id !== tim.holderId && m.status !== 'keluar');
  $('handoverSelect').innerHTML = candidates.length
    ? candidates.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')
    : '<option value="">Tidak ada anggota lain yang aktif</option>';

  // notes
  const bills = [...tim.notes].sort((a, b) =>
    String(b.occurredAt || b.createdAt).localeCompare(String(a.occurredAt || a.createdAt))
  );
  $('notaCount').textContent = bills.length ? `(${bills.length} nota)` : '';
  $('notaList').innerHTML =
    bills.length === 0
      ? '<p class="text-sm text-[#9C6F44] italic">Belum ada nota.</p>'
      : bills
          .map((nota) => {
            const total = notaGrandTotal(nota);
            const backdated = isBackdated(nota, tim);
            const payers = paidByOf(nota, tim)
              .map((row) => {
                const member = findAnggota(tim, row.memberId);
                return `${escapeHtml(member ? member.name : '?')} ${formatRupiah(row.amount)}`;
              })
              .join(', ');
            return `
              <div class="bg-[#FAF6F0] border border-[#E6CCB2] rounded-xl p-3 flex items-start justify-between gap-2">
                <button onclick="editNota('${nota.id}')" class="text-left min-w-0 flex-grow">
                  <p class="font-semibold text-sm text-[#3D312A] truncate">${escapeHtml(nota.merchant || 'Nota')}</p>
                  <p class="text-[11px] text-[#9C6F44]">${formatDate(nota.occurredAt)} · ${(nota.items || []).length} item · ${formatRupiah(total)}</p>
                  <p class="text-[10px] text-[#9C6F44] truncate">dibayar: ${payers}</p>
                  ${backdated ? '<span class="inline-block mt-1 text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">Tanggal sebelum anggota bergabung</span>' : ''}
                </button>
                <button onclick="removeNotaFromTim('${nota.id}')" class="text-[#9C6F44] hover:text-red-600 p-1 shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
              </div>`;
          })
          .join('');

  // setorans
  const setoranCandidates = activeMembers(tim).filter((m) => m.id !== tim.holderId);
  $('setoranMemberSelect').innerHTML = setoranCandidates.length
    ? setoranCandidates.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')
    : '<option value="">Tidak ada anggota non-Holder</option>';

  const deposits = [...tim.setorans].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  $('setoranList').innerHTML =
    deposits.length === 0
      ? '<p class="text-[11px] text-[#9C6F44] italic">Belum ada setoran.</p>'
      : deposits
          .map((deposit) => {
            const member = findAnggota(tim, deposit.memberId);
            const negative = deposit.amount < 0;
            return `
              <div class="flex justify-between items-start gap-2 text-xs py-1.5 border-b border-[#E6CCB2]/40">
                <div class="min-w-0">
                  <span class="font-semibold ${negative ? 'text-red-700' : 'text-[#3D312A]'}">${escapeHtml(member ? member.name : '?')}${negative ? ' · Pengembalian' : ''}</span>
                  <span class="block text-[10px] text-[#9C6F44]">${formatDateTime(deposit.at)}${deposit.note ? ' · ' + escapeHtml(deposit.note) : ''}</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-semibold ${negative ? 'text-red-700' : 'text-emerald-700'}">${formatSignedRupiah(deposit.amount)}</span>
                </div>
              </div>`;
          })
          .join('');

  // settlement rows (live)
  const rows = settlementRows(tim);
  $('periodeBalances').innerHTML = rows
    .map((row) => {
      const color = colorOf((findAnggota(tim, row.memberId) || {}).colorIndex);
      const saldoClass = row.saldo > 0 ? 'text-amber-800' : row.saldo < 0 ? 'text-emerald-700' : 'text-[#9C6F44]';
      return `
        <div class="flex justify-between items-center gap-2 py-1.5 border-b border-[#E6CCB2]/40">
          <div class="min-w-0">
            <span class="px-2 py-0.5 rounded text-[11px] font-bold ${color.bg} ${color.text}">${escapeHtml(row.name)}</span>
            ${row.isHolder ? '<span class="text-[10px] uppercase text-[#6F4E37] ml-1">Holder</span>' : ''}
            <span class="block text-[10px] text-[#9C6F44]">awal ${formatRupiah(row.saldoAwal)} · konsumsi ${formatRupiah(row.konsumsi)} · kontribusi ${formatRupiah(row.kontribusi)}</span>
          </div>
          <span class="text-xs font-semibold ${saldoClass} shrink-0">${formatRupiah(row.saldo)}</span>
        </div>`;
    })
    .join('');

  $('periodeKasNote').textContent = `Kas Holder: ${formatRupiah(kas(tim))}`;
}

function addAnggotaToTim() {
  const input = $('addAnggotaInput');
  const name = input.value.trim();
  if (!name) return;
  const tim = currentTim();
  const result = addAnggota(tim, { id: uid('m'), name, colorIndex: tim.members.length }, nowIso());
  if (!result.ok) return showModal({ title: 'Tidak bisa menambah anggota', body: `<p>${escapeHtml(result.message)}</p>` });
  commitTim(result.tim);
  input.value = '';
  showToast(`${name} ditambahkan ke roster.`);
  render();
}

function markAnggotaKeluar(memberId) {
  const tim = currentTim();
  const result = setAnggotaStatus(tim, memberId, 'keluar', nowIso());
  if (!result.ok) {
    return showModal({
      title: 'Tidak bisa menandai keluar',
      body: `<p>${escapeHtml(readableRefusal(result))}</p>`,
      confirmLabel: 'Mengerti',
    });
  }
  commitTim(result.tim);
  showToast('Anggota ditandai keluar. Riwayatnya tetap ada.');
  render();
}

function reactivateAnggota(memberId) {
  const result = setAnggotaStatus(currentTim(), memberId, 'active', nowIso());
  if (!result.ok) return showModal({ title: 'Tidak bisa mengaktifkan', body: `<p>${escapeHtml(result.message)}</p>` });
  commitTim(result.tim);
  showToast('Anggota aktif kembali dengan id dan riwayat yang sama.');
  render();
}

function confirmHandover() {
  const tim = currentTim();
  const toId = $('handoverSelect').value;
  if (!toId) return showModal({ title: 'Belum ada kandidat', body: '<p>Tambahkan anggota lain yang aktif dulu.</p>' });
  const target = findAnggota(tim, toId);
  const kasValue = kas(tim);

  showModal({
    title: 'Konfirmasi serah terima',
    body: `
      <p>Kas Holder saat ini <strong>${formatRupiah(kasValue)}</strong>. Cocokkan dengan uang fisik sebelum peran berpindah.</p>
      <p>Serahkan peran Holder kepada <strong>${escapeHtml(target ? target.name : '?')}</strong>? Saldo anggota tidak berubah.</p>`,
    confirmLabel: 'Ya, serahkan',
    onConfirm: () => {
      const result = handoverHolder(tim, { toId, at: nowIso(), note: '' });
      if (!result.ok) return showModal({ title: 'Serah terima ditolak', body: `<p>${escapeHtml(result.message)}</p>` });
      commitTim(result.tim);
      showToast('Peran Holder diserahkan.');
      render();
    },
  });
}

function archiveCurrentTim() {
  const tim = currentTim();
  showModal({
    title: 'Arsipkan Tim',
    body: `<p>Arsipkan <strong>${escapeHtml(tim.name)}</strong>? Tim tetap bisa dibuka dan diedit, hanya disembunyikan dari daftar utama.</p>`,
    confirmLabel: 'Arsipkan',
    onConfirm: () => {
      const result = archiveTim(currentTim(), nowIso());
      commitTim(result.tim);
      showToast('Tim diarsipkan.');
      goHome();
    },
  });
}

function unarchiveCurrentTim() {
  const result = unarchiveTim(currentTim());
  commitTim(result.tim);
  showToast('Tim keluar dari arsip.');
  render();
}

function deleteCurrentTim() {
  const tim = currentTim();
  const check = canDeleteTim(tim);
  if (!check.ok) {
    return showModal({
      title: 'Tidak bisa dihapus',
      body: '<p>Tim yang punya nota, setoran, atau saldo awal manual tidak bisa dihapus. Arsipkan saja.</p>',
    });
  }
  showModal({
    title: 'Hapus Tim',
    body: `<p>Hapus <strong>${escapeHtml(tim.name)}</strong> secara permanen? Tindakan ini tidak bisa dibatalkan.</p>`,
    confirmLabel: 'Hapus permanen',
    danger: true,
    onConfirm: () => {
      const result = deleteTim(store, tim.id);
      if (!result.ok) return showModal({ title: 'Tidak bisa dihapus', body: `<p>${escapeHtml(result.message)}</p>` });
      commitStore(result.store);
      showToast('Tim dihapus.');
      goHome();
    },
  });
}

/* ------------------------------------------------------------------ *
 * Upload / OCR
 * ------------------------------------------------------------------ */

function startUpload() {
  navigate('upload');
}

function renderUpload() {
  $('uploadTitle').textContent = oneOff ? 'Split Sekali Pakai' : 'Tambah Nota';
  $('uploadSubtitle').textContent = oneOff
    ? 'Foto nota atau isi manual. Mode sekali pakai tidak menyimpan apa pun ke perangkat.'
    : 'Foto nota, unggah gambar, atau isi manual.';
  icons();
}

function startManualNota() {
  const tim = currentTim();
  if (!tim) return goHome();

  draft = {
    notaId: null,
    nota: blankNota(),
    payersAuto: true,
    fuente: 'manual',
  };
  syncDraftPayerDefault();
  navigate('editor');
}

function editNota(notaId) {
  const tim = currentTim();
  if (!tim) return;
  const nota = tim.notes.find((b) => b.id === notaId);
  if (!nota) return;
  draft = {
    notaId,
    nota: {
      ...JSON.parse(JSON.stringify(nota)),
      paidBy: paidByOf(nota, tim).map((row) => ({ ...row })),
    },
    payersAuto: false,
    fuente: 'edit',
  };
  navigate('editor');
}

/* ------------------------------------------------------------------ *
 * Nota editor
 * ------------------------------------------------------------------ */

function blankNota() {
  return {
    id: uid('nota'),
    merchant: 'Restoran / Kafe',
    items: [],
    tax: 0,
    service: 0,
    discount: 0,
    occurredAt: nowIso(),
    createdAt: nowIso(),
    paidBy: [],
  };
}

function editorTim() {
  return currentTim();
}

function editorParticipants() {
  const tim = editorTim();
  if (!tim) return [];
  return activeMembers(tim);
}

function syncDraftPayerDefault() {
  if (!draft) return;
  const tim = editorTim();
  const total = notaGrandTotal(draft.nota);
  if (draft.payersAuto) {
    const holder = tim ? findAnggota(tim, tim.holderId) : null;
    draft.nota.paidBy = holder && total !== 0 ? [{ memberId: holder.id, amount: total }] : [];
  }
}

function draftChange(field, value) {
  if (!draft) return;
  if (['tax', 'service', 'discount'].includes(field)) draft.nota[field] = Math.max(0, Number(value) || 0);
  else if (field === 'occurredAt') draft.nota.occurredAt = value || draft.nota.occurredAt;
  else draft.nota[field] = value;

  if (field === 'merchant') {
    renderEditorSummary();
    return;
  }
  syncDraftPayerDefault();
  renderEditor();
}

function renderEditor() {
  const tim = editorTim();
  if (!draft || !tim) return goHome();

  $('merchantName').value = draft.nota.merchant || '';
  $('notaDateInput').value = toDateInputValue(draft.nota.occurredAt);
  $('editorContext').textContent = oneOff ? 'Mode sekali pakai · tidak disimpan' : `${tim.name}`;
  $('editorRosterTitle').textContent = oneOff ? 'Anggota (sekali pakai)' : 'Anggota';
  $('editorAddMemberWrap').classList.toggle('hidden', !oneOff);
  $('taxInput').value = draft.nota.tax || '';
  $('serviceInput').value = draft.nota.service || '';
  $('discountInput').value = draft.nota.discount || '';
  $('editorAddMemberWrap').classList.toggle('flex', oneOff);

  renderItems();
  renderPayerRows();
  renderEditorRoster();
  renderEditorSummary();
  renderBackdateWarning();
  icons();
}

function renderItems() {
  const participants = editorParticipants();
  const container = $('itemList');
  if (draft.nota.items.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-xs text-[#9C6F44]">Belum ada item. Klik "Tambah" atau isi manual.</div>';
    return;
  }

  container.innerHTML = draft.nota.items
    .map((item) => {
      const unassigned = (item.assignedTo || []).length === 0;
      return `
        <div class="bg-[#FAF6F0] p-3.5 rounded-xl border ${unassigned ? 'border-amber-400/70 bg-amber-50/30' : 'border-[#E6CCB2]'} space-y-2.5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <input type="text" value="${escapeHtml(item.name)}" onchange="updateItem('${item.id}', 'name', this.value)" class="w-full font-semibold text-sm text-[#3D312A] bg-transparent border-b border-transparent hover:border-[#E6CCB2] focus:border-[#6F4E37] focus:outline-none px-1 py-0.5 rounded">
            <div class="flex items-center gap-2 justify-between sm:justify-end">
              <div class="flex items-center bg-[#FDFBF7] border border-[#E6CCB2] rounded-lg">
                <button onclick="updateItem('${item.id}', 'qty', ${item.qty - 1})" class="px-2 py-0.5 text-xs text-[#6F4E37] hover:bg-[#F3ECE0] rounded-l-lg font-bold">-</button>
                <span class="px-2 text-xs font-semibold text-[#3D312A]">${item.qty}</span>
                <button onclick="updateItem('${item.id}', 'qty', ${item.qty + 1})" class="px-2 py-0.5 text-xs text-[#6F4E37] hover:bg-[#F3ECE0] rounded-r-lg font-bold">+</button>
              </div>
              <input type="number" value="${item.price}" onchange="updateItem('${item.id}', 'price', this.value)" class="w-24 px-2 py-1 text-right text-xs font-semibold bg-[#FDFBF7] border border-[#E6CCB2] rounded-lg focus:outline-none focus:border-[#6F4E37]">
              <span class="text-xs font-bold text-[#3D312A] w-24 text-right">${formatRupiah(itemLineTotal(item))}</span>
              <button onclick="removeItem('${item.id}')" class="text-[#9C6F44] hover:text-red-600 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
          </div>
          <div class="pt-2 border-t border-[#E6CCB2]/60 flex flex-wrap items-center gap-1.5">
            <span class="text-[11px] font-semibold text-[#9C6F44] mr-1">Pemilih:</span>
            ${participants
              .map((member) => {
                const color = colorOf(member.colorIndex);
                const chosen = (item.assignedTo || []).includes(member.id);
                return `<button onclick="toggleItemAssignment('${item.id}', '${member.id}')" class="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition flex items-center gap-1 ${chosen ? `${color.bg} ${color.text} ${color.border}` : 'bg-[#FDFBF7] text-[#6F4E37] border-[#E6CCB2] hover:bg-[#F3ECE0]'}>
                  ${escapeHtml(member.name)}${chosen ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}
                </button>`;
              })
              .join('')}
            ${participants.length === 0 ? '<span class="text-[11px] text-[#9C6F44] italic">Tambahkan anggota dulu.</span>' : ''}
          </div>
        </div>`;
    })
    .join('');
}

function renderPayerRows() {
  const participants = editorParticipants();
  const container = $('payerRows');
  if (draft.nota.paidBy.length === 0) {
    container.innerHTML = '<p class="text-[11px] text-[#9C6F44] italic">Belum ada pembayar. Tambahkan satu baris; default-nya Holder membayar seluruh nota.</p>';
  } else {
    container.innerHTML = draft.nota.paidBy
      .map(
        (row, index) => `
        <div class="flex gap-2 items-center">
          <select onchange="updatePayer(${index}, 'memberId', this.value)" class="flex-grow px-2 py-1.5 bg-[#FAF6F0] border border-[#E6CCB2] rounded-lg text-xs focus:outline-none focus:border-[#6F4E37]">
            ${participants.map((m) => `<option value="${m.id}" ${m.id === row.memberId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
          </select>
          <input type="number" value="${row.amount}" onchange="updatePayer(${index}, 'amount', this.value)" class="w-28 px-2 py-1.5 text-right bg-[#FAF6F0] border border-[#E6CCB2] rounded-lg text-xs focus:outline-none focus:border-[#6F4E37]">
          <button onclick="removePayerRow(${index})" class="text-[#9C6F44] hover:text-red-600 p-1"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>`
      )
      .join('');
  }

  const total = notaGrandTotal(draft.nota);
  const paid = paidByTotal(draft.nota);
  const remainder = total - paid;
  const box = $('payerRemainder');
  if (remainder === 0) {
    box.className = 'text-xs font-semibold rounded-lg px-3 py-2 border bg-emerald-50 border-emerald-300 text-emerald-800';
    box.textContent = 'Pembayar pas dengan total nota.';
  } else if (remainder > 0) {
    box.className = 'text-xs font-semibold rounded-lg px-3 py-2 border bg-amber-50 border-amber-300 text-amber-800';
    box.textContent = `Sisa belum terbayar: ${formatRupiah(remainder)} dari total ${formatRupiah(total)}.`;
  } else {
    box.className = 'text-xs font-semibold rounded-lg px-3 py-2 border bg-amber-50 border-amber-300 text-amber-800';
    box.textContent = `Kelebihan bayar: ${formatRupiah(-remainder)} di atas total ${formatRupiah(total)}.`;
  }
}

function renderEditorRoster() {
  const tim = editorTim();
  const participants = editorParticipants();
  $('editorRoster').innerHTML =
    participants.length === 0
      ? '<span class="text-xs text-[#9C6F44] italic">Belum ada anggota.</span>'
      : participants
          .map((member) => {
            const color = colorOf(member.colorIndex);
            return `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-sm ${color.bg} ${color.text} ${color.border}">
              ${escapeHtml(member.name)}${isHolder(tim, member.id) ? ' · Holder' : ''}
            </span>`;
          })
          .join('');
}

function renderEditorSummary() {
  if (!draft) return;
  const tim = editorTim();
  const { rows, grandTotal } = notaBreakdown(draft.nota, tim);
  $('grandTotalDisplay').textContent = formatRupiah(grandTotal);

  const unassigned = draft.nota.items.filter((item) => (item.assignedTo || []).length === 0).length;
  const pill = $('statusPill');
  const statusText = $('statusText');
  if (unassigned > 0) {
    pill.className = 'px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-amber-100 text-amber-800 border border-amber-300';
    statusText.textContent = `${unassigned} item belum ada pemilih`;
  } else if (rows.length === 0) {
    pill.className = 'px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-[#F3ECE0] text-[#6F4E37] border border-[#E6CCB2]';
    statusText.textContent = 'Belum ada item';
  } else {
    pill.className = 'px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300';
    statusText.textContent = 'Siap disimpan';
  }

  $('editorSummary').innerHTML =
    rows.length === 0
      ? '<p class="text-xs text-[#9C6F44] italic">Belum ada rincian.</p>'
      : rows
          .map((row) => {
            const member = findAnggota(tim, row.memberId);
            return `
              <div class="bg-[#FAF6F0] rounded-xl border border-[#E6CCB2] p-3 space-y-1">
                <div class="flex justify-between items-center gap-2">
                  <span class="text-xs font-bold text-[#3D312A]">${escapeHtml(member ? member.name : '?')}</span>
                  <span class="text-sm font-bold text-[#6F4E37]">${formatRupiah(row.total)}</span>
                </div>
                <p class="text-[10px] text-[#9C6F44]">item ${formatRupiah(row.subtotal)}${row.tax ? ` · pajak ${formatRupiah(row.tax)}` : ''}${row.service ? ` · layanan ${formatRupiah(row.service)}` : ''}${row.discount ? ` · diskon ${formatRupiah(row.discount)}` : ''}</p>
              </div>`;
          })
          .join('');
}

function isBackdated(nota, tim) {
  const occurred = nota.occurredAt || nota.createdAt;
  if (!occurred) return false;
  const touched = new Set();
  (nota.items || []).forEach((item) => (item.assignedTo || []).forEach((id) => touched.add(id)));
  (nota.paidBy || []).forEach((row) => touched.add(row.memberId));
  return [...touched].some((memberId) => {
    const member = findAnggota(tim, memberId);
    return member && member.joinedAt && String(occurred) < String(member.joinedAt);
  });
}

function renderBackdateWarning() {
  const tim = editorTim();
  const box = $('backdateWarning');
  if (isBackdated(draft.nota, tim)) {
    box.classList.remove('hidden');
    box.innerHTML =
      '<strong>Tanggal nota sebelum ada anggota bergabung.</strong> Nota tetap bisa disimpan, tapi periksa lagi siapa yang menanggung item ini.';
  } else {
    box.classList.add('hidden');
    box.innerHTML = '';
  }
}

function addNewItem() {
  draft.nota.items.push({ id: uid('item'), name: 'Item baru', qty: 1, price: 0, assignedTo: [] });
  syncDraftPayerDefault();
  renderEditor();
}

function updateItem(itemId, field, value) {
  const item = draft.nota.items.find((i) => i.id === itemId);
  if (!item) return;
  if (field === 'qty') item.qty = Math.max(1, Number(value) || 1);
  else if (field === 'price') item.price = Math.max(0, Number(value) || 0);
  else item.name = value;
  syncDraftPayerDefault();
  renderEditor();
}

function removeItem(itemId) {
  draft.nota.items = draft.nota.items.filter((i) => i.id !== itemId);
  syncDraftPayerDefault();
  renderEditor();
}

function toggleItemAssignment(itemId, memberId) {
  const item = draft.nota.items.find((i) => i.id === itemId);
  if (!item) return;
  const index = item.assignedTo.indexOf(memberId);
  if (index >= 0) item.assignedTo.splice(index, 1);
  else item.assignedTo.push(memberId);
  renderEditor();
}

function bagiRataUnassigned() {
  const participants = editorParticipants();
  if (participants.length === 0) {
    return showModal({ title: 'Belum ada peserta', body: '<p>Tambahkan anggota dulu.</p>' });
  }
  let count = 0;
  draft.nota.items.forEach((item) => {
    if ((item.assignedTo || []).length === 0) {
      item.assignedTo = participants.map((m) => m.id);
      count += 1;
    }
  });
  renderEditor();
  showToast(count ? `${count} item dibagi rata ke ${participants.length} anggota.` : 'Semua item sudah punya pemilih.');
}

function addPayerRow() {
  const participants = editorParticipants();
  if (participants.length === 0) return showModal({ title: 'Belum ada peserta', body: '<p>Tambahkan anggota dulu.</p>' });
  const used = new Set(draft.nota.paidBy.map((row) => row.memberId));
  const next = participants.find((m) => !used.has(m.id)) || participants[0];
  draft.nota.paidBy.push({ memberId: next.id, amount: 0 });
  draft.payersAuto = false;
  renderEditor();
}

function updatePayer(index, field, value) {
  const row = draft.nota.paidBy[index];
  if (!row) return;
  if (field === 'amount') row.amount = Math.max(0, Number(value) || 0);
  else row.memberId = value;
  draft.payersAuto = false;
  renderPayerRows();
  icons();
}

function removePayerRow(index) {
  draft.nota.paidBy.splice(index, 1);
  draft.payersAuto = false;
  renderEditor();
}

function addEditorMember() {
  if (!oneOff) return;
  const input = $('editorMemberInput');
  const name = input.value.trim();
  if (!name) return;
  const tim = editorTim();
  const result = addAnggota(tim, { id: uid('m'), name, colorIndex: tim.members.length }, nowIso());
  if (!result.ok) return showModal({ title: 'Tidak bisa menambah', body: `<p>${escapeHtml(result.message)}</p>` });
  let next = result.tim;
  if (!next.holderId) next = { ...next, holderId: next.members[next.members.length - 1].id };
  oneOff.tim = next;
  input.value = '';
  syncDraftPayerDefault();
  renderEditor();
}

function cancelEditor() {
  draft = null;
  if (oneOff) navigate('upload', { replace: true });
  else navigate('tim', { replace: true });
}

function confirmResetDraft() {
  showModal({
    title: 'Reset nota',
    body: '<p>Kosongkan item, pajak, dan pembayar pada nota ini?</p>',
    confirmLabel: 'Reset',
    onConfirm: () => {
      const id = draft.nota.id;
      const createdAt = draft.nota.createdAt;
      draft.nota = { ...blankNota(), id, createdAt };
      draft.payersAuto = true;
      syncDraftPayerDefault();
      renderEditor();
      showToast('Data nota dibersihkan.');
    },
  });
}

function saveNota() {
  const tim = editorTim();
  if (!draft || !tim) return;

  const nota = {
    ...draft.nota,
    occurredAt: draft.nota.occurredAt || nowIso(),
    createdAt: draft.nota.createdAt || nowIso(),
    paidBy: draft.nota.paidBy.map((row) => ({ memberId: row.memberId, amount: rupiah(row.amount) })),
  };

  let result;
  if (draft.notaId) result = updateNota(tim, nota, nowIso());
  else result = addNota(tim, nota, nowIso());

  if (!result.ok) {
    const errors = result.errors || [{ message: result.message }];
    return showModal({
      title: 'Nota belum bisa disimpan',
      body: `<ul class="text-sm space-y-1 list-disc pl-4">${errors.map((e) => `<li>${escapeHtml(e.message)}</li>`).join('')}</ul>`,
    });
  }

  commitTim(result.tim);
  draft = null;
  showToast(oneOff ? 'Nota dihitung. Tidak ada yang disimpan.' : 'Nota tersimpan.');

  if (oneOff) {
    navigate('tim', { replace: true });
  } else {
    navigate('tim', { replace: true });
  }
}

function removeNotaFromTim(notaId) {
  const tim = currentTim();
  const nota = tim.notes.find((b) => b.id === notaId);
  showModal({
    title: 'Hapus Nota',
    body: `<p>Hapus nota <strong>${escapeHtml(nota ? nota.merchant : 'ini')}</strong>? Konsumsi terkait ikut hilang.</p>`,
    confirmLabel: 'Hapus',
    danger: true,
    onConfirm: () => {
      const result = removeNota(currentTim(), notaId);
      if (!result.ok) return showModal({ title: 'Tidak bisa menghapus', body: `<p>${escapeHtml(result.message)}</p>` });
      commitTim(result.tim);
      render();
    },
  });
}

/* ------------------------------------------------------------------ *
 * One-off mode
 * ------------------------------------------------------------------ */

function startOneTime() {
  const now = nowIso();
  oneOff = {
    tim: {
      id: uid('onetime'),
      name: 'Sekali Pakai',
      members: [],
      holderId: null,
      notes: [],
      setorans: [],
      openingBalances: {},
      archivedAt: null,
      createdAt: now,
    },
  };
  activeTimId = null;
  draft = null;
  history = [];
  navigate('upload');
}

/* ------------------------------------------------------------------ *
 * OCR
 * ------------------------------------------------------------------ */

let cameraStream = null;

async function openCamera() {
  const overlay = $('cameraOverlay');
  const video = $('cameraVideo');
  const constraints = {
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  };

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    console.warn('Camera access failed:', error);
    return showModal({
      title: 'Kamera tidak tersedia',
      body: '<p>Tidak bisa mengakses kamera. Beri izin kamera di browser, atau pakai unggah galeri / nota manual.</p>',
    });
  }

  video.srcObject = cameraStream;
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
  icons();
}

function capturePhoto() {
  const video = $('cameraVideo');
  const canvas = $('cameraCanvas');
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  closeCamera();
  processImageWithAI(dataUrl.split(',')[1], 'image/jpeg');
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  const video = $('cameraVideo');
  video.srcObject = null;
  const overlay = $('cameraOverlay');
  overlay.classList.add('hidden');
  overlay.classList.remove('flex');
}

function openGallery() {
  $('galleryInput').click();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => processImageWithAI(e.target.result.split(',')[1], file.type);
  reader.readAsDataURL(file);
  event.target.value = '';
}

function ensureDraftForParsed() {
  if (draft) return;
  const tim = currentTim();
  if (!tim) return;
  draft = { notaId: null, nota: blankNota(), payersAuto: true, source: 'ocr' };
}

async function processImageWithAI(base64Data, mimeType) {
  navigate('loading');
  const endpoint = '/api/analyze-receipt';
  const payload = { image: base64Data, mimeType };
  let response = null;
  const delays = [1000, 2000, 4000];

  for (let i = 0; i <= delays.length; i += 1) {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) break;
    } catch (error) {
      /* retry */
    }
    if (i < delays.length) await new Promise((resolve) => setTimeout(resolve, delays[i]));
  }

  if (response && response.ok) {
    try {
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      if (content) {
        const clean = content.replace(/```json/g, '').replace(/```/g, '').trim();
        ensureDraftForParsed();
        populateParsedData(JSON.parse(clean));
        showToast('Foto nota dianalisis.');
        return;
      }
    } catch (error) {
      console.error('JSON parse error:', error);
    }
  }

  showModal({
    title: 'Analisis gagal',
    body: '<p>Server OCR tidak bisa memproses foto ini. Anda bisa mengisi nota secara manual.</p>',
    confirmLabel: 'Isi manual',
    onConfirm: () => {
      ensureDraftForParsed();
      if (!draft) return goHome();
      draft.nota.items = [{ id: uid('item'), name: 'Item baru', qty: 1, price: 0, assignedTo: [] }];
      navigate('editor');
    },
  });
}

function populateParsedData(data) {
  ensureDraftForParsed();
  if (!draft) return;
  draft.nota.merchant = data.merchant || 'Restoran / Kafe';
  draft.nota.tax = Number(data.tax) || 0;
  draft.nota.service = Number(data.service) || 0;
  draft.nota.discount = Number(data.discount) || 0;
  draft.nota.items = (data.items || []).map((item, index) => ({
    id: uid(`item_${index}`),
    name: item.name || `Menu ${index + 1}`,
    qty: Math.max(1, Number(item.qty) || 1),
    price: Math.max(0, Number(item.price) || 0),
    assignedTo: [],
  }));
  syncDraftPayerDefault();
  navigate('editor');
}

function loadSampleReceipt() {
  const sample = {
    merchant: 'Kopi & Teman Resto',
    items: [
      { name: 'Es Kopi Susu Aren', qty: 2, price: 22000 },
      { name: 'Nasi Goreng Spesial', qty: 1, price: 38000 },
      { name: 'Roti Bakar Coklat', qty: 1, price: 25000 },
      { name: 'French Fries', qty: 1, price: 20000 },
    ],
    tax: 12700,
    service: 6350,
    discount: 10000,
  };
  ensureDraftForParsed();
  if (!draft) return goHome();
  if (oneOff && editorTim().members.length === 0) {
    ['Andi', 'Budi', 'Citra'].forEach((name, index) => {
      const tim = editorTim();
      const result = addAnggota(tim, { id: uid('m'), name, colorIndex: index }, nowIso());
      if (result.ok) {
        let next = result.tim;
        if (!next.holderId) next = { ...next, holderId: next.members[next.members.length - 1].id };
        oneOff.tim = next;
      }
    });
  }
  populateParsedData(sample);
  showToast('Contoh nota dimuat.');
}

/* ------------------------------------------------------------------ *
 * Modal, toast, clipboard
 * ------------------------------------------------------------------ */

function readableRefusal(result) {
  const saldo = result.details?.saldo;
  if (typeof saldo !== 'number') return result.message;
  return result.message.replace(String(Math.abs(saldo)), formatRupiah(Math.abs(saldo)));
}

function showModal({ title, body, confirmLabel = null, onConfirm = null, danger = false }) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = body;
  const actions = $('modalActions');

  if (onConfirm) {
    actions.innerHTML = `
      <button id="modalCancelBtn" class="px-3 py-1.5 bg-[#FAF6F0] text-[#6F4E37] border border-[#E6CCB2] font-semibold text-xs rounded-xl hover:bg-[#F3ECE0] transition">Batal</button>
      <button id="modalConfirmBtn" class="px-4 py-1.5 ${danger ? 'bg-red-700 hover:bg-red-800' : 'bg-[#6F4E37] hover:bg-[#5C3D2E]'} text-[#FDFBF7] font-semibold text-xs rounded-xl transition">${escapeHtml(confirmLabel || 'Ya, lanjutkan')}</button>`;
    $('modalCancelBtn').addEventListener('click', closeModal);
    $('modalConfirmBtn').addEventListener('click', () => {
      closeModal();
      onConfirm();
    });
  } else {
    actions.innerHTML =
      '<button id="modalOkBtn" class="px-4 py-1.5 bg-[#6F4E37] text-[#FDFBF7] font-semibold text-xs rounded-xl hover:bg-[#5C3D2E] transition">Mengerti</button>';
    $('modalOkBtn').addEventListener('click', closeModal);
  }

  const modal = $('customModal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    $('modalContent').classList.remove('scale-95');
  }, 10);
}

function closeModal() {
  const modal = $('customModal');
  modal.classList.add('opacity-0');
  $('modalContent').classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

function showToast(message) {
  const toast = $('toast');
  $('toastMessage').textContent = message;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}

function copyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch (error) {
    console.error('Copy failed', error);
  }
  document.body.removeChild(textarea);
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function boot() {
  const savedTim = store.activeTimId ? findTim(store, store.activeTimId) : null;
  if (savedTim) {
    activeTimId = savedTim.id;
    view = 'tim';
  }
  render();
}

Object.assign(window, {
  goHome,
  goBack,
  startOneTime,
  startCreateTim,
  addDraftMember,
  removeDraftMember,
  confirmCreateTim,
  openTim,
  addAnggotaToTim,
  markAnggotaKeluar,
  reactivateAnggota,
  confirmHandover,
  archiveCurrentTim,
  unarchiveCurrentTim,
  deleteCurrentTim,
  startManualNota,
  editNota,
  draftChange,
  addNewItem,
  updateItem,
  removeItem,
  toggleItemAssignment,
  bagiRataUnassigned,
  addPayerRow,
  updatePayer,
  removePayerRow,
  addEditorMember,
  cancelEditor,
  confirmResetDraft,
  saveNota,
  removeNotaFromTim,
  openCamera,
  capturePhoto,
  closeCamera,
  openGallery,
  handleFileSelect,
  loadSampleReceipt,
  fromDateInputValue,
});

boot();