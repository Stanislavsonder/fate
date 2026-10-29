/**
 * Imports JS source text as an ESM module via a blob URL (decision D1 in
 * README.md — confirmed working on web, iOS, and Android by the Phase 0
 * spike). Isolated in its own module so the loader's ABI/hash/shape gates can
 * be unit tested without needing a real dynamic import of a blob: URL, and so
 * devMode.ts's hot-reimport loop can call the exact same primitive.
 */
export async function importBlobModule(code: string): Promise<unknown> {
	const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
	try {
		const module = (await import(/* @vite-ignore */ url)) as { default: unknown }
		return module.default
	} finally {
		URL.revokeObjectURL(url)
	}
}
