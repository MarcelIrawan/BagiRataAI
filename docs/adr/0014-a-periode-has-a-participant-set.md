# 0014. A Periode has a participant set

- Status: Accepted
- Date: 2026-10-20

## Context

ADR-0007 put the roster at the Tim level and had a new Periode seed from the Tim's active roster. But a Tim runs Periodes that only some of its members took part in: the Bali trip, the four people who eat lunch together, the two who went to the supplier.

Charging the whole roster in every Periode has three costs: the Settlement is padded with Rp0 rows, the WhatsApp copy grows a paragraph of zeroes, and ADR-0006's bagi-rata resolves to *everyone on the roster* — so a shared dish is split across people who were never in the room.

## Decision

A Periode carries a **participant set**:

```
periode.participants: [ memberId, ... ]   // ⊆ the Tim's roster
```

- Defaults to all active Anggota of the Tim; editable while the Periode is `open` (and before it opens).
- A non-participant is **not chargeable**, does not appear in the Periode's Settlement, and is not a target of bagi-rata.
- A participant who has already consumed something in the Periode cannot be removed from the set — the mirror of ADR-0005's no-removal rule. Their Konsumsi is real.
- **The Holder is always a participant.** They are the counterparty of every other Anggota's Saldo, and `kas` is theirs; a Periode without the Holder row is not a coherent statement.

## Consequences

- `getMemberConsumption` and `calculateTeamSettlement` (`js/calc.js:96-147`) iterate participants, not `team.members`. This is the change that most easily goes half-done — a single leftover `team.members` iteration silently reintroduces Rp0 rows or charges a non-participant.
- ADR-0006's *"bagi rata ke semua anggota"* now means *all participants of this Periode*. Wording in the UI must follow, or the confirmation promise will not match what it did.
- A participant set is a second, narrower kind of membership: **the Tim's roster decides who may join**, the **Periode's participants decide who pays**. A member who never joins a Periode is not `keluar` (ADR-0015) — they simply do not appear.
- The Tim-level roster and the Holder being always-participant together mean the Settlement always has someone to address. Without that rule, a Periode exists whose debts have no counterparty.

## Rejected

Whole-roster Periodes, always. It is tempting because it needs no new field, but it makes the most common real Periode — a subset of the group doing something together — the awkward case rather than the default.