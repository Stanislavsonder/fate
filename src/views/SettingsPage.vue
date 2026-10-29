<script setup lang="ts">
import { IonIcon, IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel } from '@ionic/vue'
import { informationCircle, language, moon, codeSlashOutline, extensionPuzzleOutline } from 'ionicons/icons'
import { ROUTES } from '@/router'

const SETTINGS = [
	{
		title: 'settings.theme.title',
		icon: moon,
		route: ROUTES.SETTINGS_THEME
	},
	{
		title: 'settings.language',
		icon: language,
		route: ROUTES.SETTINGS_LANGUAGE
	},
	{
		title: 'settings.mods.title',
		icon: extensionPuzzleOutline,
		route: ROUTES.SETTINGS_MODS
	},
	{
		title: 'settings.developer.title',
		icon: codeSlashOutline,
		route: ROUTES.SETTINGS_DEVELOPER
	},
	{
		title: 'settings.about-app.title',
		icon: informationCircle,
		route: ROUTES.SETTINGS_ABOUT
	}
]
</script>

<template>
	<ion-page>
		<ion-header>
			<ion-toolbar>
				<ion-title>{{ $t('tabs.settings.title') }}</ion-title>
			</ion-toolbar>
		</ion-header>
		<ion-content :fullscreen="true">
			<ion-header collapse="condense">
				<ion-toolbar>
					<ion-title size="large">{{ $t('tabs.settings.title') }}</ion-title>
				</ion-toolbar>
			</ion-header>
			<ion-list inset>
				<ion-item
					v-for="page in SETTINGS"
					:key="page.route"
					:router-link="page.route"
					:button="true"
					detail
				>
					<ion-icon
						slot="start"
						:icon="page.icon"
						aria-hidden="true"
						class="mr-2"
					/>
					<ion-label>
						{{ $t(page.title) }}
					</ion-label>
				</ion-item>
			</ion-list>
		</ion-content>
	</ion-page>
</template>
