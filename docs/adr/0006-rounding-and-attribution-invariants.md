# 0006. Rounding residual goes to the Holder; unattributed cost cannot be saved

- Status: Accepted
- Date: 2026-10-20

## Context

`calculateBreakdowns` rounds each member's total to whole rupiah and then dumps the entire difference on the first member in the array:

```js
friendBreakdowns[0].total += pennyDiff;   // js/calc.js:83-91
```

`friendBreakdowns` follows roster order, so `[0]` is *whoever was added first* — not the Holder. That is a one-rupiah cosmetic issue on its own. It becomes a real one because the same three lines are the only thing catching a second, larger problem:

```js
const proportion = itemsSubtotal > 0 ? (friendSubtotal / itemsSubtotal) : 0;   // js/calc.js:70
```

`itemsSubtotal` includes Items whose `assignedTo` is empty, but no member's `friendSubtotal` ever contains those Items. So an unattributed Item inflates the denominator and `grandTotal` while belonging to nobody — and then `pennyDiff` hands its **entire cost, plus its proportional share of tax and service**, to roster-order member #1. On an OCR'd Nota, where every Item starts with `assignedTo: []`, that is the whole bill landing on one arbitrary person.

Nothing prevented saving it: `saveTeamBill` only requires `items.length > 0` (`js/app.js:396-399`). The UI does warn ("N menu belum ada pemilih"), and the summary is happy to print the wrong number anyway.

## Decision

1. **The Sisa Pembulatan goes to the Holder.** Look up the Holder's row by `holderId`; if the Holder consumed nothing on that Nota, fall back to row 0 as today. Roster order stops deciding who absorbs the residual.
2. **Unattributed cost cannot be saved.** `saveTeamBill` refuses while any Item has an empty `assignedTo`, offering the existing bagi-rata confirmation (`autoAssignUnassignedItems`, `js/app.js:833`) as the explicit resolution — which is also how a shared cost with no natural consumer is recorded (ADR-0003). Since ADR-0014, *everyone* means **all participants of this Periode**, not all members of the Tim.
3. **Rounding stays per-member, not per-item.** IDR has no sub-unit and a per-item largest-remainder allocation buys nothing but complexity.
4. **Item lines display whole rupiah.** `Item.shareAmount` is a fraction (`js/calc.js:60-65`) formatted at zero decimals, so a member's listed lines can sum ±Rp1 off their own total. The member total stays authoritative; this cosmetic delta is accepted and not corrected.

## Consequences

- Members #2..n are no longer able to inherit a bill's cost through a defect. This is the actual fix; the residual placement is the tidy-up.
- The rule "every rupiah of Konsumsi has exactly one owning Anggota" (ADR-0005) is now enforced at write time instead of assumed.
- An OCR'd Nota in a Tim Periode can no longer be saved straight from the parse — the user must assign every Item or press bagi-rata. This is the intended friction: it is the difference between a wrong settlement and a right one.
- Rejected: distributing the residual by largest fractional remainder. It is fairer on paper and unverifiable in practice — nobody can see a rupiah on a Rp180.000 dinner, but everybody can see the Holder absorbing it.