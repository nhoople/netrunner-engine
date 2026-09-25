export type { Cond, Effect, Primitive, SideRef } from "./ir.js";
export { fx, effectContains } from "./ir.js";
export {
  evalEffect,
  validatePaidEffect,
  type EffectCtx,
  type EvalResult,
} from "./eval.js";
