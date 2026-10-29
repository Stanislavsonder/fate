<script setup lang="ts">
import { IonBackButton, IonButtons, IonContent, IonHeader, IonItem, IonPage, IonTitle, IonToolbar, IonIcon, IonRadio, IonLabel, IonList } from '@ionic/vue'
import { colorPaletteOutline } from 'ionicons/icons'
import useTheme, { THEMES } from '@/composables/useTheme'
import useSkins from '@/composables/useSkins'
import { isIos } from '@/utils/helpers/platform'
import { ROUTES } from '@/router'

const { theme, setTheme } = useTheme()
const { skinId, skins, setSkin } = useSkins()
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
				<ion-title class="px-4">{{ $t('settings.theme.title') }}</ion-title>
			</ion-toolbar>
		</ion-header>
		<ion-content>
			<ion-list :inset="true">
				<ion-item
					v-for="themeOption in THEMES"
					:key="themeOption.name"
					button
					:detail="false"
					@click="setTheme(themeOption.name)"
				>
					<ion-radio
						slot="start"
						:checked="themeOption.name === theme"
						class="pointer-events-none"
					/>
					<ion-icon
						slot="start"
						:icon="themeOption.icon"
					/>
					<ion-label>{{ $t(`settings.theme.${themeOption.name}`) }}</ion-label>
				</ion-item>
			</ion-list>

			<ion-list
				v-if="skins.length"
				:inset="true"
			>
				<ion-item
					button
					:detail="false"
					@click="setSkin(null)"
				>
					<ion-radio
						slot="start"
						:checked="skinId === null"
						class="pointer-events-none"
					/>
					<ion-icon
						slot="start"
						:icon="colorPaletteOutline"
					/>
					<ion-label>{{ $t('settings.theme.defaultSkin') }}</ion-label>
				</ion-item>
				<ion-item
					v-for="skin in skins"
					:key="skin.id"
					button
					:detail="false"
					@click="setSkin(skin.id)"
				>
					<ion-radio
						slot="start"
						:checked="skinId === skin.id"
						class="pointer-events-none"
					/>
					<ion-icon
						slot="start"
						:icon="colorPaletteOutline"
					/>
					<ion-label>{{ $t(skin.name) }}</ion-label>
				</ion-item>
			</ion-list>
		</ion-content>
	</ion-page>
</template>

<style>
/* This is added to prevent the flashing that happens when toggling between palettes */
ion-item {
	--transition: none;
}
</style>
