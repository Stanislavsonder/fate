import i18n from '@/i18n'
import { toastController } from '@ionic/vue'

const { t } = i18n.global

type ToastColor = 'success' | 'danger' | 'warning' | 'primary' | 'secondary' | 'tertiary'

interface ToastItem {
	message: string
	color: ToastColor
	duration: number
}

const MAX_QUEUE_LENGTH = 3

const toastQueue: ToastItem[] = []
let currentToast: ToastItem | null = null
let isProcessingQueue = false

function isSameToast(a: ToastItem, b: Pick<ToastItem, 'message' | 'color'>): boolean {
	return a.message === b.message && a.color === b.color
}

async function processToastQueue(): Promise<void> {
	if (isProcessingQueue || toastQueue.length === 0) {
		return
	}

	isProcessingQueue = true
	const item = toastQueue.shift()!
	currentToast = item

	try {
		const toast = await toastController.create({
			message: item.message,
			duration: item.duration,
			color: item.color,
			position: 'top'
		})

		await toast.present()

		setTimeout(() => {
			currentToast = null
			isProcessingQueue = false
			processToastQueue()
		}, item.duration + 100)
	} catch (error) {
		console.error('[Toast]', error)
		currentToast = null
		isProcessingQueue = false
		processToastQueue()
	}
}

export async function showToast(message: string, color: ToastColor = 'primary', duration = 2000): Promise<void> {
	const item = { message, color, duration }

	if (currentToast && isSameToast(currentToast, item)) {
		return
	}

	if (toastQueue.some(queued => isSameToast(queued, item))) {
		return
	}

	if (toastQueue.length >= MAX_QUEUE_LENGTH) {
		return
	}

	toastQueue.push(item)
	processToastQueue()
}

export async function showSuccessToast(messageKey: string, options: Record<string, unknown> = {}): Promise<void> {
	await showToast(t(messageKey, options), 'success')
}

export async function showErrorToast(messageKey: string, options: Record<string, unknown> = {}): Promise<void> {
	await showToast(t(messageKey, options), 'danger')
}

export async function showWarningToast(messageKey: string, options: Record<string, unknown> = {}): Promise<void> {
	await showToast(t(messageKey, options), 'warning')
}

export async function showInfoToast(messageKey: string, options: Record<string, unknown> = {}): Promise<void> {
	await showToast(t(messageKey, options), 'primary')
}
