# 0002. Setoran are signed ledger entries

- Status: Accepted
- Date: 2026-10-20

## Context

A Setoran is a period-wide record of money moving between an Anggota and the Holder (`js/storage.js:50`, written by `addDeposit` at `js/app.js:309-332`). The amount is floored at zero (`js/app.js:313`) and the Holder is excluded from the depositor picker (`js/app.js:286`).

Because every Nota was implicitly Holder-funded (ADR-0001), and deposits were never drawn down as a fund, a Setoran's *timing* could not affect the arithmetic — only its total. That part is coherent and worth keeping: it means a member can deposit before or after the meals and the numbers agree.

The gap is the opposite direction. There is no entry type for money the Holder hands *back*: a member over-deposited, a Nota was voided after a Setoran, a member leaves and takes their credit out. Today the only way to express any of these is to edit or delete the historical Setoran, which destroys the record of an event that actually happened.

## Decision

A Setoran's amount is **signed**.

- **Positive** — cash handed to the Holder. Unchanged.
- **Negative** — a **Pengembalian**: cash the Holder returned to that member. A note is required, because the amount alone does not say why.

The `Math.max(0, …)` floor is removed. The Holder remains excluded from the depositor picker: a Setoran is money moving *between* the Holder and someone else, so the Holder cannot be either end of it. To take cash out of their pocket the Holder uses a Nota's `paidBy` (ADR-0001), not a Setoran.

`saldo = konsumsi − setoran` is unchanged.

## Consequences

- Refunds stop being corrections and become events. The Setoran list on the team hub is now a true cash ledger between members and the Holder, in both directions.
- `-` amounts must be visually distinct in the Setoran list; a negative entry rendered in the same green as a positive one is a bug waiting to happen.
- The formula is untouched, so nothing in the Settlement needs to know refunds exist — it only sees a smaller `deposited` total.
- Totals can now be negative, which is correct and must not be clamped anywhere else. Any `Math.max(0, …)` applied to a Setoran total or a `saldo` is a bug.
- Rejected: modelling a refund as a Nota with a negative price, or as a discount. Those are cost-side concepts; a Pengembalian is a cash-side event and belongs in the Setoran ledger where the audit trail is.