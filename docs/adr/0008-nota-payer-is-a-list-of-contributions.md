# 0008. A Nota's payer is a list of contributions (amends ADR-0001)

- Status: Accepted
- Date: 2026-10-20

## Context

ADR-0001 introduced `nota.paidBy` but left payer cardinality open, and assumed one payer per Nota. That assumption produces a wrong-looking settlement in an ordinary case.

A Rp300k Nota: Budi and Citra each ate Rp150k. Budi hands the cashier Rp300k; Citra hands Budi Rp150k. Under one payer (`paidBy: Budi`, Rp300k), every rupiah is right in aggregate, but the Settlement tells **Citra she owes the Holder Rp150k she has already paid**, and invents two transfers that clear nothing.

The alternative — a co-payer settling with the payer privately — is not a fix, it is a fidelity loss: the app reports a debt that no longer exists.

## Decision

`nota.paidBy` is a **list of contributions**:

```
paidBy: [ { memberId, amount }, ... ]   // defaults to [ { holderId, grandTotal } ]
```

Each entry credits that member's **Kontribusi** (ADR-0001's `dibayarLangsungKeMerchant` channel), so the arithmetic of ADR-0001 is unchanged — every payer is still credited toward the Holder relationship, and nobody becomes a counterparty.

**The entries must sum to the Nota's grand total.** A Nota that is not fully funded is not a valid Nota.

## Consequences

- The single-payer case — the overwhelming majority — renders as one row and needs no extra attention.
- **Editing a Nota invalidates the payer sum.** Changing an Item's `qty`/`price`, or tax/service/discount, changes the grand total, so `saveTeamBill` must re-check that the payer rows still sum. Saving a Nota whose payers no longer fund it must be refused, with the difference shown.
- The UI is a payer section per Nota: rows of (member, amount), a running unfunded remainder, and a "sisa" indicator that must read zero before save. That indicator is the whole feature — without it, an under-funded Nota silently shifts money between members.
- An over-funded Nota is equally invalid. Do not silently absorb the excess anywhere.
- `getMemberDeposits` (`js/calc.js:114-118`) and `calculateTeamSettlement` (`js/calc.js:125-147`) gain a second Kontribusi term. The Setoran list stays the place to *audit* cash handed to the Holder; direct payments are audited on the Nota.
- Rejected: storing only the payer who paid most, or an unvalidated free-form list. A list that need not sum to the total is a silent-corruption vector.