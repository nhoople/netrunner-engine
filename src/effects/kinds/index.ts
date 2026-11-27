/** Dispatch for the procedure files split out of the effect switch. */
import type { EffectCtx, EvalResult } from "../eval.js";
import type { Primitive } from "../ir.js";
import { applyAddKinds } from "./addKinds.js";
import { applyBreachKinds } from "../access/breachKinds.js";
import { applyChooseKinds } from "../triggers/chooseKinds.js";
import { applyDerezKinds } from "../rez/derezKinds.js";
import { applyForbidKinds } from "../continuous/forbidKinds.js";
import { applyGainKinds } from "./gainKinds.js";
import { applyHostKinds } from "./hostKinds.js";

import { applyLookKinds } from "../visibility/lookKinds.js";
import { applyMoveKinds } from "./moveKinds.js";
import { applyOtherKinds } from "./otherKinds.js";
import { applyPayKinds } from "./payKinds.js";
import { applyPlaceKinds } from "./placeKinds.js";
import { applyPlayKinds } from "./playKinds.js";
import { applyRemoveKinds } from "./removeKinds.js";
import { applyResolveKinds } from "../triggers/resolveKinds.js";
import { applyReturnKinds } from "./returnKinds.js";
import { applyRevealKinds } from "../visibility/revealKinds.js";
import { applyRezKinds } from "../rez/rezKinds.js";
import { applySearchKinds } from "./searchKinds.js";
import { applySetKinds } from "./setKinds.js";
import { applyShuffleKinds } from "./shuffleKinds.js";
import { applySwapKinds } from "../swap/swapKinds.js";
import { applyTrashKinds } from "./trashKinds.js";
import {
  applyContinuousKinds,
  applyContinuousKindsWhenSourceExists,
} from "../continuous/continuousKinds.js";
import { applyAccessKinds } from "../access/accessKinds.js";
import { applyRezKindsWhenSourceExists } from "../rez/rezKinds.js";
import { applySwapKindsWhenSourceExists } from "../swap/swapKinds.js";
import {
  applyVisibilityKinds,
  applyVisibilityKindsWhenSourceExists,
} from "../visibility/visibilityKinds.js";
import { applyCorpInstallFromHqKinds } from "../install/corpInstallFromHqKinds.js";
import {
  applyCorpInstallFromArchivesAndRdKinds,
  applyCorpInstallFromArchivesAndRdKindsWhenSourceExists,
} from "../install/corpInstallFromArchivesAndRdKinds.js";
import {
  applyRunnerInstallFromOtherZonesKinds,
  applyRunnerInstallFromOtherZonesKindsWhenSourceExists,
} from "../install/runnerInstallFromOtherZonesKinds.js";
import { applyCorpIceInstallKinds } from "../install/corpIceInstallKinds.js";
import {
  applyCorpInstallThenRezOrAdvanceKinds,
  applyCorpInstallThenRezOrAdvanceKindsWhenSourceExists,
} from "../install/corpInstallThenRezOrAdvanceKinds.js";
import {
  applyRunnerInstallFromGripKinds,
  applyRunnerInstallFromGripKindsWhenSourceExists,
} from "../install/runnerInstallFromGripKinds.js";

const HANDLERS = [
  applyAddKinds,
  applyBreachKinds,
  applyChooseKinds,
  applyDerezKinds,
  applyForbidKinds,
  applyGainKinds,
  applyHostKinds,
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
  applyContinuousKinds,
  applyContinuousKindsWhenSourceExists,
  applyAccessKinds,
  applyRezKindsWhenSourceExists,
  applySwapKindsWhenSourceExists,
  applyVisibilityKinds,
  applyVisibilityKindsWhenSourceExists,
  applyCorpInstallFromHqKinds,
  applyCorpInstallFromArchivesAndRdKinds,
  applyCorpInstallFromArchivesAndRdKindsWhenSourceExists,
  applyRunnerInstallFromOtherZonesKinds,
  applyRunnerInstallFromOtherZonesKindsWhenSourceExists,
  applyCorpIceInstallKinds,
  applyCorpInstallThenRezOrAdvanceKinds,
  applyCorpInstallThenRezOrAdvanceKindsWhenSourceExists,
  applyRunnerInstallFromGripKinds,
  applyRunnerInstallFromGripKindsWhenSourceExists,
] as const;

export function applyCoreKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  for (const handle of HANDLERS) {
    const result = handle(ctx, action);
    if (result) return result;
  }
  return null;
}
