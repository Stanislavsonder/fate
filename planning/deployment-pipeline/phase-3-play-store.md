# Phase 3 — Google Play auto-publish

> **Status: production confirmed (2026-08-25).** Auth, signed `.aab` upload, what's-new, and full production rollout work. Default `play_track` is **production**.

Outcome: the release workflow uploads the signed `.aab` to Google Play and rolls it out on the **production** track with the auto-generated "what's new" text. Prerequisites: Phase 0.2 (service account + `PLAY_SERVICE_ACCOUNT_JSON`), Phase 1 (signed `.aab` artifact + `whatsnew/` from the notes script).

## 3.1 Workflow job (append to `release.yml`)

Shipped in `.github/workflows/release.yml`. Deltas vs the original snippet: `download-artifact@v7`; `tracks` instead of deprecated `track`; `releaseFiles` is the versioned `.aab` name; `if` also requires `main`; `play_track` workflow input (default **production** after internal was confirmed).

```yaml
play-upload:
  needs: [prepare, build-android]
  if: ${{ !inputs.dry_run && github.ref == 'refs/heads/main' }}
  runs-on: ubuntu-latest
  permissions:
    actions: read
    contents: read
  steps:
    - uses: actions/download-artifact@v7
      with:
        name: android-bundle
    - uses: actions/download-artifact@v7
      with:
        name: release-notes
        path: notes
    - uses: r0adkll/upload-google-play@v1
      with:
        serviceAccountJsonPlainText: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
        packageName: com.sonder.fate_core
        releaseFiles: fate-core-v${{ needs.prepare.outputs.version }}.aab
        releaseName: v${{ needs.prepare.outputs.version }}
        tracks: ${{ inputs.play_track }}
        status: completed
        whatsNewDirectory: notes/whatsnew
```

Parameter notes:

- `packageName` is the **Android** id `com.sonder.fate_core` (not the iOS one).
- `tracks` (not deprecated `track`): `production` by default via the `play_track` input (internal proven 2026-08-25). Choose `internal` if you only want testers.
- `status: completed` = full rollout immediately. Alternatives: `inProgress` + `userFraction: 0.2` for a 20% staged rollout (see Phase 5), or `draft` to only stage the release for a manual button press.
- `whatsNewDirectory` expects files named `whatsnew-<locale>` — Phase 1's script produces `whatsnew-en-US`. Text limit 500 chars per locale; more locales can be added later (the app already ships many i18n locales — candidates for Phase 5).
- `mappingFile` / `debugSymbols`: not applicable today (`minifyEnabled false`); add if minification or native symbols are ever enabled.

## 3.2 Constraints & gotchas

- **versionCode must strictly increase** vs everything previously uploaded on any track. `pnpm version-bump` increments it; the Phase 1 sanity check plus Play's own rejection cover mistakes. Internal has **1.4.1**; do not reuse that versionCode on a later run.
- **First automated run used `play_track: internal`** (confirmed 2026-08-25). Default is now `production`. Internal track releases are available to testers in minutes.
- Uploading to production still goes through **Google review** (typically hours, occasionally days, for an established app). "Managed publishing" in Play Console, if enabled, holds releases until manually confirmed — make sure it's off for full automation.
- The service account JSON grants release rights — treat the secret accordingly; rotate the key if it ever leaks.

## 3.3 Acceptance test

- [x] `play-upload` job on the Release workflow (`internal` default, `production` selectable).
- [x] Run release with `play_track: internal` → release appears in Play Console internal track with correct version name/code and what's-new text; installable via internal-testing link.
- [x] Switch to `production`, run next release → rollout reaches "Full rollout" state without any console interaction.
