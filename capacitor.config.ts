import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
	appId: 'com.sonder.fate_core',
	appName: 'Fate Assistant',
	webDir: 'dist',
	plugins: {
		StatusBar: {
			overlaysWebView: false
		},
		Keyboard: {
			resizeOnFullScreen: false
		}
	}
}

export default config
