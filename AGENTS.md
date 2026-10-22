# BagiRata AI

Split-bill app: static SPA (`public/index.html`, `public/js/`) plus a Netlify function
(`netlify/functions/analyze-receipt.js`) for multimodal receipt OCR. `netlify.toml`
publishes `public/` only, so the repo's tests and docs stay out of the deploy.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `MarcelIrawan/BagiRataAI`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its role name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.