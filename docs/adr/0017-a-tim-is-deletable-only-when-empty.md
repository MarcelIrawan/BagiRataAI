# 0017. A Tim is deletable only when empty

- Status: Accepted
- Date: 2026-10-20

## Context

There is no delete path for a Tim anywhere in the app — `js/storage.js` has `upsertTeam` and nothing else. Every Tim ever created, including typos, is in the home list forever.

Creating a Tim requires a name, a roster of at least two, and a Holder (`confirmCreateTeam`, `js/app.js:179-201`), so a mistyped Tim is expensive enough to create that people will make them.

With ADR-0007's durable Tim and ADR-0013's running balances, a Tim stops being a disposable container and becomes a **debt record**. That changes what deletion means.

## Decision

- **A Tim can be deleted only when it has zero Nota and zero Setoran across all its Periodes**, and no hand-entered balance of any kind. A Tim in that state is by definition not a record of anything.
- **Anything with history can only be archived.** `tim.archivedAt` hides it from the main list; nothing is removed and every reference still resolves.
- Deleting an empty Tim is a hard delete with a confirmation naming the Tim.

## Consequences

- Archive is a **filter, never a write barrier**: an archived Tim can still be opened, unarchived, and — if it meets the delete rule — deleted. It must never block a legitimate edit or make a balance unreachable, because ADR-0013 means an archived Tim may still be owed money.
- If an archived Tim has a non-zero running balance, the *"Diarsipkan"* section must show that, or the Holder archives away a debt and never chases it.
- Two lists on the home screen become three: Tims, *Diarsipkan*, and nothing else. Do not invent a "closed" list — per ADR-0007 a Tim has no status, only its Periodes do.
- The delete rule must be evaluated live, not cached on the Tim. With reopen (ADR-0004) and re-chaining (ADR-0013), a Tim that was empty yesterday may have a Nota today.
- Rejected, **(C)**: delete with history. It destroys the only evidence of who owed whom, and it is the request made by someone who is frustrated in the moment and would have wanted the record a week later.