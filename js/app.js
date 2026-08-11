/** BagiRata app: home, one-time split, team period hub, settlement */

let store = loadStore();
let sessionMode = 'home'; // 'home' | 'onetime' | 'team' | 'createTeam' | 'settlement'
let activeTeamId = null;
let editingBillId = null;
let draftMembers = [];

let appState = {
  merchant: 'Restoran / Kafe',
  items: [],
  friends: [],
  tax: 0,
  service: 0,
  discount: 0
};

window.onload = function () {
  lucide.createIcons();
  showView('home');
};

/* ---------- Views ---------- */
function hideAllViews() {
  ['homeSection', 'createTeamSection', 'teamHubSection', 'settlementSection',
    'uploadSection', 'loadingSection', 'editorSection'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function showView(view) {
  hideAllViews();
  sessionMode = view;
  const resetBtn = document.getElementById('headerResetBtn');
  const homeBtn = document.getElementById('headerHomeBtn');

  if (view === 'home') {
    document.getElementById('homeSection').classList.remove('hidden');
    resetBtn.classList.add('hidden');
    homeBtn.classList.add('hidden');
    renderHome();
  } else if (view === 'createTeam') {
    document.getElementById('createTeamSection').classList.remove('hidden');
    resetBtn.classList.add('hidden');
    homeBtn.classList.remove('hidden');
    renderCreateTeam();
  } else if (view === 'team') {
    document.getElementById('teamHubSection').classList.remove('hidden');
    resetBtn.classList.add('hidden');
    homeBtn.classList.remove('hidden');
    renderTeamHub();
  } else if (view === 'settlement') {
    document.getElementById('settlementSection').classList.remove('hidden');
    resetBtn.classList.add('hidden');
    homeBtn.classList.remove('hidden');
    renderSettlement();
  } else if (view === 'onetime' || view === 'teamBill') {
    document.getElementById('uploadSection').classList.remove('hidden');
    resetBtn.classList.remove('hidden');
    homeBtn.classList.remove('hidden');
  }
  lucide.createIcons();
}

function goHome() {
  if (sessionMode === 'teamBill' && activeTeamId) {
    editingBillId = null;
    resetBillState(false);
    showView('team');
    return;
  }
  activeTeamId = null;
  editingBillId = null;
  draftMembers = [];
  resetBillState(false);
  showView('home');
}

function startOneTime() {
  activeTeamId = null;
  editingBillId = null;
  resetBillState(true);
  sessionMode = 'onetime';
  showView('onetime');
}

/* ---------- Home ---------- */
function renderHome() {
  store = loadStore();
  const open = store.teams.filter(t => t.status === 'open');
  const closed = store.teams.filter(t => t.status === 'closed');

  const openEl = document.getElementById('openTeamsList');
  const closedEl = document.getElementById('closedTeamsList');

  if (open.length === 0) {
    openEl.innerHTML = `<p class="text-sm text-[#9C6F44] italic">Belum ada tim aktif. Buat tim baru untuk periode split bill.</p>`;
  } else {
    openEl.innerHTML = open.map(t => {
      const holder = t.members.find(m => m.id === t.holderId);
      return `
        <button onclick="openTeam('${t.id}')" class="w-full text-left bg-[#FAF6F0] border border-[#E6CCB2] rounded-xl p-4 hover:border-[#D4A373] transition flex items-center justify-between gap-3">
          <div>
            <p class="font-bold text-[#3D312A]">${escapeHtml(t.name)}</p>
            <p class="text-xs text-[#9C6F44] mt-0.5">${t.members.length} anggota · ${t.bills.length} nota · Holder: ${escapeHtml(holder ? holder.name : '-')}</p>
          </div>
          <i data-lucide="chevron-right" class="w-5 h-5 text-[#6F4E37]"></i>
        </button>`;
    }).join('');
  }

  if (closed.length === 0) {
    closedEl.innerHTML = `<p class="text-sm text-[#9C6F44] italic">Belum ada riwayat periode tertutup.</p>`;
  } else {
    closedEl.innerHTML = closed.map(t => `
      <button onclick="openSettlement('${t.id}')" class="w-full text-left bg-[#FAF6F0] border border-[#E6CCB2] rounded-xl p-4 hover:border-[#D4A373] transition flex items-center justify-between gap-3">
        <div>
          <p class="font-bold text-[#3D312A]">${escapeHtml(t.name)}</p>
          <p class="text-xs text-[#9C6F44] mt-0.5">Ditutup ${t.closedAt ? new Date(t.closedAt).toLocaleDateString('id-ID') : '-'} · ${t.bills.length} nota</p>
        </div>
        <span class="text-[10px] font-semibold uppercase tracking-wide bg-[#F3ECE0] text-[#6F4E37] px-2 py-1 rounded-full">Selesai</span>
      </button>`).join('');
  }
  lucide.createIcons();
}

/* ---------- Create Team ---------- */
function startCreateTeam() {
  draftMembers = [];
  document.getElementById('teamNameInput').value = '';
  document.getElementById('draftMemberInput').value = '';
  showView('createTeam');
}

function renderCreateTeam() {
  const list = document.getElementById('draftMembersList');
  const holderSelect = document.getElementById('holderSelect');

  if (draftMembers.length === 0) {
    list.innerHTML = `<span class="text-xs text-[#9C6F44] italic">Tambahkan minimal 2 anggota.</span>`;
  } else {
    list.innerHTML = draftMembers.map((m, i) => {
      const color = FRIEND_COLORS[m.colorIndex % FRIEND_COLORS.length];
      return `
        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-sm ${color.bg} ${color.text} ${color.border}">
          <span>${escapeHtml(m.name)}</span>
          <button onclick="removeDraftMember(${i})" class="hover:opacity-75"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>`;
    }).join('');
  }

  holderSelect.innerHTML = draftMembers.length === 0
    ? `<option value="">— pilih setelah menambah anggota —</option>`
    : draftMembers.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');

  lucide.createIcons();
}

function addDraftMember() {
  const input = document.getElementById('draftMemberInput');
  const name = input.value.trim();
  if (!name) return;
  draftMembers.push({
    id: uid('m'),
    name,
    colorIndex: draftMembers.length % FRIEND_COLORS.length
  });
  input.value = '';
  renderCreateTeam();
}

function removeDraftMember(index) {
  draftMembers.splice(index, 1);
  draftMembers.forEach((m, i) => { m.colorIndex = i % FRIEND_COLORS.length; });
  renderCreateTeam();
}

function confirmCreateTeam() {
  const name = document.getElementById('teamNameInput').value.trim();
  const holderId = document.getElementById('holderSelect').value;
  if (!name) {
    showModal('Peringatan', 'Nama tim wajib diisi.');
    return;
  }
  if (draftMembers.length < 2) {
    showModal('Peringatan', 'Tambahkan minimal 2 anggota tim.');
    return;
  }
  if (!holderId) {
    showModal('Peringatan', 'Pilih pemegang dana (holder).');
    return;
  }

  const team = createTeamRecord({ name, members: draftMembers, holderId });
  store = loadStore();
  upsertTeam(store, team);
  draftMembers = [];
  openTeam(team.id);
  showToast('Tim periode berhasil dibuat.');
}

/* ---------- Team Hub ---------- */
function openTeam(teamId) {
  store = loadStore();
  const team = getTeam(store, teamId);
  if (!team) {
    showModal('Peringatan', 'Tim tidak ditemukan.');
    showView('home');
    return;
  }
  activeTeamId = teamId;
  if (team.status === 'closed') {
    openSettlement(teamId);
    return;
  }
  showView('team');
}

function getActiveTeam() {
  store = loadStore();
  return getTeam(store, activeTeamId);
}

function renderTeamHub() {
  const team = getActiveTeam();
  if (!team) return;

  document.getElementById('teamHubTitle').innerText = team.name;
  const holder = team.members.find(m => m.id === team.holderId);
  document.getElementById('teamHubSubtitle').innerText =
    `Pemegang dana: ${holder ? holder.name : '-'} · ${team.bills.length} nota`;

  const membersEl = document.getElementById('teamMembersChips');
  membersEl.innerHTML = team.members.map(m => {
    const color = FRIEND_COLORS[m.colorIndex % FRIEND_COLORS.length];
    const isHolder = m.id === team.holderId;
    return `
      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${color.bg} ${color.text} ${color.border}">
        ${escapeHtml(m.name)}
        ${isHolder ? '<span class="text-[10px] opacity-90 uppercase">Holder</span>' : ''}
      </span>`;
  }).join('');

  const settlement = calculateTeamSettlement(team);
  const balEl = document.getElementById('liveBalancesList');
  balEl.innerHTML = settlement.rows.map(r => {
    if (r.isHolder) {
      return `
        <div class="flex justify-between items-center text-sm py-2 border-b border-[#E6CCB2]/60">
          <span class="font-semibold">${escapeHtml(r.member.name)} <span class="text-[10px] text-[#9C6F44]">(Holder)</span></span>
          <span class="font-bold text-[#6F4E37]">Net ${formatRupiah(settlement.holderNet)}</span>
        </div>`;
    }
    const label = r.saldo > 0
      ? `utang ${formatRupiah(r.saldo)}`
      : r.saldo < 0
        ? `kredit ${formatRupiah(Math.abs(r.saldo))}`
        : 'lunas';
    const cls = r.saldo > 0 ? 'text-amber-800' : r.saldo < 0 ? 'text-emerald-700' : 'text-[#6F4E37]';
    return `
      <div class="flex justify-between items-center text-sm py-2 border-b border-[#E6CCB2]/60">
        <span>${escapeHtml(r.member.name)}
          <span class="text-[10px] text-[#9C6F44] block">konsumsi ${formatRupiah(r.consumed)} · setor ${formatRupiah(r.deposited)}</span>
        </span>
        <span class="font-semibold ${cls}">${label}</span>
      </div>`;
  }).join('');

  const billsEl = document.getElementById('teamBillsList');
  if (team.bills.length === 0) {
    billsEl.innerHTML = `<p class="text-sm text-[#9C6F44] italic">Belum ada nota. Tambah split bill untuk periode ini.</p>`;
  } else {
    billsEl.innerHTML = team.bills.map(b => `
      <button onclick="editTeamBill('${b.id}')" class="w-full text-left bg-[#FAF6F0] border border-[#E6CCB2] rounded-xl p-3 hover:border-[#D4A373] transition flex justify-between items-center gap-2">
        <div>
          <p class="font-semibold text-sm text-[#3D312A]">${escapeHtml(b.merchant)}</p>
          <p class="text-[11px] text-[#9C6F44]">${new Date(b.createdAt).toLocaleString('id-ID')}</p>
        </div>
        <span class="font-bold text-sm text-[#6F4E37]">${formatRupiah(getBillGrandTotal(b))}</span>
      </button>`).join('');
  }

  const depositSelect = document.getElementById('depositMemberSelect');
  depositSelect.innerHTML = team.members
    .filter(m => m.id !== team.holderId)
    .map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')
    || `<option value="">Tidak ada anggota non-holder</option>`;

  const depList = document.getElementById('depositsList');
  if (team.deposits.length === 0) {
    depList.innerHTML = `<p class="text-xs text-[#9C6F44] italic">Belum ada setoran.</p>`;
  } else {
    depList.innerHTML = [...team.deposits].reverse().map(d => {
      const m = team.members.find(x => x.id === d.memberId);
      return `
        <div class="flex justify-between text-xs py-1.5 border-b border-[#E6CCB2]/40">
          <span>${escapeHtml(m ? m.name : '?')} ${d.note ? '· ' + escapeHtml(d.note) : ''}
            <span class="text-[#9C6F44] block">${new Date(d.createdAt).toLocaleString('id-ID')}</span>
          </span>
          <span class="font-semibold text-emerald-700">${formatRupiah(d.amount)}</span>
        </div>`;
    }).join('');
  }

  lucide.createIcons();
}

function addDeposit() {
  const team = getActiveTeam();
  if (!team || team.status !== 'open') return;
  const memberId = document.getElementById('depositMemberSelect').value;
  const amount = Math.max(0, Number(document.getElementById('depositAmountInput').value) || 0);
  const note = document.getElementById('depositNoteInput').value.trim();
  if (!memberId || amount <= 0) {
    showModal('Peringatan', 'Pilih anggota dan isi jumlah setoran yang valid.');
    return;
  }
  team.deposits.push({
    id: uid('dep'),
    memberId,
    amount,
    note,
    createdAt: new Date().toISOString()
  });
  store = loadStore();
  upsertTeam(store, team);
  document.getElementById('depositAmountInput').value = '';
  document.getElementById('depositNoteInput').value = '';
  renderTeamHub();
  showToast('Setoran berhasil dicatat.');
}

function startNewTeamBill() {
  const team = getActiveTeam();
  if (!team) return;
  editingBillId = null;
  resetBillState(false);
  appState.friends = membersToFriends(team.members);
  sessionMode = 'teamBill';
  hideAllViews();
  document.getElementById('uploadSection').classList.remove('hidden');
  document.getElementById('headerResetBtn').classList.remove('hidden');
  document.getElementById('headerHomeBtn').classList.remove('hidden');
  updateTeamBillChrome();
  lucide.createIcons();
}

function editTeamBill(billId) {
  const team = getActiveTeam();
  if (!team) return;
  const bill = team.bills.find(b => b.id === billId);
  if (!bill) return;
  editingBillId = billId;
  appState = {
    merchant: bill.merchant,
    items: JSON.parse(JSON.stringify(bill.items)),
    friends: membersToFriends(team.members),
    tax: bill.tax,
    service: bill.service,
    discount: bill.discount
  };
  sessionMode = 'teamBill';
  hideAllViews();
  document.getElementById('uploadSection').classList.add('hidden');
  document.getElementById('loadingSection').classList.add('hidden');
  document.getElementById('editorSection').classList.remove('hidden');
  document.getElementById('headerResetBtn').classList.remove('hidden');
  document.getElementById('headerHomeBtn').classList.remove('hidden');
  document.getElementById('merchantName').value = appState.merchant;
  document.getElementById('taxInput').value = appState.tax || '';
  document.getElementById('serviceInput').value = appState.service || '';
  document.getElementById('discountInput').value = appState.discount || '';
  updateTeamBillChrome();
  renderAll();
}

function updateTeamBillChrome() {
  const addFriendWrap = document.getElementById('addFriendWrap');
  const saveBillBtn = document.getElementById('saveTeamBillBtn');
  const rosterHint = document.getElementById('rosterLockedHint');
  if (sessionMode === 'teamBill') {
    if (addFriendWrap) addFriendWrap.classList.add('hidden');
    if (saveBillBtn) saveBillBtn.classList.remove('hidden');
    if (rosterHint) rosterHint.classList.remove('hidden');
  } else {
    if (addFriendWrap) addFriendWrap.classList.remove('hidden');
    if (saveBillBtn) saveBillBtn.classList.add('hidden');
    if (rosterHint) rosterHint.classList.add('hidden');
  }
}

function saveTeamBill() {
  const team = getActiveTeam();
  if (!team || team.status !== 'open') return;
  if (appState.items.length === 0) {
    showModal('Peringatan', 'Tambahkan minimal satu item sebelum menyimpan nota.');
    return;
  }

  const billData = {
    id: editingBillId || uid('bill'),
    merchant: appState.merchant,
    items: JSON.parse(JSON.stringify(appState.items)),
    tax: appState.tax,
    service: appState.service,
    discount: appState.discount,
    createdAt: editingBillId
      ? (team.bills.find(b => b.id === editingBillId)?.createdAt || new Date().toISOString())
      : new Date().toISOString()
  };

  const idx = team.bills.findIndex(b => b.id === billData.id);
  if (idx >= 0) team.bills[idx] = billData;
  else team.bills.push(billData);

  store = loadStore();
  upsertTeam(store, team);
  editingBillId = null;
  resetBillState(false);
  showView('team');
  showToast('Nota tersimpan ke periode tim.');
}

function confirmClosePeriod() {
  const team = getActiveTeam();
  if (!team) return;
  showModal(
    'Tutup Periode',
    `Tutup periode "${team.name}"? Setelah ditutup, nota dan setoran menjadi read-only dan saldo vs holder akan ditampilkan.`,
    () => {
      team.status = 'closed';
      team.closedAt = new Date().toISOString();
      store = loadStore();
      upsertTeam(store, team);
      openSettlement(team.id);
      showToast('Periode ditutup.');
    }
  );
}

/* ---------- Settlement ---------- */
function openSettlement(teamId) {
  activeTeamId = teamId;
  showView('settlement');
}

function renderSettlement() {
  const team = getActiveTeam();
  if (!team) return;
  const settlement = calculateTeamSettlement(team);
  document.getElementById('settlementTitle').innerText = team.name;
  document.getElementById('settlementSubtitle').innerText = team.status === 'closed'
    ? `Periode ditutup · ${team.bills.length} nota`
    : `Pratinjau saldo · ${team.bills.length} nota`;

  const holderName = settlement.holder ? settlement.holder.name : 'Holder';
  const list = document.getElementById('settlementList');
  list.innerHTML = settlement.rows.map(r => {
    if (r.isHolder) {
      return `
        <div class="bg-[#F3ECE0] border border-[#E6CCB2] rounded-xl p-4 space-y-2">
          <div class="flex justify-between items-center">
            <span class="font-bold text-[#3D312A]">${escapeHtml(r.member.name)} · Pemegang Dana</span>
            <span class="text-sm font-bold text-[#6F4E37]">Net ${formatRupiah(settlement.holderNet)}</span>
          </div>
          <p class="text-xs text-[#9C6F44]">Masih ditagih: ${formatRupiah(settlement.owedToHolder)} · Kredit anggota: ${formatRupiah(settlement.creditFromHolder)}</p>
          <p class="text-xs text-[#6F4E37]">Konsumsi sendiri: ${formatRupiah(r.consumed)}</p>
        </div>`;
    }
    let msg, cls;
    if (r.saldo > 0) {
      msg = `Masih berutang ke ${holderName}: ${formatRupiah(r.saldo)}`;
      cls = 'border-amber-300 bg-amber-50';
    } else if (r.saldo < 0) {
      msg = `Kelebihan setoran (kredit dari ${holderName}): ${formatRupiah(Math.abs(r.saldo))}`;
      cls = 'border-emerald-300 bg-emerald-50';
    } else {
      msg = `Lunas dengan ${holderName}`;
      cls = 'border-[#E6CCB2] bg-[#FAF6F0]';
    }
    return `
      <div class="rounded-xl p-4 border ${cls} space-y-1">
        <p class="font-bold text-[#3D312A]">${escapeHtml(r.member.name)}</p>
        <p class="text-xs text-[#9C6F44]">Konsumsi ${formatRupiah(r.consumed)} · Setoran ${formatRupiah(r.deposited)}</p>
        <p class="text-sm font-semibold text-[#3D312A]">${msg}</p>
      </div>`;
  }).join('');
}

function copySettlementWA() {
  const team = getActiveTeam();
  if (!team) return;
  const settlement = calculateTeamSettlement(team);
  const holderName = settlement.holder ? settlement.holder.name : 'Holder';
  let text = `📒 *SETTLEMENT TIM - ${team.name.toUpperCase()}*\n`;
  text += `Pemegang dana: *${holderName}*\n`;
  text += `-----------------------------------------\n`;
  settlement.rows.forEach(r => {
    if (r.isHolder) {
      text += `💼 *${r.member.name}* (Holder)\n`;
      text += `  Konsumsi: ${formatRupiah(r.consumed)}\n`;
      text += `  Net posisi: ${formatRupiah(settlement.holderNet)}\n`;
    } else if (r.saldo > 0) {
      text += `👤 *${r.member.name}*\n`;
      text += `  Konsumsi: ${formatRupiah(r.consumed)} | Setor: ${formatRupiah(r.deposited)}\n`;
      text += `  *Masih utang ke ${holderName}: ${formatRupiah(r.saldo)}*\n`;
    } else if (r.saldo < 0) {
      text += `👤 *${r.member.name}*\n`;
      text += `  Konsumsi: ${formatRupiah(r.consumed)} | Setor: ${formatRupiah(r.deposited)}\n`;
      text += `  *Kredit dari ${holderName}: ${formatRupiah(Math.abs(r.saldo))}*\n`;
    } else {
      text += `👤 *${r.member.name}* — Lunas\n`;
    }
    text += `-----------------------------------------\n`;
  });
  text += `_Dihitung via BagiRata.ai_`;
  copyToClipboard(text);
  showToast('Ringkasan settlement disalin!');
}

/* ---------- Bill editor (shared) ---------- */
function resetBillState(clearFriends) {
  appState = {
    merchant: 'Restoran / Kafe',
    items: [],
    friends: clearFriends ? [] : appState.friends,
    tax: 0,
    service: 0,
    discount: 0
  };
  const tax = document.getElementById('taxInput');
  const svc = document.getElementById('serviceInput');
  const disc = document.getElementById('discountInput');
  const file = document.getElementById('fileInput');
  const galFile = document.getElementById('galleryInput');
  if (tax) tax.value = '';
  if (svc) svc.value = '';
  if (disc) disc.value = '';
  if (file) file.value = '';
  if (galFile) galFile.value = '';
  updateTeamBillChrome();
}

function confirmResetData() {
  showModal('Konfirmasi Reset', 'Apakah Anda yakin ingin menghapus data nota saat ini?', () => {
    const keepFriends = sessionMode === 'teamBill' ? [...appState.friends] : [];
    resetBillState(sessionMode !== 'teamBill');
    if (sessionMode === 'teamBill') appState.friends = keepFriends;
    document.getElementById('uploadSection').classList.remove('hidden');
    document.getElementById('editorSection').classList.add('hidden');
    document.getElementById('loadingSection').classList.add('hidden');
    showToast('Data nota dibersihkan.');
  });
}

function showModal(title, bodyText, onConfirm = null) {
  document.getElementById('modalTitle').innerText = title;
  document.getElementById('modalBody').innerText = bodyText;
  const actionsContainer = document.getElementById('modalActions');
  if (onConfirm) {
    actionsContainer.innerHTML = `
      <button onclick="closeModal()" class="px-3 py-1.5 bg-[#FAF6F0] text-[#6F4E37] border border-[#E6CCB2] font-semibold text-xs rounded-xl hover:bg-[#F3ECE0] transition">Batal</button>
      <button id="modalConfirmBtn" class="px-4 py-1.5 bg-[#6F4E37] text-[#FDFBF7] font-semibold text-xs rounded-xl hover:bg-[#5C3D2E] transition">Ya, Lanjutkan</button>`;
    document.getElementById('modalConfirmBtn').onclick = function () {
      closeModal();
      onConfirm();
    };
  } else {
    actionsContainer.innerHTML = `
      <button onclick="closeModal()" class="px-4 py-1.5 bg-[#6F4E37] text-[#FDFBF7] font-semibold text-xs rounded-xl hover:bg-[#5C3D2E] transition">Mengerti</button>`;
  }
  const modal = document.getElementById('customModal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    document.getElementById('modalContent').classList.remove('scale-95');
  }, 10);
}

function closeModal() {
  const modal = document.getElementById('customModal');
  modal.classList.add('opacity-0');
  document.getElementById('modalContent').classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMessage').innerText = message;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}

/* ---------- Camera (getUserMedia) ---------- */
let cameraStream = null;

async function openCamera() {
  const overlay = document.getElementById('cameraOverlay');
  const video = document.getElementById('cameraVideo');

  // Use rear camera on mobile (facingMode: environment), any available camera on desktop
  const constraints = {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  };

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.warn('Camera access failed:', err);
    showModal(
      'Kamera Tidak Tersedia',
      'Tidak dapat mengakses kamera. Pastikan Anda memberikan izin kamera di browser, atau gunakan opsi Unggah dari Galeri sebagai alternatif.'
    );
    return;
  }

  video.srcObject = cameraStream;
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
  lucide.createIcons();
}

function capturePhoto() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  const ctx = canvas.getContext('2d');

  // Set canvas size to match video dimensions
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Extract base64 JPEG from canvas
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64Data = dataUrl.split(',')[1];

  closeCamera();
  processImageWithAI(base64Data, 'image/jpeg');
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraVideo');
  video.srcObject = null;
  const overlay = document.getElementById('cameraOverlay');
  overlay.classList.add('hidden');
  overlay.classList.remove('flex');
}

function openGallery() {
  document.getElementById('galleryInput').click();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const base64Data = e.target.result.split(',')[1];
    processImageWithAI(base64Data, file.type);
  };
  reader.readAsDataURL(file);
  // Reset input so re-selecting the same file still triggers onchange
  event.target.value = '';
}

async function processImageWithAI(base64Data, mimeType) {
  document.getElementById('uploadSection').classList.add('hidden');
  document.getElementById('loadingSection').classList.remove('hidden');
  const endpoint = '/.netlify/functions/analyze-receipt';
  const payload = { image: base64Data, mimeType };
  let response = null;
  const delays = [1000, 2000, 4000];
  for (let i = 0; i <= delays.length; i++) {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) break;
    } catch (e) { /* retry */ }
    if (i < delays.length) await new Promise(res => setTimeout(res, delays[i]));
  }
  document.getElementById('loadingSection').classList.add('hidden');
  if (response && response.ok) {
    try {
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      if (content) {
        const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
        populateParsedData(JSON.parse(cleanJson));
        showToast('Foto nota berhasil dianalisis via Netlify API!');
        return;
      }
    } catch (err) {
      console.error('JSON Parse Error:', err);
    }
  }
  showModal('Pemberitahuan Analisis', 'Gagal memproses foto nota melalui server Netlify. Mengalihkan Anda ke mode manual dengan contoh data nota.', () => {
    loadSampleReceipt();
  });
}

function loadSampleReceipt() {
  const sampleData = {
    merchant: 'Kopi & Teman Resto',
    items: [
      { name: 'Es Kopi Susu Aren', qty: 2, price: 22000 },
      { name: 'Nasi Goreng Spesial', qty: 1, price: 38000 },
      { name: 'Roti Bakar Coklat', qty: 1, price: 25000 },
      { name: 'French Fries', qty: 1, price: 20000 }
    ],
    tax: 12700,
    service: 6350,
    discount: 10000
  };
  document.getElementById('uploadSection').classList.add('hidden');
  document.getElementById('loadingSection').classList.add('hidden');
  populateParsedData(sampleData);

  if (sessionMode !== 'teamBill' && appState.friends.length === 0) {
    appState.friends = [
      { id: 'f1', name: 'Andi', color: FRIEND_COLORS[0] },
      { id: 'f2', name: 'Budi', color: FRIEND_COLORS[1] },
      { id: 'f3', name: 'Citra', color: FRIEND_COLORS[2] }
    ];
    appState.items[0].assignedTo = ['f1', 'f2'];
    appState.items[1].assignedTo = ['f2'];
    appState.items[2].assignedTo = ['f3'];
    appState.items[3].assignedTo = ['f1', 'f2', 'f3'];
  }
  renderAll();
  showToast('Contoh nota berhasil dimuat.');
}

function populateParsedData(data) {
  appState.merchant = data.merchant || 'Restoran / Kafe';
  appState.tax = Number(data.tax) || 0;
  appState.service = Number(data.service) || 0;
  appState.discount = Number(data.discount) || 0;
  document.getElementById('merchantName').value = appState.merchant;
  document.getElementById('taxInput').value = appState.tax || '';
  document.getElementById('serviceInput').value = appState.service || '';
  document.getElementById('discountInput').value = appState.discount || '';
  appState.items = (data.items || []).map((item, index) => ({
    id: 'item_' + Date.now() + '_' + index,
    name: item.name || 'Menu ' + (index + 1),
    qty: Math.max(1, Number(item.qty) || 1),
    price: Math.max(0, Number(item.price) || 0),
    assignedTo: []
  }));
  document.getElementById('editorSection').classList.remove('hidden');
  updateTeamBillChrome();
  renderAll();
}

function updateCostState(key, val) {
  appState[key] = Math.max(0, Number(val) || 0);
  renderAll();
}

function addNewItem() {
  appState.items.push({
    id: 'item_' + Date.now(),
    name: 'Menu Baru',
    qty: 1,
    price: 10000,
    assignedTo: []
  });
  renderAll();
}

function updateItem(id, field, val) {
  const item = appState.items.find(i => i.id === id);
  if (!item) return;
  if (field === 'qty') item.qty = Math.max(1, Number(val) || 1);
  else if (field === 'price') item.price = Math.max(0, Number(val) || 0);
  else if (field === 'name') item.name = val;
  renderAll();
}

function removeItem(id) {
  appState.items = appState.items.filter(i => i.id !== id);
  renderAll();
}

function toggleItemAssignment(itemId, friendId) {
  const item = appState.items.find(i => i.id === itemId);
  if (!item) return;
  const idx = item.assignedTo.indexOf(friendId);
  if (idx > -1) item.assignedTo.splice(idx, 1);
  else item.assignedTo.push(friendId);
  renderAll();
}

function addFriend() {
  if (sessionMode === 'teamBill') return;
  const input = document.getElementById('friendNameInput');
  const name = input.value.trim();
  if (!name) return;
  const colorIndex = appState.friends.length % FRIEND_COLORS.length;
  appState.friends.push({
    id: 'f_' + Date.now(),
    name,
    color: FRIEND_COLORS[colorIndex]
  });
  input.value = '';
  renderAll();
}

function removeFriend(friendId) {
  if (sessionMode === 'teamBill') {
    showToast('Anggota tim terkunci untuk periode ini.');
    return;
  }
  appState.friends = appState.friends.filter(f => f.id !== friendId);
  appState.items.forEach(item => {
    item.assignedTo = item.assignedTo.filter(id => id !== friendId);
  });
  renderAll();
}

function autoAssignUnassignedItems() {
  if (appState.friends.length === 0) {
    showModal('Peringatan', 'Silakan tambahkan anggota kelompok terlebih dahulu di panel kanan.');
    return;
  }
  let assignedCount = 0;
  const allFriendIds = appState.friends.map(f => f.id);
  appState.items.forEach(item => {
    if (item.assignedTo.length === 0) {
      item.assignedTo = [...allFriendIds];
      assignedCount++;
    }
  });
  if (assignedCount > 0) {
    renderAll();
    showToast(`${assignedCount} menu berhasil dibagi rata ke semua anggota.`);
  } else {
    showToast('Semua menu sudah memiliki pemilih.');
  }
}

function renderAll() {
  document.getElementById('taxFormatted').innerText = formatRupiah(appState.tax);
  document.getElementById('serviceFormatted').innerText = formatRupiah(appState.service);
  document.getElementById('discountFormatted').innerText = formatRupiah(appState.discount);
  renderItemList();
  renderFriendsList();
  calculateAndRenderSummary();
  lucide.createIcons();
}

function renderItemList() {
  const container = document.getElementById('itemList');
  if (appState.items.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-xs text-[#9C6F44]">Belum ada item pesanan. Klik "Tambah Menu" di atas.</div>`;
    return;
  }
  container.innerHTML = appState.items.map(item => {
    const totalItemPrice = item.qty * item.price;
    const isUnassigned = item.assignedTo.length === 0;
    return `
      <div class="bg-[#FAF6F0] p-3.5 rounded-xl border ${isUnassigned ? 'border-amber-400/70 bg-amber-50/30' : 'border-[#E6CCB2]'} space-y-2.5 transition">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex-grow">
            <input type="text" value="${escapeHtml(item.name)}" onchange="updateItem('${item.id}', 'name', this.value)" class="w-full font-semibold text-sm text-[#3D312A] bg-transparent border-b border-transparent hover:border-[#E6CCB2] focus:border-[#6F4E37] focus:outline-none px-1 py-0.5 rounded">
          </div>
          <div class="flex items-center gap-2 justify-between sm:justify-end">
            <div class="flex items-center bg-[#FDFBF7] border border-[#E6CCB2] rounded-lg">
              <button onclick="updateItem('${item.id}', 'qty', ${item.qty - 1})" class="px-2 py-0.5 text-xs text-[#6F4E37] hover:bg-[#F3ECE0] rounded-l-lg font-bold">-</button>
              <span class="px-2 text-xs font-semibold text-[#3D312A]">${item.qty}</span>
              <button onclick="updateItem('${item.id}', 'qty', ${item.qty + 1})" class="px-2 py-0.5 text-xs text-[#6F4E37] hover:bg-[#F3ECE0] rounded-r-lg font-bold">+</button>
            </div>
            <div class="relative w-28">
              <span class="absolute left-2 top-1 text-xs text-[#9C6F44] font-medium">@</span>
              <input type="number" value="${item.price}" onchange="updateItem('${item.id}', 'price', this.value)" class="w-full pl-6 pr-1.5 py-1 text-right text-xs font-semibold bg-[#FDFBF7] border border-[#E6CCB2] rounded-lg focus:outline-none focus:border-[#6F4E37]">
            </div>
            <span class="text-xs font-bold text-[#3D312A] w-24 text-right">${formatRupiah(totalItemPrice)}</span>
            <button onclick="removeItem('${item.id}')" class="text-[#9C6F44] hover:text-red-600 p-1 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div>
        </div>
        <div class="pt-2 border-t border-[#E6CCB2]/60 flex flex-wrap items-center gap-1.5">
          <span class="text-[11px] font-semibold text-[#9C6F44] mr-1">Pemilih:</span>
          ${appState.friends.map(friend => {
            const isAssigned = item.assignedTo.includes(friend.id);
            return `
              <button onclick="toggleItemAssignment('${item.id}', '${friend.id}')" class="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition flex items-center gap-1 ${isAssigned ? `${friend.color.bg} ${friend.color.text} ${friend.color.border}` : 'bg-[#FDFBF7] text-[#6F4E37] border-[#E6CCB2] hover:bg-[#F3ECE0]'}">
                <span>${escapeHtml(friend.name)}</span>
                ${isAssigned ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}
              </button>`;
          }).join('')}
          ${appState.friends.length === 0 ? '<span class="text-[11px] text-[#9C6F44] italic">Tambah anggota dulu di panel kanan</span>' : ''}
        </div>
      </div>`;
  }).join('');
}

function renderFriendsList() {
  const container = document.getElementById('friendsList');
  if (appState.friends.length === 0) {
    container.innerHTML = `<span class="text-xs text-[#9C6F44] italic">Belum ada anggota yang ditambahkan.</span>`;
    return;
  }
  container.innerHTML = appState.friends.map(friend => `
    <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-sm ${friend.color.bg} ${friend.color.text} ${friend.color.border}">
      <span>${escapeHtml(friend.name)}</span>
      ${sessionMode === 'teamBill' ? '' : `
        <button onclick="removeFriend('${friend.id}')" class="hover:opacity-75 transition"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>`}
    </div>`).join('');
}

function calculateAndRenderSummary() {
  const { friendBreakdowns, grandTotal } = calculateBreakdowns(appState);
  document.getElementById('grandTotalDisplay').innerText = formatRupiah(grandTotal);

  const unassignedItems = appState.items.filter(i => i.assignedTo.length === 0);
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  if (unassignedItems.length > 0) {
    statusPill.className = 'px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-amber-100 text-amber-800 border border-amber-300';
    statusText.innerText = `${unassignedItems.length} menu belum ada pemilih`;
  } else if (appState.friends.length === 0) {
    statusPill.className = 'px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-[#F3ECE0] text-[#6F4E37] border border-[#E6CCB2]';
    statusText.innerText = 'Tambahkan anggota kelompok';
  } else {
    statusPill.className = 'px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300';
    statusText.innerText = 'Sesuai Struk (Presisi 100%)';
  }

  const container = document.getElementById('personSummaryList');
  if (friendBreakdowns.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-xs text-[#9C6F44]">Belum ada rincian anggota.</div>`;
    return;
  }
  container.innerHTML = friendBreakdowns.map(data => `
    <div class="bg-[#FAF6F0] p-4 rounded-xl border border-[#E6CCB2] space-y-3">
      <div class="flex items-center justify-between pb-2 border-b border-[#E6CCB2]">
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${data.friend.color.bg} ${data.friend.color.text}">${escapeHtml(data.friend.name)}</span>
        </div>
        <button onclick="copySingleSummary('${data.friend.id}')" class="text-xs font-semibold text-[#6F4E37] hover:text-[#3D312A] bg-[#FDFBF7] hover:bg-[#F3ECE0] px-2.5 py-1 rounded-lg border border-[#E6CCB2] transition flex items-center gap-1">
          <i data-lucide="copy" class="w-3 h-3"></i><span>Salin</span>
        </button>
      </div>
      <div class="space-y-1 text-xs text-[#3D312A]">
        ${data.items.length === 0 ? '<p class="text-[#9C6F44] italic">Belum memilih menu apapun</p>' : ''}
        ${data.items.map(i => `
          <div class="flex justify-between">
            <span class="text-[#6F4E37]">${escapeHtml(i.name)} <span class="text-[10px] text-[#9C6F44]">(${i.portion} porsi)</span></span>
            <span class="font-medium">${formatRupiah(i.price)}</span>
          </div>`).join('')}
        ${data.tax > 0 ? `<div class="flex justify-between text-[#9C6F44] pt-1"><span>Pajak (Proporsional)</span><span>+${formatRupiah(data.tax)}</span></div>` : ''}
        ${data.service > 0 ? `<div class="flex justify-between text-[#9C6F44]"><span>Layanan (Proporsional)</span><span>+${formatRupiah(data.service)}</span></div>` : ''}
        ${data.discount > 0 ? `<div class="flex justify-between text-emerald-700"><span>Diskon (Proporsional)</span><span>-${formatRupiah(data.discount)}</span></div>` : ''}
      </div>
      <div class="pt-2 border-t border-[#E6CCB2] flex justify-between items-center font-bold text-sm text-[#3D312A]">
        <span>Total Tagihan:</span>
        <span class="text-[#6F4E37] text-base">${formatRupiah(data.total)}</span>
      </div>
    </div>`).join('');
}

function generateWAFormatForPerson(friendId) {
  const { friendBreakdowns } = calculateBreakdowns(appState);
  const data = friendBreakdowns.find(b => b.friend.id === friendId);
  if (!data) return '';
  let text = `👤 *${data.friend.name}*\n`;
  text += data.items.map(i => `  • ${i.name} (${i.portion} porsi) - ${formatRupiah(i.price)}`).join('\n') + '\n';
  if (data.tax > 0) text += `  • Pajak (Proporsional) - +${formatRupiah(data.tax)}\n`;
  if (data.service > 0) text += `  • Layanan (Proporsional) - +${formatRupiah(data.service)}\n`;
  if (data.discount > 0) text += `  • Diskon (Proporsional) - -${formatRupiah(data.discount)}\n`;
  text += `  *TOTAL TAGIHAN: ${formatRupiah(data.total)}*`;
  return text;
}

function copySingleSummary(friendId) {
  const friend = appState.friends.find(f => f.id === friendId);
  const waText = `🧾 *RINCIAN BAGI RATA - ${appState.merchant.toUpperCase()}*\n\n` + generateWAFormatForPerson(friendId) + `\n\n_Dihitung otomatis via BagiRata.ai_`;
  copyToClipboard(waText);
  showToast(`Rincian tagihan ${friend ? friend.name : ''} disalin!`);
}

function copyAllSummary() {
  if (appState.friends.length === 0) {
    showModal('Peringatan', 'Belum ada data anggota untuk disalin.');
    return;
  }
  const { grandTotal } = calculateBreakdowns(appState);
  let text = `🧾 *RINCIAN BAGI RATA - ${appState.merchant.toUpperCase()}*\n`;
  text += `-----------------------------------------\n`;
  appState.friends.forEach(friend => {
    text += generateWAFormatForPerson(friend.id) + `\n-----------------------------------------\n`;
  });
  text += `*TOTAL KESELURUHAN STRUK: ${formatRupiah(grandTotal)}*\n`;
  text += `_Dihitung adil & presisi menggunakan BagiRata.ai_`;
  copyToClipboard(text);
  showToast('Seluruh tagihan berhasil disalin ke WhatsApp!');
}

function copyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try { document.execCommand('copy'); } catch (err) { console.error('Fallback Copy Error:', err); }
  document.body.removeChild(textarea);
}
