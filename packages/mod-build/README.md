# @fate-app/mod-build

Vite build preset + dev-mode server for authoring [Assistant for Fate](https://github.com/Stanislavsonder/fate)
mods — externalizes host-shared libraries (`vue`, `vue-i18n`, `@ionic/vue`,
`ionicons`) against `window.FateSDK` instead of bundling them, inlines CSS,
and enforces bundle size limits.

```ts
// vite.config.ts
import { defineModConfig } from '@fate-app/mod-build'

export default defineModConfig()
```

`./testing` exposes `stubFateSDK()`/`smokeLoad()` for headlessly verifying a
built bundle's shape outside a real app (used by the registry's CI).

Full author-facing documentation lives in the app repo's
[`docs/MOD_API.md`](https://github.com/Stanislavsonder/fate/blob/main/docs/MOD_API.md).
Scaffold a new mod project with `pnpm create fate-mod` rather than hand-rolling
this config.

## Version discipline

This package's version tracks `SDK_VERSION` (the `FateSDK` ABI, defined in
the app's `src/mods/sdk.ts`) — same major.minor, patch is free. Don't pin a
version here that doesn't correspond to a real `SDK_VERSION` the app has
shipped.
