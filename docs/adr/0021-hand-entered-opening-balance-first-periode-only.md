# 0021. A hand-entered opening balance is allowed on the first Periode only

- Status: Accepted
- Date: 2026-10-20

## Context

ADR-0013 defines `Saldo Awal` as read from the previous Periode's close snapshot. That leaves the Tim's **first** Periode with no previous snapshot — and one real case with nowhere to go: a group adopting the app mid-tab. Andi already owes Rp200k from before the app existed.

Three responses were possible:

- **(A)** Always zero. Pre-app debt is out of scope; the Tim starts clean.
- **(B)** Allow a hand-entered per-member `Saldo Awal` on the Tim's first Periode only, defaulting to 0.
- **(C)** A general signed **Penyesuaian** (adjustment) entry, available in any Periode.

## Decision

**(B).** A hand-entered opening balance is allowed **only** on the Tim's first Periode, defaults to 0, and is the only place in the model where a balance exists without a Nota behind it.

Every other Periode derives its `Saldo Awal` from the previous close snapshot (ADR-0013) and cannot be hand-edited.

## Consequences

- The "two Kontribusi channels" rule of ADR-0001 stays intact for every Periode except the first, where nothing is being contributed — the balance is a fact about the past, not a payment.
- **The first Periode is therefore special, and must be labelled as such** in the UI. A user who hand-edited an opening balance must be able to see that they did, or it is indistinguishable from a bug later.
- A hand-entered opening balance counts as **history** for ADR-0017: a Tim whose first Periode has one is not empty and cannot be deleted.
- **(C) rejected outright**, and the reason matters more than the decision. The case that *sounds* like it needs a general adjustment entry — the Holder's wallet is Rp20k short of `kas` — does not: the money did not vanish into an abstraction, **the Holder spent it**. It is a manual Nota (ADR-0003) consumed by the Holder, which drops `kas` by Rp20k and raises their Konsumsi by Rp20k. That reconciles the cash exactly, with no new concept, and it stays honest about where the money went.
- The same argument disposes of the other candidate: a Nota that was never entered is fixed by reopening and entering it (ADR-0004, ADR-0020), not by adjusting a balance to match.
- Practical consequence for the migrator (ADR-0007): migrating a `bagirata.v1` team produces a Tim whose first Periode has `saldoAwal = 0` and no hand-entered balances. Do not infer one from a closed team's credits.