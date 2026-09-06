import { Dice } from '@/dice/shapes'
import type { DiceMaterial } from '@/dice/materials'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import type { Group, Mesh } from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { DiceCollisionEvent } from '@fate-app/mod-types'
import type { FaceUpAmount, DiceResult } from '@/dice/types'
import d20Icon from './d20.svg'

/**
 * Creates a number mesh for the dice faces
 */
export function createNumberMesh(number: number, material: DiceMaterial): Mesh {
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d')

	if (!ctx) {
		throw new Error('Failed to get 2D context')
	}

	// Set canvas size
	const size = 128
	canvas.width = size
	canvas.height = size

	// Draw number text
	ctx.font = 'bold 80px Arial'
	ctx.fillStyle = 'white'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(number.toString(), size / 2, size / 2)

	// Create texture from canvas
	const texture = new THREE.CanvasTexture(canvas)

	// Create a small plane to display the number
	const geometry = new THREE.PlaneGeometry(0.5, 0.5)
	const numberMaterial = material.symbolMaterial.clone() as THREE.MeshStandardMaterial
	numberMaterial.map = texture
	numberMaterial.transparent = true

	const mesh = new THREE.Mesh(geometry, numberMaterial)

	return mesh
}

/**
 * Creates the D20 geometry
 */
export function createD20Geometry(size: number): THREE.BufferGeometry {
	// Use THREE.js built-in icosahedron geometry for perfect D20 shape
	const baseGeometry = new THREE.IcosahedronGeometry(size, 0)

	// Merge vertices to ensure clean geometry
	const geometry = mergeVertices(baseGeometry)

	return geometry
}

/**
 * Creates the D20 mesh
 */
function createDiceMesh(material: DiceMaterial, size: number, _quality: number): Group {
	const diceGroup = new THREE.Group()

	// Create D20 geometry
	const geometry = createD20Geometry(size)

	// Create mesh with material
	const outerMesh = new THREE.Mesh(geometry, material.faceMaterial)
	outerMesh.castShadow = true
	outerMesh.receiveShadow = true
	diceGroup.add(outerMesh)

	// Add number meshes to faces
	const faceValues = [20, 8, 14, 2, 11, 17, 5, 3, 16, 10, 19, 7, 13, 1, 12, 18, 6, 4, 15, 9]

	// Get face normals for number placement
	interface FaceData {
		normal: THREE.Vector3
		center: THREE.Vector3
	}

	const faceNormals: FaceData[] = []
	const normalAttribute = geometry.getAttribute('normal')
	const positionAttribute = geometry.getAttribute('position')

	// Collect unique face normals and their center positions
	for (let i = 0; i < normalAttribute.count; i += 3) {
		const normal = new THREE.Vector3()
		normal.fromBufferAttribute(normalAttribute, i)

		// Get face center for number placement
		const center = new THREE.Vector3()
		center.fromBufferAttribute(positionAttribute, i)
		center.add(new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 1))
		center.add(new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 2))
		center.divideScalar(3)

		// Only add unique face normals
		if (!faceNormals.some(fn => fn.normal.equals(normal))) {
			faceNormals.push({ normal, center })
		}
	}

	// Add numbers to faces
	faceNormals.forEach((face, index) => {
		if (index < faceValues.length) {
			const numberMesh = createNumberMesh(faceValues[index], material)

			// Position number slightly above face
			numberMesh.position.copy(face.center)
			numberMesh.position.addScaledVector(face.normal, 0.01)

			// Orient number to face outward
			numberMesh.lookAt(face.center.clone().add(face.normal))

			diceGroup.add(numberMesh)
		}
	})

	return diceGroup
}

/**
 * Creates a physical dice body
 */
function createDiceBody(world: CANNON.World, size: number, mass: number, onCollide: (event: DiceCollisionEvent) => void): CANNON.Body {
	// Create a physics body for D20
	const body = new CANNON.Body({
		mass: mass,
		sleepTimeLimit: 0.3
	})

	const scaleFactor = size * 0.55

	// Create an icosahedron shape for physics
	// The vertices and faces of a regular icosahedron
	const t = (1 + Math.sqrt(5)) / 2
	const vertices = [
		[-1, t, 0],
		[1, t, 0],
		[-1, -t, 0],
		[1, -t, 0],
		[0, -1, t],
		[0, 1, t],
		[0, -1, -t],
		[0, 1, -t],
		[t, 0, -1],
		[t, 0, 1],
		[-t, 0, -1],
		[-t, 0, 1]
	].map(v => new CANNON.Vec3(v[0] * scaleFactor, v[1] * scaleFactor, v[2] * scaleFactor))

	const faces = [
		[0, 11, 5],
		[0, 5, 1],
		[0, 1, 7],
		[0, 7, 10],
		[0, 10, 11],
		[1, 5, 9],
		[5, 11, 4],
		[11, 10, 2],
		[10, 7, 6],
		[7, 1, 8],
		[3, 9, 4],
		[3, 4, 2],
		[3, 2, 6],
		[3, 6, 8],
		[3, 8, 9],
		[4, 9, 5],
		[2, 4, 11],
		[6, 2, 10],
		[8, 6, 7],
		[9, 8, 1]
	]

	// Create a convex hull shape
	const shape = new CANNON.ConvexPolyhedron({
		vertices,
		faces
	})

	// Add shape to body
	body.addShape(shape)

	// Set physics properties
	body.collisionResponse = true
	body.collisionFilterGroup = 1
	body.collisionFilterMask = 1
	body.angularDamping = 0.3
	body.linearDamping = 0.3
	body.sleepSpeedLimit = 0.4
	body.sleepTimeLimit = 0.5
	body.allowSleep = true

	body.addEventListener('collide', onCollide)

	// Add to world
	world.addBody(body)

	return body
}

/**
 * Determines which face of a D20 die is facing up
 */
export function getD20DieValue(dice: Dice): number {
	// The face values of a D20 die, ordered according to the faces array
	// Standard D20 numbering where opposite faces sum to 21
	const faceValues = [20, 8, 14, 2, 11, 17, 5, 3, 16, 10, 19, 7, 13, 1, 12, 18, 6, 4, 15, 9]

	// Get the mesh's geometry
	const group = dice.mesh as THREE.Group
	// Find the first mesh in the group (which should be our main dice mesh)
	const diceMesh = group.children.find(child => child instanceof THREE.Mesh && child.geometry instanceof THREE.BufferGeometry) as THREE.Mesh

	if (!diceMesh || !diceMesh.geometry) {
		console.error('Could not find valid dice mesh with geometry')
		return 1 // Return 1 as a fallback value
	}

	const geometry = diceMesh.geometry as THREE.BufferGeometry

	// Get face normals
	const normalAttribute = geometry.getAttribute('normal')
	const faceNormals: THREE.Vector3[] = []

	// Collect unique face normals
	for (let i = 0; i < normalAttribute.count; i += 3) {
		const normal = new THREE.Vector3()
		normal.fromBufferAttribute(normalAttribute, i)

		// Only add unique face normals
		if (!faceNormals.some(fn => fn.equals(normal))) {
			faceNormals.push(normal)
		}
	}

	// Transform these normals to world space using the mesh's matrix
	const worldMatrix = diceMesh.matrixWorld
	const worldNormals = faceNormals.map(normal => normal.clone().applyMatrix4(new THREE.Matrix4().extractRotation(worldMatrix)).normalize())

	// Calculate how much each face normal is pointing up (dot product with up vector)
	const upVector = new THREE.Vector3(0, 1, 0)

	const facesUpAmount: FaceUpAmount[] = worldNormals.map((normal, index) => ({
		face: `face-${index}`,
		value: faceValues[index],
		amount: normal.dot(upVector)
	}))

	// Sort by how much they face up (highest first)
	facesUpAmount.sort((a, b) => b.amount - a.amount)

	// Return the value of the face most facing up
	return facesUpAmount[0].value
}

/**
 * D20 Dice implementation
 */
export default class D20Dice extends Dice {
	static name = 'D20'
	static icon = d20Icon

	constructor(material: DiceMaterial, size: number, quality: number, mass: number, world: CANNON.World, onCollide: (event: DiceCollisionEvent) => void) {
		super(material, size, quality, mass, world, onCollide)
	}

	public getResult(): number {
		return getD20DieValue(this)
	}

	public formatResult(result: number | number[]): DiceResult {
		if (Array.isArray(result)) {
			const sum = result.reduce((acc, curr) => acc + curr, 0)
			return {
				value: sum,
				values: result,
				text: result.map(value => value.toString()).join(', '),
				color: result.every(value => value === 20) ? 'success' : result.every(value => value === 1) ? 'danger' : 'medium'
			}
		}
		return {
			value: result,
			values: [result],
			text: result.toString(),
			color: result === 20 ? 'success' : result === 1 ? 'danger' : 'medium'
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
		// We use the mass from the class instance rather than a constant
		return createDiceBody(world, this.size, this.mass, onCollide)
	}

	public clone(): Dice {
		const clonedDice = new D20Dice(this.material, this.size, this.quality, this.mass, this.world, this.onCollide)
		// Copy position and rotation from original dice
		clonedDice.body.position.copy(this.body.position)
		clonedDice.body.quaternion.copy(this.body.quaternion)
		clonedDice.mesh.position.copy(this.mesh.position as THREE.Vector3)
		clonedDice.mesh.quaternion.copy(this.mesh.quaternion as THREE.Quaternion)
		return clonedDice
	}
}
