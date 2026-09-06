# Outstanding work after the 1.5.0 → 2.0.0 merge and branding migration

Snapshot taken 2026-09-06, on `2.0.0` @ `c73ff5f`.

Everything here was found while merging `1.5.0` into `2.0.0` and migrating the mod SDK off the
`fate-core` name. **Nothing below is a regression from that work** — each item is either
pre-existing on `2.0.0`, or a deliberate deferral. Each has been re-verified against the live
state rather than carried over from memory.

Done and not repeated here: the branch merge, the `@fate-app` scope migration (published,
old scope unpublished), the `fate-mods` registry rename, and both mods republished at `1.1.0`
with `sdk ^2.0.0`. See `planning/branding-migration/` for that runbook.

---

## A. Blocking — legal and release

### A1. ~~29 of 30 privacy policies do not disclose the mod network calls~~ — fixed

All 29 non-English locales now carry a translated §5 ("Network Connections and Third-Party
Content") matching `en.md`: the automatic catalog refresh, Mod Store browsing, and mod
installation network calls, the `stanislavsonder.github.io/fate-mods` host, and the no-analytics/
no-tracking disclaimer. §2–§4 were updated to match (internet-connection disclosure, "installed
mods" added to the locally-stored/user-controlled data lists). Verified: every file still has
exactly 9 `## ` sections, none retain the old "does not integrate third-party services" language,
and all reference `fate-mods`.

`pnpm translate` could not do this — the localizer (`scripts/localizer/index.ts`) only walks JSON
i18n files, not the hand-maintained Markdown policies — so each file was translated by hand from
the `en.md` diff, matching the existing register/formality already used per locale.

### A2. ~~The Release workflow is failing on `main`~~ — fixed on `2.0.0`, not yet on `main`

Last run (2026-09-05, id `33988450202`) failed in `appstore-upload`:

```
Failed to update encryption compliance for build. (409)
ENTITY_ERROR.ATTRIBUTE.INVALID — "You cannot update when the value is already set."
source: /data/attributes/usesNonExemptEncryption
```

Confirmed cause: `ios/App/App/Info.plist:50` already declares `ITSAppUsesNonExemptEncryption =
false`, so builds reach App Store Connect with compliance already set — and the workflow was also
passing `uses-non-exempt-encryption: 'false'` to `apple-actions/upload-testflight-build@v4`, which
made the action PATCH the same attribute a second time; ASC rejects the redundant write with a 409.
Verified against the action's `v4` source (`dist/index.js`): the encryption PATCH only fires when
`uses-non-exempt-encryption` is a non-empty input — omit it and the action leaves compliance to
`Info.plist` entirely (preference-order fix #1 from the original note).

Already fixed same-day in `73b0464` ("build: fix for apple pipeline", 2026-09-05 23:08), which
drops the redundant input from `.github/workflows/release.yml`. That commit is on `2.0.0` but
**not yet on `main`** — `appstore-upload`/`appstore-submit` only run `if: github.ref ==
'refs/heads/main'`, so the fix has no live effect until `2.0.0` merges to `main` and a release
runs from there. `submit-appstore.ts` was checked too and never touches this attribute, so it's
not a second source of the conflict.

Nothing left to do here beyond the eventual `2.0.0` → `main` merge.

---

## B. Should fix before 2.0.0 ships

### B1. ~~The mod and developer UI is English-only~~ — fixed

Resolved by `2a7b174` ("fix: updated translations") just before this pass started. Verified by
flattening every locale in `src/i18n/translations/*.json` against `en.json` (209 keys each): zero
missing, zero extra keys across all 29 locales. Also checked every `src/modules/*/translations/`
directory the same way (including `sonder@core-consequences`) — full parity everywhere.

### B2. ~~`modStore/blocklist.cy.ts` fails~~ — not reproducing

Re-ran it in isolation (4 times, including against a freshly-started cold `vite` dev server to
rule out a warm-cache artifact), as the full `modStore/**` folder (16/16), and as the complete
suite (`pnpm exec cypress run`, 34/34 e2e; `pnpm vitest run`, 197/197 unit) — all green, no
flakiness across ~7 runs of this spec. `applyBlocklist` in `src/mods/registryClient.ts` and the
spec's own tab-remount handling both read correctly on inspection.

Whatever caused the original timeout wasn't reproducible against the current `2.0.0` tree. Leave
this closed; reopen if it resurfaces (e.g. only under CI's slower/cold environment).

### B3. No provenance on the published SDK packages — needs manual action on npmjs.com

Every publish logged `Skipped OIDC: ERR_PNPM_AUTH_TOKEN_EXCHANGE (404)`, so
`@fate-app/mod-types@2.0.0`, `@fate-app/mod-build@2.0.0` and `create-fate-mod@1.2.0` are all
published **unsigned**, and `NPM_TOKEN` is still a long-lived all-packages write token in repo
secrets.

npm's Trusted Publisher config has no API — it's a web-UI-only setting, and deleting the repo
secret is irreversible-ish (breaks the fallback path) — so this can't be done by an agent. Still
outstanding; do this by hand:

1. On npmjs.com, for each of `@fate-app/mod-types`, `@fate-app/mod-build`, `create-fate-mod` →
   Settings → Trusted Publisher → GitHub Actions → repo `Stanislavsonder/fate`, workflow
   `publish-sdk.yml`, environment none.
2. Cut a trivial release (or re-run `publish-sdk.yml`) and confirm the log no longer shows
   `Skipped OIDC`.
3. Only then delete the `NPM_TOKEN` secret from the repo.

### B4. ~~`publish.yml` silently skips mods (registry repo)~~ — fixed

Fixed and pushed directly to `main` on `Stanislavsonder/fate-mods` at `e38aceb` (per-action
approval given for this one). The detect step now emits every changed `mods/<id>/` folder
(newline-delimited `mod-dirs` output, plus a `mod-dirs-csv` for the commit message) instead of
`head -n1`, and the install/build/publish steps loop over all of them instead of assuming one.

Checked `validate-pr.yml` too: it's **not** the same bug — `scripts/ci/validate.ts` explicitly
rejects a PR touching more than one mod folder (`modIds.size > 1` → error) unless a maintainer
applies the `multi-mod` label. One residual gap: when that label *is* applied, `validate.ts:87`
(`const modId = [...modIds][0]`) still only builds/lints/smoke-loads the first of the mods —
milder than publish.yml's silent single-mod skip since a human deliberately opted in, but worth a
follow-up if multi-mod PRs become common. Left as-is for now; not pushed.

---

## C. Minor

### C1. `sonder@dice-d6`'s CHANGELOG has no `1.1.0` entry

It published before the entry could be added. Adding one now is not free: any further push
touching `mods/sonder@dice-d6/` re-triggers publish, which hits `publish.ts`'s immutability guard
(`refusing to overwrite`) and **fails CI red**. It would have to ride along with a bump to
`1.1.1`. `sonder@example`'s changelog is current.

Decision: skip for now — cosmetic gap, not worth publishing a new live version for no functional
change.

### C2. ~~Local working copy is CRLF, index is LF~~ — not reproducing

`core.autocrlf` is unset in this worktree and `git add --renormalize .` found nothing to
renormalize. Whatever worktree the original diagnosis ran against isn't this one; nothing to fix
here now.

### C3. ~~Branch cleanup~~ — done

Deleted `merge/1.5.0-into-2.0.0` on origin (no local copy existed).

### C4. `2.0.0` has no CI signal

`tests.yml` only triggers on `main` (`on: push: branches: [main]`), so nothing ran for the
`2.0.0` push. The branch's only verification is local. It gets properly exercised when 2.0.0
eventually opens a PR against `main`.

---

## D. Deliberately left alone

Not oversights — each was a judgment call to preserve an accurate record. Revisit only if you
want a cosmetic clean sweep.

| What | Why |
| --- | --- |
| `planning/modules-2-0/**` — ~25 `fate-core-mods` mentions | Completed-phase archive, including real PR links (`.../fate-core-mods/pull/3`) that still resolve via GitHub's redirect. Rewriting them would falsify the record. |
| `planning/modules-2-0/phase-5-other-improvements.md:19` — `@fate-core` | Incident log of a real 403 caused by a token scoped to `@fate-core`. True as written. |
| `mods/sonder@example/CHANGELOG.md` — "migrated from the `fate-core` repo" | Changelogs are immutable records; the repo *was* called that at the time. |

`FATE: Core` no longer appears anywhere in either repo. The only remaining `fate-core` strings are
the three above plus this document.
