/** Shared split-bill calculation helpers */
const FRIEND_COLORS = [
  { bg: 'bg-[#6F4E37]', text: 'text-[#FDFBF7]', border: 'border-[#5C3D2E]' },
  { bg: 'bg-[#D4A373]', text: 'text-[#3D312A]', border: 'border-[#B98B5E]' },
  { bg: 'bg-[#C27D38]', text: 'text-[#FDFBF7]', border: 'border-[#A06328]' },
  { bg: 'bg-[#A3B18A]', text: 'text-[#3D312A]', border: 'border-[#87986A]' },
  { bg: 'bg-[#E07A5F]', text: 'text-[#FDFBF7]', border: 'border-[#C25E45]' },
  { bg: 'bg-[#8D5B4C]', text: 'text-[#FDFBF7]', border: 'border-[#704437]' },
  { bg: 'bg-[#3D405B]', text: 'text-[#FDFBF7]', border: 'border-[#2B2D42]' },
];

function formatRupiah(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(num);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getItemsSubtotal(items) {
  return (items || []).reduce((sum, item) => sum + (item.qty * item.price), 0);
}

function getBillGrandTotal(bill) {
  const itemsSubtotal = getItemsSubtotal(bill.items);
  return itemsSubtotal + (Number(bill.tax) || 0) + (Number(bill.service) || 0) - (Number(bill.discount) || 0);
}

/**
 * Calculate per-friend breakdowns with proportional tax/service/discount
 * and penny adjustment so totals match the receipt.
 */
function calculateBreakdowns(bill) {
  const friends = bill.friends || [];
  const items = bill.items || [];
  const tax = Number(bill.tax) || 0;
  const service = Number(bill.service) || 0;
  const discount = Number(bill.discount) || 0;
  const itemsSubtotal = getItemsSubtotal(items);
  const grandTotal = itemsSubtotal + tax + service - discount;

  const friendBreakdowns = friends.map(friend => {
    const friendItems = [];
    let friendSubtotal = 0;

    items.forEach(item => {
      if ((item.assignedTo || []).includes(friend.id)) {
        const splitCount = item.assignedTo.length;
        const itemTotalPrice = item.qty * item.price;
        const shareAmount = itemTotalPrice / splitCount;
        friendSubtotal += shareAmount;
        friendItems.push({
          name: item.name,
          portion: splitCount > 1 ? `1/${splitCount}` : '1',
          price: shareAmount
        });
      }
    });

    const proportion = itemsSubtotal > 0 ? (friendSubtotal / itemsSubtotal) : 0;
    const propTax = tax * proportion;
    const propService = service * proportion;
    const propDiscount = discount * proportion;
    const unroundedTotal = friendSubtotal + propTax + propService - propDiscount;

    return {
      friend,
      items: friendItems,
      subtotal: friendSubtotal,
      tax: propTax,
      service: propService,
      discount: propDiscount,
      total: Math.round(unroundedTotal)
    };
  });

  const calculatedSum = friendBreakdowns.reduce((sum, f) => sum + f.total, 0);
  const pennyDiff = grandTotal - calculatedSum;
  if (pennyDiff !== 0 && friendBreakdowns.length > 0) {
    friendBreakdowns[0].total += pennyDiff;
  }

  return { friendBreakdowns, itemsSubtotal, grandTotal };
}

function getMemberConsumption(team, memberId) {
  let total = 0;
  (team.bills || []).forEach(bill => {
    const friends = (team.members || []).map(m => ({
      id: m.id,
      name: m.name,
      color: FRIEND_COLORS[m.colorIndex % FRIEND_COLORS.length]
    }));
    const { friendBreakdowns } = calculateBreakdowns({
      ...bill,
      friends
    });
    const row = friendBreakdowns.find(b => b.friend.id === memberId);
    if (row) total += row.total;
  });
  return total;
}

function getMemberDeposits(team, memberId) {
  return (team.deposits || [])
    .filter(d => d.memberId === memberId)
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
}

/**
 * Settlement vs holder:
 * saldo = konsumsi - setoran
 * >0 member owes holder; <0 member has credit
 */
function calculateTeamSettlement(team) {
  const holderId = team.holderId;
  const holder = (team.members || []).find(m => m.id === holderId);
  const rows = (team.members || []).map(member => {
    const consumed = getMemberConsumption(team, member.id);
    const deposited = getMemberDeposits(team, member.id);
    const saldo = consumed - deposited;
    return {
      member,
      consumed,
      deposited,
      saldo,
      isHolder: member.id === holderId
    };
  });

  const nonHolder = rows.filter(r => !r.isHolder);
  const owedToHolder = nonHolder.filter(r => r.saldo > 0).reduce((s, r) => s + r.saldo, 0);
  const creditFromHolder = nonHolder.filter(r => r.saldo < 0).reduce((s, r) => s + Math.abs(r.saldo), 0);
  const holderNet = owedToHolder - creditFromHolder;

  return { rows, holder, owedToHolder, creditFromHolder, holderNet };
}

function uid(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}
