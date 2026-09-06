import * as CANNON from 'cannon-es'
import { Motion } from '@capacitor/motion'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import type { AccelListenerEvent } from '@capacitor/motion'
import { isIos } from '@/utils/helpers/platform'
import { ACCEL_THRESHOLD, MAX_DICE_VELOCITY, WALL_PROXIMITY_THRESHOLD, WALL_CORRECTION_STRENGTH } from '@/dice/constants'
import type { DiceCollisionEvent } from '@fate-core/mod-types'
import type { Dice } from '../shapes'
import { getWallEscapeVector } from './useDicePhysics'

export const debugEventName = 'mock'

export type DebugAccelEvent = Event & {
	detail: {
		acceleration: { x: number; y: number; z: number }
	}
}

declare global {
	interface WindowEventMap {
		[debugEventName]: DebugAccelEvent
	}
}

/**
 * Sets up acceleration listeners for shake detection
 */
export async function setupAccelerationListener(
	onShake: (accelVec: CANNON.Vec3, strength: number) => void,
	threshold: number = ACCEL_THRESHOLD,
	cooldownTime: number = 300
): Promise<{ remove: () => void } | null> {
	let shakeCooldown = false

	const callback = (event: AccelListenerEvent | DebugAccelEvent) => {
		const acceleration = 'detail' in event ? event.detail.acceleration : event.acceleration

		const { x, y, z } = acceleration

		const magnitude = Math.sqrt(x ** 2 + y ** 2 + z ** 2)

		if (magnitude > threshold && !shakeCooldown) {
			let sceneX = isIos ? -x : x
			const sceneY = 1 + Math.random()
			let sceneZ = isIos ? y : -y

			// Handle different screen orientations
			if (isIos) {
				switch (window.screen.orientation.angle) {
					case 270:
						;[sceneX, sceneZ] = [sceneZ, -sceneX]
						break
					case 90:
						;[sceneX, sceneZ] = [-sceneZ, sceneX]
						break
					case 180:
						;[sceneX, sceneZ] = [-sceneX, -sceneZ]
						break
				}
			} else {
				switch (window.screen.orientation.angle) {
					case 90:
						;[sceneX, sceneZ] = [-sceneZ, sceneX]
						break
					case 270:
						;[sceneX, sceneZ] = [sceneZ, -sceneX]
						break
				}
			}

			const accelVec = new CANNON.Vec3(sceneX, sceneY, sceneZ)
			accelVec.normalize()

			onShake(accelVec, magnitude)

			shakeCooldown = true
			setTimeout(() => {
				shakeCooldown = false
			}, cooldownTime)
		}
	}
	const listener = await Motion.addListener('accel', callback)
	window.addEventListener(debugEventName, callback)

	return {
		remove: () => {
			listener.remove()
			window.removeEventListener(debugEventName, callback)
		}
	}
}

/**
 * Applies a shake impulse to all dice, with per-die wall escape correction.
 */
export function applyShakeImpulse(
	diceArray: Dice[],
	accelVec: CANNON.Vec3,
	magnitude: number,
	force: number,
	maxForce: number,
	halfSizeX: number,
	halfSizeZ: number
): void {
	const forceScale = (force / maxForce) * 5 * magnitude
	accelVec.scale(forceScale, accelVec)
	const impulsePoint = new CANNON.Vec3(0, 0, 0)

	for (const dice of diceArray) {
		const esc = getWallEscapeVector(dice.body.position, halfSizeX, halfSizeZ, WALL_PROXIMITY_THRESHOLD)
		const dieImpulse = new CANNON.Vec3(
			accelVec.x + esc.x * forceScale * WALL_CORRECTION_STRENGTH,
			accelVec.y,
			accelVec.z + esc.z * forceScale * WALL_CORRECTION_STRENGTH
		)
		dice.body.applyImpulse(dieImpulse, impulsePoint)

		// Limit maximum velocity
		const currentVelocity = dice.body.velocity.length()
		if (currentVelocity > MAX_DICE_VELOCITY) {
			const scale = MAX_DICE_VELOCITY / currentVelocity
			dice.body.velocity.scale(scale, dice.body.velocity)
		}
	}
}

let hapticsSupported = true

/**
 * Handles dice collision effects (haptic feedback)
 */
export function handleDiceCollision(
	event: DiceCollisionEvent,
	isHapticEnabled: boolean,
	velocityThreshold: number,
	lastCollisionTime: { current: number },
	collisionCooldown: number
): void {
	const impactVelocity = event.contact.getImpactVelocityAlongNormal ? event.contact.getImpactVelocityAlongNormal() : 2

	// Ignore tiny collisions that could cause jitter
	if (impactVelocity < 1.0) {
		return
	}

	if (!isHapticEnabled || !hapticsSupported) return

	const now = Date.now()
	if (impactVelocity > velocityThreshold && now - lastCollisionTime.current > collisionCooldown) {
		lastCollisionTime.current = now
		void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
			hapticsSupported = false
		})
	}
}
