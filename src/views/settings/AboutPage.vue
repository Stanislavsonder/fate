<script setup lang="ts">
import { IonPage, IonItem, IonNote, IonLabel, IonIcon, IonList, IonContent, IonHeader, IonToolbar, IonBackButton, IonButtons, IonTitle } from '@ionic/vue'
import { version, author } from '@/../package.json'
import { openOutline } from 'ionicons/icons'
import { isIos } from '@/utils/helpers/platform'
import { ROUTES } from '@/router'

const ABOUT_APP = {
	version,
	author: author.name,
	github: {
		title: 'GitHub',
		url: 'https://github.com/Stanislavsonder/fate'
	},
	license: {
		title: 'MIT License',
		url: 'https://opensource.org/license/mit'
	},
	privacyPolicy: {
		url: ROUTES.SETTINGS_PRIVACY_POLICY
	},
	legal: {
		url: ROUTES.SETTINGS_LEGAL
	},
	evilHat: {
		title: 'Evil Hat Productions',
		url: 'https://evilhat.com/product/fate-core-system/'
	}
}
</script>

<template>
	<ion-page>
		<ion-header>
			<ion-toolbar>
				<ion-buttons slot="start">
					<ion-back-button
						:default-href="ROUTES.SETTINGS"
						:text="isIos ? $t('common.actions.back') : undefined"
					/>
				</ion-buttons>
				<ion-title class="px-4">
					{{ $t('settings.about-app.title') }}
				</ion-title>
			</ion-toolbar>
		</ion-header>
		<ion-content>
			<ion-list :inset="true">
				<ion-item :detail="false">
					<ion-label>{{ $t('settings.about-app.version') }}</ion-label>
					<ion-note
						slot="end"
						class="text-sm self-center"
						>{{ ABOUT_APP.version }}</ion-note
					>
				</ion-item>
				<ion-item>
					<ion-label>{{ $t('settings.about-app.author') }}</ion-label>
					<ion-note
						slot="end"
						class="text-sm self-center"
					>
						{{ ABOUT_APP.author }}
					</ion-note>
				</ion-item>
				<ion-item
					:router-link="ABOUT_APP.privacyPolicy.url"
					detail
				>
					<ion-label>{{ $t('settings.about-app.privacy-policy.title') }}</ion-label>
				</ion-item>
				<ion-item
					:router-link="ABOUT_APP.legal.url"
					detail
				>
					<ion-label>{{ $t('settings.about-app.legal.title') }}</ion-label>
				</ion-item>
				<ion-item
					:href="ABOUT_APP.github.url"
					:detail="false"
				>
					<ion-label>{{ $t('settings.about-app.source-code') }}</ion-label>
					<ion-note
						slot="end"
						class="text-sm self-center flex gap-1 items-center"
					>
						{{ ABOUT_APP.github.title }}
						<ion-icon
							class="text-lg"
							:icon="openOutline"
						/>
					</ion-note>
				</ion-item>
				<ion-item
					:href="ABOUT_APP.license.url"
					:detail="false"
				>
					<ion-label>{{ $t('settings.about-app.license') }}</ion-label>
					<ion-note
						slot="end"
						class="text-sm self-center flex gap-1 items-center"
					>
						{{ ABOUT_APP.license.title }}
						<ion-icon
							class="text-lg"
							:icon="openOutline"
						/>
					</ion-note>
				</ion-item>

				<ion-item
					:href="ABOUT_APP.evilHat.url"
					:detail="false"
				>
					<ion-label>{{ $t('settings.about-app.original-author') }}</ion-label>
					<ion-note
						slot="end"
						class="text-sm self-center flex gap-1 items-center"
					>
						{{ ABOUT_APP.evilHat.title }}
						<ion-icon
							class="text-lg"
							:icon="openOutline"
						/>
					</ion-note>
				</ion-item>
			</ion-list>
		</ion-content>
	</ion-page>
</template>
