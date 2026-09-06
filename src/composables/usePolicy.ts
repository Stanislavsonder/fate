import { computed, ref } from 'vue'

export const DATE_KEY = 'privacyPolicyAcceptanceDate'
export const VERSION_KEY = 'privacyPolicyVersionDate'

export const ACTUAL_POLICY_VERSION_DATE = '2026-09-07'

const privacyPolicyDate = ref<string | null>(localStorage.getItem(DATE_KEY))
const privacyPolicyVersion = ref<string | null>(localStorage.getItem(VERSION_KEY))

export default function usePolicy() {
	const isPolicyAccepted = computed<boolean>(() => {
		return !!privacyPolicyDate.value
	})

	const isPolicyOutdated = computed<boolean>(() => {
		return !!privacyPolicyDate.value && privacyPolicyVersion.value !== ACTUAL_POLICY_VERSION_DATE
	})

	function acceptPolicy() {
		privacyPolicyDate.value = new Date().toISOString()
		localStorage.setItem(DATE_KEY, privacyPolicyDate.value)

		privacyPolicyVersion.value = ACTUAL_POLICY_VERSION_DATE
		localStorage.setItem(VERSION_KEY, privacyPolicyVersion.value)
	}

	return {
		privacyPolicyDate,
		isPolicyAccepted,
		isPolicyOutdated,
		acceptPolicy
	}
}
