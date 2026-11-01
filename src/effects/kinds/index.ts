/** Dispatch for the procedure files split out of the effect switch. */
import type { EffectCtx, EvalResult } from "../eval.js";
import type { Primitive } from "../ir.js";
import { applyAddKinds } from "./addKinds.js";
import { applyBreachKinds } from "./breachKinds.js";
import { applyChooseKinds } from "./chooseKinds.js";
import { applyDerezKinds } from "./derezKinds.js";
import { applyForbidKinds } from "./forbidKinds.js";
import { applyGainKinds } from "./gainKinds.js";
import { applyHostKinds } from "./hostKinds.js";
import { applyInstallKinds } from "./installKinds.js";
import { applyLookKinds } from "./lookKinds.js";
import { applyMoveKinds } from "./moveKinds.js";
import { applyOtherKinds } from "./otherKinds.js";
import { applyPayKinds } from "./payKinds.js";
import { applyPlaceKinds } from "./placeKinds.js";
import { applyPlayKinds } from "./playKinds.js";
import { applyRemoveKinds } from "./removeKinds.js";
import { applyResolveKinds } from "./resolveKinds.js";
import { applyReturnKinds } from "./returnKinds.js";
import { applyRevealKinds } from "./revealKinds.js";
import { applyRezKinds } from "./rezKinds.js";
import { applySearchKinds } from "./searchKinds.js";
import { applySetKinds } from "./setKinds.js";
import { applyShuffleKinds } from "./shuffleKinds.js";
import { applySwapKinds } from "./swapKinds.js";
import { applyTrashKinds } from "./trashKinds.js";

const HANDLERS = [
  applyAddKinds,
  applyBreachKinds,
  applyChooseKinds,
  applyDerezKinds,
  applyForbidKinds,
  applyGainKinds,
  applyHostKinds,
  applyInstallKinds,
  applyLookKinds,
  applyMoveKinds,
  applyOtherKinds,
  applyPayKinds,
  applyPlaceKinds,
  applyPlayKinds,
  applyRemoveKinds,
  applyResolveKinds,
  applyReturnKinds,
  applyRevealKinds,
  applyRezKinds,
  applySearchKinds,
  applySetKinds,
  applyShuffleKinds,
  applySwapKinds,
  applyTrashKinds,
] as const;

export function applyCoreKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  for (const handle of HANDLERS) {
    const result = handle(ctx, action);
    if (result) return result;
  }
  return null;
}
