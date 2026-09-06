# create-fate-mod

Scaffolder for [Assistant for Fate](https://github.com/Stanislavsonder/fate) mod
projects.

```
pnpm create fate-mod
```

Prompts for a mod id, display name, author info, and capabilities
(`sheetComponents`/`dice`/`theme`/`translations`), then generates a ready-to-
build project using `@fate-core/mod-build`'s Vite preset — `npm install &&
npm run dev` gets you live-reloading in the app's Developer Mode.

See [`docs/MOD_API.md`](https://github.com/Stanislavsonder/fate/blob/main/docs/MOD_API.md)
for the full authoring contract, and
[`fate-core-mods`](https://github.com/Stanislavsonder/fate-core-mods)'s
`SUBMITTING.md` for how to publish what you build.
