# 0004. Periods close manually, can be reopened, and snapshot their settlement

- Status: Accepted, extended by ADR-0013 (the snapshot seeds the next Periode) and ADR-0016 (a Periode has a label; dates are recorded, never constraints)
- Date: 2026-10-20

## Context

A Tim has `status: 'open' | 'closed'` plus `createdAt`/`closedAt` and nothing else (`js/storage.js:39-55`). No start or end dates, no reopen.

Closing was **one-way and irreversible** (`confirmClosePeriod`, `js/app.js:425-440`). A misclick on "Tutup Periode" could never be undone: `openTeam` silently redirects a closed Tim to the Settlement screen (`js/app.js:213-216`), `addDeposit` and `saveTeamBill` refuse to write, and there is no "buka kembali" anywhere in the UI.

The Settlement itself was a live recomputation from `team.bills` and `team.deposits` on every render (`js/calc.js:125-147`). It was frozen in practice only because writes were blocked — the numbers were never *stored*.

## Decision

1. **No explicit start/end dates on a Periode.** A Periode opens when the Tim is created and ends when the user closes it. "Periode" here means *an open ledger that gets closed*; that is the feature, not a missing field.
2. **Closing is reversible.** Add a "Buka kembali periode" action that returns the Tim to `open`, letting Nota and Setoran be corrected.
3. **At close, snapshot the Settlement.** Store the computed rows onto the Tim record at `closedAt`. A closed Periode renders its snapshot.

Because closing is now reversible, point 3 is what protects the audit trail: without it, reopening and editing would silently rewrite a settlement that members may already have paid each other against.

## Consequences

- A closed Periode's displayed Settlement must come from the snapshot, not from a recomputation, or point 3 achieves nothing. The live computation stays the source of truth while `open`.
- The snapshot must be replaced on every re-close, otherwise a corrected Periode keeps showing its first, wrong settlement. `closedAt` moves with it.
- Anything that changes a Nota, a Setoran, or the roster after a close is a reopen first. Model that as a UI flow (reopen → edit → close again), not as a silent write behind a closed Periode.
- A Periode with zero Nota can be closed; its snapshot is a list of zeroes. Do not add a "period must balance" precondition.
- Settled since: a Tim does outlive a Periode and carries a balance forward (ADR-0007, ADR-0013), and a payment made after close is recorded as an ordinary Setoran in the open Periode rather than by reopening the closed one. Reopening is for *corrections*, not for recording money that arrived today.