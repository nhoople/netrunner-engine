export type { Cond, Effect, Primitive, SideRef } from "./ir.js";
export {
  fx,
  effectContains,
  validateEffectTree,
  KNOWN_PRIMITIVE_KINDS,
  KNOWN_EFFECT_OPS,
} from "./ir.js";
export {
  evalEffect,
  validatePaidEffect,
  type EffectCtx,
  type EvalResult,
} from "./eval.js";
