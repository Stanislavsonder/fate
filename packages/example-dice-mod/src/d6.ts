import { Dice, type DiceMaterial, type DiceCollisionEvent, type DiceResult } from '@fate-app/mod-types'
// Both bare imports below are rewritten by @fate-app/mod-build into reads of
// globalThis.FateSDK.dice.* — the host app's own three/cannon-es instances.
import * as THREE from 'three'
import * as CANNON from 'cannon-es'

/** Face layout of a standard D6 — opposite faces sum to 7. */
const FACES: { value: number; normal: [number, number, number] }[] = [
	{ value: 1, normal: [0, 1, 0] },
	{ value: 6, normal: [0, -1, 0] },
	{ value: 2, normal: [1, 0, 0] },
	{ value: 5, normal: [-1, 0, 0] },
	{ value: 3, normal: [0, 0, 1] },
	{ value: 4, normal: [0, 0, -1] }
]

function createNumberMesh(value: number, material: DiceMaterial): THREE.Mesh | null {
	const canvas = document.createElement('canvas')
	// Headless environments (the registry's jsdom-based smoke-load) have no 2D
	// canvas — degrade to a numberless die instead of failing to construct.
	const ctx = canvas.getContext('2d')
	if (!ctx) {
		return null
	}

	const size = 128
	canvas.width = size
	canvas.height = size
	ctx.font = 'bold 80px Arial'
	ctx.fillStyle = 'white'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(value.toString(), size / 2, size / 2)

	const texture = new THREE.CanvasTexture(canvas)
	const numberMaterial = material.symbolMaterial.clone() as THREE.MeshStandardMaterial
	numberMaterial.map = texture
	numberMaterial.transparent = true

	return new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), numberMaterial)
}

function createDiceMesh(material: DiceMaterial, size: number): THREE.Group {
	const diceGroup = new THREE.Group()

	const outerMesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material.faceMaterial)
	outerMesh.castShadow = true
	outerMesh.receiveShadow = true
	diceGroup.add(outerMesh)

	for (const face of FACES) {
		const normal = new THREE.Vector3(...face.normal)
		const numberMesh = createNumberMesh(face.value, material)
		if (!numberMesh) {
			continue
		}
		numberMesh.position.copy(normal).multiplyScalar(size / 2 + 0.001)
		numberMesh.lookAt(normal.clone().multiplyScalar(size))
		diceGroup.add(numberMesh)
	}

	return diceGroup
}

function createDiceBody(world: CANNON.World, size: number, mass: number, onCollide: (event: DiceCollisionEvent) => void): CANNON.Body {
	const half = size / 2
	const body = new CANNON.Body({
		mass,
		shape: new CANNON.Box(new CANNON.Vec3(half, half, half)),
		sleepTimeLimit: 0.2
	})

	body.collisionResponse = true
	body.collisionFilterGroup = 1
	body.collisionFilterMask = 1
	body.angularDamping = 0.3
	body.linearDamping = 0.3
	body.sleepSpeedLimit = 0.4
	body.sleepTimeLimit = 0.5
	body.allowSleep = true

	body.addEventListener('collide', onCollide)
	world.addBody(body)

	return body
}

function getD6Value(dice: Dice): number {
	const rotation = new THREE.Matrix4().extractRotation((dice.mesh as THREE.Object3D).matrixWorld)
	const up = new THREE.Vector3(0, 1, 0)

	let best = FACES[0].value
	let bestAmount = -Infinity
	for (const face of FACES) {
		const amount = new THREE.Vector3(...face.normal).applyMatrix4(rotation).normalize().dot(up)
		if (amount > bestAmount) {
			bestAmount = amount
			best = face.value
		}
	}
	return best
}

export default class D6Dice extends Dice {
	static name = 'D6'
	static icon =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="16" cy="16" r="1.6" fill="currentColor"/></svg>'
		)

	constructor(material: DiceMaterial, size: number, quality: number, mass: number, world: CANNON.World, onCollide: (event: DiceCollisionEvent) => void) {
		super(material, size, quality, mass, world, onCollide)
	}

	public getResult(): number {
		return getD6Value(this)
	}

	public formatResult(result: number | number[]): DiceResult {
		const values = Array.isArray(result) ? result : [result]
		const sum = values.reduce((acc, curr) => acc + curr, 0)
		return {
			value: sum,
			values,
			text: values.map(value => value.toString()).join(', '),
			color: values.every(value => value === 6) ? 'success' : values.every(value => value === 1) ? 'danger' : 'medium'
		}
	}

	public changeMaterial(material: DiceMaterial): void {
		this.material = material
		this.mesh = this.createMesh()
	}

	protected createMesh(): THREE.Group {
		return createDiceMesh(this.material, this.size)
	}

	protected createBody(world: CANNON.World, onCollide: (event: DiceCollisionEvent) => void): CANNON.Body {
		return createDiceBody(world, this.size, this.mass, onCollide)
	}

	public clone(): Dice {
		const clonedDice = new D6Dice(this.material, this.size, this.quality, this.mass, this.world, this.onCollide)
		clonedDice.body.position.copy(this.body.position)
		clonedDice.body.quaternion.copy(this.body.quaternion)
		clonedDice.mesh.position.copy(this.mesh.position as THREE.Vector3)
		clonedDice.mesh.quaternion.copy(this.mesh.quaternion as THREE.Quaternion)
		return clonedDice
	}
}
