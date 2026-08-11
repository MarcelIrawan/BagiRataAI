# BagiRata AI

Aplikasi split bill berbasis AI (foto nota) dengan dua mode:

- **Sekali Pakai** — split satu nota tanpa menyimpan tim
- **Tim Periode** — anggota tetap + pemegang dana (holder), banyak nota, setoran, dan settlement saat periode ditutup

## Stack

- Static SPA (`index.html` + `js/`)
- Netlify Function: `netlify/functions/analyze-receipt.js` (OpenRouter multimodal OCR)
- Persistensi tim: `localStorage` key `bagirata.v1`

## Local / deploy

Deploy ke Netlify dan set env `OPENROUTER_API_KEY`. Untuk uji UI tanpa OCR, gunakan tombol **Gunakan Contoh Nota Makanan**.

## Settlement

`saldo = totalKonsumsiSemuaBill - totalSetoran`

- `saldo > 0` → anggota masih berutang ke holder
- `saldo < 0` → kelebihan setoran (kredit)
