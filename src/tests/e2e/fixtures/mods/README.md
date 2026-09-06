# Mod fixtures for the Cypress suite

Two kinds of fixture live here:

- **`fixture-mod/`** — a hand-written stub (trivial `bundle.mjs`, no
  capabilities) used by the Mod Store specs, where only the
  install/update/remove *plumbing* matters, not what the mod does. Its
  registry index fixtures (`registry.*.json`) pin sha256 hashes of these
  exact files — if you edit a `bundle.mjs` here, recompute the hash in every
  registry fixture that references it.
- **`example-mod/` and `example-dice-mod/`** — committed snapshots of the
  real build output of `packages/example-mod` and
  `packages/example-dice-mod`, used by the specs that need a *functional*
  mod (sheet section with mod data, external dice). Regenerate with:

  ```bash
  pnpm fixtures:mods
  ```

  and commit the diff. Do this whenever `@fate-app/mod-build`'s shim or
  CSS-injection behavior, `SDK_VERSION`, or either example package's source
  changes — nothing ties the snapshots to the live preset output
  automatically, so they drift silently otherwise.

Specs consume these either via `cy.intercept` (`interceptModFiles`, always
with the `,utf-8` suffix so Cypress doesn't re-serialize JSON and silently
change the bytes/sha256) or by seeding IndexedDB directly (`seedBuiltMod`,
which recomputes the sha256 in-browser so the loader's integrity gate
passes).
