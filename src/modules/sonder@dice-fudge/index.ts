import manifest from './manifest.json'
import bundle from './bundle'
import { assembleMod } from '@/mods/assembleMod'

export default assembleMod(manifest, bundle)
