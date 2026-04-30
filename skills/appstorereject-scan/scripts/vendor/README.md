# vendor/

This directory contains pre-bundled, vendored third-party code so the skill scripts
can run without `npm install` after a fresh `npx skills add`.

## js-yaml.cjs

- Source: `js-yaml@4.1.0` (https://github.com/nodeca/js-yaml)
- Bundled with: esbuild (CommonJS, target node18)
- License: MIT (see js-yaml's LICENSE)

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
