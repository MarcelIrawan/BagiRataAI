# 0009. The Holder role can be handed over

- Status: Accepted
- Date: 2026-10-20

## Context

ADR-0001 makes the Holder the counterparty of every other member's Saldo, and the role was fixed at creation with no way to change it.

Real teams hand the cash over: the person carrying the wallet leaves the project, or a Periode runs long enough that someone else takes over. Today the app has no way to express that, so the books keep naming a Holder who no longer holds anything.

The tempting counter-argument is that the role is cosmetic — the settlement is against the *role*, not the person, so who fills it changes nothing about the balances. That is true, and it is exactly why leaving it fixed is worse than it looks: the Holder is not just a name, it is the person the mobile app tells everyone to transfer money to.

## Decision

The Holder role may be **handed over** at any time, recorded as an event on the Tim:

```
handover { fromId, toId, at, note? }
```

- The role moves; the balances do not. Settlement arithmetic stays against the role.
- Exactly one Holder at a time. A handover to someone who is not on the Tim's roster is refused.
- The handover log is kept — never mutate a past handover, append a new one.

## Consequences

- The Holder is a Tim-level role (ADR-0007), so a handover at a Periode boundary and a handover mid-Periode are the same event.
- **Handover is the reconciliation moment for Kas Holder (ADR-0012).** The outgoing Holder is about to stop being the person everyone transfers to, which is the one moment the cash position must be verifiably right. Surface `kas` on the handover screen and let the user confirm or correct it before the role moves — a handover done with unreconciled cash hands a silent discrepancy to someone who has no way to explain it.
- Only the *current* Holder is shown as the transfer destination in the Settlement and the WhatsApp copy; the log answers "who was holding the cash on 12 Oct" when a member disputes a payment.
- The handover record belongs on the Tim, not the Periode, and must survive a storage migration (ADR-0007).