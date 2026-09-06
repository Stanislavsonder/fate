# Phase 0 — Prerequisites (one-time setup)

> **Status: ✅ COMPLETE (2026-07-25).** All 8 secrets set; Play + ASC access verified with live API calls; DNS + Pages configured; signing config wired and checked via `signingReport`. Remaining informational item only: confirm Play App Signing status (Play Console → Setup → App signing).

Everything here is done once, mostly by hand (keys, consoles, DNS). Nothing in later phases works without it. Small code changes in this phase: Android signing config, `.gitignore` fix, `ExportOptions.plist`, `Info.plist` compliance key.

## 0.1 Android upload keystore + signing config

Currently `android/app/build.gradle` has **no `signingConfigs` block** — release builds from Gradle are unsigned (past releases were presumably signed manually via Android Studio).

1. **Keystore: already exists** — `E:\Git\fate\fate-ionic\fate_core.jks` (PKCS12, single entry, alias **`fate-core`**, created 2024-12-23). No new key needed. It lives outside the repo — good. Back it up somewhere durable (password manager + offline copy); losing it means losing upload rights unless Play App Signing key reset is used.

2. **Play App Signing:** the app is already published, so check Play Console → *Setup → App signing*. If Play App Signing is enabled (default for years now), `fate_core.jks` is only the **upload key** — Google re-signs with the app signing key. If the release key was generated locally and never enrolled, enroll in Play App Signing so the key can be reset if ever lost.

3. **Add a release signing config** to `android/app/build.gradle` that reads from environment variables so local builds without them still work (falls back to unsigned/debug):

   ```groovy
   signingConfigs {
       release {
           if (System.getenv('ANDROID_KEYSTORE_PATH')) {
               storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
               storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
               keyAlias System.getenv('ANDROID_KEY_ALIAS')
               keyPassword System.getenv('ANDROID_KEY_PASSWORD')
           }
       }
   }
   buildTypes {
       release {
           if (System.getenv('ANDROID_KEYSTORE_PATH')) {
               signingConfig signingConfigs.release
           }
           // existing minifyEnabled / proguard lines stay as-is
       }
   }
   ```

4. **Hygiene:** in `android/.gitignore` the `*.jks` / `*.keystore` lines are **commented out** — uncomment them so a keystore can never be committed by accident. Never put the keystore in the repo; CI receives it base64-encoded via the `ANDROID_KEYSTORE_BASE64` secret.

5. Set secrets:

   | Secret | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes('E:\Git\fate\fate-ionic\fate_core.jks')) \| Set-Clipboard` |
   | `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
   | `ANDROID_KEY_ALIAS` | `fate-core` |
   | `ANDROID_KEY_PASSWORD` | The key password (for PKCS12 keystores this is usually identical to the keystore password) |

   Sanity check the passwords locally first: `keytool -list -keystore E:\Git\fate\fate-ionic\fate_core.jks -storepass <password>` should list the `fate-core` entry without the integrity warning. (`keytool` ships with Android Studio: `C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe`.)

## 0.2 Google Play API access (service account)

1. In **Google Cloud Console**: create/select a project → enable **Google Play Android Developer API** → create a **service account** (e.g. `github-release@…`) → create a **JSON key**.
2. In **Play Console** → *Users and permissions* → invite the service account email → grant at minimum **"Release to production, exclude devices, and use Play App Signing"** (+ *View app information*) for the Assistant for Fate app.
3. Paste the entire JSON file into the `PLAY_SERVICE_ACCOUNT_JSON` secret.

Notes:
- The API can only publish apps that already have at least one release created manually — true for this app.
- Permission propagation can take up to ~24h after inviting the service account.

## 0.3 App Store Connect API key + iOS signing

1. **API key:** App Store Connect → *Users and Access → Integrations → App Store Connect API* → generate a **Team key** with **Admin** role (App Manager can call the ASC API but **cannot** use cloud-managed Apple Distribution certificates during `xcodebuild -exportArchive` — confirmed 2026-08-25). Download the `.p8` **immediately** (single download). Set secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` (the full `.p8` file text). Key roles cannot be changed; rotate by creating a new key.
2. **Signing in CI — cloud-managed signing (primary plan):** the project uses automatic signing (team `M9KUDJFFFS`). Xcode can manage certificates/profiles headlessly on CI:

   ```bash
   xcodebuild ... -allowProvisioningUpdates \
     -authenticationKeyPath $RUNNER_TEMP/AuthKey.p8 \
     -authenticationKeyID $ASC_KEY_ID \
     -authenticationKeyIssuerID $ASC_ISSUER_ID
   ```

   This creates/uses a **cloud-managed Apple Distribution certificate** — no `.p12` juggling. First run may create the cert; verify it appears under *Certificates* in the developer portal.
3. **Fallback (if cloud signing misbehaves):** export an Apple Distribution certificate as `.p12` + an App Store provisioning profile, store base64 in secrets, and install them in CI with `apple-actions/import-codesign-certs`. Document only if needed.
4. **Create `ios/App/ExportOptions.plist`** (used by `xcodebuild -exportArchive` in Phase 1):

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>method</key><string>app-store-connect</string>
       <key>teamID</key><string>M9KUDJFFFS</string>
       <key>signingStyle</key><string>automatic</string>
       <key>uploadSymbols</key><true/>
   </dict>
   </plist>
   ```

5. **Export compliance:** add to `ios/App/App/Info.plist` so every build isn't stuck on the encryption question in App Store Connect:

   ```xml
   <key>ITSAppUsesNonExemptEncryption</key><false/>
   ```

## 0.4 DNS + GitHub Pages

1. At the registrar for `stanislavsonder.com`, add a **CNAME record**: host `fate` → `stanislavsonder.github.io`.
2. Repo *Settings → Pages*: Source = **GitHub Actions**; Custom domain = `fate.stanislavsonder.com`; enable **Enforce HTTPS** (available after the cert is issued, ~minutes to an hour after DNS propagates).

## 0.5 Store registrations — CONFIRMED

Both store registrations are verified; no audit needed:

- **Play (published):** https://play.google.com/store/apps/details?id=com.sonder.fate_core — package `com.sonder.fate_core` confirmed, and the "already has a manual release" requirement for API publishing is satisfied.
- **App Store Connect (first version currently in review):** app ID **6782209520** — https://appstoreconnect.apple.com/apps/6782209520/distribution/ios/version/inflight — bundle ID `com.sonder.fatecore`.

The bundle-ID mismatch between platforms is fine and permanent — just make sure the pipeline configs use the right one per store (Phase 3 uses `com.sonder.fate_core`; Phase 4 targets ASC app `6782209520`).

Note: while the first iOS version is in review, Phase 4's auto-submit cannot run (ASC allows only one version in review at a time) — see the Phase 4 gotchas. Everything else, including uploading builds, works regardless.

## Checklist

- [x] Existing keystore `E:\Git\fate\fate-ionic\fate_core.jks` (alias `fate-core`) backed up — Play App Signing status still to confirm
- [x] `signingConfigs.release` added to `android/app/build.gradle`; `.gitignore` keystore lines uncommented — wiring verified via `signingReport` (store + alias resolve; only real passwords pending)
- [x] 4 Android secrets set
- [x] Play service account created + invited + `PLAY_SERVICE_ACCOUNT_JSON` set — **verified via API**: draft edit created + deleted on `com.sonder.fate_core`
- [x] ASC API key created; 3 `ASC_*` secrets set — originally App Manager (key `J3QR99S23Z`, ASC API query OK); **rotated to Admin 2026-08-25** so CI cloud signing works. Resolves app `6782209520` / `com.sonder.fatecore`
- [x] `ios/App/ExportOptions.plist` created; `ITSAppUsesNonExemptEncryption` added to Info.plist
- [x] DNS CNAME `fate` → `stanislavsonder.github.io` (propagation confirmed); Pages source = GitHub Actions, custom domain `fate.stanislavsonder.com` set, DNS check passed
- [x] Store registrations confirmed: Play `com.sonder.fate_core` (published), ASC app `6782209520` / `com.sonder.fatecore` (first version in review)
