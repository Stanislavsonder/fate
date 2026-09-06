# Phase 5 — Other Improvements (backlog)

> **Prerequisites:** none specific — this is a backlog of follow-ups
> identified while implementing earlier phases, not a strictly-ordered
> continuation of Phase 4. Pull items into a real phase/PR as they're ready.

## Phase 4 close-out — DONE (Phase 5 session, 2026-07-26)

**Context:** Phase 4's app-side implementation (SDK publish infra,
`create-fate-mod` scaffolder, the `dice` capability, theme confirmed already
generic) was done, unit-tested, and verified locally in the prior session.
Every item below required pushing to the separate, live `fate-core-mods`
repo (or npm) — each push was confirmed with the user individually, same as
Phase 3's closeout, and all landed this session.

- ~~`NPM_TOKEN` repo secret~~ Added by the user, then had to be **regenerated
  twice**: first attempt hit `ERR_PNPM_OTP_NON_INTERACTIVE` (token wasn't
  flagged to bypass 2FA on publish), second attempt hit a `403` publishing
  `create-fate-mod` specifically (token was scoped to `@fate-core` only —
  a brand-new *unscoped* package needs "Read and write, All packages").
  Final token: granular, 7-day expiry (npm's max is 90), all-packages
  read+write, 2FA bypass enabled. **Follow-up below: replace with Trusted
  Publishing so no token is needed going forward.**
- ~~`create-fate-mod` isn't published to npm yet~~ Published as `1.1.0`
  alongside `mod-types`/`mod-build` (also bumped to `1.1.0` to match
  `SDK_VERSION`) via the `mod-sdk-v1.1.0` tag → `publish-sdk.yml`.
- ~~`fate-core-mods`' `validate-pr.yml` still rejects `dice`/`theme`~~
  [PR #3](https://github.com/Stanislavsonder/fate-core-mods/pull/3):
  bumped the repo's own `@fate-app/mod-build`/`mod-types` devDeps to
  `^1.1.0` (smoke-load now stubs `FateSDK.dice` and instantiates shapes
  headlessly — this was the entire gap, there was never explicit
  capability-rejection code), fixed the stale schema comment, added
  `translationTargets`, new root README + `docs/GUIDE.md`, `SUBMITTING.md`
  scaffolder-first rewrite, and a CI fix so label-gated infra-only PRs
  (like this one) pass `validate-pr.yml` instead of erroring on "no mods
  folder touched" — merged, then a second PR
  ([#4](https://github.com/Stanislavsonder/fate-core-mods/pull/4)) added
  `three`/`cannon-es` as real devDependencies there too (the smoke-load
  stub imports them unconditionally; without them installed, *every*
  mod's smoke-load — not just dice — failed).
- ~~`translationTargets` schema field~~ Landed in PR #3 above; the app
  repo's vendored `packages/mod-types/registry.schema.json` was then
  re-synced from the canonical copy (`pnpm check-registry-schema` green)
  and `FateModManifest` gained the matching `translationTargets?: string[]`
  field.
- ~~A real dice mod, published end-to-end~~ **`sonder@dice-d6@1.0.0`** is
  live in `registry.json` — scaffolded with the *published*
  `create-fate-mod@1.1.0` (proving the real external-consumer path, not
  workspace links), built against real npm `@fate-app/*@1.1.0`, verified
  locally (build + security lint + dice smoke-load) before submission,
  then went through the actual PR pipeline
  ([#5](https://github.com/Stanislavsonder/fate-core-mods/pull/5)) and
  `publish.yml` deployed it to GitHub Pages on merge. One shape (D6,
  canvas-textured numbers) + one material (Gold). Found and fixed along
  the way: `createNumberMesh` threw in headless/jsdom environments (no 2D
  canvas context) — now degrades to a numberless die instead of crashing
  the smoke-load; same fix applied to `packages/example-dice-mod` in this
  repo so the pattern isn't lost. Also filed
  [PR #6](https://github.com/Stanislavsonder/fate-core-mods/pull/6) to
  record ownership in `owners.json` for both published mods (the
  "maintainer adds this on merge" step manifest.json's comment describes
  had never actually been done, even for `sonder@example`).
- ~~Author docs in the registry repo~~ New `docs/GUIDE.md` (zero-to-
  published walkthrough via the scaffolder) and `SUBMITTING.md` rewritten
  around `pnpm create fate-mod`, both in PR #3.
- ~~Project close-out sweep~~ App repo's `CLAUDE.md`/`README.md` done
  earlier in Phase 5; registry repo's new root `README.md` (PR #3) covers
  the trust model, a 24-hour blocklist response-time target, and the
  maintenance cadence (RFC issue before any ABI-breaking SDK major).
- ~~No Cypress e2e coverage for the dice UI changes~~ Done earlier in
  Phase 5 — `dice/externalDice.cy.ts`, which is what caught the
  `loadDiceLibs()` bug below in the first place.

**Bug found via this process, not by inspection:** Phase 4 wired up
`loadDiceLibs()` in `src/mods/sdk.ts` and documented that the loader calls
it, but **no call site ever existed** — every external dice-capability mod
would have thrown at import time (`FateSDK.dice.three`/`cannonEs` empty when
the shimmed bundle evaluates). `dice/externalDice.cy.ts` caught it on its
first real run. Fixed in `src/mods/loader.ts` (`loadExternalMod` now awaits
`loadDiceLibs()` before importing a dice-capability bundle), unit-tested in
`loader.test.ts`, and re-verified end-to-end by `sonder@dice-d6`'s own CI
smoke-load passing.

**Not yet exercised on-device / by a human**: installing `sonder@dice-d6`
from the live Mod Store inside a running app, its physics/rendering feel,
and iOS/Android device passes — all fall under this project's existing
"no hardware available this session" pattern (see Phase 3's equivalent
notes). Worth a manual pass before calling Phase 4 fully closed.

### Follow-up: replace the npm token with Trusted Publishing

The 7-day token used for the `1.1.0` release is not sustainable. Once
logged into npmjs.com: for each of `@fate-app/mod-types`,
`@fate-app/mod-build`, and `create-fate-mod` → Settings → Trusted
Publisher → GitHub Actions → repo `Stanislavsonder/fate`, workflow
`publish-sdk.yml`, environment none. `publish-sdk.yml` already has
`id-token: write` and `--provenance` — no workflow change needed. After
all three are configured, delete the `NPM_TOKEN` repo secret; the next tag
push won't need it (OIDC is attempted first, token is only the fallback —
the `[WARN] Skipped OIDC ... 404` seen in this session's run is expected
until a trusted publisher exists).
  Original item: `DiceTypeSelect.vue`'s
  shape/material selection now keys off the `DICE_SHAPES`/`DICE_MATERIALS`
  Map key (namespaced for external mods) rather than the bare class name;
  covered by a unit test for the underlying `registerBuiltinDice`/
  `syncExternalDice` logic (`src/tests/unit/dice/registerBuiltinDice.test.ts`)
  but not by a real browser test of the Roll Dice page itself. Same gap
  pattern as the existing "Cypress e2e coverage for Phase 2" backlog item
  below — real browser testing has repeatedly caught bugs unit tests
  couldn't (see that section), so this is worth prioritizing once there's a
  real external dice mod to test against.

## Repo topology — DECIDED (Phase 5): keep the current structure

**Decision (user-confirmed, Phase 5 planning session):** no restructure.
`packages/mod-types`, `packages/mod-build`, and `packages/create-fate-mod`
stay as pnpm workspace packages in this repo, published to npm via the
`mod-sdk-v*` tag pipeline (`.github/workflows/publish-sdk.yml`);
`fate-core-mods` stays a wholly separate community-facing repo.

Rationale:

- **The app is the SDK's primary consumer, deeply.** 42 files in `src/`
  import `@fate-app/mod-types` — including `src/types.ts` itself (the core
  `Character` type lives there) and the entire dice subsystem. Spinning the
  packages out would turn every core-type change into an
  edit-elsewhere → publish → bump-here cycle, pure friction for a single
  maintainer.
- **The SDK ABI is defined by the app.** `SDK_VERSION` (`src/mods/sdk.ts`)
  moves in lockstep with the package versions, guarded by
  `src/tests/unit/mods/sdkSurface.test.ts` — a test that can only exist
  because both sides share a repo. `mod-build`'s `sdkExports.ts` is
  generated from the app's own pinned vue/ionic/three/cannon-es versions.
  A repo split would make atomic SDK changes impossible.
- **Independent release cadence already exists without a split** — the
  tag-triggered publish workflow releases the packages on their own
  schedule, decoupled from app releases.
- **`fate-core-mods` stays separate** because it takes PRs from arbitrary
  community authors (who shouldn't land in the app's history/issue
  tracker), and its GitHub Pages URL is already baked into shipped apps'
  boot-time registry fetch.

This is the standard app+SDK-monorepo pattern (Vue, Vite, and most
app-plus-SDK projects publish libraries from inside a larger monorepo) —
what looked like an "awkward in-between" is the intended end state, now
documented as such.

## Privacy Policy needs updating — Phase 2/3 make it factually wrong

> **Status (Phase 5 session):** DONE for English — `en.md` §2/§5 rewritten
> (new "Network Connections and Third-Party Content" section describing the
> registry catalog refresh, Mod Store browsing, and mod installs; character
> data never transmitted stays emphasized), effective date bumped to
> 2026-07-26, and `usePolicy.ts`'s `ACTUAL_POLICY_VERSION_DATE` bumped to
> match. Also fixed along the way: the §7 re-prompt mechanism was dead code —
> the router guard only checked `DATE_KEY`, so a policy update never actually
> re-prompted anyone; the guard now also compares `VERSION_KEY` against
> `ACTUAL_POLICY_VERSION_DATE` (and the e2e helpers import the constant
> instead of hardcoding the date). **Remaining: the other 29 locale files
> still carry the old text — user will translate them** (explicitly their
> call, this session).

**Context:** `privacy-policy/languages/en.md` (and the other locales) currently
states, verbatim:

- §2: *"The App operates entirely offline and does not collect any personal
  data from users."*
- §5: *"The App does not integrate with any third-party services or external
  APIs. No data is shared with or collected by third parties."*

Both statements are already false as of Phase 2 (install-from-URL fetches an
author-supplied URL on explicit user action) and become more clearly false
with Phase 3: `src/mods/registryClient.ts`'s `refreshIndex()` runs
**automatically, in the background, on every app boot** (`main.ts`, no user
action required) and fetches `registry.json` from
`https://stanislavsonder.github.io/fate-core-mods` — a real third-party
network request the current policy explicitly says doesn't happen. The Mod
Store's detail view (`ModStoreDetailModal.vue`) also fetches and renders
community-authored README content from the same host on demand.

**What needs to happen** before Phase 2/3 should be considered fully shipped
to end users (not just implemented):

- Rewrite §2 and §5 to accurately describe what's actually fetched (registry
  index, mod bundles/manifests/translations/READMEs — all from
  `github.io`/GitHub Pages, all either automatic-background or
  explicit-user-install, never containing character data going *out*) and
  when (background refresh vs. explicit install-from-URL vs. explicit Mod
  Store browsing).
- Character data itself is still never transmitted anywhere — that part of
  the policy stays true and should stay emphasized, this isn't a privacy
  *regression* so much as an accuracy gap in what the app now legitimately does.
- `usePolicy.ts` / `PrivacyPolicyPage.vue` already has the mechanism for this
  (§7 of the policy itself: "significant changes will be communicated to you
  through a dialogue prompt upon launching the App after the policy is
  updated") — updating the policy content should naturally trigger that
  existing re-acceptance flow, no new plumbing needed.
- Do this for every locale under `privacy-policy/languages/`, not just `en.md`.

## Character list card / identity module redesign

**Context:** Phase 1 made `avatar` a required core `Character` field
(`packages/mod-types/src/character.ts`), independent of whether
`sonder@core-identity` is installed — see
[phase-1-builtins-migration.md](./phase-1-builtins-migration.md) Step 3 and
`src/patches/v2.0.0.ts` (the migration that backfills existing characters).
This fixed the immediate problem: `src/components/ChracterList/parts/CharacterCard.vue`
no longer depends on a specific module for the image every card shows.

**What's still open, deliberately left out of Phase 1:**

- There is currently no way to set/change a character's avatar unless
`sonder@core-identity` is installed — the only avatar editor
(`sonder@core-identity/src/components/parts/Avatar.vue`) lives inside that
module's sheet section (`Identity.vue`). A character created with zero
modules gets the empty-string default (placeholder image) and has no UI
path to add a real one without installing identity first.
- `CharacterCard.vue` and `sonder@core-identity` (`Identity.vue`, `Avatar.vue`)
are candidates for a broader redesign now that `avatar` is a core concept —
e.g., an avatar picker directly in character creation
(`CharacterConfiguration.vue`), independent of module selection.
- Owner: user ("I'll tinker something") — no fixed design yet, intentionally
left open rather than guessed at here.



## Cypress e2e coverage for Phase 2 (external mod loading)

> **Status (Phase 5 session): DONE** — and it caught a showstopper on its
> first run, exactly as this section predicted. **`loadDiceLibs()` was never
> called anywhere in production code** (Phase 4 wired up the function and the
> loader comment claimed the loader calls it, but no call site existed), so
> every external dice mod would have thrown at import time —
> mod-build's shims read `globalThis.FateSDK.dice.three/cannonEs` at module
> evaluation. Fixed in `loader.ts` (dice-capability manifests now await
> `loadDiceLibs()` before `importBlobModule`), unit-tested in
> `loader.test.ts`, and proven end-to-end by the new dice spec.
>
> What shipped, slightly different from the sketch below (better, because a
> committed *real build* fixture existed to make it possible):
>
> - `packages/example-dice-mod/` — a new never-published worked example for
>   the dice capability (D6 + gold material), sibling to `example-mod`.
> - `pnpm fixtures:mods` (`scripts/sync-e2e-mod-fixtures/`) rebuilds both
>   example packages and snapshots their output into
>   `src/tests/e2e/fixtures/mods/{example-mod,example-dice-mod}/1.0.0/` —
>   see `fixtures/mods/README.md` for the regeneration/drift rules.
> - `seedBuiltMod` / `deleteInstalledMod` commands (support/modStore.ts):
>   seed a real built mod straight into IndexedDB, recomputing sha256
>   in-browser so the loader's integrity gate passes — no intercepts needed
>   except where the network path IS the thing under test.
> - New specs: `developer/installFromUrl.cy.ts` (typed-confirm gate: wrong
>   text stays open, cancel installs nothing, correct id installs),
>   `characterSheet/externalMod.cy.ts` (External badge, manifest-driven
>   config modal, getModData/setModData round-trip across reload),
>   `modStore/enableDisable.cy.ts` (disable removes the sheet section
>   in-session, re-enable live-loads it back), `dice/externalDice.cy.ts`
>   (namespaced shape/material registration, selection persistence, stale
>   config self-healing after removal — the "dice UI" gap from the Phase 4
>   close-out list above).
> - The blob-URL `import()` gap is now closed for real: the seeded bundles
>   are genuine mod-build output executed through the loader in a real
>   browser, WebGL scene included.
>
> Still open from the sketch: the dev-mode live-reload spec (needs a second
> running process — deliberately kept out of the main suite).

**Context:** Phase 2 (install-from-URL, Dexie-backed mod storage, the
runtime loader, Settings → Mods, dev-mode live reload) shipped with unit/
integration coverage (`src/tests/unit/mods/`) but **zero Cypress e2e
coverage** — every one of these flows was instead verified once, by hand,
in a live Chrome session (see the session that closed out
`phase-2-loader-storage-devmode.md`). That manual pass caught six real bugs
that no automated test caught first:

1. A literal `@` in a translation string crashed vue-i18n's message parser
   the moment Developer Mode was opened (`settings.developer.installFromUrl.urlPlaceholder`).
2. `ModsManagePage.vue` displayed raw i18n keys instead of resolved mod
   names (missing `$t()`; `safeManifest()` not signing the manifest).
3. A disabled-across-reload mod's name showed as a raw key (translations
   never merged for a mod that was never `loadExternalMod`-ed this session).
4. `packages/example-mod`'s `onInstall` wasn't idempotent, silently wiping
   character data on every reload (also caught: `docs/MOD_API.md` had
   documented `onInstall` as "runs once", which is wrong).
5. The dev-mode hot-reimport threw `DataCloneError` — passing the live
   reactive Pinia character object into `changeCharacterModules` instead of
   going through the existing `reconfigureCharacter` action.
6. (Pre-existing, not Phase 2's bug, but only surfaced by actually creating
   a character live) every built-in module's `manifest.json` still declared
   `appVersion: "^1.x"` after the 2.0.0 bump, so *no* character could be
   created at all.

None of these are exotic — they're exactly the class of bug that only shows
up when real browser APIs run for real: vue-i18n message compilation, blob-URL
`import()` (confirmed **unavailable in Node/Vitest** — this is why
`src/tests/unit/mods/integration.exampleMod.test.ts` substitutes a `data:`
URL for that one step), `structuredClone` on a Vue reactive proxy, and
autosave debounce timing. Unlike the unit suite, Cypress runs in a real
browser and could close the blob-URL gap completely — this is the one
mechanism nothing in the automated suite exercises for real.

**What's needed**, roughly in priority order:

- **A committed fixture mod bundle** under `src/tests/e2e/fixtures/mods/`
  (a manifest.json + built bundle.mjs + translations/en.json — e.g. a
  trimmed copy of `packages/example-mod`'s build output) so specs don't
  need to spawn `@fate-app/mod-build` during the Cypress run. Regenerate it
  manually (`pnpm --filter example-mod build` + copy) whenever
  `packages/mod-build`'s shim/CSS-injection behavior or `SDK_VERSION` changes
  — there's no automation tying the fixture to the real preset output yet,
  so it can drift silently; a follow-up could add a CI check that diffs them.
- **Serve the fixture via `cy.intercept`**, not a second running process —
  intercept `GET **/mods/example/manifest.json`, `.../bundle.mjs`, and
  `.../translations/en.json` and reply with the fixture files' contents.
  This avoids the process-management complexity of running
  `mod-build`'s dev server (or any static server) alongside Cypress in CI,
  and keeps the whole spec self-contained.
- **Install-from-URL spec**: Settings → Developer → enable → install from
  the intercepted URL → typed-confirmation prompt (type the wrong string,
  assert it stays open; type the mod id, assert it installs) → toast →
  appears in Settings → Mods as `Loaded`.
- **Character-sheet spec**: create a character with the fixture mod
  selected (assert the "External" badge renders — `CharacterConfiguration.vue`),
  open its config modal (assert the config option renders from
  `manifest.json`, not the bundle), fill in the mod's own field, reload the
  page, assert the value survived (this is exactly the `getModData`/
  `setModData` round-trip bug #4 above would have caught).
- **Mods management spec**: disable (assert the character sheet section
  disappears without a full reload — `ModsManagePage.vue`'s in-session
  `ModRegistry` status flip), re-enable, update, and the remove-guard
  (attempt remove while a character still references it, assert it's
  blocked and lists the character name — `installService.ts`'s `remove()`).
  Removing `confirmRemove`'s use of `@capacitor/dialog`'s native
  `Dialog.confirm` (a real blocking browser `confirm()` on web) needs
  either a Cypress-specific stub or accepting that spec can't assert past
  the confirm step in Chrome headless the way `cy.on('window:confirm')`
  normally would for `window.confirm` — check whether Capacitor's web
  fallback actually calls `window.confirm` before assuming `cy.on` works.
- **Dev-mode live reload**: lower priority / harder to automate well — it
  needs a second running process (`mod-build`'s dev server) alongside
  Cypress, which is exactly the complexity the `cy.intercept` approach above
  is designed to avoid for the other specs. If attempted, keep it as its
  own opt-in spec (e.g. `dev-mode.cy.ts`, run manually or in a separate CI
  job) rather than blocking the main suite on spawning a child process.

## Other known follow-ups from Phase 1 (see that doc's checklist for detail)

- Manual verification never done in the coding session: Pink skin in a real
browser/device, `.fchar`/`.fmod` round-trip against a pre-Phase-1 export,
non-English locale spot-check, iOS/Android smoke test.
- Dice materials (white/black) were deliberately not converted to mods in
Phase 1 — only shapes were. Revisit if a real need for custom materials
shows up.
- ~~`FateModDice.shapes`/`materials` stay `unknown[]`...~~ Done in Phase 4 —
now properly typed `DiceConstructor[]`/`DiceMaterial[]`.
- ~~Double check missing translations and fix it.~~ Checked in Phase 5 (ad-hoc
  key-parity sweep of every locale vs en, core + all modules). Fixed
  mechanically: 3 dead keys (`debug.enabled`,
  `modules.import.error.parse`/`.read`) removed from all 29 core locales
  (they'd have failed the localizer's own extra-key validation),
  `sonder@core-stunts`'s missing `author.name` copied to all locales (proper
  noun), `sonder@core-skills`'s Greek file still using the pre-rename
  `list.*` group renamed to `skills.*` (content was already translated).
  **Remaining, needs real translation (user-owned, same as the privacy
  policy):** the 64 Modules-2.0 UI keys (`modules.external`,
  `settings.developer.*`, `settings.mods.*`, Mod Store strings) are
  en-only — every other locale falls back to English; plus `pt` lags ~16
  older core keys and 18 `sonder@core-consequences` keys. Feed them through
  `pnpm translate` when ready.
- ~~Add more debug info for mod devs~~ Reviewed in Phase 5: the surface was
  already good (quarantine error text + status badge + retry in
  Settings → Mods, toasts with error detail on every install/enable/update
  failure, console.error/warn in the loader). Added the missing piece: a
  per-mod `console.info` on successful boot-load stating id/version/source
  and the mod's sdk range vs the app's `SDK_VERSION` — the first thing a mod
  dev needs when "my mod silently isn't doing anything" (usually: it never
  loaded, or an old version loaded).

