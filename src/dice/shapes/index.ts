// Single source of truth is @fate-app/mod-types (decision D7) — the app and
// external dice-capability mods both build against the exact same Dice base
// class / DiceConstructor type. Kept as a re-export so existing imports of
// '@/dice/shapes' throughout the app don't need to change.
export { Dice, type DiceConstructor, type DiceCollisionEvent } from '@fate-app/mod-types'
