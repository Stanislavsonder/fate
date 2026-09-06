<script setup lang="ts">
import { useRouter } from 'vue-router'
import usePolicy from '@/composables/usePolicy'
import { nextTick, ref, watch } from 'vue'
import {
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonItem,
	IonLabel,
	IonPage,
	IonTitle,
	IonToolbar,
	IonPopover
} from '@ionic/vue'
import { useI18n } from 'vue-i18n'
import MarkdownIt from 'markdown-it'
import { ROUTES } from '@/router'
import { informationCircle, language } from 'ionicons/icons'
import LanguageList from '@/components/LanguageList/LanguageList.vue'
import useFileHandler from '@/composables/useFileHandler'

const NOTICE_ANCHOR = 'data-privacy-policy-notice-anchor'

const { acceptPolicy, isPolicyOutdated } = usePolicy()
const router = useRouter()
const { locale } = useI18n()
const { processPendingFile } = useFileHandler()

const content = ref('')
const contentEl = ref<HTMLElement | null>(null)
const noticeTarget = ref<Element | null>(null)

watch(locale, loadPrivacyPolicy, { immediate: true })

function injectNoticeAnchor(html: string): string {
	const doc = new DOMParser().parseFromString(`<div id="md-root">${html}</div>`, 'text/html')
	const root = doc.getElementById('md-root')
	if (!root) return html

	const dateParagraph = root.querySelector(':scope > h1 + p')
	if (!dateParagraph) return html

	const anchor = doc.createElement('div')
	anchor.setAttribute(NOTICE_ANCHOR, '')
	dateParagraph.after(anchor)
	return root.innerHTML
}

async function loadPrivacyPolicy() {
	const mdParser = new MarkdownIt()
	const raw = await import(`../../privacy-policy/languages/${locale.value}.md?raw`)
	let html = mdParser.render(raw.default)
	if (isPolicyOutdated.value) {
		html = injectNoticeAnchor(html)
	}
	content.value = html
	await nextTick()
	noticeTarget.value = contentEl.value?.querySelector(`[${NOTICE_ANCHOR}]`) ?? null
}

function goToCharacterPage() {
	router.push(ROUTES.CHARACTER_SHEET)
}

async function acceptPolicyHandler() {
	acceptPolicy()
	const handled = await processPendingFile()
	if (!handled) {
		goToCharacterPage()
	}
}
</script>

<template>
	<ion-page>
		<ion-header v-if="content">
			<ion-toolbar>
				<ion-title class="px-4">
					{{ $t('settings.about-app.privacy-policy.title') }}
				</ion-title>
				<ion-buttons slot="end">
					<ion-button
						id="language-change-policy-trigger"
						data-testid="language-change-policy-trigger"
					>
						<ion-icon
							slot="icon-only"
							:icon="language"
						/>
					</ion-button>
					<ion-popover
						data-testid="language-change-policy-popover"
						trigger="language-change-policy-trigger"
						dismiss-on-select
					>
						<ion-content>
							<LanguageList />
						</ion-content>
					</ion-popover>
				</ion-buttons>
			</ion-toolbar>
		</ion-header>
		<ion-content
			v-if="content"
			class="[--padding-bottom:var(--ion-safe-area-bottom,0px)]"
		>
			<!-- eslint-disable vue/no-v-html -->
			<div
				ref="contentEl"
				data-testid="privacy-policy-content"
				class="markdown"
				v-html="content"
			/>
			<!-- eslint-enable vue/no-v-html -->
			<Teleport
				v-if="isPolicyOutdated && noticeTarget"
				:to="noticeTarget"
			>
				<ion-item
					data-testid="privacy-policy-updated-notice"
					color="primary"
					lines="none"
					class="my-3"
					role="status"
				>
					<ion-icon
						:icon="informationCircle"
						slot="start"
					/>
					<ion-label class="ion-text-wrap">
						{{ $t('settings.about-app.privacy-policy.updated') }}
					</ion-label>
				</ion-item>
			</Teleport>
			<ion-button
				expand="block"
				class="m-4 mb-8"
				data-testid="accept-policy-button"
				@click="acceptPolicyHandler"
			>
				{{ $t('settings.about-app.privacy-policy.accept-policy') }}
			</ion-button>
		</ion-content>
	</ion-page>
</template>
