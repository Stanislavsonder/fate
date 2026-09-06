# Phase 1 — Release workflow + GitHub Release

> **Status: done (2026-08-25).** Dry-run green (web + signed Android + signed iOS). Live tag + GitHub Release + `CHANGELOG.md` confirmed on `main` with the Phase 2 Release.

Outcome of this phase alone: pressing **Actions → Release → Run workflow** produces a git tag `vX.Y.Z` and a GitHub Release containing the signed `.apk`, `.aab`, `.ipa`, a zipped web build, and an auto-generated changelog. Store uploads and Pages come in Phases 2–4 as additional jobs on the same workflow.

## Current state (2026-08-25)

Shipped on branch `1.4.0`:

| Piece | Location |
|---|---|
| Release-notes script | `scripts/release-notes/index.ts`, `pnpm release-notes` |
| CI Capacitor sync | `pnpm build:android:ci` / `pnpm build:ios:ci` |
| Workflow | `.github/workflows/release.yml` |
| Temp output | `release-artifacts/` (gitignored) |

**Dry-run** (`workflow_dispatch` on `1.4.0`, `dry_run: true`):

- `prepare`, `build-web`, `build-android` — green on first run (signed `.apk` + `.aab`).
- `build-ios` — first export failed: `Cloud signing permission error` / `No signing certificate "iOS Distribution" found`. Cause: App Store Connect API key was **App Manager**. Cloud-managed Distribution signing on CI requires **Admin**. After rotating `ASC_KEY_ID` + `ASC_PRIVATE_KEY` to a new Admin team key, export succeeded.
- `github-release` — green; skipped tag/release/changelog (expected for dry-run).
- No `v1.4.0` tag or GitHub Release was created.

**Not done yet (needs merge to `main`):**

- Live run (`dry_run: false` on `main`) — tag `v1.4.0`, GitHub Release with 4 assets, `CHANGELOG.md` commit.
- Re-run of the same version must fail the tag-exists check.
- Manual install check of the signed `.apk` from the dry-run artifacts.

### Gotchas found while testing

1. **`workflow_dispatch` is invisible until the file exists on `main`.** GitHub only lists/triggers a workflow if it is on the default branch. `gh workflow run release.yml --ref 1.4.0` 404s until `release.yml` is merged (or copied) onto `main`. After that, **Release** appears in the Actions sidebar and `--ref 1.4.0` works. Historical workflows (e.g. "Publish mod SDK packages") can still show in the sidebar from old runs even if the YAML is gone from `main`.
2. **ASC API key must be Admin**, not App Manager. App Manager can talk to the ASC API (Phase 0 verification) but cannot use cloud-managed Apple Distribution certs during `xcodebuild -exportArchive`. Key roles cannot be changed — generate a new Team key and update `ASC_KEY_ID` / `ASC_PRIVATE_KEY` (`ASC_ISSUER_ID` stays).
3. **Node 20 action runtime deprecation.** `actions/checkout@v4`, `setup-node@v4`, `upload-artifact@v4` warn and are forced onto Node 24. Workflows now use Node 24 majors: `checkout@v7`, `setup-node@v7`, `upload-artifact@v7`, `download-artifact@v7`, `setup-java@v6`, `cache@v6`, `android-actions/setup-android@v4`, `softprops/action-gh-release@v3`.
4. **Prod audit (CI `pnpm audit --prod --audit-level=high`):** nested `nanoid@3.3.16` / `postcss@8.5.22` via Ionic. Forced in `pnpm-workspace.yaml` (`overrides`) to `nanoid@3.3.18` and `postcss@8.5.23`. pnpm 11 ignores `package.json#pnpm.overrides`.

### Behaviour vs original spec

- Live release still requires `github.ref == refs/heads/main`. **`dry_run: true` is allowed on any branch** so builds can be proven on `1.4.0` before merge.
- `github-release` commits `CHANGELOG.md` first, then creates the tag on that commit (`target_commitish`).
- Artifact names (for Phases 2–4): `dist`, `web-zip`, `android-bundle`, `android-apk`, `ios-ipa`, `release-notes`.
- iOS auth key is written as `$RUNNER_TEMP/AuthKey_${ASC_KEY_ID}.p8` with `chmod 600`; archive passes `DEVELOPMENT_TEAM=M9KUDJFFFS` and `CODE_SIGN_STYLE=Automatic`.

## 1.1 Release-notes script — `scripts/release-notes/index.ts`

Follow the existing scripts pattern (`node --experimental-transform-types`, like `scripts/version-bump/index.ts`). Implemented by parsing `git log` directly (did not wire `conventional-changelog-atom`):

- Find the last `v*` tag (`git describe --tags --abbrev=0 --match 'v*'`); if none, take full history. Current baseline tag: `v1.3.2`.
- `git log <lastTag>..HEAD --pretty=%s` → group by conventional-commit type: **Features** (`feat`), **Fixes** (`fix`), **Other** (`perf`, `refactor`; drop `chore`, `build`, `ci`, `test`, `docs` noise).
- Outputs (written to a `release-artifacts/` temp dir, git-ignored):
  1. `RELEASE_NOTES.md` — markdown body for the GitHub Release; also prepended to `CHANGELOG.md` under a `## X.Y.Z (YYYY-MM-DD)` heading (file created if missing). A copy of `CHANGELOG.md` is included in the `release-notes` artifact for the live commit step.
  2. `whatsnew/whatsnew-en-US` — plain text, **≤500 chars** (Play hard limit), bullet-style summary derived from the same data. Also reused as the App Store "What's New" text in Phase 4.

Package.json script: `"release-notes": "node --experimental-transform-types ./scripts/release-notes/index.ts"`.

## 1.2 CI-friendly build scripts

`build:android`/`build:ios` end with interactive `cap open`. Non-interactive variants:

```json
"build:android:ci": "pnpm build && npx cap sync android",
"build:ios:ci": "pnpm build && npx cap sync ios"
```

## 1.3 `.github/workflows/release.yml`

```yaml
name: Release
on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Build everything but skip GitHub Release, store uploads, and Pages deploy'
        type: boolean
        default: false
concurrency:
  group: release
  cancel-in-progress: false
```

Guards:

- Live release (tag + GitHub Release + CHANGELOG push): `github.ref == 'refs/heads/main'` and `dry_run == false`.
- Any other branch with `dry_run` off fails immediately in `prepare`.
- `dry_run: true` is allowed on any branch.

### Job: `prepare` (ubuntu-latest)

1. Checkout with `fetch-depth: 0` and `fetch-tags: true` (needed for tags/changelog).
2. Read `version` from `package.json` → job output `version`.
3. **Sanity checks** (fail fast with clear messages):
   - tag `v${version}` does not already exist;
   - `versionName` in `android/app/build.gradle` == version;
   - `MARKETING_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` == version
   (i.e. `pnpm version-bump` was run on the release branch).
4. Run `pnpm release-notes`; upload `release-artifacts/` as the `release-notes` artifact.

### Job: `build-web` (ubuntu-latest, needs: prepare)

- pnpm setup (same steps as `tests.yml`: `npm i -g pnpm`, `actions/setup-node` with `node-version-file: package.json`, `pnpm install`).
- `pnpm build` → `dist/`.
- Upload `dist` artifact (consumed by Pages deploy in Phase 2) + `fate-core-web-v${version}.zip` (`web-zip`).

### Job: `build-android` (ubuntu-latest, needs: prepare)

- Temurin JDK 21 (AGP 8.11 / Gradle 8.13) + `android-actions/setup-android` with platform 36.
- `pnpm build:android:ci`.
- Decode keystore: `printf '%s' "$ANDROID_KEYSTORE_BASE64" | tr -d '\n' | base64 -d > $RUNNER_TEMP/upload.keystore`; export `ANDROID_KEYSTORE_PATH` + the three password/alias env vars from secrets (consumed by the Phase 0 signing config).
- `cd android && ./gradlew bundleRelease assembleRelease`.
- Rename + upload: `fate-core-v${version}.aab` as `android-bundle`, `.apk` as `android-apk`.

### Job: `build-ios` (macos-26, needs: prepare)

- `pnpm build:ios:ci`, then `pod install` in `ios/App` (Pods are gitignored).
- Write `ASC_PRIVATE_KEY` to `$RUNNER_TEMP/AuthKey_${ASC_KEY_ID}.p8` (`chmod 600`).
- Archive + export with `-allowProvisioningUpdates`, ASC API key, `DEVELOPMENT_TEAM=M9KUDJFFFS`, using `ios/App/ExportOptions.plist`.
- Upload `fate-core-v${version}.ipa` as `ios-ipa`.

### Job: `github-release` (ubuntu-latest, needs: [build-web, build-android, build-ios])

- Download all artifacts (always; dry-run still lists them).
- If not `dry_run` and on `main` (`contents: write`):
  - Commit `CHANGELOG.md` first (`chore: changelog for v${version}`) with `github-actions[bot]`.
  - `softprops/action-gh-release@v3`: `tag_name: v${version}` on that commit, body from `RELEASE_NOTES.md`, files: apk, aab, ipa, web zip.
- If `dry_run`: skip tag/release/push; artifacts stay on the workflow run.

## 1.4 Acceptance test

- [x] Dry-run on `1.4.0`: all three platform builds green; no tag created.
- [x] iOS cloud signing works with an **Admin** ASC API key (App Manager is not enough).
- [ ] Merge `1.4.0` → `main` so **Release** is registered on the default branch (required for the Actions UI / `gh workflow run`).
- [ ] Live run on `main` (`dry_run: false`): release `v1.4.0` exists with 4 assets; `CHANGELOG.md` committed; notes match commits since `v1.3.2`.
- [ ] Signed `.apk` from the run installs on a device.
- [ ] Re-running live with the same version fails the tag-exists check.
