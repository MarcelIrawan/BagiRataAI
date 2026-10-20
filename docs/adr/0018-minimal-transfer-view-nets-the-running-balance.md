# 0018. The minimal-transfer view nets the running balance

- Status: Accepted
- Date: 2026-10-20

## Context

ADR-0011 scoped the *"Cara bayar paling ringkas"* block to the Periode, which was correct when `saldo` meant one period's damage. ADR-0013 changed that: `saldo` is now a running figure, `Saldo Awal + Konsumsi − Kontribusi`.

So a member may owe Rp50k from the current Periode and Rp150k carried from the last. A Periode-scoped netting block tells them to transfer Rp50k and calls it settled — a wrong instruction, not an incomplete one, because it is the version that leaves the Holder chasing a debt the member believes they cleared.

## Decision

The netting block operates on the **running Saldo** — the money that actually changes hands — and is labelled *"saldo berjalan"* wherever it renders.

It is derived from **whatever balance set is being viewed**:

- A live, `open` Periode nets current running balances.
- A `closed` Periode nets the balances recorded in its close snapshot, so it shows the transfers as of its close.

## Consequences

- The same screen now has an asymmetry that must be labelled or it will be misread: a closed Periode shows a transfer list as of its close, while its Settlement still shows the debts that outlived it. Both are correct; unlabeled, they look contradictory.
- "As of close" is not the same as "final". A closed Periode's block is a historical artifact, not advice — a member navigating to an old Periode should not be told to make a transfer that a later Periode already recorded as done.
- The block never lists a transfer to or from a non-participant, and never for a `keluar` Anggota (ADR-0015) *within the current Periode's* view — but a running balance still includes someone who has since left, so a live netting block may name them. That is intended; their debt is still real.
- Still derived, still never stored, including in snapshots (ADR-0011 stands). The as-of-close computation reads the snapshot's balances; it does not read a stored transfer list.
- Rejected: showing both a running and a Periode-scoped netting block. Two transfer lists on one screen is how people pay the wrong amount.