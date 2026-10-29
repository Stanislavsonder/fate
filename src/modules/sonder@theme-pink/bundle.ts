import { defineFateMod } from '@fate-app/mod-types'

// Theme mods are app-level (registered by src/composables/useSkins.ts, never
// installed on a character), so the character-lifecycle hooks are unused
// no-ops — kept only because FateModuleManifest currently requires them.
export default defineFateMod({
	onInstall() {},
	onUninstall() {},
	onReconfigure() {},
	theme: {
		css: `
:root {
	--ion-color-primary: #e91e63;
	--ion-color-primary-rgb: 233, 30, 99;
	--ion-color-primary-contrast: #ffffff;
	--ion-color-primary-contrast-rgb: 255, 255, 255;
	--ion-color-primary-shade: #cd1a57;
	--ion-color-primary-tint: #eb3573;
}

:root.ion-palette-dark {
	--ion-color-primary: #f06292;
	--ion-color-primary-rgb: 240, 98, 146;
	--ion-color-primary-contrast: #000000;
	--ion-color-primary-contrast-rgb: 0, 0, 0;
	--ion-color-primary-shade: #d45681;
	--ion-color-primary-tint: #f2729d;
}
`
	}
})
