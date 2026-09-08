/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Deliberately not mod containment. The loader imports every external mod from
 * a blob: URL, so script-src must allow blob: — which is the same primitive a
 * mod would use to run code it generated itself. The only directive that could
 * actually contain a mod is connect-src, and closing it would take
 * install-from-URL, the registry-base override and dev-server hot reload with
 * it, since all three fetch arbitrary hosts by design. See M5 in
 * planning/mods-2-0-audit/README.md.
 *
 * What this does buy: no remote or inline <script>, no eval, no plugins, no
 * <base> rewriting, no form posts — the injection surface around imported
 * character files and mod-supplied markup. frame-ancestors and report-to are
 * omitted on purpose: browsers ignore both in a <meta> policy.
 */
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"script-src 'self' blob:",
	// Ionic, Vue SFCs and mod themes all inject <style> at runtime.
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https:",
	"font-src 'self' data:",
	"media-src 'self' data: blob:",
	// Open by design (see above). ws:/wss: are left out only because nothing
	// uses them yet — add them the day something does.
	"connect-src 'self' http: https: data: blob:",
	"worker-src 'self' blob:",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'none'"
].join('; ')

/**
 * Build-only: the dev server needs its own HMR websocket, and Cypress drives
 * the app through that same dev server while injecting scripts of its own.
 * `pnpm preview` serves the built output, so that's where to smoke-test it.
 */
function contentSecurityPolicy(): Plugin {
	return {
		name: 'fate-content-security-policy',
		apply: 'build',
		transformIndexHtml: () => [
			{
				tag: 'meta',
				attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
				injectTo: 'head-prepend'
			}
		]
	}
}

export default defineConfig({
	plugins: [
		vue(),
		tailwindcss(),
		contentSecurityPolicy(),
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
						urlPattern: /^https:\/\/stanislavsonder\.github\.io\/fate-mods\//,
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
