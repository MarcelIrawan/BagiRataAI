# 0010. A Nota carries its own date; joinedAt is advisory

- Status: Accepted
- Date: 2026-10-20

## Context

The only temporal anchor on a Nota was `createdAt` — the *entry* time — yet the Nota list rendered it as if it were the meal time (`js/app.js:278`). Enter last night's dinner this morning and the books date it wrong, silently.

ADR-0005 added a mid-Period roster growth and left one question: whether a member added today may be charged on a Nota entered today for a meal from last week. A hard block would compare a real meal date against an entry timestamp — two different things.

## Decision

1. **A Nota carries `occurredAt`**, user-editable, defaulting to now. The Nota list shows `occurredAt`, not `createdAt`.
2. **`createdAt` is retained** as the audit field: when the row was actually written. Every Nota has both.
3. **`joinedAt` is advisory.** Charging an Anggota on a Nota dated before they joined produces a **warning**, never a blocked save.

## Consequences

- A Nota now has two timestamps with different jobs, and the UI must not conflate them: `occurredAt` is what the user reasons about, `createdAt` is what an auditor would ask for.
- The Nota list sorts by `occurredAt` — a back-dated Nota appears in its proper place, dated as entered.
- A back-dated Nota may fall before its Periode's `openedAt` or after its `closedAt`. That is accepted here, and **ADR-0016 settled it permanently**: a Periode's dates are recorded, never constraints, so there is no window for a Nota to fall outside of and no validation rule to add.
- Warnings must be visible without blocking: a badge on the Nota and a line in the Settlement preview. An app that silently records a wrong attribution is worse than one that records it loudly and lets the user decide — the user is the only party who knows whether Sari was at that lunch.
- Rejected: hard-blocking on `joinedAt`. It compares an entry timestamp against a meal date and produces a dead end the user cannot reason their way out of — the app insisting reality did not happen is worse than a bad number they can see and fix.