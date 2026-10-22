# 0011. The Settlement also shows a minimal-transfer view

- Status: Accepted
- Date: 2026-10-20

## Context

Settlement was Holder-centric: everyone pays the Holder, the Holder pays out credits. That is the correct model (ADR-0001) but a poor instruction set. If Budi is owed Rp150k and Citra owes Rp150k, the Settlement tells Citra to transfer to the Holder, who then transfers to Budi — two real transfers and two real bank fees to settle nothing.

ADR-0001 already notes that pairwise netting is a *presentation* of the same per-member positions, not a different model.

## Decision

The "vs Holder" list stays the **primary** Settlement. Below it, add a secondary block — *"Cara bayar paling ringkas"* — computed from the **running** Saldo (ADR-0018), not from this Periode's movement:

- Greedily match the largest debtor against the largest creditor, settle the smaller of the two, repeat until everyone is zero.
- It changes **no balances**. It is advice for executing the Settlement, not a new source of truth.

## Consequences

- The Holder still sees exactly what they must collect; the netting block never replaces that number.
- Render it only when at least two members have opposite-sign Saldo. For the ordinary team (one debtor per person, everyone owing the Holder) the block is noise and should be hidden, not shown empty.
- The greedy result is **derived, never stored** — including in ADR-0004's close snapshot. The snapshot stores balances; if the algorithm improves, old snapshots must not be frozen to a stale transfer list. A *closed* Periode's block is computed from its snapshot balances, so it shows transfers as of that close (ADR-0018).
- The WhatsApp copy (`copySettlementWA`, `js/app.js:491-520`) gains the same block optionally, since that message is how the transfers actually get instructed.
- Rejected: making netting the only view. Someone must still be told the total they owe the group, and "you owe Budi Rp150k" is harder to check against your own consumption than "you owe the team Rp150k, and here is the receipt".