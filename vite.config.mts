/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
	plugins: [
		vue(),
		tailwindcss(),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: false,
			manifest: false,
			workbox: {
				cleanupOutdatedCaches: true,
				skipWaiting: true,
				clientsClaim: true,
				globPatterns: [],
				runtimeCaching: [
					{
						urlPattern: ({ request }) => request.mode === 'navigate',
						handler: 'NetworkFirst',
						options: {
							cacheName: 'pages',
							networkTimeoutSeconds: 3,
							expiration: {
								maxEntries: 20,
								maxAgeSeconds: 7 * 24 * 60 * 60
							}
						}
					},
					{
						urlPattern: /\.(?:js|css)$/i,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'assets',
							networkTimeoutSeconds: 3,
							expiration: {
								maxEntries: 60,
								maxAgeSeconds: 7 * 24 * 60 * 60
							}
						}
					},
					{
						urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico|webp|woff|woff2)$/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'images',
							expiration: {
								maxEntries: 60,
								maxAgeSeconds: 30 * 24 * 60 * 60
							}
						}
					},
					{
						// Defensive, not currently load-bearing: no other runtimeCaching
						// rule matches registry.json/mod artifacts today, so the SW
						// wouldn't cache them anyway. This exists so a future catch-all
						// runtimeCaching rule can't silently reintroduce a stale-cached
						// registry.json defeating registryClient.ts's own blocklist checks
						// — see planning/modules-2-0/phase-3-registry-store.md, Decision 6.
						urlPattern: /^https:\/\/stanislavsonder\.github\.io\/fate-core-mods\//,
						handler: 'NetworkOnly'
					}
				]
			},
			devOptions: {
				enabled: false
			}
		})
	],
	resolve: {
		tsconfigPaths: true
	}
})
