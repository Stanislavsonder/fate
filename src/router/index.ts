import { createRouter, createWebHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'
import AppTabs from '../views/AppTabs.vue'
import { ACTUAL_POLICY_VERSION_DATE, DATE_KEY, VERSION_KEY } from '@/composables/usePolicy'

export const ROUTES = {
	START_SCREEN: '/',
	TABS: '/tabs',
	CHARACTER_SHEET: '/tabs/character',
	CHARACTER_CREATE: '/tabs/character/create',
	CHARACTER_CONFIGURE: '/tabs/character/configure/:id',
	CHARACTER_LIST: '/tabs/character/list',
	ROLL_DICE: '/tabs/roll-dice',
	SETTINGS: '/tabs/settings',
	SETTINGS_ABOUT: '/tabs/settings/about',
	SETTINGS_PRIVACY_POLICY: '/tabs/settings/about/privacy-policy',
	SETTINGS_LEGAL: '/tabs/settings/about/legal',
	SETTINGS_LANGUAGE: '/tabs/settings/language',
	SETTINGS_THEME: '/tabs/settings/theme',
	SETTINGS_DEVELOPER: '/tabs/settings/developer',
	SETTINGS_MODS: '/tabs/settings/mods'
}

function tabRoute(path: string) {
	return path.replace('/tabs/', '')
}

const routes: Array<RouteRecordRaw> = [
	{
		path: ROUTES.START_SCREEN,
		component: () => import('@/views/StartScreen.vue')
	},
	{
		path: ROUTES.TABS,
		component: AppTabs,
		children: [
			{
				path: '',
				redirect: ROUTES.CHARACTER_SHEET
			},
			{
				path: tabRoute(ROUTES.CHARACTER_SHEET),
				component: () => import('@/views/character/CharacterSheetPage.vue')
			},
			{
				path: tabRoute(ROUTES.CHARACTER_CREATE),
				component: () => import('@/views/character/CharacterCreatePage.vue')
			},
			{
				path: tabRoute(ROUTES.CHARACTER_CONFIGURE),
				component: () => import('@/views/character/CharacterConfigurePage.vue')
			},
			{
				path: tabRoute(ROUTES.CHARACTER_LIST),
				component: () => import('@/views/character/CharacterListPage.vue')
			},
			{
				path: tabRoute(ROUTES.ROLL_DICE),
				component: () => import('@/views/RollDicePage.vue')
			},
			{
				path: tabRoute(ROUTES.SETTINGS),
				component: () => import('@/views/SettingsPage.vue')
			},
			{
				path: tabRoute(ROUTES.SETTINGS_ABOUT),
				component: () => import('@/views/settings/AboutPage.vue')
			},
			{
				path: tabRoute(ROUTES.SETTINGS_PRIVACY_POLICY),
				component: () => import('@/views/settings/about/PrivacyPolicyPage.vue')
			},
			{
				path: tabRoute(ROUTES.SETTINGS_LEGAL),
				component: () => import('@/views/settings/about/LegalPage.vue')
			},
			{
				path: tabRoute(ROUTES.SETTINGS_LANGUAGE),
				component: () => import('@/views/settings/LanguagePage.vue')
			},
			{
				path: tabRoute(ROUTES.SETTINGS_THEME),
				component: () => import('@/views/settings/ThemePage.vue')
			},
			{
				path: tabRoute(ROUTES.SETTINGS_DEVELOPER),
				component: () => import('@/views/settings/DeveloperModePage.vue')
			},
			{
				// Always reachable — installed mods are app-wide state, not gated
				// behind Developer Mode (that gate is only for installing NEW code
				// from a URL); the registry ("trusted path") browse/install flow
				// is ungated for the same reason. See useDeveloperMode.ts /
				// DeveloperModePage.vue. ModStorePage.vue absorbed the old
				// install-list-only ModsManagePage.vue as its "Installed" tab.
				path: tabRoute(ROUTES.SETTINGS_MODS),
				component: () => import('@/views/mods/ModStorePage.vue')
			}
		]
	}
]

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes
})

function needsPolicyAcceptance(): boolean {
	return !localStorage.getItem(DATE_KEY) || localStorage.getItem(VERSION_KEY) !== ACTUAL_POLICY_VERSION_DATE
}

router.beforeEach((to, _from, next) => {
	if (to.path === ROUTES.START_SCREEN) {
		if (needsPolicyAcceptance()) {
			next()
		} else next(ROUTES.TABS)
	} else {
		if (needsPolicyAcceptance()) {
			next(ROUTES.START_SCREEN)
		} else next()
	}
})

export default router
