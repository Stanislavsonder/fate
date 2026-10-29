import type * as CANNON from 'cannon-es'
import type * as THREE from 'three'

/**
 * Structural mirror of the app's own dice-collision event shape. Deliberately
 * not the legacy `cannon` package's `ICollisionEvent` (an app-local quirk
 * predating this package, kept only where the app already used it) —
 * cannon-es's own `Body` type is all a dice author actually needs.
 */
export interface DiceCollisionEvent {
	type: string
	body: CANNON.Body
	target: CANNON.Body
	contact: CANNON.ContactEquation
}

export type DiceResult = {
	value: number
	values: number[]
	text: string
	color: 'success' | 'danger' | 'medium'
}

/**
 * A dice material — a real (tiny) runtime class, not just a type: it has no
 * three/cannon-es logic of its own beyond holding references, so bundling it
 * into every dice mod costs nothing. Only the heavy libraries (three,
 * cannon-es themselves) go through FateSDK.dice — see docs/MOD_API.md.
 */
export class DiceMaterial {
	constructor(
		public readonly name: string,
		public readonly faceMaterial: THREE.MeshStandardMaterial,
		public readonly symbolMaterial: THREE.MeshStandardMaterial,
		public readonly previewColor: string
	) {}
}

/**
 * The abstract base class every custom dice shape extends. A real runtime
 * export (not a type-only declaration) for the same reason as DiceMaterial —
 * its own constructor logic never touches three/cannon-es directly (that's
 * the subclass's job in createMesh/createBody), so it's safe and cheap to
 * bundle per-mod rather than routing through FateSDK.
 */
export abstract class Dice {
	public static name: string
	public static icon: string

	public mesh: THREE.Mesh | THREE.Group
	public body: CANNON.Body

	protected constructor(
		public material: DiceMaterial,
		public size: number,
		public quality: number,
		public mass: number,
		public world: CANNON.World,
		public onCollide: (event: DiceCollisionEvent) => void
	) {
		this.mesh = this.createMesh()
		this.body = this.createBody(this.world, this.onCollide)
	}

	public abstract clone(): Dice
	public abstract getResult(): number
	public abstract formatResult(result: number | number[]): DiceResult
	public abstract changeMaterial(material: DiceMaterial): void

	protected abstract createMesh(): THREE.Mesh | THREE.Group
	protected abstract createBody(world: CANNON.World, onCollide: (event: DiceCollisionEvent) => void): CANNON.Body
}

export type DiceConstructor = {
	new (material: DiceMaterial, size: number, quality: number, mass: number, world: CANNON.World, onCollide: (event: DiceCollisionEvent) => void): Dice
	icon: string
	name: string
}
