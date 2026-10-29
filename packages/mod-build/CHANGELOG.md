# Changelog

## 1.1.0

Tracks `SDK_VERSION` 1.1.0 (the `dice` capability). `three` and `cannon-es`
imports are now externalized to `FateSDK.dice.three`/`FateSDK.dice.cannonEs`
(pinned export lists regenerated); the testing stub gained `dice` libs and
`smokeLoad()` instantiates dice shapes headlessly. Depends on
`@fate-app/mod-types@^1.1.0`.

## 1.0.0

Version aligned to `SDK_VERSION` (1.0.0) — the versioning scheme going
forward tracks the `FateSDK` ABI (same major.minor, patch free), not
independent semver. No breaking changes from 0.1.5. Depends on
`@fate-app/mod-types@^1.0.0`.

## 0.1.0 – 0.1.5

Initial releases, published as a Phase 3 prerequisite (registry CI's
smoke-load step and real mod authors' local dev both needed the published
package to exist before the registry itself shipped).
