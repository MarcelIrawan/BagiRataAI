# BagiRata AI

Split-bill app: static SPA (`public/index.html`, `public/js/`) plus a Cloudflare
Pages Function (`functions/api/analyze-receipt.js`, route `/api/analyze-receipt`)
for multimodal receipt OCR. The Pages build publishes `public/` only (build
command `exit 0`, build output directory `public`), so the repo's tests and docs
stay out of the deploy; `public/_routes.json` invokes the function on `/api/*`
only, keeping static requests off the Functions quota. `public/404.html` must
exist: without a top-level 404 Pages serves the SPA with 200 for every missing
path, which breaks the deploy-exposure check.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `MarcelIrawan/BagiRataAI`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its role name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.