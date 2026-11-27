/**
 * Minimal effect IR for card data / stubs.
 * Hand-authored AST — not a CR / nodes.json compiler.
 * A printed ability is classified under CR 9.3 before it is written
 * (`abilityRecord.ts`). The effect tree is the instructions.
 *
 * Shape: seq | do | if | prevent | choose
 * Unknown IR nodes fail closed at load/eval time.
 */

/*
 * This file is a pointer: the IR lives in `./ir/`, split by kind family
 * (`ir/<family>Primitive.ts`, matching `kinds/<family>Kinds.ts`).
 * New code can import from there; this file keeps the old import path working.
 */

export type { SideRef, CreditTally, PumpDuration } from "./ir/shared.js";
export type { Primitive } from "./ir/primitive.js";
export type { Cond } from "./ir/cond.js";
export type { ChoiceOption, Effect } from "./ir/effect.js";
export { KNOWN_PRIMITIVE_KINDS } from "./ir/knownKinds.js";
export { fx } from "./ir/fx.js";
export {
  effectContains,
  validateCond,
  validateEffectTree,
} from "./ir/validate.js";
