# Phase 5 — Optional improvements

None of these block the core pipeline; pick them up when they start to itch.

## Rollout safety

- **Play staged rollout:** `status: inProgress` + `userFraction: 0.2` in the `play-upload` job, plus a tiny manual `workflow_dispatch` "promote" workflow that bumps the fraction / completes the rollout via the same action.
- **App Store phased release:** set `phasedRelease` on the appStoreVersion via the ASC API in `submit-appstore.ts` (7-day gradual rollout, can be paused from ASC).
- **Post-deploy smoke check:** after `deploy-pages`, curl `https://fate.stanislavsonder.com` and fail the workflow if it doesn't return 200 + expected `<title>`.

## Release ergonomics

- **Release-PR automation** (release-please style): a workflow that, on demand, creates the version branch, runs `pnpm version-bump:<level>`, generates the changelog preview into the PR body, and opens the PR — turning step 1–2 of the flow into one click too.
- **Localized store notes:** the app ships many locales; extend `scripts/release-notes` to emit `whatsnew-<locale>` files (even if just duplicating English at first) and localized `whatsNew` in the ASC script.
- **Store metadata/screenshots automation:** if descriptions/screenshots start changing per release, revisit fastlane `deliver`/`supply` just for metadata — that's the point where it pays for its Ruby overhead.
- **Notifications:** a final `if: always()` job posting release success/failure (e.g. Telegram/Discord webhook) so you don't watch the Actions tab.

## CI speed & hygiene

- **Caching:** pnpm store (`actions/setup-node` cache), Gradle (`gradle/actions/setup-gradle`), CocoaPods (`ios/App/Pods` keyed on `Podfile.lock`). The iOS job benefits most — macOS runners are the slowest.
- **Wire the empty `.husky/pre-push` hook** to `pnpm test:unit` (pre-commit already runs vitest; pre-push is currently a no-op).
- **Dependabot/Renovate for actions:** pin marketplace actions by SHA and let a bot bump them — `upload-google-play` and `apple-actions` track breaking store-API changes.
- **Stale artifact cleanup:** delete the leftover `android/app/release/app-release.apk` (old v1.2.4 build, git-ignored) to avoid ever confusing it with pipeline output.
