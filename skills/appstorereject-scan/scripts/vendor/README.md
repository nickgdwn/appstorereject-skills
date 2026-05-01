# vendor/

This directory contains pre-bundled, vendored third-party code so the skill scripts
can run without `npm install` after a fresh `npx skills add`.

> **For code reviewers:** the `.cjs` files in this directory are **generated artifacts**, not human-written source. Do not review the bundle byte-by-byte — verify provenance by re-running the rebuild instructions below and comparing the resulting hash to the one recorded here.

## js-yaml.cjs

- Source: `js-yaml@4.1.0` (https://github.com/nodeca/js-yaml)
- Bundled with: esbuild (CommonJS, target node18)
- License: MIT (see js-yaml's LICENSE)
- SHA-256: `5904eecfd3c096fc5e848c0f7000660b0c795e3022442421680cfaef0816e736`

Verify integrity:
```bash
shasum -a 256 js-yaml.cjs
# expected: 5904eecfd3c096fc5e848c0f7000660b0c795e3022442421680cfaef0816e736
```

A mismatch means the bundle has been modified or rebuilt with different esbuild flags. Rebuild from clean source (instructions below) to confirm whether the change is intentional.

## Rebuilding

```bash
cd /tmp && mkdir -p asr-vendor && cd asr-vendor
npm init -y
npm install js-yaml@4.1.0 esbuild
npx esbuild --bundle --platform=node --format=cjs --target=node18 \
  --external:fs --external:path \
  node_modules/js-yaml/index.js > js-yaml.cjs
cp js-yaml.cjs <skills-repo>/skills/appstorereject-scan/scripts/vendor/js-yaml.cjs
```

Verify with:
```bash
node -e "const y = require('./js-yaml.cjs'); console.log(y.load('a: b', { schema: y.FAILSAFE_SCHEMA }))"
```
Expected: `{ a: 'b' }`.
