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

### A1. 29 of 30 privacy policies do not disclose the mod network calls

**Only `en.md` has section 5's network disclosure.** The other 29 still carry the pre-2.0.0 text
stating the app *"does not integrate third-party services and does not use external APIs"* — which
becomes false the moment the Mod Store ships, since the app fetches the registry on boot.

This is the one genuine compliance gap left. It is not merge fallout: `2.0.0` only ever updated
`en.md` (`git diff <merge-base> 2.0.0 -- privacy-policy/` touches exactly one file), and the merge
preserved each side faithfully.

`pnpm translate` **cannot** fix this — the localizer (`scripts/localizer/index.ts`) only walks
JSON i18n files under `src/i18n/translations` and `src/modules/*/translations`. The policies are
hand-maintained Markdown. They need translating by whatever route produced the other 29.

Reference text: `privacy-policy/languages/en.md` §5, which also names the
`stanislavsonder.github.io/fate-mods` host.

### A2. The Release workflow is failing on `main`

Last run (2026-09-05, id `33988450202`) failed in `appstore-upload`:

```
Failed to update encryption compliance for build. (409)
ENTITY_ERROR.ATTRIBUTE.INVALID — "You cannot update when the value is already set."
source: /data/attributes/usesNonExemptEncryption
```

Cause is a conflict, not a credential problem: `ios/App/App/Info.plist:50` already declares
`ITSAppUsesNonExemptEncryption = false`, so builds reach App Store Connect with compliance
already set — and then `apple-actions/upload-testflight-build@v4` tries to PATCH the same
attribute and ASC rejects the redundant write.

Likely fixes, in preference order (needs confirming against the action's inputs — I did not
verify which it supports):

1. Leave `Info.plist` as the single source of truth and stop the action from setting compliance.
2. Drop the `Info.plist` key and let the action own it.

Worth checking whether the **upload itself succeeded** and only the compliance step failed — if
so the build may already be in TestFlight and this is a false alarm on an otherwise-good release.

This predates all the merge work.

---

## B. Should fix before 2.0.0 ships

### B1. The mod and developer UI is English-only

All 29 non-English locales are missing the keys 2.0.0 added (`modules.external`,
`settings.developer.*`, `settings.mods.*` …). `en.json` has 210 keys; every other locale is
missing 64, except `pt.json` which is missing 80.

Pre-existing on `2.0.0` — the merged parity matches `2.0.0` exactly, so the merge introduced
nothing. Unlike A1, this **is** fixable with `pnpm translate`, since these are JSON i18n files.

### B2. `modStore/blocklist.cy.ts` fails

The final assertion — that un-blocklisting clears the "flagged as unsafe" explanation — times
out; the row still contains the text after the registry serves `registry.v4-unblocked.json`.

Confirmed pre-existing: it fails identically on a pristine `2.0.0` worktree with its own
`pnpm install`. Everything else passes (33/34 e2e, 197/197 unit).

Either `applyBlocklist` genuinely does not clear the explanation on unblock, or the spec races
the tab-remount refetch it documents in its own comment. The comment at
`src/tests/e2e/specs/modStore/blocklist.cy.ts:22-33` is the place to start.

### B3. No provenance on the published SDK packages

Every publish logged `Skipped OIDC: ERR_PNPM_AUTH_TOKEN_EXCHANGE (404)`, so
`@fate-app/mod-types@2.0.0`, `@fate-app/mod-build@2.0.0` and `create-fate-mod@1.2.0` are all
published **unsigned**, and `NPM_TOKEN` is still a long-lived all-packages write token in repo
secrets.

The packages now exist, which resolves the chicken-and-egg that blocked this earlier. Per
`planning/modules-2-0/phase-5-other-improvements.md:90`: for each of the three packages →
Settings → Trusted Publisher → GitHub Actions → repo `Stanislavsonder/fate`, workflow
`publish-sdk.yml`, environment none. Then delete the `NPM_TOKEN` secret.

### B4. `publish.yml` silently skips mods (registry repo)

`.github/workflows/publish.yml:42` in `Stanislavsonder/fate-mods`:

```bash
MOD_DIR=$(echo "$CHANGED" | grep -oE '^mods/[^/]+/' | sed 's:/$::' | head -n1 || true)
```

`head -n1` means **one mod per push**. This already bit us: the combined migration commit
(`809f046`) touched both mods, published `sonder@dice-d6@1.1.0`, and silently skipped
`sonder@example` — with a green checkmark. It needed a second push to recover.

Fix by looping over every changed mod folder instead of taking the first. Until then, never put
two mods in one push. `validate-pr.yml` has the same `head -n1` shape and likely the same flaw.

---

## C. Minor

### C1. `sonder@dice-d6`'s CHANGELOG has no `1.1.0` entry

It published before the entry could be added. Adding one now is not free: any further push
touching `mods/sonder@dice-d6/` re-triggers publish, which hits `publish.ts`'s immutability guard
(`refusing to overwrite`) and **fails CI red**. It would have to ride along with a bump to
`1.1.1`. `sonder@example`'s changelog is current.

### C2. Local working copy is CRLF, index is LF

368 files are `i/lf w/crlf` — the worktree predates `.gitattributes`' `* text=auto eol=lf`, and
`core.autocrlf=true`. Consequence: `pnpm exec prettier --check .` fails locally on ~197 files
that are perfectly fine in git, and stale stat entries can block a `git checkout` with a phantom
"modified" file whose index and worktree hashes are identical. CI checks out fresh and is
unaffected.

Fix when convenient: re-normalize the worktree (`git add --renormalize .`, or delete and
re-checkout the tree). Purely local; nothing to commit.

### C3. Branch cleanup

`merge/1.5.0-into-2.0.0` is merged into `2.0.0` (fast-forward) and can be deleted locally and on
origin.

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
