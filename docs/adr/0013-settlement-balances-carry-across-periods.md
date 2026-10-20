# 0013. Settlement balances carry across a Tim's Periods

- Status: Accepted
- Date: 2026-10-20

## Context

ADR-0007 split the Tim from the Periode for one stated reason: under Tim ≡ Periode, an unsettled Saldo "had nowhere to live" and the Holder chased it outside the app forever.

Two shapes were possible:

- **(A) No carry-over.** Closing seals a Periode permanently. An unpaid Saldo stays on the closed Periode, displayed as *belum tertagih*, and never moves.
- **(B) Carry-over.** The Tim owns a running account; a Periode is a statement period over it.

ADR-0004 had already made closing reversible and snapshotted the Settlement at close — which, under (B), is exactly the data a next Periode needs to open with.

## Decision

**Balances carry.** Each Anggota has a **Saldo Awal** in a Periode, taken from their closing balance in the previous Periode:

```
saldo = Saldo Awal + Konsumsi − Kontribusi
```

`saldoAwal` is not stored on the new Periode as user data — it is read from the previous Periode's close snapshot (ADR-0004). The Tim's first Periode starts at `saldoAwal = 0` unless an opening balance was entered for it (still open).

**At most one Periode per Tim may be `open` at a time.** Carry-over forces this: two parallel open Periodes would each seed from the same previous close, and the same debt would count twice in both directions.

A payment against an old debt is an **ordinary Setoran in the current Periode**, reducing the carried balance. It is *not* a reason to reopen a closed Periode.

## Consequences

- **`saldo` no longer means "this period's damage".** It is the running amount owed. The Settlement must show `Saldo Awal` as its own line, alongside the Periode's Konsumsi and Kontribusi, or a member seeing Rp200k cannot tell whether they ate that much or arrived owing it.
- The close snapshot becomes a **statement**, not a verdict: it is simultaneously the record of that Periode and the opening balances of the next one. `kas` and the closing balances both belong in it.
- **`holderNet` becomes a running figure**, and the Holder's position is the mirror of everyone else's, in perpetuity rather than per Periode.
- **Reopening an earlier Periode re-chains every later one.** Edit Periode #1's Nota and Periodes #2..#n have different opening balances. Allow it — discovering a wrong Nota a month later is exactly why ADR-0004 made closing reversible — but require an explicit confirmation naming the Periodes that will be re-derived, and mark each re-derived Periode as such. A silent cascade rewrite is the failure mode this ADR exists to avoid.
- A Tim with no open Periode is idle, not closed; its running balances are still true and still displayed.
- The "preview" wording on the Settlement (ADR-0004's live computation) now needs two distinct words: the running balance, and what this Periode moved. Conflating them is the most likely UI bug to come out of this decision.