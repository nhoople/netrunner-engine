/** Dispatch for the procedure files split out of the effect switch. */
import type { EffectCtx, EvalResult } from "../eval.js";
import type { Primitive } from "../ir.js";
import { applyAddKinds } from "../searchAndDeck/addKinds.js";
import { applyBreachKinds } from "../access/breachKinds.js";
import { applyChooseKinds } from "../triggers/chooseKinds.js";
import { applyDerezKinds } from "../rez/derezKinds.js";
import { applyForbidKinds } from "../continuous/forbidKinds.js";
import { applyGainKinds } from "../keywordsAndCredits/gainKinds.js";
import { applyHostKinds } from "../hostingAndTrash/hostKinds.js";

import { applyLookKinds } from "../visibility/lookKinds.js";
import { applyMoveKinds } from "../uninstallAndPosition/moveKinds.js";
import { applyOtherKinds } from "./otherKinds.js";
import { applyPayKinds } from "../keywordsAndCredits/payKinds.js";
import { applyPlaceKinds } from "../counters/placeKinds.js";
import { applyPlayKinds } from "./playKinds.js";
import { applyRemoveKinds } from "../counters/removeKinds.js";
import { applyResolveKinds } from "../triggers/resolveKinds.js";
import { applyReturnKinds } from "../uninstallAndPosition/returnKinds.js";
import { applyRevealKinds } from "../visibility/revealKinds.js";
import { applyRezKinds } from "../rez/rezKinds.js";
import { applySearchKinds } from "../searchAndDeck/searchKinds.js";
import { applySetKinds } from "../run/setKinds.js";
import { applyShuffleKinds } from "../searchAndDeck/shuffleKinds.js";
import { applySwapKinds } from "../swap/swapKinds.js";

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
import {
  applyHostedCardKinds,
  applyHostedCardKindsWhenSourceExists,
} from "../hostingAndTrash/hostedCardKinds.js";
import {
  applyCorpInstalledTrashKinds,
  applyCorpInstalledTrashKindsWhenSourceExists,
} from "../hostingAndTrash/corpInstalledTrashKinds.js";
import {
  applyRunnerHandAndDeckTrashKinds,
  applyRunnerHandAndDeckTrashKindsWhenSourceExists,
} from "../hostingAndTrash/runnerHandAndDeckTrashKinds.js";
import { applyCorpHandAndDeckTrashKinds } from "../hostingAndTrash/corpHandAndDeckTrashKinds.js";
import {
  applyRunnerInstalledTrashKinds,
  applyRunnerInstalledTrashKindsWhenSourceExists,
} from "../hostingAndTrash/runnerInstalledTrashKinds.js";
import { applyUninstallAndPositionKinds } from "../uninstallAndPosition/uninstallAndPositionKinds.js";
import {
  applyDamageAndPreventionKinds,
  applyDamageAndPreventionKindsWhenSourceExists,
} from "../damageAndPrevention/damageAndPreventionKinds.js";
import {
  applyCounterKinds,
  applyCounterKindsWhenSourceExists,
} from "../counters/counterKinds.js";
import {
  applyDeckOrderKinds,
  applyDeckOrderKindsWhenSourceExists,
} from "../searchAndDeck/deckOrderKinds.js";
import { applyArchivesAndHeapRetrievalKinds } from "../searchAndDeck/archivesAndHeapRetrievalKinds.js";
import {
  applySearchAndShuffleKinds,
  applySearchAndShuffleKindsWhenSourceExists,
} from "../searchAndDeck/searchAndShuffleKinds.js";
import {
  applyRunKinds,
  applyRunKindsWhenSourceExists,
} from "../run/runKinds.js";
import {
  applyKeywordAndCreditKinds,
  applyKeywordAndCreditKindsWhenSourceExists,
} from "../keywordsAndCredits/keywordAndCreditKinds.js";

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
  applyHostedCardKinds,
  applyHostedCardKindsWhenSourceExists,
  applyCorpInstalledTrashKinds,
  applyCorpInstalledTrashKindsWhenSourceExists,
  applyRunnerHandAndDeckTrashKinds,
  applyRunnerHandAndDeckTrashKindsWhenSourceExists,
  applyCorpHandAndDeckTrashKinds,
  applyRunnerInstalledTrashKinds,
  applyRunnerInstalledTrashKindsWhenSourceExists,
  applyUninstallAndPositionKinds,
  applyDamageAndPreventionKinds,
  applyDamageAndPreventionKindsWhenSourceExists,
  applyCounterKinds,
  applyCounterKindsWhenSourceExists,
  applyDeckOrderKinds,
  applyDeckOrderKindsWhenSourceExists,
  applyArchivesAndHeapRetrievalKinds,
  applySearchAndShuffleKinds,
  applySearchAndShuffleKindsWhenSourceExists,
  applyRunKinds,
  applyRunKindsWhenSourceExists,
  applyKeywordAndCreditKinds,
  applyKeywordAndCreditKindsWhenSourceExists,
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
