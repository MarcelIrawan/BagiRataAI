# 0012. Show the Holder their cash position

- Status: Accepted, scoped by ADR-0019 (Tim-wide, not Periode-scoped)
- Date: 2026-10-20

## Context

Nothing in the app told the Holder how much cash they should be physically holding. The Holder is the team's only clearing house (ADR-0001): members hand them Setoran, they pay merchants, they hand Pengembalian back. Every one of those numbers is already in the data, and none of them were ever summed into a figure the Holder could check against their wallet.

This matters because `kas` is the **only number in the whole app that reality can contradict**. A Saldo is a derivation; the cash in the Holder's pocket is a fact.

## Decision

Show a live **Kas Holder** figure on the team hub:

```
kas = Σ Setoran (signed, across all Periodes)
    − Σ (amount the Holder contributed as a Nota's Pembayar, across all Periodes)
```

Notas paid by other members are **excluded**, because the Holder never disbursed that cash. A Nota part-paid by the Holder counts only the Holder's share.

## Consequences

- A mismatch means something concrete: a Nota not yet entered, a Setoran recorded wrong, or a Pengembalian that never got written down. Surface it as a hint ("kas dihitung Rp240.000 — cocokkan dengan uang Anda"), not an error state; the app cannot know the user's wallet.
- This is a **Tim-wide, running** figure — cash does not reset at a Periode boundary (ADR-0019). It is modelled and displayed with the Tim as its subject, never under a Periode header.
- **It is the reconciliation instrument at Holder handover** (ADR-0009): the moment the role moves is the moment `kas` must be verifiably right.
- It must never be summed into `holderNet`. `holderNet` is what the Holder collects from others; `kas` is what they are holding *now*. They are different quantities and a UI that adds them will be wrong in a way nobody notices.
- The Holder's wallet is now verifiable without opening a single Nota, which is the point: the Holder should discover a missing Nota before close, not after everyone has paid.