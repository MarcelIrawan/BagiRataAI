# BagiRata AI

Aplikasi split bill berbasis AI (foto nota) dengan dua mode:

- **Sekali Pakai** — split satu nota dengan Tim in-memory; tidak menulis apa pun ke penyimpanan
- **Tim** — grup yang bertahan: roster, Holder, banyak **Periode**, Setoran, Settlement per periode

## Stack

- Static SPA (`public/index.html` + ES modules di `public/js/`), tanpa bundler
- Cloudflare Pages Function: `functions/api/analyze-receipt.js` → route `/api/analyze-receipt` (OpenRouter multimodal OCR)
- Persistensi: `localStorage` key `bagirata.v2` (key `bagirata.v1` dibaca sekali untuk migrasi, tidak dihapus)
- Deploy: hanya folder `public/` yang dipublikasikan (Cloudflare Pages: build command `exit 0`, build output directory `public`); folder `functions/` ada di root repo dan tidak pernah dipublikasikan sebagai file statis

## Modul

| File | Isi |
| --- | --- |
| `public/js/domain.js` | Skema, migrasi v1→v2, dan **semua** aritmatika uang. Murni: tanpa DOM, `localStorage`, `Intl`, jam, atau jaringan |
| `public/js/storage.js` | Hanya baca/tulis store mentah |
| `public/js/format.js` | `formatRupiah`, `escapeHtml`, tanggal, warna |
| `public/js/app.js` | Shell UI: routing, render, event handler. Tidak menghitung uang |
| `functions/api/analyze-receipt.js` | OCR nota (Pages Function, route `/api/analyze-receipt`), hanya mengisi editor |

## Test

```bash
npm test
```

Node built-in test runner, tanpa dependency. Test menyentuh `public/js/domain.js` (Nota math, Settlement, siklus Periode/Anggota, migrasi) dan `functions/api/analyze-receipt.js` (kontrak HTTP handler Pages).

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

Deploy ke Cloudflare Pages (Workers & Pages → Create application → Pages → import repo `MarcelIrawan/BagiRataAI`): production branch `main`, build command `exit 0`, build output directory `public`. Set env `OPENROUTER_API_KEY` di Settings → Environment variables (Production **dan** Preview) — fungsi membacanya dari `context.env`, bukan `process.env`. `public/_routes.json` membatasi invokasi function hanya ke `/api/*`, supaya request statis tetap unlimited. `public/404.html` WAJIB ada: tanpa file 404 top-level, Cloudflare Pages menganggap proyek SPA dan mengembalikan `index.html` dengan status 200 untuk path apa pun yang tidak ada — script cek di bawah akan salah baca sebagai leak. Build output `public/` saja — `test/`, `docs/`, `GLOSSARY.md`, `AGENTS.md`, dan `package.json` tidak pernah ikut ke deploy. Setelah mengubah pengaturan build atau isi `public/`, cek hasil deploy:

```bash
bash scripts/check-deploy-exposure.sh https://<url-deploy>
```

Untuk uji UI tanpa OCR, gunakan **Gunakan contoh nota**, atau **Nota Manual**.
