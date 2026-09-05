# Phase 4 — App Store upload + auto-submit

> **Status: implemented (2026-08-25).** 4a (IPA upload) and 4b (auto-submit script) are in `.github/workflows/release.yml`. The first iOS version of app `6782209520` is still in review, so 4b **skips with a clear message (exit 0)** until that version is approved. Next live Release exercises upload; a later Release after approval exercises submit.

Outcome: the release workflow uploads the `.ipa` to App Store Connect, waits for processing, creates the App Store version for `X.Y.Z`, attaches the build with release notes, and **submits it for review** — zero visits to appstoreconnect.apple.com on a normal release. Apple's review itself remains asynchronous (usually 1–2 days); the pipeline ends at "Waiting for Review".

## 4a — Upload — `appstore-upload`

Shipped in `.github/workflows/release.yml`. Deltas vs the original snippet: `download-artifact@v7`; `apple-actions/upload-testflight-build@v4` (not v3) so the default `appstore-api` backend runs on **ubuntu-latest**; live-only `if` also requires `main`; `wait-for-processing: true`. Export compliance comes from `ITSAppUsesNonExemptEncryption` in Info.plist.

```yaml
appstore-upload:
  needs: [prepare, build-ios]
  if: ${{ !inputs.dry_run && github.ref == 'refs/heads/main' }}
  runs-on: ubuntu-latest
  timeout-minutes: 75
  steps:
    - uses: actions/download-artifact@v7
      with: { name: ios-ipa }
    - uses: apple-actions/upload-testflight-build@v4
      with:
        app-path: fate-core-v${{ needs.prepare.outputs.version }}.ipa
        issuer-id: ${{ secrets.ASC_ISSUER_ID }}
        api-key-id: ${{ secrets.ASC_KEY_ID }}
        api-private-key: ${{ secrets.ASC_PRIVATE_KEY }}
        wait-for-processing: 'true'
```

(Despite the name, this is the standard "upload build to App Store Connect" path — the same build is then usable for TestFlight *and* App Store release.)

`prepare` also exports `buildNumber` (`CURRENT_PROJECT_VERSION`) and fails if it does not match Android `versionCode`.

## 4b — Auto-submit script — `scripts/release/submit-appstore.ts`

No marketplace action covers "create version + attach build + submit for review", so this is a small script against the **App Store Connect REST API** (same `node --experimental-transform-types` pattern as other repo scripts). Auth: JWT (ES256) signed with `node:crypto` (`dsaEncoding: 'ieee-p1363'`) using `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`. No extra npm dependency.

Package.json script: `"submit-appstore"`. The workflow job does not need `pnpm install` (stdlib only).

Flow (all against `https://api.appstoreconnect.apple.com/v1`):

1. **App id:** constant **`6782209520`** — asserted via `GET /apps?filter[bundleId]=com.sonder.fatecore`.
2. **In-review guard:** if another iOS version is `WAITING_FOR_REVIEW` / `IN_REVIEW` / similar, or any inflight version blocks creating a new one, **exit 0** with a skip message. If *this* version is already in review, treat as idempotent success.
3. **Poll for the processed build:** `GET /builds?filter[app]=…&filter[version]=<CURRENT_PROJECT_VERSION>` until `processingState == 'VALID'`. Upload already waits; this is a short confirmation with a 60 min fallback. `INVALID` / `FAILED_PROCESSING` are fatal.
4. **Ensure the App Store version:** `GET /apps/{id}/appStoreVersions?filter[versionString]=X.Y.Z`; if absent, `POST /appStoreVersions` (`platform: IOS`, `versionString: X.Y.Z`). Reuse an existing `PREPARE_FOR_SUBMISSION` version.
5. **Attach the build:** `PATCH /appStoreVersions/{id}/relationships/build`.
6. **Set "What's New":** `GET .../appStoreVersionLocalizations` → `PATCH` `whatsNew` for `en-US` using the Phase 1 `whatsnew-en-US` text.
7. **Submit for review:** `POST /reviewSubmissions` (`platform: IOS`) + `POST /reviewSubmissionItems` linking the appStoreVersion, then `PATCH` the submission with `submitted: true`. A 409 (open submission) fails with a clear message.

```yaml
appstore-submit:
  needs: [prepare, appstore-upload]
  if: ${{ !inputs.dry_run && github.ref == 'refs/heads/main' }}
  runs-on: ubuntu-latest
  timeout-minutes: 70
  steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-node@v7
      with: { node-version-file: 'package.json' }
    - uses: actions/download-artifact@v7
      with: { name: release-notes, path: notes }
    - run: node --experimental-transform-types ./scripts/release/submit-appstore.ts
      env:
        ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
        ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
        ASC_PRIVATE_KEY: ${{ secrets.ASC_PRIVATE_KEY }}
        VERSION: ${{ needs.prepare.outputs.version }}
        BUILD_NUMBER: ${{ needs.prepare.outputs.buildNumber }}
        WHATSNEW_PATH: notes/whatsnew/whatsnew-en-US
```

## Gotchas

- **Current state (2026-08-25): the app's FIRST version is still in review** (app `6782209520`). ASC allows only **one version in review at a time**, so auto-submit cannot complete until that version is approved and released. Build **uploads** (4a) work regardless. The script detects an existing in-review / inflight version and skips (exit 0) rather than failing the Release.
- The **first fully-automated submit should be watched**: version state must be "Prepared for Submission" before submit; leftover half-created versions in ASC from past manual releases can conflict (script handles "version already exists" by reusing it).
- `ITSAppUsesNonExemptEncryption` in Info.plist (Phase 0.3) is required — otherwise the build sits in "Missing Compliance" and step 3 never yields a submittable build. Do not also pass `uses-non-exempt-encryption` to the upload action: Apple already applies the plist value, and a second PATCH returns 409 ("You cannot update when the value is already set").
- Phased release, screenshots/description updates are out of scope here (Phase 5); the script only ships a new build + what's-new.
- If Apple **rejects** the review, resolution is manual in ASC (respond/fix, then re-run the release with a bumped version).

## Acceptance test

- [ ] Next live Release on `main` → `appstore-upload` green; the `.ipa` appears in App Store Connect / TestFlight. `appstore-submit` skips with the in-review message (workflow still green).
- [ ] After the first iOS version is approved: a later Release → ASC shows the new version "Waiting for Review" with correct build number and what's-new text, with no manual console interaction.
- [ ] Kill-switch check: re-running `appstore-submit` when a submission is already in review skips / succeeds with a clear message (idempotency guard in the script).
