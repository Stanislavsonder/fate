# Changelog

## 1.1.0

Tracks `SDK_VERSION` 1.1.0 (the `dice` capability). Additive: new runtime
exports `Dice`/`DiceMaterial` (base classes for custom dice, bundled into
the mod — no runtime three/cannon-es dependency of their own), new types
`DiceConstructor`/`DiceCollisionEvent`/`DiceResult`; `FateModDice.shapes`/
`materials` are now properly typed; `validateBundleShape` validates the
`dice` capability and caps `theme.css` at 100 KiB.

## 1.0.0

Version aligned to `SDK_VERSION` (1.0.0) — the versioning scheme going
forward tracks the `FateSDK` ABI (same major.minor, patch free), not
independent semver. No breaking changes from 0.1.2.

## 0.1.0 – 0.1.2

Initial releases, published as a Phase 3 prerequisite (registry CI's
smoke-load step and real mod authors' local dev both needed the published
package to exist before the registry itself shipped).
