import { readonly, ref } from 'vue'

const reloadRequired = ref(false)

export function markModReloadRequired(): void {
	reloadRequired.value = true
}

export function useModReloadRequired() {
	return readonly(reloadRequired)
}
