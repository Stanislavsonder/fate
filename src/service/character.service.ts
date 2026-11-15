import { characters } from '@/db'
import type { Character, CharacterModules } from '@/types'
import type { WriteFileOptions } from '@capacitor/filesystem'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isWeb } from '@/utils/helpers/platform'
import { clone } from '@/utils/helpers/clone'
import { showSuccessToast, showErrorToast } from '@/utils/helpers/toast'

class CharacterService {
	CHARACTER_EXTENSION = '.fchar'
	CHARACTER_MODULE_EXTENSION = '.fmod'
	#characters = characters

	constructor() {}

	async getCharacter(id: string | number): Promise<Character | undefined> {
		return this.#characters.get(Number(id))
	}

	async createCharacter(character: Character): Promise<Character> {
		const { id: _ignored, ...insertDto } = clone(character)
		character.id = await this.#characters.add(insertDto as Character)
		return character
	}

	async getCharacters(): Promise<Character[]> {
		return this.#characters.toArray()
	}

	async updateCharacter(character: Character): Promise<number> {
		const dto = JSON.parse(JSON.stringify(character))
		return this.#characters.put(dto)
	}

	async removeCharacter(id: string | number): Promise<void> {
		return this.#characters.delete(Number(id))
	}

	get canShare(): boolean {
		if (!isWeb) return true
		if (!('share' in navigator)) return false
		try {
			const probe = new File(['{}'], 'probe.fchar', { type: 'application/x-fchar' })
			return navigator.canShare?.({ files: [probe] }) ?? false
		} catch {
			return false
		}
	}

	saveCharacter(character: Character): void {
		const jsonString = JSON.stringify(character)
		const fileName = `${character.name}${this.CHARACTER_EXTENSION}`

		if (isWeb) {
			this.#exportForWeb(jsonString, fileName)
			showSuccessToast('character.exportSuccess')
			return
		}

		this.#writeFileToDocuments(jsonString, fileName)
			.then(() => showSuccessToast('character.exportSuccess'))
			.catch(err => showErrorToast('errors.character.export', { error: err }))
	}

	shareCharacter(character: Character): void {
		const jsonString = JSON.stringify(character)
		const fileName = `${character.name}${this.CHARACTER_EXTENSION}`

		if (isWeb) {
			this.#shareForWeb(jsonString, fileName).catch(err => {
				if ((err as Error)?.name !== 'AbortError') {
					showErrorToast('errors.character.export', { error: err })
				}
			})
			return
		}

		this.#saveFileToDevice(jsonString, fileName)
			.then(() => showSuccessToast('character.exportSuccess'))
			.catch(err => showErrorToast('errors.character.export', { error: err }))
	}

	saveModules(character: Character): void {
		const jsonString = JSON.stringify(character._modules)
		const fileName = `${character.name}${this.CHARACTER_MODULE_EXTENSION}`

		if (isWeb) {
			this.#exportForWeb(jsonString, fileName)
			showSuccessToast('modules.exportSuccess')
			return
		}

		this.#writeFileToDocuments(jsonString, fileName)
			.then(() => showSuccessToast('modules.exportSuccess'))
			.catch(err => showErrorToast('errors.modules.export', { error: err }))
	}

	shareModules(character: Character): void {
		const jsonString = JSON.stringify(character._modules)
		const fileName = `${character.name}${this.CHARACTER_MODULE_EXTENSION}`

		if (isWeb) {
			this.#shareForWeb(jsonString, fileName).catch(err => {
				if ((err as Error)?.name !== 'AbortError') {
					showErrorToast('errors.modules.export', { error: err })
				}
			})
			return
		}

		this.#saveFileToDevice(jsonString, fileName)
			.then(() => showSuccessToast('modules.exportSuccess'))
			.catch(err => showErrorToast('errors.modules.export', { error: err }))
	}

	async importCharacter(file: File): Promise<Character | never> {
		// Check file extension
		if (!file.name.endsWith(this.CHARACTER_EXTENSION)) {
			showErrorToast('character.import.error.extension')
			throw new Error(`Invalid file extension. Character files must end with ${this.CHARACTER_EXTENSION}`)
		}

		return new Promise<Character>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => {
				try {
					const character = JSON.parse(reader.result as string)
					if (this.#validateCharacter(character)) {
						showSuccessToast('character.import.success')
						resolve(character as Character)
					} else {
						const error = new Error('Invalid character file: Failed validation checks')
						showErrorToast('character.import.error.validation')
						reject(error)
					}
				} catch (error) {
					showErrorToast('character.import.error.validation')
					reject(new Error('Invalid character file: Could not parse JSON', { cause: error }))
				}
			}
			reader.onerror = () => {
				showErrorToast('character.import.error.validation')
				reject(new Error('Error reading character file'))
			}
			reader.readAsText(file)
		}).catch(error => {
			throw error
		})
	}

	async importCharacterModules(file: File): Promise<CharacterModules | never> {
		// Check file extension
		if (!file.name.endsWith(this.CHARACTER_MODULE_EXTENSION)) {
			const error = new Error(`Invalid file extension. Module files must end with ${this.CHARACTER_MODULE_EXTENSION}`)
			showErrorToast('modules.import.error.extension')
			throw error
		}

		return new Promise<CharacterModules>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => {
				try {
					const modules = JSON.parse(reader.result as string)
					if (this.#validateModules(modules)) {
						showSuccessToast('modules.import.success')
						resolve(modules as CharacterModules)
					} else {
						const error = new Error('Invalid modules file: Failed validation checks')
						showErrorToast('modules.import.error.validation')
						reject(error)
					}
				} catch (error) {
					showErrorToast('modules.import.error.validation')
					reject(new Error('Invalid modules file: Could not parse JSON', { cause: error }))
				}
			}
			reader.onerror = () => {
				showErrorToast('modules.import.error.validation')
				reject(new Error('Error reading modules file'))
			}
			reader.readAsText(file)
		}).catch(error => {
			throw error
		})
	}

	#validateCharacter(character: unknown): boolean {
		// Check if character is an object
		if (!character || typeof character !== 'object') {
			console.error('Character is not an object')
			return false
		}

		// Check for required properties
		const requiredProps = ['name']
		for (const prop of requiredProps) {
			if (!(prop in character)) {
				console.error(`Character is missing required property: ${prop}`)
				return false
			}
		}

		// Check name is a string and not empty
		const typedChar = character as Partial<Character>
		if (typeof typedChar.name !== 'string' || typedChar.name.trim() === '') {
			console.error('Character name must be a non-empty string')
			return false
		}

		// Check _modules if present
		if ('_modules' in character) {
			if (!this.#validateModules(typedChar._modules)) {
				console.error('Character has invalid modules')
				return false
			}
		} else {
			// If no modules, add empty modules object
			;(character as Character)._modules = {}
		}

		// Check character version
		if (typedChar._version) {
			if (typeof typedChar._version !== 'string') {
				console.error('Character version must be a string')
				return false
			}
		}

		return true
	}

	#validateModules(modules: unknown): boolean {
		// Check if modules is an object
		if (!modules || typeof modules !== 'object') {
			console.error('Modules is not an object')
			return false
		}

		// Check each module entry
		const typedModules = modules as Record<string, unknown>

		for (const [moduleId, moduleData] of Object.entries(typedModules)) {
			// Check if moduleData is an object
			if (!moduleData || typeof moduleData !== 'object') {
				console.error(`Module ${moduleId} data is not an object`)
				return false
			}

			// Check if module has version
			const typedModuleData = moduleData as { version?: string; config?: Record<string, unknown> }
			if (!('version' in typedModuleData) || typeof typedModuleData.version !== 'string') {
				console.error(`Module ${moduleId} is missing a valid version`)
				return false
			}

			// If config exists, ensure it's an object
			if ('config' in typedModuleData && (typedModuleData.config === null || typeof typedModuleData.config !== 'object')) {
				console.error(`Module ${moduleId} has an invalid config`)
				return false
			}
		}

		return true
	}

	#getMimeType(fileName: string): string {
		if (fileName.endsWith(this.CHARACTER_EXTENSION)) return 'application/x-fchar'
		if (fileName.endsWith(this.CHARACTER_MODULE_EXTENSION)) return 'application/x-fmod'
		return 'application/octet-stream'
	}

	#exportForWeb(jsonString: string, fileName: string): void {
		const element = document.createElement('a')
		const file = new Blob([jsonString], { type: this.#getMimeType(fileName) })
		element.href = URL.createObjectURL(file)
		element.download = fileName
		document.body.appendChild(element)
		element.click()
		document.body.removeChild(element)
	}

	async #writeFileToDocuments(contents: string, fileName: string): Promise<void> {
		const options: WriteFileOptions = {
			path: fileName,
			data: contents,
			directory: Directory.Documents,
			encoding: Encoding.UTF8
		}

		try {
			await Filesystem.writeFile(options)
		} catch (error) {
			console.error('Error writing file', error)
			throw error
		}
	}

	async #saveFileToDevice(contents: string, fileName: string): Promise<void> {
		await this.#writeFileToDocuments(contents, fileName)
		await this.#shareFile(fileName)
	}

	async #shareForWeb(jsonString: string, fileName: string): Promise<void> {
		const mimeType = this.#getMimeType(fileName)
		const blob = new Blob([jsonString], { type: mimeType })
		const file = new File([blob], fileName, { type: mimeType })
		await navigator.share({ files: [file] })
	}

	async #shareFile(fileName: string) {
		const fileUriResult = await Filesystem.getUri({
			directory: Directory.Documents,
			path: fileName
		})
		const path = fileUriResult.uri

		try {
			await Share.share({
				title: fileName,
				url: path
			})
		} catch (error) {
			console.error('Error sharing file', error)
		}
	}
}

export default new CharacterService()
