import { Dice } from '@/dice/shapes'
import type { DiceMaterial } from '@/dice/materials'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import type { BoxGeometry, BufferGeometry, Group, Material, Mesh } from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DICE_MASS } from '@/dice/constants'
import type { DiceCollisionEvent } from '@fate-app/mod-types'
import type { FaceUpAmount, DiceResult } from '@/dice/types'
import fudge from './fugde.svg'

type FudgeSymbol = '+' | '-'

type SymbolParam = {
	symbol: FudgeSymbol
	position: [number, number, number]
	rotation: [number, number, number]
}

/**
 * Creates a symbol mesh (+ or -) for the dice faces
 */
export function createSymbolMesh(symbol: FudgeSymbol | undefined, material: Material): Mesh {
	const size = 0.5
	const thick = 0.1

	// Handle different symbols based on their type
	if (symbol === '+') {
		const shape = new THREE.Shape()
		shape.moveTo(-size / 2, thick / 2)
		shape.lineTo(-size / 2, -thick / 2)
		shape.lineTo(-thick / 2, -thick / 2)
		shape.lineTo(-thick / 2, -size / 2)
		shape.lineTo(thick / 2, -size / 2)
		shape.lineTo(thick / 2, -thick / 2)
		shape.lineTo(size / 2, -thick / 2)
		shape.lineTo(size / 2, thick / 2)
		shape.lineTo(thick / 2, thick / 2)
		shape.lineTo(thick / 2, size / 2)
		shape.lineTo(-thick / 2, size / 2)
		shape.lineTo(-thick / 2, thick / 2)
		shape.closePath()

		const extrudeSettings = { depth: 0.01, bevelEnabled: false }
		const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
		return new THREE.Mesh(geometry, material)
	}
	const geometry = new THREE.BoxGeometry(size, thick, 0.001)
	return new THREE.Mesh(geometry, material)
}

function createDiceMesh(material: DiceMaterial, size: number, quality: number): Group {
	const diceGroup = new THREE.Group()

	const geometry = createRoundedBoxGeometry(size, size, size, quality, size / 10)
	const outerMesh = new THREE.Mesh(geometry, material.faceMaterial)
	outerMesh.castShadow = true
	outerMesh.receiveShadow = true
	diceGroup.add(outerMesh)

	// Symbol parameters for the faces
	const symbolParams: SymbolParam[] = [
		{
			symbol: '+',
			position: [0.5001, 0, 0],
			rotation: [0, -Math.PI * 0.5, 0]
		},
		{
			symbol: '+',
			position: [-0.5001, 0, 0],
			rotation: [0, Math.PI * 0.5, 0]
		},
		{
			symbol: '-',
			position: [0, 0, 0.5],
			rotation: [0, 0, 0]
		},
		{
			symbol: '-',
			position: [0, 0, -0.5],
			rotation: [0, 0, 0]
		}
		// Note: top and bottom faces are blank (no symbols)
	]

	symbolParams.forEach(({ symbol, position, rotation }) => {
		const symbolMesh = createSymbolMesh(symbol, material.symbolMaterial)
		symbolMesh.position.set(position[0], position[1], position[2])
		symbolMesh.rotation.set(rotation[0], rotation[1], rotation[2])
		diceGroup.add(symbolMesh)
	})

	return diceGroup
}

/**
 * Creates a rounded box geometry for dice
 */
export function createRoundedBoxGeometry(width: number, height: number, depth: number, segments: number, edgeRadius: number): BufferGeometry {
	let boxGeometry: BoxGeometry | BufferGeometry = new THREE.BoxGeometry(width, height, depth, segments, segments, segments)

	const positionAttr = boxGeometry.attributes.position
	const subCubeHalfSize = 0.5 - edgeRadius

	for (let i = 0; i < positionAttr.count; i++) {
		let position = new THREE.Vector3().fromBufferAttribute(positionAttr, i)
		const subCube = new THREE.Vector3(Math.sign(position.x), Math.sign(position.y), Math.sign(position.z)).multiplyScalar(subCubeHalfSize)

		const addition = new THREE.Vector3().subVectors(position, subCube)

		// Corner rounding logic
		if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
			addition.normalize().multiplyScalar(edgeRadius)
			position = subCube.add(addition)
		} else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize) {
			addition.z = 0
			addition.normalize().multiplyScalar(edgeRadius)
			position.x = subCube.x + addition.x
			position.y = subCube.y + addition.y
		} else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
			addition.y = 0
			addition.normalize().multiplyScalar(edgeRadius)
			position.x = subCube.x + addition.x
			position.z = subCube.z + addition.z
		} else if (Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
			addition.x = 0
			addition.normalize().multiplyScalar(edgeRadius)
			position.y = subCube.y + addition.y
			position.z = subCube.z + addition.z
		}

		positionAttr.setXYZ(i, position.x, position.y, position.z)
	}

	boxGeometry.deleteAttribute('normal')
	boxGeometry.deleteAttribute('uv')
	boxGeometry = mergeVertices(boxGeometry)
	boxGeometry.computeVertexNormals()

	return boxGeometry
}

/**
 * Creates a physical dice body
 */
function createDiceBody(world: CANNON.World, onCollide: (event: DiceCollisionEvent) => void): CANNON.Body {
	const body = new CANNON.Body({
		mass: DICE_MASS,
		shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
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

/**
 * Determines which face of a Fate die is facing up
 */
export function getFateDieValue(dice: Dice): number {
	// The Fate dice have + on the left/right faces and - on the front/back faces
	// We need to determine which face is most facing up (highest y-component)

	// Create vectors for each face direction in local space
	const rightFace = new THREE.Vector3(1, 0, 0) // +
	const leftFace = new THREE.Vector3(-1, 0, 0) // +
	const frontFace = new THREE.Vector3(0, 0, 1) // -
	const backFace = new THREE.Vector3(0, 0, -1) // -
	const topFace = new THREE.Vector3(0, 1, 0) // blank (0)
	const bottomFace = new THREE.Vector3(0, -1, 0) // blank (0)

	// Transform these vectors to world space using the mesh's matrix
	const mesh = dice.mesh as THREE.Object3D
	const worldMatrix = mesh.matrixWorld
	const worldRight = rightFace.clone().applyMatrix4(worldMatrix).normalize()
	const worldLeft = leftFace.clone().applyMatrix4(worldMatrix).normalize()
	const worldFront = frontFace.clone().applyMatrix4(worldMatrix).normalize()
	const worldBack = backFace.clone().applyMatrix4(worldMatrix).normalize()
	const worldTop = topFace.clone().applyMatrix4(worldMatrix).normalize()
	const worldBottom = bottomFace.clone().applyMatrix4(worldMatrix).normalize()

	// Calculate how much each face is pointing up (dot product with up vector)
	const upVector = new THREE.Vector3(0, 1, 0)
	const rightUpAmount = worldRight.dot(upVector)
	const leftUpAmount = worldLeft.dot(upVector)
	const frontUpAmount = worldFront.dot(upVector)
	const backUpAmount = worldBack.dot(upVector)
	const topUpAmount = worldTop.dot(upVector)
	const bottomUpAmount = worldBottom.dot(upVector)

	// Find which face is most facing up
	const facesUpAmount: FaceUpAmount[] = [
		{ face: 'right', value: 1, amount: rightUpAmount },
		{ face: 'left', value: 1, amount: leftUpAmount },
		{ face: 'front', value: -1, amount: frontUpAmount },
		{ face: 'back', value: -1, amount: backUpAmount },
		{ face: 'top', value: 0, amount: topUpAmount },
		{ face: 'bottom', value: 0, amount: bottomUpAmount }
	]

	// Sort by how much they face up (highest first)
	facesUpAmount.sort((a, b) => b.amount - a.amount)

	// Return the value of the face most facing up
	return facesUpAmount[0].value
}

export default class FudgeDice extends Dice {
	static name = 'Fudge'
	static icon = fudge

	constructor(material: DiceMaterial, size: number, quality: number, mass: number, world: CANNON.World, onCollide: (event: DiceCollisionEvent) => void) {
		super(material, size, quality, mass, world, onCollide)
	}

	public getResult(): number {
		return getFateDieValue(this)
	}

	public formatResult(result: number | number[]): DiceResult {
		if (Array.isArray(result)) {
			const sum = result.reduce((acc, curr) => acc + curr, 0)
			return {
				value: sum,
				values: result,
				text: sum > 0 ? '+' + sum.toString() : sum.toString(),
				color: sum > 0 ? 'success' : sum < 0 ? 'danger' : 'medium'
			}
		}
		return {
			value: result,
			values: [result],
			text: (result > 0 ? '+' : '') + result.toString(),
			color: result > 0 ? 'success' : result < 0 ? 'danger' : 'medium'
		}
	}

	public changeMaterial(material: DiceMaterial): void {
		this.material = material
		this.mesh = this.createMesh()
	}

	protected createMesh(): Group {
		return createDiceMesh(this.material, this.size, this.quality)
	}

	protected createBody(world: CANNON.World, onCollide: (event: DiceCollisionEvent) => void): CANNON.Body {
		return createDiceBody(world, onCollide)
	}

	public clone(): Dice {
		const clonedDice = new FudgeDice(this.material, this.size, this.quality, this.mass, this.world, this.onCollide)
		// Copy position and rotation from original dice
		clonedDice.body.position.copy(this.body.position)
		clonedDice.body.quaternion.copy(this.body.quaternion)
		clonedDice.mesh.position.copy(this.mesh.position as THREE.Vector3)
		clonedDice.mesh.quaternion.copy(this.mesh.quaternion as THREE.Quaternion)
		return clonedDice
	}
}
