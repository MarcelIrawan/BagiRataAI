# 0019. Kas Holder is a Tim-wide figure

- Status: Accepted
- Date: 2026-10-20

## Context

ADR-0012 scoped `kas` to the Periode and explicitly flagged that carry-over would reopen the question. It does: cash does not reset at a Periode boundary. If the Holder collected Rp150k in Periode #1 to clear an old debt and never disbursed it, that money is still in their wallet when Periode #2 opens.

A Periode-scoped `kas` therefore cannot be "what is in the Holder's pocket" — which was the entire point of the figure (ADR-0012: the only number in the app that reality can contradict).

## Decision

`kas` is **Tim-wide and running**:

```
kas = Σ Setoran (signed, across all Periodes)
    − Σ (amount the Holder contributed as a Nota's Pembayar, across all Periodes)
```

No `kasAwal`, no per-Periode reset. The figure is Tim-level and always equals the physical cash, by construction.

The close snapshot still records `kas` (ADR-0013) — but purely so a historical statement stays readable. It is not an input to the live figure.

## Consequences

- This is now the one figure in the app that is **provably** right or wrong against the world, which makes it the strongest reconciliation instrument available. Everything else is a derivation; `kas` is a prediction about a wallet.
- It must be displayed with the Tim as the subject, not the Periode. Showing it under a Periode header implies a scope it does not have.
- ADR-0012's handover reconciliation still holds and is now stronger: at a handover the outgoing Holder hands over exactly `kas`, and the record of it is a single Tim-wide number that survives the handover event.
- Rejected, **(B)**: per-Periode `kas` with a carried `kasAwal`. Identical arithmetic with one more field that can drift, and the drift is silent — a wrong `kasAwal` produces a plausible-looking wrong number, which is the worst kind.
- Combined with ADR-0018, the rule generalises: **cash and balances are Tim-wide; Nota, Setoran, participants and statements are Periode-scoped.** Anything that mixes the two scopes is a bug or a design mistake.