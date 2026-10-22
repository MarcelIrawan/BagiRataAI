# BagiRata AI

Aplikasi split bill berbasis AI (foto nota) dengan dua mode:

- **Sekali Pakai** — split satu nota dengan Tim in-memory; tidak menulis apa pun ke penyimpanan
- **Tim** — grup yang bertahan: roster, Holder, banyak **Periode**, Setoran, Settlement per periode

## Stack

- Static SPA (`public/index.html` + ES modules di `public/js/`), tanpa bundler
- Netlify Function: `netlify/functions/analyze-receipt.js` (OpenRouter multimodal OCR)
- Persistensi: `localStorage` key `bagirata.v2` (key `bagirata.v1` dibaca sekali untuk migrasi, tidak dihapus)
- Deploy: hanya folder `public/` yang dipublikasikan (`netlify.toml` → `[build] publish = "public"`)

## Modul

| File | Isi |
| --- | --- |
| `public/js/domain.js` | Skema, migrasi v1→v2, dan **semua** aritmatika uang. Murni: tanpa DOM, `localStorage`, `Intl`, jam, atau jaringan |
| `public/js/storage.js` | Hanya baca/tulis store mentah |
| `public/js/format.js` | `formatRupiah`, `escapeHtml`, tanggal, warna |
| `public/js/app.js` | Shell UI: routing, render, event handler. Tidak menghitung uang |
| `netlify/functions/analyze-receipt.js` | OCR nota, hanya mengisi editor |

## Test

```bash
npm test
```

Node built-in test runner, tanpa dependency. Test menyentuh `public/js/domain.js` (Nota math, Settlement, siklus Periode/Anggota, migrasi) dan `netlify/functions/analyze-receipt.js` (kontrak HTTP handler).

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

Jalankan UI secara lokal dari folder publish:

```bash
npx serve public      # atau server statis apa pun; ES module butuh http://, bukan file://
```

Deploy ke Netlify dan set env `OPENROUTER_API_KEY`. `netlify.toml` mempublikasikan `public/` saja — `test/`, `docs/`, `GLOSSARY.md`, `AGENTS.md`, dan `package.json` tidak pernah ikut ke deploy. Setelah mengubah `netlify.toml` atau isi `public/`, cek hasil deploy:

```bash
bash scripts/check-deploy-exposure.sh https://<url-deploy>
```

Untuk uji UI tanpa OCR, gunakan **Gunakan contoh nota**, atau **Nota Manual**.
