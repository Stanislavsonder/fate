<script setup lang="ts">
import { inject, type Ref, ref } from 'vue'
import { IonIcon, actionSheetController } from '@ionic/vue'
import { trash, image, close } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import type { FateContext } from '@/types'

const { t } = useI18n()

const context = inject<Ref<FateContext>>('context')!

const fileInput = ref<HTMLInputElement | null>(null)
const avatar = defineModel<string>({ required: true })

const ACCEPTED_FILE_TYPES = '.jpeg,.jpg,.gif,.webp,.png'

function uploadAvatar() {
	fileInput.value?.click()
}

async function openAvatarActions() {
	const actionSheet = await actionSheetController.create({
		header: t('character.sheet.avatar.actions'),
		buttons: [
			{
				text: t('common.actions.upload'),
				icon: image,
				cssClass: 'avatar-upload-option',
				handler: uploadAvatar
			},
			{
				text: t('common.actions.remove'),
				icon: trash,
				role: 'destructive',
				cssClass: 'avatar-remove-option',
				handler: removeAvatar
			},
			{
				text: t('common.actions.cancel'),
				icon: close,
				role: 'cancel'
			}
		]
	})

	await actionSheet.present()
}

function handleFileChange(event: Event) {
	const target = event.target as HTMLInputElement
	const file = target.files?.[0]
	if (file) {
		if (file.size > context.value.constants.MAX_AVATAR_FILE_SIZE!) {
			alert(
				t('character.sheet.avatar.errors.fileSize', {
					value: context.value.constants.MAX_AVATAR_FILE_SIZE! / 1024 / 1024
				})
			)
			return
		}

		const reader = new FileReader()
		reader.onload = () => {
			avatar.value = reader.result as string
		}
		reader.readAsDataURL(file)
	}
}

function removeAvatar() {
	avatar.value = ''
}
</script>

<template>
	<div :aria-label="$t('character.sheet.avatar.section')">
		<!--
			No avatar yet: the whole square is the upload target. Corner brackets mark its bounds so
			it reads as a control rather than an empty panel.
		-->
		<template v-if="!avatar">
			<button
				type="button"
				data-testid="character-image-placeholder"
				class="group text-primary bg-background-2 focus-visible:outline-accent relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl shadow-md transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2"
				@click="uploadAvatar"
			>
				<span
					aria-hidden="true"
					class="border-accent pointer-events-none absolute top-3 left-3 size-7 rounded-tl-lg border-t-3 border-l-3 opacity-60 transition-opacity group-hover:opacity-100"
				/>
				<span
					aria-hidden="true"
					class="border-accent pointer-events-none absolute top-3 right-3 size-7 rounded-tr-lg border-t-3 border-r-3 opacity-60 transition-opacity group-hover:opacity-100"
				/>
				<span
					aria-hidden="true"
					class="border-accent pointer-events-none absolute bottom-3 left-3 size-7 rounded-bl-lg border-b-3 border-l-3 opacity-60 transition-opacity group-hover:opacity-100"
				/>
				<span
					aria-hidden="true"
					class="border-accent pointer-events-none absolute right-3 bottom-3 size-7 rounded-br-lg border-r-3 border-b-3 opacity-60 transition-opacity group-hover:opacity-100"
				/>
				<ion-icon
					:icon="image"
					class="text-5xl opacity-70"
					aria-hidden="true"
				/>
				<span class="px-6 text-center text-sm font-medium">
					{{ $t('character.sheet.avatar.upload') }}
				</span>
			</button>
			<!--
				Kept outside the button: calling .click() on a nested input would bubble back up to
				the button's own handler and re-fire it.
			-->
			<input
				ref="fileInput"
				data-testid="character-image-upload-button"
				type="file"
				class="sr-only"
				:accept="ACCEPTED_FILE_TYPES"
				@change="handleFileChange"
			/>
		</template>

		<!-- Avatar set: tap the image to open the upload/remove actions. -->
		<template v-else>
			<button
				type="button"
				data-testid="character-image-button"
				class="block w-full focus-visible:outline-accent rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
				:aria-label="$t('character.sheet.avatar.actions')"
				@click="openAvatarActions"
			>
				<img
					data-testid="character-image"
					:src="avatar"
					:alt="$t('character.sheet.avatar.label')"
					class="aspect-square w-full rounded-xl object-cover shadow-md"
				/>
			</button>
			<input
				ref="fileInput"
				data-testid="character-image-upload-button"
				type="file"
				class="sr-only"
				:accept="ACCEPTED_FILE_TYPES"
				@change="handleFileChange"
			/>
		</template>
	</div>
</template>
