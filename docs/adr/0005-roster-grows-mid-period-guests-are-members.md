# 0005. The roster grows mid-period, and a guest is a member

- Status: Accepted
- Date: 2026-10-20

## Context

The roster is frozen at team creation (`createTeamRecord`, `js/storage.js:39-55`) and `removeFriend` refuses outright in team mode (`js/app.js:822-825`). Consumer chips come from `membersToFriends(team.members)` (`js/app.js:339`) and `getMemberConsumption` iterates `team.members` (`js/calc.js:99`), so a person who isn't on the roster **cannot be charged for anything at all**.

That means a friend who joins the team's meals in week two, or a visiting relative who eats once, has no representation in the books. Their share gets absorbed silently by whoever is present — which, per ADR-0006's defect, means roster-order member #1.

## Decision

1. **Add-only while a Periode is `open`.** A new Anggota can be added at any time and is chargeable from then on. Each Anggota carries a `joinedAt`.
2. **No removal.** A person who has consumed anything cannot be taken off the roster; their Konsumsi and Saldo are real. (ADR-0015 adds a **`keluar`** status for *leaving*, which is not removal and destroys nothing.)
3. **A guest is an Anggota.** There is no separate non-member consumer type, ever. A one-off visitor is added, charged, and simply never appears again if the Tim is per-Periode.

The invariant this protects: **every rupiah of Konsumsi has exactly one owning Anggota.** The clearing-house arithmetic of ADR-0001 only closes if consumption is fully attributable to the roster.

## Consequences

- `colorIndex` for a late addition must take the next free index, not `members.length % FRIEND_COLORS.length` (`js/app.js:167`), or a colour repeats and two members become visually indistinguishable on the same Nota.
- Adding a member invalidates every cached balance. Nothing caches today, but the roster is in the Settlement's input set — treat a roster change like any other write.
- A mistaken member can only be fixed by deleting the Tim, or — with ADR-0002 and ADR-0004 — by refunding their Setoran and closing. This is the accepted cost of refusing removal: a `remove` path needs a policy for debt already incurred, and that policy is a bigger decision than the mis-typed name it fixes.
- **Settled since (ADR-0010):** `joinedAt` is *advisory*. A Nota carries its own Tanggal Nota (`occurredAt`) and charging an "older" Nota raises a warning rather than a block — a hard block would compare an entry timestamp against a meal date and produce a dead end the user cannot reason out of.