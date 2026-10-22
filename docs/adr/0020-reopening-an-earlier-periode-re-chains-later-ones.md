# 0020. Reopening an earlier Periode re-chains every later one

- Status: Accepted
- Date: 2026-10-20

## Context

ADR-0013 made balances carry by reading each Periode's `Saldo Awal` from the previous Periode's close snapshot. That creates a chain, and a chain has a failure mode: edit Periode #1 and Periodes #2..#n are now opening with balances derived from a Periode that no longer says what it said.

Three responses were possible:

- **(A)** Allow reopening any Periode, recompute forward, and announce it.
- **(B)** Only the latest Periode can be reopened.
- **(C)** Allow reopening anywhere, but freeze later Periodes' opening balances — break the chain deliberately.

## Decision

**(A).** Any Periode may be reopened (ADR-0004 already makes closing reversible). Reopening an earlier Periode:

1. **Requires an explicit confirmation** naming every Periode whose opening balances will change.
2. **Recomputes forward** automatically once confirmed.
3. **Marks each re-derived Periode** so that a number someone printed last week is explainable rather than contradicted.

## Consequences

- (B) fails exactly when the feature is needed: a wrong Nota discovered while Periode #3 is open, belonging to Periode #1. A correction workflow that only works for the newest data does not work.
- (C) is the dangerous option dressed as caution. It makes later statements arithmetically inconsistent with the ledger they claim to summarize, and the Holder ends up owed money that no screen accounts for. **A self-consistent wrong answer is worse than a moving right one.**
- The "re-derived" mark is not cosmetic. Without it, the app silently rewrites a statement a member may have already paid against, and there is no way to explain the difference later.
- Records already posted as *payments* are unaffected — a Setoran is cash that moved, and no reopening changes that (ADR-0013). Only the opening balances move.
- Re-derivation must be computed, not propagated as writes. Deriving each Periode's `Saldo Awal` from the current chain means a re-chain needs no data migration and cannot half-apply; only the re-derived marks are stored.
- Practical display rule: a re-derived Periode's statement should say so, with the date it was re-derived, or the mark protects nothing.