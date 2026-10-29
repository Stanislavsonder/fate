<script setup lang="ts">
import { isIos } from '@/utils/helpers/platform'
import MarkdownIt from 'markdown-it'
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ROUTES } from '@/router'
import useTheme from '@/composables/useTheme'
import { POWERED_BY_FATE_LOGO } from '@/utils/branding'
// Prose is localized under attribution/languages/. The mandatory CC-BY attribution and trademark
// notices must remain verbatim English in every locale file, as prescribed by Evil Hat.

const { locale } = useI18n()
const { isDarkMode } = useTheme()

const content = ref('')

watch(locale, loadAttribution, { immediate: true })

async function loadAttribution() {
	const mdParser = new MarkdownIt()
	const raw = await import(`../../../../attribution/languages/${locale.value}.md?raw`)
	content.value = mdParser.render(raw.default)
}

// The "Powered by Fate" logo is © Evil Hat Productions, LLC, used with permission and shown
// unaltered. The bundled file is the white, dark-background variant, so it is inverted to
// black on the light theme. If it ever goes missing the block hides itself rather than
// rendering a broken image.
const logoSrc = POWERED_BY_FATE_LOGO
const hasLogo = ref(true)
</script>

<template>
	<ion-page>
		<ion-header>
			<ion-toolbar>
				<ion-buttons slot="start">
					<ion-back-button
						:default-href="ROUTES.SETTINGS_ABOUT"
						:text="isIos ? $t('common.actions.back') : undefined"
					/>
				</ion-buttons>
				<ion-title class="px-4">{{ $t('settings.about-app.legal.title') }}</ion-title>
			</ion-toolbar>
		</ion-header>
		<ion-content>
			<div
				v-if="hasLogo"
				class="flex justify-center px-4 pt-6 pb-2"
			>
				<!-- artwork is white-on-transparent, so flip it for the light theme -->
				<img
					:src="logoSrc"
					:class="{ invert: !isDarkMode }"
					class="h-auto w-full max-w-70"
					alt="Powered by Fate"
					@error="hasLogo = false"
				/>
			</div>
			<!-- eslint-disable vue/no-v-html -->
			<div
				data-testid="legal-content"
				class="markdown"
				v-html="content"
			/>
			<!-- eslint-enable vue/no-v-html -->
		</ion-content>
	</ion-page>
</template>
