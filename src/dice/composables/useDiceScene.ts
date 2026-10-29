import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Motion } from '@capacitor/motion'
import { debounce } from '@/utils/helpers/debounce'
import { randomSign } from '@/utils/helpers/random'
import usePermission from '@/composables/usePermission.js'
import CannonDebugRenderer from 'cannon-es-debugger'
import useDebug from '@/composables/useDebug'

// Import our modules
import type { DiceSceneConfig } from '@/dice/types'
import {
	MIN_NUMBER_OF_DICE,
	MAX_NUMBER_OF_DICE,
	MIN_GRAVITY,
	MAX_GRAVITY,
	MIN_SCALE,
	MAX_SCALE,
	MIN_FORCE,
	MAX_FORCE,
	DEFAULT_DICE_SCENE_CONFIG,
	COLLISION_COOLDOWN,
	SCENE_HEIGHT,
	COLLISION_VELOCITY_THRESHOLD,
	VELOCITY_THRESHOLD_FOR_STOPPED,
	ANGULAR_VELOCITY_THRESHOLD_FOR_STOPPED,
	RESULT_CHECK_DELAY,
	MIN_IMPULSE,
	DICE_SHAPES,
	DICE_MATERIALS,
	DICE_MASS,
	WALL_PROXIMITY_THRESHOLD,
	WALL_CORRECTION_STRENGTH
} from '@/dice/constants'
import { createPhysicsWorld, createBoundaries, placeDiceInCenter, updateDiceMeshes, areDiceStopped, getWallEscapeVector } from './useDicePhysics'
import { setupAccelerationListener, applyShakeImpulse, handleDiceCollision } from './useDiceMotion'
import { calculateDiceResult } from './useDiceResult'
import { registerBuiltinDice } from '@/dice/registerBuiltinDice'
import type { Dice, DiceConstructor } from '../shapes'
import type { DiceResult } from '../types'
import whiteDefault from '../materials/whiteDefault'
import type { DiceCollisionEvent } from '@fate-app/mod-types'

// Re-export constants, types, and enums
export { MIN_NUMBER_OF_DICE, MAX_NUMBER_OF_DICE, MIN_GRAVITY, MAX_GRAVITY, MIN_SCALE, MAX_SCALE, MIN_FORCE, MAX_FORCE, DEFAULT_DICE_SCENE_CONFIG }
export type { DiceSceneConfig }

const wallHeight = 50 // Add wallHeight constant at the top level

export default function useDiceScene(config: Ref<DiceSceneConfig>, canvas: Ref<HTMLCanvasElement | null>) {
	registerBuiltinDice()

	const { hasMotionPermission } = usePermission()
	const { isDebug } = useDebug()

	// Reactive width/height and aspect ratio
	const width = ref<number>(0)
	const height = ref<number>(0)
	const aspect = computed<number>(() => {
		if (height.value === 0) return 1
		return width.value / height.value
	})

	// Camera bounds based on config.scale * aspect
	const halfSizeX = ref<number>((MAX_SCALE + MIN_SCALE - config.value.scale) * aspect.value)
	const halfSizeZ = ref<number>(MAX_SCALE + MIN_SCALE - config.value.scale)

	// Scene state
	const diceArray = ref<Dice[]>([])
	const diceResult = ref<DiceResult>({
		value: 0,
		values: [],
		text: '',
		color: 'medium'
	})
	const isRolling = ref<boolean | undefined>(undefined)
	let resultCheckTimeout: number | null = null

	// Core rendering components
	let scene = new THREE.Scene()
	let renderer: THREE.WebGLRenderer | null = null
	let physics = createPhysicsWorld(config.value.gravity)
	let camera: THREE.OrthographicCamera | null = null
	let cannonDebugger: { update: () => void } | null = null

	// Motion and collision state
	const lastCollisionTime = { current: 0 }
	let accelListenerHandle: { remove: () => void } | null = null

	// Scene control flags
	let isFrozen = false
	let animationFrameId: number | null = null

	/**
	 * Creates the 3D scene and all necessary components
	 */
	function createScene() {
		if (!canvas.value) return

		// Create the renderer
		renderer = new THREE.WebGLRenderer({
			alpha: true,
			antialias: true,
			canvas: canvas.value
		})
		renderer.shadowMap.enabled = true
		renderer.shadowMap.type = THREE.PCFShadowMap
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

		// Capture dimensions
		width.value = canvas.value.clientWidth
		height.value = canvas.value.clientHeight
		renderer.setSize(width.value, height.value)

		// Create camera
		camera = new THREE.OrthographicCamera(-halfSizeX.value, halfSizeX.value, halfSizeZ.value, -halfSizeZ.value, 0.1, 100)
		camera.position.set(0, SCENE_HEIGHT, 0)
		camera.lookAt(new THREE.Vector3(0, 0, 0))
		camera.updateProjectionMatrix()
		scene.add(camera)

		// Lights
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
		scene.add(ambientLight)

		const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
		directionalLight.position.set(0, SCENE_HEIGHT, 10)
		directionalLight.castShadow = true

		directionalLight.shadow.mapSize.width = 512
		directionalLight.shadow.mapSize.height = 512
		directionalLight.shadow.camera.near = 1
		directionalLight.shadow.camera.far = 50

		directionalLight.shadow.camera.left = -halfSizeX.value * 2
		directionalLight.shadow.camera.right = halfSizeX.value * 2
		directionalLight.shadow.camera.top = halfSizeX.value * 2
		directionalLight.shadow.camera.bottom = -halfSizeX.value * 2

		directionalLight.shadow.bias = -0.001
		scene.add(directionalLight)

		// Floor
		const floorGeo = new THREE.PlaneGeometry(200, 200)
		const floorMat = new THREE.ShadowMaterial({ opacity: 0.1 })
		const floor = new THREE.Mesh(floorGeo, floorMat)
		floor.rotation.x = -Math.PI * 0.5
		floor.receiveShadow = true
		scene.add(floor)

		// Create physics boundaries
		createBoundaries(physics, halfSizeX.value, halfSizeZ.value)

		// Setup cannon debugger only in debug mode
		if (isDebug.value) {
			cannonDebugger = CannonDebugRenderer(scene, physics, {
				color: 0x00ff00, // Default color (green)
				scale: 1,
				onInit: (body: CANNON.Body, mesh: THREE.Mesh) => {
					// Floor and ceiling - blue
					if (body.shapes[0] instanceof CANNON.Box && body.position.y === wallHeight) {
						mesh.material = new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true })
					}
					// Floor - cyan
					else if (body.shapes[0] instanceof CANNON.Plane && body.quaternion.x < 0) {
						mesh.material = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true })
					}
					// Walls - red
					else if (body.shapes[0] instanceof CANNON.Box) {
						mesh.material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
					}
					// Dice remain green (default)
				}
			}) as { update: () => void }
		}

		// Handle collision events
		const onCollide = (event: DiceCollisionEvent) => {
			handleDiceCollision(event, config.value.haptic, COLLISION_VELOCITY_THRESHOLD, lastCollisionTime, COLLISION_COOLDOWN)
		}

		// Create dice. A persisted shape/material key can go stale (e.g. the mod
		// that provided it was uninstalled) — fall back to Fudge/white AND write
		// the fallback back into config so the UI (DiceTypeSelect) and
		// localStorage stop pointing at a since-removed key.
		const amount = config.value.numberOfDice
		let diceConstructor: DiceConstructor | undefined = DICE_SHAPES.get(config.value.dice.shape)
		if (!diceConstructor) {
			diceConstructor = DICE_SHAPES.get('Fudge')!
			config.value.dice.shape = 'Fudge'
		}
		let diceMaterial = DICE_MATERIALS.get(config.value.dice.material)
		if (!diceMaterial) {
			diceMaterial = whiteDefault
			config.value.dice.material = 'white'
		}
		// Create template dice with proper size and mass
		const diceTemplate = new diceConstructor(
			diceMaterial,
			1.0, // Base size of 1.0 units
			12, // Quality (segments)
			DICE_MASS, // Use constant mass
			physics,
			onCollide
		)

		for (let i = 0; i < amount; i++) {
			const diceCloned = diceTemplate.clone()
			scene.add(diceCloned.mesh)
			diceArray.value.push(diceCloned)
		}

		// Remove template from physics world since we only need the clones
		physics.removeBody(diceTemplate.body)

		placeDiceInCenter(diceArray.value as Dice[])
		renderLoop(0)
	}

	/**
	 * Cleans up the 3D scene and physics
	 */
	function destroyScene() {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId)
			animationFrameId = null
		}

		diceArray.value.forEach(dice => {
			dice.body.removeEventListener('collide', handleDiceCollision)
			physics.removeBody(dice.body as CANNON.Body)
		})
		diceArray.value = []

		scene.traverse(object => {
			if (object instanceof THREE.Mesh) {
				object.geometry.dispose()
				if (Array.isArray(object.material)) {
					object.material.forEach(m => m.dispose())
				} else {
					object.material.dispose()
				}
			}
		})
		scene.clear()

		if (renderer) {
			renderer.dispose()
			renderer = null
		}

		scene = new THREE.Scene()
		physics = createPhysicsWorld(config.value.gravity)
		camera = null
	}

	/**
	 * Main render loop for the scene
	 */
	let lastTime = 0
	function renderLoop(time: number) {
		if (isFrozen || !renderer || !camera) return

		const delta = (time - lastTime) / 1000
		lastTime = time

		physics.step(1 / 60, delta, 3)
		updateDiceMeshes(diceArray.value as Dice[])

		// Update debugger only in debug mode
		if (isDebug.value && cannonDebugger) {
			cannonDebugger.update()
		}

		// Check if dice have stopped rolling
		if (isRolling.value) {
			checkIfDiceStopped()
		}

		renderer.render(scene, camera)
		animationFrameId = requestAnimationFrame(renderLoop)
	}

	/**
	 * Handles window resize
	 */
	function handleResize() {
		if (!canvas.value || !renderer || !camera) return

		width.value = canvas.value.clientWidth
		height.value = canvas.value.clientHeight
		renderer.setSize(width.value, height.value)

		camera.left = -halfSizeX.value
		camera.right = halfSizeX.value
		camera.top = halfSizeZ.value
		camera.bottom = -halfSizeZ.value
		camera.updateProjectionMatrix()
	}

	/**
	 * Handles shake detection via device motion
	 */
	async function addAccelListener() {
		if (!hasMotionPermission.value) {
			console.error('[Acceleration] No motion permission')
			return
		}

		if (!config.value.shake) {
			console.warn('[Acceleration] Shake is disabled')
			removeAccelListener()
			return
		}

		if (accelListenerHandle) {
			console.warn('[Acceleration] Accel listener already exists')
			return
		}

		const onShake = (accelVec: CANNON.Vec3, magnitude: number) => {
			isRolling.value = true
			applyShakeImpulse(diceArray.value as Dice[], accelVec, magnitude, config.value.force, MAX_FORCE, halfSizeX.value, halfSizeZ.value)
		}

		accelListenerHandle = await setupAccelerationListener(onShake)
	}

	function removeAccelListener() {
		if (accelListenerHandle) {
			accelListenerHandle.remove()
			accelListenerHandle = null
		}
	}

	/**
	 * Completely recreates the scene with current config
	 */
	function repaint() {
		if (!canvas.value) return
		canvas.value.style.width = ''
		canvas.value.style.height = ''

		nextTick(() => {
			destroyScene()
			width.value = canvas.value?.clientWidth || 0
			height.value = canvas.value?.clientHeight || 0
			halfSizeX.value = (MAX_SCALE + MIN_SCALE - config.value.scale) * aspect.value
			halfSizeZ.value = MAX_SCALE + MIN_SCALE - config.value.scale
			createScene()
			handleResize()
			unfreeze()
		})
	}

	/**
	 * Check if dice have stopped moving and calculate result if so
	 */
	function checkIfDiceStopped() {
		if (!isRolling.value) return

		const allStopped = areDiceStopped(diceArray.value as Dice[], VELOCITY_THRESHOLD_FOR_STOPPED, ANGULAR_VELOCITY_THRESHOLD_FOR_STOPPED)

		if (allStopped) {
			// Wait a bit to make sure they're really stopped
			if (resultCheckTimeout === null) {
				resultCheckTimeout = window.setTimeout(() => {
					// Double-check they're still stopped
					const stillStopped = areDiceStopped(diceArray.value as Dice[], VELOCITY_THRESHOLD_FOR_STOPPED, ANGULAR_VELOCITY_THRESHOLD_FOR_STOPPED)

					if (stillStopped) {
						isRolling.value = false
						diceResult.value = calculateDiceResult(diceArray.value as Dice[])
					}

					resultCheckTimeout = null
				}, RESULT_CHECK_DELAY)
			}
		} else {
			// If any dice are moving, clear the timeout
			if (resultCheckTimeout !== null) {
				clearTimeout(resultCheckTimeout)
				resultCheckTimeout = null
			}
		}
	}

	/**
	 * Throws the dice with a random impulse
	 */
	function throwDice(): DiceResult {
		// Clear any existing timeout
		if (resultCheckTimeout !== null) {
			clearTimeout(resultCheckTimeout)
			resultCheckTimeout = null
		}

		// Set rolling state
		isRolling.value = true

		// Apply randomized physics impulses to each die
		diceArray.value.forEach(dice => {
			const currentVelocity = dice.body.velocity.length()
			const maxImpulse = Math.max(0, 50 - currentVelocity)
			const force = config.value.force
			const scaledImpulse = MIN_IMPULSE + ((force - MIN_FORCE) / (MAX_FORCE - MIN_FORCE)) * (50 - MIN_IMPULSE) // Increased from 40
			const randomFactor = 1 + (Math.random() * 0.3 - 0.15) // ±15% variation
			const finalImpulse = Math.min(scaledImpulse * randomFactor, maxImpulse)

			// Ensure the impulse is always above a minimum threshold
			const effectiveImpulse = Math.max(finalImpulse, MIN_IMPULSE * 1.5)

			const x = randomSign() * effectiveImpulse
			const y = Math.random() * 5 + 2
			const z = randomSign() * effectiveImpulse

			const esc = getWallEscapeVector(dice.body.position, halfSizeX.value, halfSizeZ.value, WALL_PROXIMITY_THRESHOLD)
			const impulsePoint = new CANNON.Vec3(0, 0, 0)
			const impulse = new CANNON.Vec3(x + esc.x * WALL_CORRECTION_STRENGTH * effectiveImpulse, y, z + esc.z * WALL_CORRECTION_STRENGTH * effectiveImpulse)

			dice.body.applyImpulse(impulse, impulsePoint)
		})

		// Return the current result, which will be updated when dice stop
		return diceResult.value
	}

	// Pause simulation and interaction
	function freeze() {
		if (isFrozen) return
		isFrozen = true

		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId)
			animationFrameId = null
		}

		removeAccelListener()

		window.removeEventListener('resize', debouncedRepaint)
	}

	// Resume simulation and interaction
	async function unfreeze() {
		if (!isFrozen) return
		isFrozen = false
		await addAccelListener()
		window.addEventListener('resize', debouncedRepaint)
		renderLoop(0)
	}

	// Set up watchers and lifecycle hooks
	watch(hasMotionPermission, value => {
		if (value) {
			addAccelListener()
		}
	})

	watch(
		() => config.value.shake,
		value => {
			if (value) {
				addAccelListener()
			} else {
				removeAccelListener()
			}
		}
	)

	watch(canvas, async value => {
		if (!value) return

		setTimeout(async () => {
			halfSizeX.value = (MAX_SCALE + MIN_SCALE - config.value.scale) * (value.clientWidth / value.clientHeight)
			halfSizeZ.value = MAX_SCALE + MIN_SCALE - config.value.scale
			createScene()
		}, 0)
	})

	// Watch for configuration changes that require updating the scene
	watch(
		() => config.value.gravity,
		newGravity => {
			physics.gravity.set(0, -newGravity, 0)
		}
	)

	// Watch for changes that require a full repaint
	watch([() => config.value.numberOfDice, () => config.value.scale, () => config.value.dice.material, () => config.value.dice.shape], () => {
		repaint()
	})

	// Watch for debug mode changes
	watch(isDebug, newValue => {
		if (newValue) {
			// Enable debugger if debug mode is turned on
			if (!cannonDebugger && scene && physics) {
				cannonDebugger = CannonDebugRenderer(scene, physics, {
					color: 0x00ff00,
					scale: 1
				}) as { update: () => void }
			}
		} else {
			// Disable debugger if debug mode is turned off
			cannonDebugger = null
		}
	})

	const debouncedRepaint = debounce(repaint, 200)

	onMounted(() => {
		window.addEventListener('resize', debouncedRepaint)
	})

	onBeforeUnmount(() => {
		window.removeEventListener('resize', debouncedRepaint)
		Motion.removeAllListeners()
		if (animationFrameId) cancelAnimationFrame(animationFrameId)
	})

	// Return public API
	return {
		freeze,
		unfreeze,
		throwDice,
		diceResult,
		isRolling
	}
}
