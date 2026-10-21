/** Display helpers: currency, escaping, dates, colours. No arithmetic. */

export const FRIEND_COLORS = [
  { bg: 'bg-[#6F4E37]', text: 'text-[#FDFBF7]', border: 'border-[#5C3D2E]' },
  { bg: 'bg-[#D4A373]', text: 'text-[#3D312A]', border: 'border-[#B98B5E]' },
  { bg: 'bg-[#C27D38]', text: 'text-[#FDFBF7]', border: 'border-[#A06328]' },
  { bg: 'bg-[#A3B18A]', text: 'text-[#3D312A]', border: 'border-[#87986A]' },
  { bg: 'bg-[#E07A5F]', text: 'text-[#FDFBF7]', border: 'border-[#C25E45]' },
  { bg: 'bg-[#8D5B4C]', text: 'text-[#FDFBF7]', border: 'border-[#704437]' },
  { bg: 'bg-[#3D405B]', text: 'text-[#FDFBF7]', border: 'border-[#2B2D42]' },
];

export function colorOf(colorIndex) {
  const index = Number.isInteger(colorIndex) ? colorIndex : 0;
  return FRIEND_COLORS[((index % FRIEND_COLORS.length) + FRIEND_COLORS.length) % FRIEND_COLORS.length];
}

export function formatRupiah(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatSignedRupiah(amount) {
  const num = Number(amount) || 0;
  return `${num >= 0 ? '+' : '−'}${formatRupiah(Math.abs(num))}`;
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatDate(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(iso)} · ${hours}:${minutes}`;
}

export function toDateInputValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromDateInputValue(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Periode #3 · dibuka 20 Okt 2026 — free text label wins, always escaped by the caller. */
export function periodeLabel(periode, index) {
  if (periode && periode.label) return String(periode.label);
  return `Periode #${index + 1} · dibuka ${formatDate(periode && periode.openedAt)}`;
}

export function saldoWord(saldo) {
  if (saldo > 0) return 'utang ke Holder';
  if (saldo < 0) return 'kredit dari Holder';
  return 'lunas';
}
