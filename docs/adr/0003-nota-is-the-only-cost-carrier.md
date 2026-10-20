# 0003. A Nota is the only cost carrier

- Status: Accepted
- Date: 2026-10-20

## Context

`editorSection` is only ever un-hidden by `populateParsedData` (`js/app.js:762`) or `editTeamBill` (`:367`). The only doors into it are `openCamera`/`openGallery` and the *"Gunakan Contoh Nota Makanan"* button, which calls `loadSampleReceipt`. There is no manual entry path: `addNewItem()` exists (`js/app.js:772`) but is unreachable until a Nota has been parsed from a photo.

So a Tim Periode literally cannot record a cost without photographing something. Parking, a delivery fee, a tip, a handwritten slip, a cost the user simply forgot to photograph, a cost entered days later — none of it can go into the books. The only workarounds are to load fake sample data into a real Periode, or to photograph an unrelated object and edit every field.

## Decision

**The Nota is the only entity that carries cost, and OCR is an accelerator, not a gate.** A manual door is added into the same editor — an empty Item list, an editable merchant, `paidBy` defaulting to the Holder — producing a Nota identical in shape to a parsed one: same fields, same consumer assignment, same place in `team.bills`.

There is **no** separate `TeamExpense`, "biaya bersama", or "cost without consumers" entity. A cost that nobody in particular consumed is recorded by assigning its Item to all of the Periode's participants via the existing bagi-rata confirmation (`autoAssignUnassignedItems`, `js/app.js:833`; ADR-0014).

## Consequences

- Consumption, Settlement, `holderNet`, and the "N nota" count need no second code path. One cost carrier means one arithmetic.
- The "N nota" figure counts manually entered costs, and the merchant field is free text that may be synthetic ("Parkir", "Ongkos Kirim"). That is acceptable; the Nota's job is to be an auditable line in the books, not a claim that a receipt exists.
- `team.bills` entries created manually have no source image. If image storage is ever added, the field must be optional.
- This decision is load-bearing and will be pushed against. The next person to want a "simple expense form" is asking for a second cost carrier, and the answer is no: they want a Nota with one Item, which is already cheaper to build than a second entity.
- Open: whether a manual Nota's `createdAt` can be back-dated to the day the cost was actually incurred (see the Nota date question, still open).