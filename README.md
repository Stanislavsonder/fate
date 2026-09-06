# Assistant for Fate

A free, open-source digital character sheet, 3D dice roller and pluggable module system for the
[Fate](https://www.faterpg.com/) roleplaying game. Built with Vue, Ionic and Capacitor;
it runs as a website, a PWA, and a native app on Android (and iOS soon).

This is an independent project. It is not published, sponsored or endorsed by Evil Hat Productions, LLC.

- **Web / PWA:** https://fate.stanislavsonder.com
- **Google Play:** https://play.google.com/store/apps/details?id=com.sonder.fate_core

## Features

- Character sheets assembled from modules (aspects, skills, stunts, stress, consequences, Fate points, inventory, notebook, identity)
- 3D Fate dice with physics
- Import / export characters as `.fchar` files
- Community mods, installable from the in-app Mod Store
- Works offline; all character data stays on the device
- Light / dark theme and many UI languages

## Mods

The character sheet is fully modular. Built-in modules (aspects, skills, stress, dice, â¦) live in `src/modules/`, and the app also loads community-made mods at runtime:

- **Mod Store** â browse and install mods from the public registry, right in the app (Settings â Mods). The registry lives in its own repo: [fate-mods](https://github.com/Stanislavsonder/fate-mods).
- **Write your own** â scaffold a mod project with `create-fate-mod`, build it against the `@fate-app/mod-types` / `@fate-app/mod-build` SDK, and live-reload it in the app via Developer Mode. See [docs/MOD_API.md](./docs/MOD_API.md) for the full author guide.

## Install the app

### Web

Open [fate.stanislavsonder.com](https://fate.stanislavsonder.com) in a modern browser. The site is a PWA: on supported browsers you can install it to the home screen from the browserâs install / Add to Home Screen prompt.

### Android

Install from [Google Play](https://play.google.com/store/apps/details?id=com.sonder.fate_core).

### iOS

An App Store build is in review. Until it is live, use the web / PWA version on iPhone or iPad.

## Develop in this repository

### Prerequisites

- [Node.js](https://nodejs.org/) See version in `engines` in `package.json`
- [pnpm](https://pnpm.io/)
- For native builds: Android Studio (Android) and/or Xcode on macOS (iOS)

### Setup

```bash
git clone https://github.com/Stanislavsonder/fate.git
cd fate
pnpm install
pnpm dev
```

`pnpm dev` compiles translations and starts the Vite dev server (LAN-accessible).

### Common commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server + translation compile |
| `pnpm build` | Typecheck + production web build |
| `pnpm preview` | Serve the production build locally |
| `pnpm test:unit` | Vitest unit tests |
| `pnpm test:e2e` | Cypress e2e tests |
| `pnpm test` | Unit then e2e |
| `pnpm cypress:open` | Cypress interactive UI |
| `pnpm lint` | ESLint with auto-fix |
| `pnpm format` | Prettier |
| `pnpm translate` | Localization script |
| `pnpm module:generate` | Scaffold a new built-in module (`pnpm module:generate author@name`) |
| `pnpm check-registry-schema` | Check the vendored mod-registry schema for drift |
| `pnpm fixtures:mods` | Rebuild the committed e2e fixtures of the example mods |
| `pnpm build:android` | Web build, Capacitor sync, open Android Studio |
| `pnpm build:ios` | Web build, Capacitor sync, open Xcode |

Unit tests live in `src/tests/unit/**/*.test.ts`. E2E specs live in `src/tests/e2e/specs/**/*.cy.ts`.

```bash
pnpm vitest run src/tests/unit/path/to/file.test.ts
```

### Native apps

Android package id: `com.sonder.fate_core`. iOS bundle id: `com.sonder.fatecore`.

```bash
pnpm build:android   # needs Android Studio
pnpm build:ios       # needs Xcode on macOS
```

## Privacy

Character sheets and settings stay in local storage / IndexedDB on the device — they are never uploaded, and the app collects no personal data, has no analytics and no ads.

The app works offline. Its only network use is the optional mod system: it refreshes the public mod catalog on start and downloads mods you choose to install. Those requests carry no character data. See section 5 of the privacy policy for details.

Full policy (many languages): [privacy-policy/index.md](./privacy-policy/index.md). English: [privacy-policy/languages/en.md](./privacy-policy/languages/en.md).

Questions: [stanislavsonder@gmail.com](mailto:stanislavsonder@gmail.com).

## License and attribution

Two licenses apply. Keep them distinct.

**App source code** is [MIT](./LICENSE). That covers only the code in this repository.

**Fate rules text** (Fate Core System, Fate Accelerated Edition and Fate Condensed) is used under the
[Creative Commons Attribution 3.0 Unported license](https://creativecommons.org/licenses/by/3.0/)
and is *not* covered by the MIT License. The license requires:

> This work is based on Fate Core System and Fate Accelerated Edition (found at
> https://www.faterpg.com/), products of Evil Hat Productions, LLC, developed, authored, and
> edited by Leonard Balsera, Brian Engard, Jeremy Keller, Ryan Macklin, Mike Olson, Clark
> Valentine, Amanda Valentine, Fred Hicks, and Rob Donoghue, and licensed for our use under
> the Creative Commons Attribution 3.0 Unported license.

> This work is based on Fate Condensed (found at https://www.faterpg.com/), a product of Evil
> Hat Productions, LLC, developed, authored, and edited by PK Sullivan, Lara Turner, Fred
> Hicks, Richard Bellingham, Robert Hanz, and Sophie LagacÃ©, and licensed for our use under
> the Creative Commons Attribution 3.0 Unported license.

**Trademarks** belong to Evil Hat Productions, LLC and are not licensed under MIT or CC BY:

> Fateâ¢ is a trademark of Evil Hat Productions, LLC. The Powered by Fate logo is Â© Evil Hat
> Productions, LLC and is used with permission.

The Fate Core logo is a trademark of Evil Hat Productions, LLC and is not used in this project.

Full notice (many languages): [attribution/index.md](./attribution/index.md). English: [attribution/languages/en.md](./attribution/languages/en.md) (also what the in-app Legal page shows). Mandatory CC-BY and trademark notices remain in English in every locale.
