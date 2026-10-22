# BagiRata AI

Aplikasi split bill berbasis AI (foto nota) dengan dua mode:

- **Sekali Pakai** — split satu nota dengan Tim in-memory; tidak menulis apa pun ke penyimpanan
- **Tim** — grup yang bertahan: roster, Holder, banyak **Periode**, Setoran, Settlement per periode

## Stack

- Static SPA (`index.html` + ES modules di `js/`), tanpa bundler
- Netlify Function: `netlify/functions/analyze-receipt.js` (OpenRouter multimodal OCR)
- Persistensi: `localStorage` key `bagirata.v2` (key `bagirata.v1` dibaca sekali untuk migrasi, tidak dihapus)

## Modul

| File | Isi |
| --- | --- |
| `js/domain.js` | Skema, migrasi v1→v2, dan **semua** aritmatika uang. Murni: tanpa DOM, `localStorage`, `Intl`, jam, atau jaringan |
| `js/storage.js` | Hanya baca/tulis store mentah |
| `js/format.js` | `formatRupiah`, `escapeHtml`, tanggal, warna |
| `js/app.js` | Shell UI: routing, render, event handler. Tidak menghitung uang |
| `netlify/functions/analyze-receipt.js` | OCR nota, hanya mengisi editor |

## Test

```bash
npm test
```

Node built-in test runner, tanpa dependency. Test menyentuh `js/domain.js` (Nota math, Settlement, siklus Periode/Anggota, migrasi) dan `netlify/functions/analyze-receipt.js` (kontrak HTTP handler).

## Model uang

```
saldo      = Saldo Awal + Konsumsi − Kontribusi
kontribusi = Setoran (signed) + jumlah yang dibayar langsung ke merchant (Pembayar)
kas        = Σ Setoran semua Periode − Σ paidBy milik Holder
```

- `saldo > 0` → anggota berutang ke Holder; `saldo < 0` → kredit dari Holder
- **Kas Holder** dan **Holder Net** adalah dua angka berbeda; jangan dijumlahkan
- Konsumsi, Setoran, peserta, dan pernyataan bersifat per-Periode; saldo dan kas bersifat per-Tim

`GLOSSARY.md` dan `docs/adr/` adalah sumber kebenaran istilah dan aturan.

## Local / deploy

Deploy ke Netlify dan set env `OPENROUTER_API_KEY`. Untuk uji UI tanpa OCR, gunakan **Gunakan contoh nota**, atau **Nota Manual**.
