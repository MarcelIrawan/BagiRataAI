# 0007. A Tim is durable and owns successive Periods

- Status: Accepted
- Date: 2026-10-20

## Context

A Tim and a Periode were the same record. `team.name` was labelled *"Nama Tim / Periode"* (`index.html:107`), and `status`/`createdAt`/`closedAt` all lived on the team (`js/storage.js:39-55`). The home screen listed closed Tims under *"Riwayat Periode"* (`index.html:94`).

That conflation had two costs:

1. **A recurring group re-enters its roster every period.** With ADR-0005's add-only roster, creating a new Tim is the *only* way to change who is on the roster — so a monthly group either keeps the same Tim open forever, or retypes everyone.
2. **An unsettled Saldo has nowhere to live.** Each Tim was sealed when it closed, so Andi not paying his Rp150k could not be represented at all. The Holder chased it outside the app, forever, with no record.

The alternative was a *"Buat periode baru dari tim ini"* button copying the roster forward — no schema change, and it removes the retyping — but it does not create a place to put a carried-over debt.

## Decision

**A Tim is a durable group. It owns a roster, a Holder role, and a list of Periods.**

```
Tim   { id, name, members[], holderId, periods[], createdAt }
Periode { id, label, status, openedAt, closedAt, bills[], deposits[], snapshot }
```

The roster and the Holder sit at the **Tim** level. `status`, the Nota, the Setoran, and the close-snapshot sit at the **Periode** level. A Tim exists whether or not a Periode is open, and may have zero open Periods.

Creating a Tim creates its first Periode. Opening a later Periode seeds from the Tim's current active roster and Holder, then narrows to that Periode's participant set (ADR-0014).

## Consequences

- The home screen becomes two levels: Tims → Periods. `renderHome` (`js/app.js:89-126`) and `openTeam`/`getActiveTeam` (`js/app.js:204-223`) all go a level deeper; `activeTeamId` gains a sibling `activePeriodId`.
- ADR-0004's close is now a **Periode** event, not a Tim event.
- ADR-0005's membership is **Tim**-level. A member added while a Periode is open joins the Tim and is chargeable from their `joinedAt`; the "no removal" rule still holds at the Tim level.
- ADR-0009's Holder handover becomes a Tim-level event, with one Holder at a time.
- **Storage migration.** Existing `bagirata.v1` data is `{ teams: [...] }`. Each `team` becomes one Tim holding exactly one Periode, carrying `bills`/`deposits`/`status`/`closedAt`/snapshot down to it. Missing `paidBy` defaults to that Nota's `holderId` (ADR-0008). Bump the key to `bagirata.v2` and write the migrator as a pure function of the old store, since both shapes will be in the wild.
- **Settled since:** at most one Periode open per Tim and balances carry across Periodes (ADR-0013); a Periode's participant set decides who pays (ADR-0014); a Periode keeps a label and its dates are recorded, never constraints (ADR-0016); an Anggota can be marked `keluar` (ADR-0015); and a Tim is deletable only when empty, otherwise archivable (ADR-0017).