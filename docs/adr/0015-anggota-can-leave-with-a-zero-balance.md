# 0015. An Anggota can leave with a zero balance

- Status: Accepted
- Date: 2026-10-20

## Context

ADR-0005 refused member removal, on the grounds that a person who has consumed something cannot be un-made and their Konsumsi and Saldo are real. That reasoning is about **deletion**, and it is correct.

It does not apply to **leaving**. People quit the group — they change jobs, they move, they stop coming to lunch. Today the app cannot represent them at all: they sit on the roster forever, and the only way to stop charging them is to keep them out of every participant set by hand.

## Decision

An Anggota carries a status:

```
anggota.status: 'active' | 'keluar'
anggota.leftAt:  ISO date | null
```

- `keluar` is **not deletion**. The Anggota stays in the Tim, with their Nota, Konsumsi and Setoran history intact (ADR-0005 stands).
- A `keluar` Anggota is excluded from new Periodes' participant sets by default and cannot be a Pembayar or a consumer on a new Nota.
- Their running Saldo stays visible and still settles — they can still be owed, or still owe.
- **A member may not go `keluar` with a non-zero running Saldo.** The exit is refused until the balance is zeroed: settled by a Setoran, or by a Pengembalian from the Holder (ADR-0002). The app never carries a debt it can no longer collect.
- `keluar` is **reversible** — back to `active`, with `leftAt` cleared. Nothing was destroyed, so nothing needs re-creating.

## Consequences

- `leftAt` is a fact about the Tim, not about a Periode, and it must not be used to auto-exclude someone retroactively from Periodes they already took part in.
- The zero-balance gate is the only place the app refuses a *user action* rather than an invalid *record*. It must explain itself — "Andi masih punya saldo Rp150.000; selesaikan dulu" — because "I can't remove my own friend" is otherwise indistinguishable from a bug.
- A member who is `keluar` and later re-added keeps their id, their colour, and their history. Do not mint a new Anggota for a returning person; two ids for one person double their balances.
- If the *Holder* wants to go `keluar`, that requires a handover first (ADR-0009) — one Holder at a time, and a Tim cannot have none.
- The combination with ADR-0014 means leaving the roster and dropping out of a Periode are two different things: `keluar` is a statement about the Tim, a participant set is a statement about one Periode.