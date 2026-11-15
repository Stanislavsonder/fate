# Changelog

## 2.0.1 (2026-11-15)

### Fixes

- Inventory: opening the "add item" form no longer crashes the app
- Inventory: the item color picker shows its colors again, and item quantity is limited again
- Updating the app no longer shows an empty green notification; it says which version the character was updated from and to
- Importing a character exported from 1.x no longer shows a raw `character.import.warning.version` message
- A character that uses a mod you don't have shows one "not installed" notice instead of an extra "Module not found" error
- The notice shown when a mod update can't be applied to a character now has proper text in every language
- Aspect validation messages now talk about aspects instead of stunts
- A character that fails to load no longer shows the previously opened character's sections, and its half-applied changes are no longer saved
- Mods that leave out the optional install, uninstall or reconfigure hooks no longer break the characters that use them

## 2.0.0 (2026-10-29)

### Features

- Mods: install community mods from the in-app Mod Store (Settings → Mods), backed by the public [`fate-mods`](https://github.com/Stanislavsonder/fate-mods) registry. Every file is checked against the registry's published SHA-256 before it is installed, and again when it loads
- Mods: browse, install a specific version, update, downgrade, enable/disable and remove mods; see which mods are installed and which have updates
- Mods: a remote blocklist (plus a list compiled into the app) disables mod versions flagged as unsafe
- Mods: characters that use a mod you do not have offer to install it from the Mod Store
- Mods: the app asks to restart after a mod change, so the change applies fully
- Mods: install, update and remove buttons show a spinner and status text while the action runs
- Developer Mode: install a mod from a URL (behind a typed confirmation) and live-reload a mod from a local dev server
- Mod SDK 3.0 for authors: `@fate-app/mod-types`, `@fate-app/mod-build` and `create-fate-mod` on npm; mods can add character-sheet sections, dice and app themes
- The D20 die is now a mod in the Mod Store (`sonder@dice-d20`); the Fudge die stays built in
- The character avatar and name are now part of the app itself instead of the identity module
- Privacy policy updated in every language to describe the Mod Store's network requests

### Fixes

- A module whose update is incompatible no longer stays on the sheet after being dropped from the character
- Removing a mod no longer fails halfway when the mod's cleanup throws, and no longer alters other mods' data
- Removing a mod also removes the data it stored on your characters, even if the mod is disabled or failing to load
- Release builds ship a Content-Security-Policy

## 1.4.5 (2026-09-05)

No user-facing changes.

## 1.4.4 (2026-08-28)

### Other

- Renamed to Assistant for Fate and updated the legal notices to comply with Evil Hat's requirements, covering Fate Condensed and Fate Accelerated

## 1.4.3 (2026-08-25)

### Fixes

- update PWA settings to remove cache issue
- update PWA settings to remove cache issue
- deprecation warning removed
- improve haptic feedback handling by checking support status
## 1.4.2 (2026-08-25)

No user-facing changes.
## 1.4.1 (2026-08-25)

### Fixes

- version-bump indent
- infinite errors fix
## 1.4.0 (2026-08-25)

### Fixes

- isolate iOS status bar handling from Android changes
- restore status bar background coloring
- sync system bar colors with in-app theme on Android 15+
- incomatable patch install issue
- removing module on update removed
- improve types
- correct syntax in vite.config.mts
- add mts to write
- pipeline translation compilation added
- remove index.ts message from the complie script
- prettier run
- update ignore files to remove some
- incomatable modules cannot be installed together
- build
- lint run and add to the pipeline
- cover modules by more unit tests and fix the issues
- context override issue
- optional chainig issue for tokens module
- some npm packages updated
- add error boundary
- error handeling improved for character creation process
- install modules race for version update
- change clone to safe clone to prevent maps from removing
- uninstall modules reverts the logic. tests added
