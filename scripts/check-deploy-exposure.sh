#!/usr/bin/env bash
# Asserts that a deploy serves ONLY the SPA.
#
#   bash scripts/check-deploy-exposure.sh [base-url]
#
# RED  = repo internals are publicly fetchable.
# GREEN = internals 404, and the app's own surface still serves.
#
# Run it against the production URL and against a deploy preview after changing
# `netlify.toml` or the layout of `public/`.
set -u

BASE="${1:?usage: check-deploy-exposure.sh <base-url>}"

# Repo-internal paths that must NOT be served.
PRIVATE=(
  "/package.json"
  "/README.md"
  "/AGENTS.md"
  "/GLOSSARY.md"
  "/netlify.toml"
  "/test/nota.test.js"
  "/test/settlement.test.js"
  "/test/lifecycle.test.js"
  "/test/migration.test.js"
  "/test/function.test.js"
  "/docs/agents/issue-tracker.md"
  "/docs/adr/0001-holder-is-the-sole-settlement-counterparty.md"
  "/netlify/functions/analyze-receipt.js"
)

# The app's real surface, which must keep working.
PUBLIC=(
  "/"
  "/index.html"
  "/js/app.js"
  "/js/domain.js"
  "/js/storage.js"
  "/js/format.js"
)

OUT=$(mktemp)
status() { curl -s -o "$OUT" -w "%{http_code}" "$BASE$1"; }

leaks=0
breaks=0

echo "=== private paths (expect 404) ==="
for p in "${PRIVATE[@]}"; do
  code=$(status "$p")
  if [ "$code" = "200" ]; then
    echo "  LEAK  $code  $p"; leaks=$((leaks + 1))
  else
    echo "  ok    $code  $p"
  fi
done

echo "=== public paths (expect 200) ==="
for p in "${PUBLIC[@]}"; do
  code=$(status "$p")
  if [ "$code" = "200" ]; then
    echo "  ok    $code  $p"
  else
    echo "  BROKE $code  $p"; breaks=$((breaks + 1))
  fi
done

echo "=== function endpoint (expect 200 on OPTIONS) ==="
fcode=$(curl -s -o "$OUT" -w "%{http_code}" -X OPTIONS "$BASE/.netlify/functions/analyze-receipt")
if [ "$fcode" = "200" ]; then
  echo "  ok    $fcode  OPTIONS /.netlify/functions/analyze-receipt"
else
  echo "  BROKE $fcode  OPTIONS /.netlify/functions/analyze-receipt"; breaks=$((breaks + 1))
fi

rm -f "$OUT"
echo
echo "leaks=$leaks breaks=$breaks"
if [ "$leaks" -eq 0 ] && [ "$breaks" -eq 0 ]; then
  echo "VERDICT: GREEN"; exit 0
fi
echo "VERDICT: RED"; exit 1
