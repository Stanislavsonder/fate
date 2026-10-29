import { DiceMaterial } from '@fate-app/mod-types'
import * as THREE from 'three'

/** Registered by the host under the namespaced key `sonder@example-dice:Gold`. */
const goldMaterial = new DiceMaterial(
	'Gold',
	new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.35 }),
	new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
	'#d4af37'
)

export default goldMaterial
