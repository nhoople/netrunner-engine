/**
 * Load and validate card definitions from vendored `vendor/cards-data/`
 * (fetched via `npm run fetch-cards` from the pinned netrunner-cards-data tag).
 * Fail closed on unknown Effect IR nodes.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyAbilityRecords,
  canonicalizeAbilityFlags,
  type AbilityFlagValue,
} from "../effects/abilityRecord.js";
import { validateEffectTree } from "../effects/ir/validate.js";
import type { CardInstance } from "../state/types/card.js";
import type { CardDef } from "./cardDef.js";
import { instantiateCard } from "./instantiateCard.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const cardsDir = join(root, "vendor/cards-data");
const cardsPinPath = join(root, "data/cards-pin.json");

export interface CardsPin {
  tag: string;
  repo: string;
  rawBase: string;
  archiveUrl?: string;
  required?: string[];
}

export function loadCardsPin(): CardsPin {
  return JSON.parse(readFileSync(cardsPinPath, "utf8")) as CardsPin;
}

/** True when pin-required paths exist under vendor/cards-data/. */
export function cardsDataPresent(): boolean {
  if (!existsSync(join(cardsDir, "pool.json"))) return false;
  const pin = loadCardsPin();
  return (pin.required ?? ["pool.json"]).every((rel) =>
    existsSync(join(cardsDir, rel)),
  );
}

export function assertCardsDataPresent(): void {
  if (cardsDataPresent()) return;
  const pin = loadCardsPin();
  throw new Error(
    `Missing vendored card data under vendor/cards-data/. Run: npm run fetch-cards (pins ${pin.tag})`,
  );
}

export function assertCardsPinnedTag(expected = "v1.75.0"): void {
  const pin = loadCardsPin();
  if (pin.tag !== expected) {
    throw new Error(`Expected cards pin ${expected}, found ${pin.tag}`);
  }
  const vendorPinPath = join(cardsDir, "PIN.json");
  if (existsSync(vendorPinPath)) {
    const vendor = JSON.parse(readFileSync(vendorPinPath, "utf8")) as {
      tag: string;
    };
    if (vendor.tag !== expected) {
      throw new Error(`Vendor cards PIN.json tag ${vendor.tag} != ${expected}`);
    }
  }
}

/**
 * Pack names in corpus order. Pool membership lives in pool.json.
 * Card files are loaded from CARD_STORAGE_DIRS, not from these pack names.
 */
export const CARD_WAVE_DIRS = [
  "core",
  "what-lies-ahead",
  "trace-amount",
  "cyber-exodus",
  "a-study-in-static",
  "humanitys-shadow",
  "future-proof",
  "creation-and-control",
  "opening-moves",
  "stalwart",
  "mala-tempora",
  "true-colors",
  "fear-and-loathing",
  "double-time",
  "honor-and-profit",
  "upstalk",
  "the-spaces-between",
  "first-contact",
  "up-and-over",
  "all-that-remains",
  "the-source",
  "order-and-chaos",
  "the-valley",
  "breaker-bay",
  "chrome-city",
  "the-underway",
  "old-hollywood",
  "the-universe-of-tomorrow",
  "data-and-destiny",
  "kala-ghoda",
  "business-first",
  "democracy-and-dogma",
  "salsette-island",
  "the-liberated-mind",
  "fear-the-masses",
  "twenty-three-seconds",
  "blood-money",
  "escalation",
  "intervention",
  "martial-law",
  "quorum",
  "daedalus-complex",
  "station-one",
  "terminal-directive",
  "earths-scion",
  "blood-and-water",
  "free-mars",
  "crimson-dust",
  "revised-core",
  "sovereign-sight",
  "down-the-white-nile",
  "council-of-the-crest",
  "the-devil-and-the-dragon",
  "whispers-in-nalubaale",
  "kampala-ascendent",
  "reign-and-reverie",
  "magnum-opus",
  "system-core-2019",
  "downfall",
  "uprising",
  "system-gateway",
  "system-update-2021",
  "midnight-sun",
  "parhelion",
  "the-automata-initiative",
  "rebellion-without-rehearsal",
  "elevation",
  "vantage-point",
] as const;

/** Card JSON directories: data/<side>/<type>/<id>.json. */
export const CARD_STORAGE_DIRS = [
  "corp/identity",
  "corp/agenda",
  "corp/asset",
  "corp/ice",
  "corp/operation",
  "corp/upgrade",
  "runner/identity",
  "runner/event",
  "runner/hardware",
  "runner/program",
  "runner/resource",
] as const;

export interface CardPool {
  version: number;
  description: string;
  agendaPointsToWinDefault: number;
  corpusOrder?: string[];
  waves: Record<string, { status: string; notes?: string; cards: string[] }>;
}

let catalogCache: Map<string, CardDef> | null = null;
let poolCache: CardPool | null = null;

function validateCardShape(raw: unknown, path: string): CardDef {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${path}: card must be an object`);
  }
  const c = raw as Record<string, unknown>;
  const abilityErr = applyAbilityRecords(c, path);
  if (abilityErr) throw new Error(abilityErr);
  for (const key of ["id", "title", "type", "side"] as const) {
    if (typeof c[key] !== "string") {
      throw new Error(`${path}: missing/invalid ${key}`);
    }
  }
  const checkEffect = (effect: unknown, label: string) => {
    if (effect === undefined) return;
    const err = validateEffectTree(effect, `${path}.${label}`);
    if (err) throw new Error(err);
  };
  if (Array.isArray(c.subroutines)) {
    for (let i = 0; i < c.subroutines.length; i++) {
      const sub = c.subroutines[i] as { effect?: unknown };
      checkEffect(sub.effect, `subroutines[${i}].effect`);
    }
  }
  if (Array.isArray(c.paidAbilities)) {
    for (let i = 0; i < c.paidAbilities.length; i++) {
      const ab = c.paidAbilities[i] as {
        effect?: unknown;
        startsRun?: { onSuccessfulRun?: unknown; onRunEnd?: unknown };
        flag?: AbilityFlagValue;
        oncePerTurn?: boolean;
        requiresThreat?: number;
      };
      canonicalizeAbilityFlags(ab);
      checkEffect(ab.effect, `paidAbilities[${i}].effect`);
      if (ab.startsRun?.onSuccessfulRun) {
        checkEffect(
          ab.startsRun.onSuccessfulRun,
          `paidAbilities[${i}].startsRun.onSuccessfulRun`,
        );
      }
      if (ab.startsRun?.onRunEnd) {
        checkEffect(
          ab.startsRun.onRunEnd,
          `paidAbilities[${i}].startsRun.onRunEnd`,
        );
      }
    }
  }
  if (c.runEvent && typeof c.runEvent === "object") {
    const re = c.runEvent as {
      onSuccessfulRun?: unknown;
      onRunEnd?: unknown;
      onFirstEncounterThisRun?: unknown;
    };
    checkEffect(re.onSuccessfulRun, "runEvent.onSuccessfulRun");
    checkEffect(re.onRunEnd, "runEvent.onRunEnd");
    checkEffect(re.onFirstEncounterThisRun, "runEvent.onFirstEncounterThisRun");
  }
  checkEffect(
    c.onInstallWithoutSpendingCredits,
    "onInstallWithoutSpendingCredits",
  );
  checkEffect(c.onAccessFaceupInstalledAgenda, "onAccessFaceupInstalledAgenda");
  checkEffect(c.onCorpTurnEnd, "onCorpTurnEnd");
  checkEffect(c.onDiscardPhaseEnd, "onDiscardPhaseEnd");
  checkEffect(c.onWouldDrawOncePerTurn, "onWouldDrawOncePerTurn");
  checkEffect(
    c.onFirstTrashMatchingRunnerIdentityFactionEachTurn,
    "onFirstTrashMatchingRunnerIdentityFactionEachTurn",
  );
  checkEffect(c.onFirstRevealEachTurn, "onFirstRevealEachTurn");
  checkEffect(
    c.mirrormorphOnThirdDistinctAction,
    "mirrormorphOnThirdDistinctAction",
  );
  checkEffect(c.onCorpActionPhaseEnd, "onCorpActionPhaseEnd");
  checkEffect(c.onRunnerActionPhaseEnd, "onRunnerActionPhaseEnd");
  checkEffect(c.onAnyIceRez, "onAnyIceRez");
  checkEffect(
    c.onRunnerTrashFromThisServerRootOrProtecting,
    "onRunnerTrashFromThisServerRootOrProtecting",
  );
  checkEffect(
    c.onEncounterEndIfPrintedSubroutineBroken,
    "onEncounterEndIfPrintedSubroutineBroken",
  );
  checkEffect(c.onRezIceProtectingThisServer, "onRezIceProtectingThisServer");
  checkEffect(c.afterMandatoryDraw, "afterMandatoryDraw");
  checkEffect(c.onFirstEmptyGripEachTurn, "onFirstEmptyGripEachTurn");
  checkEffect(
    c.onFirstAgendaScoredOrStolenThisTurn,
    "onFirstAgendaScoredOrStolenThisTurn",
  );
  checkEffect(c.onRunBegin, "onRunBegin");
  checkEffect(c.onMovedToServerRoot, "onMovedToServerRoot");
  checkEffect(c.onRez, "onRez");
  checkEffect(c.onPlay, "onPlay");
  checkEffect(c.playAdditionalCost, "playAdditionalCost");
  checkEffect(c.onScore, "onScore");
  checkEffect(
    c.onGrayOrBlackOpsTrashedAfterResolve,
    "onGrayOrBlackOpsTrashedAfterResolve",
  );
  checkEffect(c.onPassAllIceProtectingServer, "onPassAllIceProtectingServer");
  checkEffect(c.onSuccessfulRunThisServer, "onSuccessfulRunThisServer");
  checkEffect(c.onWouldTakeBadPublicity, "onWouldTakeBadPublicity");
  checkEffect(c.onForfeit, "onForfeit");
  checkEffect(c.scoreAdditionalCost, "scoreAdditionalCost");
  checkEffect(c.stealAdditionalCost, "stealAdditionalCost");
  checkEffect(c.trashAdditionalCost, "trashAdditionalCost");
  checkEffect(
    c.stealAdditionalCostFromProtectingServer,
    "stealAdditionalCostFromProtectingServer",
  );
  checkEffect(c.onSteal, "onSteal");
  checkEffect(c.onAgendaStolen, "onAgendaStolen");
  checkEffect(
    c.onPassRezzedIceProtectingThisServer,
    "onPassRezzedIceProtectingThisServer",
  );
  checkEffect(c.onOtherAgendaStolen, "onOtherAgendaStolen");
  checkEffect(c.onFullyBreakOncePerTurn, "onFullyBreakOncePerTurn");
  checkEffect(c.onFullyBreak, "onFullyBreak");
  checkEffect(
    c.onSuccessfulRunOtherServerOncePerTurn,
    "onSuccessfulRunOtherServerOncePerTurn",
  );
  checkEffect(c.onSuccessfulRunEndOncePerTurn, "onSuccessfulRunEndOncePerTurn");
  checkEffect(c.onSuccessfulRunEnd, "onSuccessfulRunEnd");
  checkEffect(
    c.onSpendCreditsOutsidePoolDuringRunOncePerTurn,
    "onSpendCreditsOutsidePoolDuringRunOncePerTurn",
  );
  checkEffect(
    c.onFirstBadPublicityTakeEachTurn,
    "onFirstBadPublicityTakeEachTurn",
  );
  if (c.onArchivesFacedownTurnedFaceupGte) {
    checkEffect(
      (c.onArchivesFacedownTurnedFaceupGte as { effect?: unknown }).effect,
      "onArchivesFacedownTurnedFaceupGte.effect",
    );
  }
  if (
    c.firstEncounterGainsSubroutine &&
    typeof c.firstEncounterGainsSubroutine === "object"
  ) {
    const syn = c.firstEncounterGainsSubroutine as {
      effect?: unknown;
    };
    checkEffect(syn.effect, "firstEncounterGainsSubroutine.effect");
  }
  checkEffect(c.onEncounter, "onEncounter");
  checkEffect(c.onPass, "onPass");
  checkEffect(c.onBypass, "onBypass");
  checkEffect(c.onFirstProgramInstallEachTurn, "onFirstProgramInstallEachTurn");
  checkEffect(
    c.onFirstHardwareInstallEachTurn,
    "onFirstHardwareInstallEachTurn",
  );
  checkEffect(c.onFirstEncounterEachRun, "onFirstEncounterEachRun");
  checkEffect(c.onFirstCorpCardTrashEachTurn, "onFirstCorpCardTrashEachTurn");
  checkEffect(
    c.onFirstInstalledCorpCardTrashEachTurn,
    "onFirstInstalledCorpCardTrashEachTurn",
  );
  checkEffect(
    c.onFirstRunnerStoleOrTrashedCorpCardThisTurn,
    "onFirstRunnerStoleOrTrashedCorpCardThisTurn",
  );
  checkEffect(c.onAccessTrash, "onAccessTrash");
  checkEffect(
    c.onFirstCorpRootInstallEachTurn,
    "onFirstCorpRootInstallEachTurn",
  );
  checkEffect(c.onPassHost, "onPassHost");
  checkEffect(c.rezAdditionalCost, "rezAdditionalCost");
  checkEffect(c.onHostRezzed, "onHostRezzed");
  checkEffect(c.onHostDerezzed, "onHostDerezzed");
  checkEffect(c.onHostEncounter, "onHostEncounter");
  checkEffect(c.onApproachServer, "onApproachServer");
  checkEffect(
    c.onRunDeclaredOnThisServerIfTagged,
    "onRunDeclaredOnThisServerIfTagged",
  );
  checkEffect(c.onApproachIce, "onApproachIce");
  const flippedHooks =
    c.identityFlippedHooks as CardDef["identityFlippedHooks"];
  if (flippedHooks?.onFirstOperationPlayThisTurn) {
    checkEffect(
      flippedHooks.onFirstOperationPlayThisTurn,
      "identityFlippedHooks.onFirstOperationPlayThisTurn",
    );
  }
  if (flippedHooks?.onSuccessfulHqOrRdRun) {
    checkEffect(
      flippedHooks.onSuccessfulHqOrRdRun,
      "identityFlippedHooks.onSuccessfulHqOrRdRun",
    );
  }
  if (flippedHooks?.onSuccessfulHqRun) {
    checkEffect(
      flippedHooks.onSuccessfulHqRun,
      "identityFlippedHooks.onSuccessfulHqRun",
    );
  }
  checkEffect(
    c.onFirstHardwareUseDuringRunEachTurn,
    "onFirstHardwareUseDuringRunEachTurn",
  );
  checkEffect(
    c.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun,
    "onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun",
  );
  if (flippedHooks?.onFlipToBackIfRunMatchesFace) {
    checkEffect(
      flippedHooks.onFlipToBackIfRunMatchesFace,
      "identityFlippedHooks.onFlipToBackIfRunMatchesFace",
    );
  }
  if (flippedHooks?.onRunnerDiscardPhaseEnd) {
    checkEffect(
      flippedHooks.onRunnerDiscardPhaseEnd,
      "identityFlippedHooks.onRunnerDiscardPhaseEnd",
    );
  }
  checkEffect(
    c.additionalCostOnScoreAgendaInstalledThisTurn,
    "additionalCostOnScoreAgendaInstalledThisTurn",
  );
  if (
    c.hostsUniqueCompanionOrConnectionResources &&
    typeof c.hostsUniqueCompanionOrConnectionResources === "object"
  ) {
    const h = c.hostsUniqueCompanionOrConnectionResources as {
      creditDiscount?: unknown;
    };
    if (typeof h.creditDiscount !== "number" || h.creditDiscount < 0) {
      throw new Error(
        `${path}.hostsUniqueCompanionOrConnectionResources.creditDiscount must be a non-negative number`,
      );
    }
  }
  checkEffect(
    c.onCreditsGainedFromAgendaOrOperationAbility,
    "onCreditsGainedFromAgendaOrOperationAbility",
  );
  checkEffect(c.onRunnerDiscardOverMaxHand, "onRunnerDiscardOverMaxHand");
  checkEffect(c.onTurnBegin, "onTurnBegin");
  checkEffect(c.onCorpTurnBegin, "onCorpTurnBegin");
  checkEffect(c.onGameStart, "onGameStart");
  checkEffect(c.onInstall, "onInstall");
  checkEffect(c.onUninstall, "onUninstall");
  checkEffect(c.onInstallFromNonHq, "onInstallFromNonHq");
  checkEffect(c.onRemoveTags, "onRemoveTags");
  checkEffect(
    c.onFirstAvoidOrRemoveTagThisTurn,
    "onFirstAvoidOrRemoveTagThisTurn",
  );
  checkEffect(c.onAgendaScoredFromThisServer, "onAgendaScoredFromThisServer");
  checkEffect(
    c.onFirstSuccessfulRunOnRdEndsThisTurn,
    "onFirstSuccessfulRunOnRdEndsThisTurn",
  );
  checkEffect(
    c.onFirstProgramOrHardwareTrashEachTurn,
    "onFirstProgramOrHardwareTrashEachTurn",
  );
  checkEffect(c.onFirstAccessTrashEachTurn, "onFirstAccessTrashEachTurn");
  checkEffect(c.onRunnerTurnEnd, "onRunnerTurnEnd");
  checkEffect(c.onFirstIceRezEachTurn, "onFirstIceRezEachTurn");
  checkEffect(c.onSuccessfulRunOnThisServer, "onSuccessfulRunOnThisServer");
  checkEffect(c.onRunnerTurnBegin, "onRunnerTurnBegin");
  checkEffect(c.onEachCorpBadPublicityTake, "onEachCorpBadPublicityTake");
  checkEffect(
    c.onCorpTurnBeginIfRunnerUntagged,
    "onCorpTurnBeginIfRunnerUntagged",
  );
  checkEffect(
    c.onTurnBeginIfCorpNoBadPublicity,
    "onTurnBeginIfCorpNoBadPublicity",
  );
  checkEffect(c.onPowerCountersEmpty, "onPowerCountersEmpty");
  checkEffect(c.onPassUnrezzedIce, "onPassUnrezzedIce");
  checkEffect(
    c.onCorpBasicClickForCreditOrDraw,
    "onCorpBasicClickForCreditOrDraw",
  );
  checkEffect(
    c.onFirstGripOrStackTrashBatchEachTurn,
    "onFirstGripOrStackTrashBatchEachTurn",
  );
  checkEffect(
    c.onFirstResourcePaidAbilityEachTurn,
    "onFirstResourcePaidAbilityEachTurn",
  );
  checkEffect(c.onSuccessfulRun, "onSuccessfulRun");
  checkEffect(c.onSuccessfulRunOnRd, "onSuccessfulRunOnRd");
  checkEffect(c.onSuccessfulTraceDuringRun, "onSuccessfulTraceDuringRun");
  checkEffect(c.onBreakSubroutine, "onBreakSubroutine");
  if (
    c.onBreakSubroutineMayPayCreditsBreakAnother &&
    typeof c.onBreakSubroutineMayPayCreditsBreakAnother === "object"
  ) {
    const m = c.onBreakSubroutineMayPayCreditsBreakAnother as {
      credits?: unknown;
    };
    if (typeof m.credits !== "number" || m.credits < 0) {
      throw new Error(
        `${path}: onBreakSubroutineMayPayCreditsBreakAnother.credits must be a non-negative number`,
      );
    }
  }
  if (
    c.strengthBonusOnBreakSubForRun !== undefined &&
    typeof c.strengthBonusOnBreakSubForRun !== "number"
  ) {
    throw new Error(`${path}: strengthBonusOnBreakSubForRun must be a number`);
  }
  if (
    c.installedCardsTrashCostBonus !== undefined &&
    (typeof c.installedCardsTrashCostBonus !== "number" ||
      c.installedCardsTrashCostBonus < 0)
  ) {
    throw new Error(
      `${path}: installedCardsTrashCostBonus must be a non-negative number`,
    );
  }
  if (
    c.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount !== undefined &&
    (typeof c.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount !==
      "number" ||
      c.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount < 0)
  ) {
    throw new Error(
      `${path}: mayImmediatelyRezIceOnInstallProtectingThisServerDiscount must be a non-negative number`,
    );
  }
  checkEffect(c.onAccess, "onAccess");
  checkEffect(c.onTrash, "onTrash");
  checkEffect(c.onTrashWhileAccessed, "onTrashWhileAccessed");
  checkEffect(c.onTrashFromGripOrStack, "onTrashFromGripOrStack");
  checkEffect(c.onVirusPurge, "onVirusPurge");
  checkEffect(c.onBreachHqIfHostingCorpCard, "onBreachHqIfHostingCorpCard");
  checkEffect(c.onBreachRd, "onBreachRd");
  if (
    c.accessHostNonAgendaFaceup &&
    typeof c.accessHostNonAgendaFaceup === "object"
  ) {
    const ah = c.accessHostNonAgendaFaceup as { creditCost?: unknown };
    if (typeof ah.creditCost !== "number" || ah.creditCost < 0) {
      throw new Error(
        `${path}.accessHostNonAgendaFaceup.creditCost must be a non-negative number`,
      );
    }
  }
  if (
    c.maxHostedCards !== undefined &&
    (typeof c.maxHostedCards !== "number" || c.maxHostedCards < 1)
  ) {
    throw new Error(`${path}.maxHostedCards must be a positive number`);
  }
  if (
    c.onWouldAccessArchivesHostInstead &&
    typeof c.onWouldAccessArchivesHostInstead === "object"
  ) {
    const w = c.onWouldAccessArchivesHostInstead as {
      oncePerArchivesBreach?: unknown;
    };
    if (
      w.oncePerArchivesBreach !== undefined &&
      typeof w.oncePerArchivesBreach !== "boolean"
    ) {
      throw new Error(
        `${path}.onWouldAccessArchivesHostInstead.oncePerArchivesBreach must be boolean`,
      );
    }
  }
  checkEffect(c.onRezzedCardTrashed, "onRezzedCardTrashed");
  checkEffect(c.onFirstTagThisTurn, "onFirstTagThisTurn");
  checkEffect(c.onTakeTagsWhenUntagged, "onTakeTagsWhenUntagged");
  checkEffect(
    c.onEncounterEndIfRezzedThisTurn,
    "onEncounterEndIfRezzedThisTurn",
  );
  checkEffect(c.onEncounterEnd, "onEncounterEnd");
  checkEffect(c.onAfterOperationOrExpendable, "onAfterOperationOrExpendable");
  checkEffect(
    c.onFirstPassRezzedCodeGateOrSentryThisTurn,
    "onFirstPassRezzedCodeGateOrSentryThisTurn",
  );
  checkEffect(c.onFirstCoreDamageThisTurn, "onFirstCoreDamageThisTurn");
  checkEffect(c.onInstallProgramFromHeap, "onInstallProgramFromHeap");
  checkEffect(c.onSufferCoreDamage, "onSufferCoreDamage");
  checkEffect(
    c.onHostFullyBrokenThisEncounter,
    "onHostFullyBrokenThisEncounter",
  );
  checkEffect(c.onFirstRdRunBeginThisTurn, "onFirstRdRunBeginThisTurn");
  checkEffect(
    c.onFirstArchivesRunBeginThisTurn,
    "onFirstArchivesRunBeginThisTurn",
  );
  checkEffect(c.onFirstRunBeginThisTurn, "onFirstRunBeginThisTurn");
  checkEffect(c.onFinishAccessRdOncePerTurn, "onFinishAccessRdOncePerTurn");
  checkEffect(c.onEncounterAnyIceOncePerTurn, "onEncounterAnyIceOncePerTurn");
  checkEffect(c.onUnsuccessfulRunOnThisServer, "onUnsuccessfulRunOnThisServer");
  checkEffect(c.onTurnBeginIfRunnerTagged, "onTurnBeginIfRunnerTagged");
  checkEffect(c.onFirstPassIceEachTurn, "onFirstPassIceEachTurn");
  checkEffect(c.onAdvance, "onAdvance");
  checkEffect(c.onStealAgenda, "onStealAgenda");
  checkEffect(c.onFirstRemoteInstallThisTurn, "onFirstRemoteInstallThisTurn");
  checkEffect(c.onFirstVirusInstallThisTurn, "onFirstVirusInstallThisTurn");
  checkEffect(c.onVirusProgramInstall, "onVirusProgramInstall");
  checkEffect(
    c.onFirstCorpCardInstallEachTurn,
    "onFirstCorpCardInstallEachTurn",
  );
  if (
    c.remainderOfTurnOnInstallPrintedCostGte &&
    typeof c.remainderOfTurnOnInstallPrintedCostGte === "object"
  ) {
    const rem = c.remainderOfTurnOnInstallPrintedCostGte as {
      min?: unknown;
      effect?: unknown;
    };
    if (typeof rem.min !== "number" || rem.min < 1) {
      throw new Error(
        `${path}.remainderOfTurnOnInstallPrintedCostGte.min must be ≥ 1`,
      );
    }
    checkEffect(rem.effect, "remainderOfTurnOnInstallPrintedCostGte.effect");
  }
  checkEffect(
    c.onFirstSuccessfulMarkRunThisTurn,
    "onFirstSuccessfulMarkRunThisTurn",
  );
  checkEffect(
    c.onFirstSuccessfulHqRunThisTurn,
    "onFirstSuccessfulHqRunThisTurn",
  );
  checkEffect(
    c.onFirstSuccessfulHqOrRdRunThisTurn,
    "onFirstSuccessfulHqOrRdRunThisTurn",
  );
  checkEffect(
    c.onEncounterEndIfNotFullyBroken,
    "onEncounterEndIfNotFullyBroken",
  );
  checkEffect(c.onEncounterEndIfBroke, "onEncounterEndIfBroke");
  checkEffect(
    c.onFirstSuccessfulCentralRunThisTurn,
    "onFirstSuccessfulCentralRunThisTurn",
  );
  checkEffect(c.onFirstSuccessfulRunThisTurn, "onFirstSuccessfulRunThisTurn");
  checkEffect(
    c.onFirstUnsuccessfulRunThisTurn,
    "onFirstUnsuccessfulRunThisTurn",
  );
  checkEffect(c.onFirstInstallEachTurn, "onFirstInstallEachTurn");
  checkEffect(
    c.onFirstClickLossEachTurnExceptPaidAbility,
    "onFirstClickLossEachTurnExceptPaidAbility",
  );
  checkEffect(c.onFirstDamageEachTurn, "onFirstDamageEachTurn");
  checkEffect(c.onFirstBasicClickDrawEachTurn, "onFirstBasicClickDrawEachTurn");
  checkEffect(c.onFullyBreakProtectingIce, "onFullyBreakProtectingIce");
  if (Array.isArray(c.identityFaceOptions)) {
    for (let i = 0; i < c.identityFaceOptions.length; i++) {
      const face = c.identityFaceOptions[i] as { onFlip?: unknown };
      checkEffect(face.onFlip, `identityFaceOptions[${i}].onFlip`);
    }
  }
  if (c.identityFaces !== undefined) {
    if (!Array.isArray(c.identityFaces) || c.identityFaces.length < 2) {
      throw new Error(
        `${path}: identityFaces must list at least two faces (CR 3.1.1a)`,
      );
    }
    for (let i = 0; i < c.identityFaces.length; i++) {
      const face = c.identityFaces[i] as {
        title?: unknown;
        subtypes?: unknown;
        link?: unknown;
      };
      if (typeof face?.title !== "string" || !face.title) {
        throw new Error(
          `${path}: identityFaces[${i}].title must be a non-empty string`,
        );
      }
      if (
        !Array.isArray(face?.subtypes) ||
        !face.subtypes.every((name) => typeof name === "string")
      ) {
        throw new Error(
          `${path}: identityFaces[${i}].subtypes must be strings`,
        );
      }
      if (
        face?.link !== undefined &&
        (typeof face.link !== "number" || face.link < 0)
      ) {
        throw new Error(
          `${path}: identityFaces[${i}].link must be a number >= 0`,
        );
      }
    }
  }
  if (
    c.loseCreditsOnFirstAdvertisementRezThisTurn !== undefined &&
    (typeof c.loseCreditsOnFirstAdvertisementRezThisTurn !== "number" ||
      c.loseCreditsOnFirstAdvertisementRezThisTurn < 1)
  ) {
    throw new Error(
      `${path}.loseCreditsOnFirstAdvertisementRezThisTurn must be a positive number`,
    );
  }
  checkEffect(c.onProgramOrHardwareInstall, "onProgramOrHardwareInstall");
  checkEffect(c.onHardwareInstallOrTrash, "onHardwareInstallOrTrash");
  checkEffect(c.onHardwareInstall, "onHardwareInstall");
  if (c.onPowerCountersGte && typeof c.onPowerCountersGte === "object") {
    const gte = c.onPowerCountersGte as {
      amount?: unknown;
      effect?: unknown;
    };
    if (typeof gte.amount !== "number" || gte.amount < 0) {
      throw new Error(
        `${path}.onPowerCountersGte.amount must be a non-negative number`,
      );
    }
    checkEffect(gte.effect, "onPowerCountersGte.effect");
  }
  if (c.onHostedCreditsGte && typeof c.onHostedCreditsGte === "object") {
    const gte = c.onHostedCreditsGte as {
      amount?: unknown;
      effect?: unknown;
    };
    if (typeof gte.amount !== "number" || gte.amount < 0) {
      throw new Error(
        `${path}.onHostedCreditsGte.amount must be a non-negative number`,
      );
    }
    checkEffect(gte.effect, "onHostedCreditsGte.effect");
  }
  checkEffect(c.onAgendaScored, "onAgendaScored");
  checkEffect(c.onAgendaScoredOrStolen, "onAgendaScoredOrStolen");
  checkEffect(c.onAgendaAccessedOrScored, "onAgendaAccessedOrScored");
  checkEffect(c.onAgendaAddedToRunnerScore, "onAgendaAddedToRunnerScore");
  checkEffect(c.onScoreTurnEnd, "onScoreTurnEnd");
  if (c.breaker && typeof c.breaker === "object") {
    const br = c.breaker as Record<string, unknown>;
    if (typeof br.breaksSubtype !== "string") {
      throw new Error(`${path}.breaker.breaksSubtype required`);
    }
  }
  return c as unknown as CardDef;
}

function loadAllCardFiles(): Map<string, CardDef> {
  const map = new Map<string, CardDef>();
  assertCardsDataPresent();
  if (!existsSync(cardsDir)) {
    throw new Error(`Missing card data directory: ${cardsDir}`);
  }
  for (const wave of CARD_STORAGE_DIRS) {
    const dir = join(cardsDir, wave);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      if (file.startsWith("_")) continue;
      const path = join(dir, file);
      const raw = JSON.parse(readFileSync(path, "utf8"));
      const def = validateCardShape(raw, path);
      if (map.has(def.id)) {
        throw new Error(`Duplicate card id ${def.id} in ${path}`);
      }
      map.set(def.id, def);
    }
  }
  return map;
}

export function loadCardCatalog(force = false): Map<string, CardDef> {
  if (!force && catalogCache) return catalogCache;
  catalogCache = loadAllCardFiles();
  return catalogCache;
}

export function loadCardPool(force = false): CardPool {
  if (!force && poolCache) return poolCache;
  const path = join(cardsDir, "pool.json");
  poolCache = JSON.parse(readFileSync(path, "utf8")) as CardPool;
  return poolCache;
}

export function getCardDef(id: string): CardDef {
  const def = loadCardCatalog().get(id);
  if (!def) {
    throw new Error(
      `Unknown card def "${id}". Add it to netrunner-cards-data or check pool.json.`,
    );
  }
  return def;
}

export function supportedCardIds(): string[] {
  const pool = loadCardPool();
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const wave of Object.values(pool.waves)) {
    if (wave.status !== "supported") continue;
    for (const id of wave.cards) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Apply a card definition onto an existing instance (legacy stub helper). */
export function applyCardDef(card: CardInstance, defId: string): void {
  const fresh = instantiateCard(defId, card.id, card.zone);
  Object.assign(card, {
    ...fresh,
    id: card.id,
    zone: card.zone,
    faceup: card.faceup,
    rezzed: card.rezzed,
  });
}
