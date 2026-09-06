# @fate-core/mod-types

Shared TypeScript types and runtime helpers for [Assistant for Fate](https://github.com/Stanislavsonder/fate)
mods — the single source of truth for the mod manifest/bundle shape, consumed
by both the app and community mod authors.

Exports `defineFateMod`, `getModData`/`setModData`, `validateBundleShape`, and
the vendored `registry.schema.json` used to validate a mod's `manifest.json`.

Full author-facing documentation lives in the app repo's
[`docs/MOD_API.md`](https://github.com/Stanislavsonder/fate/blob/main/docs/MOD_API.md).
Submitting a mod to the public registry: see
[`fate-core-mods`](https://github.com/Stanislavsonder/fate-core-mods)'s
`SUBMITTING.md`.

## Version discipline

This package's version tracks `SDK_VERSION` (the `FateSDK` ABI, defined in
the app's `src/mods/sdk.ts`) — same major.minor, patch is free. A mod's
`manifest.json` `sdk` field is a semver range checked against the app's
`SDK_VERSION` at load time; this package (and `@fate-core/mod-build`) is how
you compile against a given ABI version. Don't pin a version here that
doesn't correspond to a real `SDK_VERSION` the app has shipped.
