import { createServer as createHttpServer, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, watch as watchFs } from 'node:fs'
import { join, extname } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

export interface DevServerOptions {
	/** The mod project root (where manifest.json / translations/ / vite.config.ts live). */
	root: string
	/** Where the watched build writes bundle.mjs — defaults to <root>/dist. */
	distDir?: string
	port?: number
}

export interface DevServerHandle {
	close(): Promise<void>
}

const MIME: Record<string, string> = {
	'.json': 'application/json',
	'.mjs': 'text/javascript',
	'.js': 'text/javascript'
}

/**
 * The author-side half of Developer Mode live reload (see src/mods/devMode.ts
 * for the app-side client). Spawns `vite build --watch` as a child process —
 * deliberately NOT Vite's programmatic build() API: at the time this was
 * written (Vite 8 / rolldown-vite), build({ watch: {} }) produced a
 * corrupted/incomplete build (dropped modules, SFC parse errors) that the
 * plain CLI command does not, in this exact project. Spawning the CLI
 * reuses the code path that's actually proven to work, and decouples "run
 * the watched build" from "serve files + notify" — a plain fs.watch on the
 * output directory drives the SSE `/events` endpoint the app subscribes to.
 */
export async function startDevServer(options: DevServerOptions): Promise<DevServerHandle> {
	const { root } = options
	const port = options.port ?? 5199
	const distDir = options.distDir ?? join(root, 'dist')

	const clients = new Set<ServerResponse>()
	function notifyRebuild(): void {
		for (const res of clients) {
			res.write('data: rebuild\n\n')
		}
	}

	// Windows needs shell:true to run npx (a .cmd file) at all; combining shell:true
	// with an argv array triggers Node's DEP0190 warning (args aren't escaped for
	// the shell), so pass one fixed, non-interpolated command string instead —
	// nothing here is ever built from user input.
	const child: ChildProcess = spawn('npx vite build --watch', {
		cwd: root,
		stdio: 'inherit',
		shell: true
	})

	// Watches `root` (not distDir directly) because distDir may not exist yet at
	// startup (e.g. right after `rm -rf dist`) — fs.watch on a not-yet-existing
	// path never fires for anything created later, silently going dead for the
	// whole session. `root` always exists; filter to changes under dist/.
	// Debounced: a rebuild touches multiple files in dist/ in quick succession.
	let debounceTimer: ReturnType<typeof setTimeout> | undefined
	const fsWatcher = watchFs(root, { recursive: true }, (_event, filename) => {
		if (!filename || !filename.split(/[\\/]/).includes('dist')) {
			return
		}
		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(notifyRebuild, 150)
	})

	const server = createHttpServer(async (req, res) => {
		res.setHeader('Access-Control-Allow-Origin', '*')

		const url = new URL(req.url ?? '/', `http://localhost:${port}`)

		if (url.pathname === '/events') {
			res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
			res.write('\n')
			clients.add(res)
			req.on('close', () => clients.delete(res))
			return
		}

		let pathname: string
		try {
			pathname = decodeURIComponent(url.pathname)
		} catch {
			res.writeHead(400)
			res.end('Bad request')
			return
		}

		let filePath: string | null = null
		if (pathname === '/bundle.mjs') {
			const bundlePath = join(distDir, 'bundle.mjs')
			filePath = existsSync(bundlePath) ? bundlePath : null
		} else if (pathname === '/manifest.json') {
			filePath = join(root, 'manifest.json')
		} else if (/^\/translations\/[a-z]{2}(?:-[A-Z]{2})?\.json$/.test(pathname)) {
			filePath = join(root, pathname.slice(1))
		}

		if (!filePath) {
			res.writeHead(404)
			res.end('Not found')
			return
		}

		try {
			const stats = await stat(filePath)
			if (!stats.isFile()) {
				throw new Error('not a file')
			}
			const contents = await readFile(filePath)
			res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
			res.end(contents)
		} catch {
			res.writeHead(404)
			res.end('Not found')
		}
	})

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, resolve)
	})
	console.log(`[mod-build dev] serving ${root} at http://localhost:${port} (SSE: /events)`)

	return {
		async close() {
			for (const res of clients) {
				res.end()
			}
			clients.clear()
			fsWatcher?.close()
			child.kill()
			await new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve())))
		}
	}
}
