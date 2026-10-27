import { computed, ref, watch } from 'vue'
import { ModRegistry, type ModRecord } from '@/mods/modRegistry'

const STORAGE_KEY = 'skin'
const STYLE_ATTR = 'data-skin-id'

const skinId = ref<string | null>(getSavedSkinId())

function getSavedSkinId(): string | null {
	return localStorage.getItem(STORAGE_KEY)
}

function getSkinRecords(): ModRecord[] {
	// A skin disabled mid-session must stop applying at once, not at the restart.
	return ModRegistry.getAll().filter(record => record.status === 'loaded' && record.manifest.capabilities?.includes('theme') && record.manifest.theme)
}

function applySkin(id: string | null) {
	document.querySelectorAll(`style[${STYLE_ATTR}]`).forEach(el => el.remove())

	if (!id) {
		return
	}

	const record = getSkinRecords().find(r => r.manifest.id === id)
	if (!record?.manifest.theme) {
		return
	}

	const style = document.createElement('style')
	style.setAttribute(STYLE_ATTR, id)
	style.textContent = record.manifest.theme.css
	document.head.appendChild(style)
}

/** Injects the persisted skin's CSS, if any. Call once from main.ts before app.mount(). */
export function applyPersistedSkin(): void {
	applySkin(getSavedSkinId())
}

export default function useSkins() {
	const skins = computed(() => getSkinRecords().map(record => record.manifest))

	function setSkin(id: string | null) {
		skinId.value = id
	}

	watch(
		skinId,
		id => {
			if (id) {
				localStorage.setItem(STORAGE_KEY, id)
			} else {
				localStorage.removeItem(STORAGE_KEY)
			}
			applySkin(id)
		},
		{ immediate: false }
	)

	return { skinId, skins, setSkin }
}
