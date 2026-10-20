# Glossary

The vocabulary of BagiRata. Use these terms — in code, UI copy, issues, tests, and ADRs. Where a term lists an **Avoid**, do not drift to that synonym.

---

### Tim
A **durable group**: a name, a roster, a **Holder** role, and a list of **Periode**. A Tim exists whether or not a Periode is open, and it is what survives from one Periode to the next (ADR-0007).
**Avoid:** using "Tim" and **Periode** interchangeably. They were one record until ADR-0007 separated them; the old "Nama Tim / Periode" label is gone.

### Tim Arsip
A Tim hidden from the home list but fully intact — archiving is a *filter*, never a write barrier. Only a Tim with zero Nota, zero Setoran and no hand-entered balance can be deleted at all (ADR-0017).
**Avoid:** treating "archived" as "closed". A Tim has no status; only its Periodes do.

### Periode
One of a Tim's successive windows, during which **Nota** and **Setoran** accumulate. It has an id, a **Label Periode**, an `openedAt`/`closedAt`, and a **Peserta Periode** set. A Periode's dates are recorded, never constraints (ADR-0016). See **Status Periode**.
**Avoid:** "bulan" / "month" — a Periode is not a calendar month. It ends when the user closes it, not when a clock says so.

### Label Periode
The optional user-supplied name that tells a Tim's Periodes apart — *"Trip Bali"*, *"Oktober"*. Free text, so it must be escaped everywhere it renders. With none, an auto-label is derived: *"Periode #3 · dibuka 20 Okt 2026"* (ADR-0016).
**Avoid:** using the label as a kind of status or as a date constraint.

### Peserta Periode (participants)
The subset of the Tim's roster this Periode charges: `periode.participants ⊆ roster`, defaulting to all `active` Anggota. A non-participant is not chargeable, does not appear in this Periode's Settlement, and is not a target of **bagi rata**. The **Holder is always a participant**. A participant who has already consumed something here cannot be dropped from the set — their **Konsumsi** is real (ADR-0014).
**Avoid:** conflating this with the roster. The roster decides who *may* join; the participant set decides who *pays*.

### Status Periode
`open` or `closed`. `open` means Nota and Setoran may be added or edited, and **at most one Periode of a Tim may be `open` at a time** (ADR-0013) — two parallel open Periodes would seed the same carried debt twice. `closed` means the Periode is finished and its **Settlement** was snapshotted at close (ADR-0004). Closing is reversible.

### Anggota
A person on a **Tim**'s roster, with status `active` or **Keluar** (ADR-0015). Anggota belong to the Tim, not to a single Periode; one added while a Periode is open joins the Tim and is chargeable from their `joinedAt` (ADR-0005, ADR-0007). An Anggota is a consumer, a possible **Pembayar**, a possible **Holder**, and a possible depositor — all at once.
**Avoid:** "friend" / "teman" / "peserta" when you mean a roster member. A **Tamu** is not a separate kind of thing either — see below.

### Tamu (guest)
A person who ate with the team but is not a roster member. **Avoid** as a modelled type: a Tamu is recorded as an **Anggota** (ADR-0005). There is no non-member consumer, and there never should be — see the invariant under **Konsumsi**.

### Keluar (left)
An Anggota who has stopped participating. **Not deletion** — history, Konsumsi and Setoran all survive, and the status is reversible (ADR-0015). A `keluar` Anggota is excluded from new Periodes' participant sets by default, but their running **Saldo** is still real and still settles. They cannot go `keluar` while their Saldo is non-zero.
**Avoid:** "hapus" / "delete" / "removed" for a member who has left. Leaving destroys nothing; deletion does not exist. Also do not confuse `keluar` with dropping out of one Periode's participant set — that is a statement about a Periode, not about the Tim.

### Holder / Pemegang Dana
The Anggota acting as the Tim's clearing house: the assumed payer of every Nota, the recipient of every **Setoran**, and the single counterparty of every other Anggota's **Saldo**. Exactly one Holder at a time, and the role may be **handed over** mid-Periode or mid-Tim, recorded as an append-only event (ADR-0009).
**Avoid:** treating the Holder as merely "the person with the cash" — the Holder is a *role in the settlement model*, not just a wallet. Also avoid "bendahara" as a synonym for a non-member treasurer; a non-consuming treasurer is still an Anggota.

### Nota
One receipt or one recorded cost. The **only** entity that carries cost — there is no separate "expense" or "biaya bersama" type (ADR-0003). A Nota need not come from OCR; it may be entered manually. It always has a merchant, a list of **Item**, a **Tanggal Nota**, and at least one **Pembayar**.
**Avoid:** "bill", "invoice", "struk" as synonyms for the entity. "Struk" is fine only when referring to the physical paper.

### Item
One line on a Nota: name, `qty`, `price`, and the **Pemilih** who consumed it.

### Pemilih (assignees)
The Anggota an Item is attributed to. An Item with no Pemilih has **unattributed cost**, which is not a valid state to save (ADR-0006) — it is resolved by assigning the Item to everyone.

### Tanggal Nota (`occurredAt`)
When the Nota's cost was *incurred* — user-editable, defaulting to now. Distinct from `createdAt`, which only records when the row was written; `occurredAt` is what the Nota list displays and sorts by (ADR-0010).
**Avoid:** showing `createdAt` as though it were the meal time. The two must never be conflated in the UI.

### Pembayar (payer)
The **list** of Anggota who handed money to the merchant for a Nota, each with an amount: `[ { memberId, amount } ]`. Defaults to the single entry "the Holder paid the whole Nota" (ADR-0008).
**Invariant:** the payer amounts must sum to the Nota's grand total. An under- or over-funded Nota is not a valid Nota and cannot be saved.
A Pembayar who is not the Holder is not a second counterparty — it simply makes that person a creditor of the Holder (ADR-0001).

### Konsumsi (consumption)
The value an Anggota took out of the team's spending: their share of every Nota's Item plus their proportional share of that Nota's tax, service, and discount. Money-valued, per Periode.
**Invariant:** every rupiah of Konsumsi has exactly one owning Anggota.

### Kontribusi (contribution)
The money an Anggota put into the team's spending. Two channels, and only two:
1. **Setoran** — cash handed to the Holder.
2. Being a **Pembayar** of a Nota — money handed directly to a merchant.

**Avoid:** "talangan" / "advance" / "reimburse" as a separate entity. Paying a merchant out of pocket *is* the second Kontribusi channel; there is no third entry type.

### Setoran (deposit)
A **signed** ledger entry of money moving between an Anggota and the Holder (ADR-0002). Scoped to a **Periode**.
- **Positive** — cash handed to the Holder.
- **Negative** — a **Pengembalian**.

Setoran are period-wide, not tied to a particular Nota. Their *timing* never affects the arithmetic, only the money's availability.

### Pengembalian (refund)
A negative **Setoran**: cash the Holder hands back to an Anggota. Requires a note. The reason it exists as its own word is that a refund is a real event in the ledger, not a correction to a mis-typed Setoran — editing history destroys the record.

### Saldo Awal (opening balance)
An Anggota's running balance carried **into** a Periode, taken from the previous Periode's close snapshot (ADR-0004, ADR-0013). It is not user data on the new Periode — it is read from the previous one. The Tim's **first** Periode is the single exception: its `saldoAwal` may be hand-entered, because a pre-app debt has no Nota behind it (ADR-0021). Every later Periode derives it and cannot be hand-edited.
**Avoid:** treating it as this Periode's activity. Food eaten last month is not **Konsumsi** now, and a screen that shows `saldoAwal` as "Konsumsi" will be read as a lie.

### Saldo
What an Anggota owes the Holder, or is owed by the Holder — a **running** figure across the Tim's Periodes.

```
saldo = Saldo Awal + Konsumsi − Kontribusi
```

`saldo > 0` → the Anggota owes the Holder. `saldo < 0` → the Holder owes the Anggota (a **Kredit**). Timing of Setoran never enters the formula, only totals.
**Avoid:** calling this "saldo periode ini". The Periode's own movement is `Konsumsi − Kontribusi`; the Saldo is what the person actually owes. The two must never be labelled the same way on screen.

### Kredit
A negative **Saldo** — money the Holder owes an Anggota. Not a separate entity; it is what a Saldo below zero *means*.

### Settlement
The period-end presentation of every Anggota's Saldo, plus the Holder's net position. During an `open` Periode it is a live recomputation of Nota and Setoran and is labelled a **preview**; at close it is snapshotted (ADR-0004). It carries the "vs Holder" list as primary and **Cara Bayar Paling Ringkas** as a secondary block (ADR-0011).
**Avoid:** "patungan", "bagi rata" when you mean the Settlement screen — "bagi rata" is the *split* rule, the Settlement is the *outcome*.

### Cara Bayar Paling Ringkas (minimal-transfer view)
An optional secondary block in the Settlement: the shortest set of member-to-member transfers that zeroes every **running Saldo**, computed by greedy largest-debtor/largest-creditor matching. Derived, never stored, and never a replacement for the vs-Holder list (ADR-0011). It nets whatever balance set is being viewed, so a closed Periode's block is as of its close (ADR-0018).
**Avoid:** calling it "the settlement" or presenting it as authoritative — it changes no balances. Also avoid rendering it against a single Periode's movement; that under-instructs by exactly the carried balance.

### Kas Holder
The cash the Holder should physically be holding right now:

```
kas = Σ Setoran (signed) − Σ (amount the Holder contributed as Pembayar)
```

Scoped to the **Tim** and running across its Periodes, never reset per Periode (ADR-0019). It is the only figure in the app reality can contradict, and it is the reconciliation instrument at Holder handover (ADR-0012).
**Avoid:** adding it to **Holder Net**. They are different quantities: `kas` is what the Holder *holds now*, `holderNet` is what they will *collect*.

### Holder Net
What the Holder will net-collect from the rest of the team: the sum of every other Anggota's positive Saldo, minus the sum of every Kredit. Like the Saldo it is built from, it is a **running** figure across the Tim's Periodes, not a per-Periode one. The Holder's own Konsumsi is shown separately; it is not a debt and never appears as a Saldo.

### Sisa Pembulatan (rounding residual)
The leftover rupiah when each Anggota's proportional share is rounded to whole rupiah. It is assigned to the **Holder** when the Holder consumed anything on that Nota, otherwise to the first Anggota in roster order (ADR-0006). IDR has no sub-unit, so this residual always exists and is always someone's.