# 0001. The Holder is the sole settlement counterparty

- Status: Accepted, amended by ADR-0008 (payer cardinality)
- Date: 2026-10-20

## Context

The settlement model computes, for every member, `saldo = konsumsi − setoran` (`js/calc.js:131`) and describes each member's position as a claim on, or debt to, the Holder: `holderNet = owedToHolder − creditFromHolder` (`js/calc.js:142-144`).

Nota carried no payer field, and the `index.html:123` copy stated the assumption out loud: *"Holder membayar transaksi; anggota bisa setor dana kepadanya."* So "the Holder funds every Nota" was an **unstated invariant**, not a decision anyone made.

The consequence was a real modelling hole. If a non-Holder pays a merchant out of pocket — the ordinary case at a restaurant where the Holder isn't present — the app cannot record it. `addDeposit` floors the amount at `Math.max(0, …)` (`js/app.js:313`), so the payer cannot enter a negative Setoran either, and their Saldo is identical whether they paid or not. The money simply disappears from the books.

We considered three models:

- **(A) Holder-only, stated as a non-goal** — only the Holder ever pays merchants.
- **(B) A `paidBy` field per Nota, settlement still strictly vs the Holder.**
- **(C) A full debt graph** — nobody is special, positions are `paid + deposited − consumed`, settled pairwise with minimal transfers.

## Decision

**(B).** Every Nota records a `paidBy`, defaulting to `holderId`. Settlement remains strictly against the Holder; no other counterparty exists.

A member's contribution therefore has exactly two channels, and they are interchangeable in the arithmetic:

```
kontribusi = setoran + dibayarLangsungKeMerchant
saldo      = konsumsi − kontribusi
```

where `dibayarLangsungKeMerchant` is the grand total of every Nota whose `paidBy` is that member. A non-Holder payer becomes a **creditor of the Holder** for the full amount they paid; the consumers of that Nota still owe the Holder for their shares. On such a Nota the Holder's own position nets to zero — they are a pass-through, not a beneficiary.

The Holder's own share of a Nota they paid needs no special case: it appears once in their Konsumsi and once in their Kontribusi and cancels.

## Consequences

- The Holder-centric Settlement screen, `holderNet`, the "vs holder" wording in the WhatsApp copy, and the README's `saldo = totalKonsumsiSemuaBill − totalSetoran` all keep working. `saldo`'s definition widens; its sign and meaning do not change.
- Paying out of pocket and depositing cash become two ways to write the same number. This is intended: to the books they are identical, and to the payer the difference is only who is holding the money.
- **(C) is not a different model, it is a different *presentation* of the same numbers.** Pairwise minimal-transfer netting answers "how do we clear this with the fewest transfers", which is a view of the same per-member positions. It can be added later without revisiting this ADR.
- **Payer cardinality: amended by ADR-0008.** A Nota may name several Pembayar with amounts, so a Nota whose cash was split across two payers at the table *is* expressible. The original one-payer assumption is no longer in force. Everything else in this ADR stands.
- `store` data written before this change has no `paidBy`; treat a missing `paidBy` as `holderId`. Do not bump the `bagirata.v1` key.
- The glossary's **Kontribusi** term exists because of this decision. Do not reintroduce a separate "talangan"/"advance"/"reimbursement" entity — it would be a third channel for money that already has two.