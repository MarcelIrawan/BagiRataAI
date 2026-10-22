# 0016. A Periode's dates are recorded, never constraints

- Status: Accepted
- Date: 2026-10-20

## Context

ADR-0004 gave a Periode no explicit start or end dates: it opens when the Tim is created and ends when the user closes it. That was decided when a Tim had exactly one Periode.

ADR-0007 split them, and a Tim with many Periodes must be able to tell them apart in a list. The tempting answer is real dates — a start date picked at open, an end date at close — but that immediately reinvents a validation rule ADR-0010 had deliberately left open (*does a back-dated Nota fall inside its Periode's dates?*), and it hands the app a claim it cannot support: that a trip ended at midnight while people were still at dinner.

## Decision

**Dates are recorded, never constraints.**

- A Periode keeps `openedAt` and `closedAt` as facts about when it was opened and closed.
- A Periode gains an optional user **Label Periode** — *"Trip Bali"*, *"Oktober"*.
- With no label, an auto-label is derived: *"Periode #3 · dibuka 20 Okt 2026"*.
- No required start/end date. **No auto-close** on any date arriving.

## Consequences

- **ADR-0010's caveat is resolved:** a back-dated Nota may fall before its Periode's `openedAt` or after its `closedAt`, and that is *accepted*, not validated. There is no window to be outside of.
- Two Periodes of one Tim may have overlapping recorded dates, because nothing prevents it — a Periode ends when the team says it ends. Accepted, not an error.
- The label is free text and is user-visible in the list, the Settlement and the WhatsApp copy, so it must be escaped wherever it is rendered (`escapeHtml` in the UI, and the copy paths at `js/app.js:491-520`).
- The list sorts by `openedAt`, which is stable and already stored.
- Rejected, **(C)**: auto-closing at an end date. It would close a Periode the Holder is still adding Notas to, and there is nothing in the app that can tell the difference between "the period is over" and "the user forgot to enter yesterday's lunch".
- Rejected, **(B)**: required start/end dates. It buys nothing a label does not, and costs every user a decision they cannot make correctly at the moment they create a Periode — the end date is by definition unknown then.