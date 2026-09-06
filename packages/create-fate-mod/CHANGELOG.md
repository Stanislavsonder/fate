# Changelog

## 1.2.1

Infra-only, no functional change — republished to verify the npm Trusted
Publisher (OIDC) setup added for provenance-signed publishes.

## 1.1.0

Tracks `SDK_VERSION` 1.1.0 — scaffolded projects now pin
`@fate-app/mod-types`/`@fate-app/mod-build` at `^1.1.0` and declare
`"sdk": "^1.1.0"` in their manifest.

## 1.0.0

Initial release (never published — 1.1.0 is the first npm release).
Scaffolds a mod project shaped like `packages/example-mod/`
using `@fate-app/mod-build`'s Vite preset, gated by chosen capabilities
(`sheetComponents`/`dice`/`theme`/`translations`).
