/** Richer cost model + recurring credit refill (CR 1.10 / 1.16). */

import { abilitiesSuppressed } from "../continuous/abilities.js";
import { noteRunnerClickDuringRun } from "../turnAndActions/clickHooks.js";
import { iceAtRunnerPosition } from "../uninstallAndPosition/runPosition.js";
import { log } from "../setupAndEnd/createGame.js";
import { dealDamage } from "../damageAndPrevention/damage.js";
import {
  moveForfeitedAgendaOutOfGame,
  removeCardFromCurrentZone,
} from "../turnAndActions/scoring.js";
import { enterSetAside } from "../zones.js";
import {
  fireOnRemoveTags,
  fireOnTakeTagsWhenUntagged,
} from "../hostingAndTrash/trashHooks.js";
import { noteStoredConditionals } from "../triggers/storedConditionalHooks.js";
import { onTrashAbility } from "../cardFlags/cardDeclarations.js";
import type {
  CardInstance,
  CostSpec,
  GameState,
  PaidAbility,
  ServerId,
  Side,
} from "../types.js";
import { CR } from "../../timing/labels.js";
import {
  withCostCheckpoint,
  occurCheckpoint,
} from "../../legality/checkpoints.js";
import { noteOutsideCreditPoolSpendDuringRun } from "./outsidePoolSpend.js";
import { effectiveIceStrength } from "../../cards/stubs.js";
import { trashCard } from "../hostingAndTrash/trash.js";
import { hostCard } from "../hostingAndTrash/host.js";
import { removeCardFromGame } from "../uninstallAndPosition/uninstall.js";
import {
  stealthHostedCreditsAvailable,
  runnerAvailableCredits,
  recurringCreditsForProgramOrHardware,
  hostedCreditsSpendableToUseProgramsDuringRuns,
  hostedCreditsSpendableForAnything,
  takeFromStealthHostedCredits,
  takeFromHostedCreditsForAnything,
  takeFromHostedCreditsDuringRuns,
  takeFromProgramOrHardwareRecurring,
  takeFromCentralRunRecurring,
  takeFromHostedCreditsToUseProgramsDuringRuns,
  runnerCreditPoolLocked,
  subtractRunnerCreditPool,
  noteInstalledCardCreditSpend,
  spendCreditsForInstall,
} from "./runnerCredits.js";

/** Installed programs eligible for Simulchip-class additional trash cost. */
function installedProgramsForSimulchipCost(
  state: GameState,
  sourceId?: string,
): string[] {
  return state.runner.installed.filter((id) => {
    if (sourceId && id === sourceId) return false;
    return state.cards[id]?.type === "program";
  });
}

/**
 * CR 5.2.1: a paid ability is an action when its cost begins with a click.
 * CR 5.2.1a: a click elsewhere in a cost is not an action. This engine stores
 * the leading click on `cost.clicks` (or `clickCost` when `cost` is absent).
 * A "Lose [click]" cost is `cost.loseClicks`: losing a click is not spending
 * it (CR 1.11.3b), so it never makes the ability an action.
 */
export function costBeginsWithClick(ability: PaidAbility): boolean {
  const clicks = ability.cost
    ? (ability.cost.clicks ?? 0)
    : (ability.clickCost ?? 0);
  return clicks > 0;
}

const REGULAR_PAID_WINDOWS = new Set<PaidAbility["windows"][number]>([
  "approach_paw",
  "encounter_paw",
  "corp_action_paw",
  "runner_action_paw",
  "run_initiate_paw",
  "run_movement_paw",
  "run_after_move_paw",
]);

const ENCOUNTER_EFFECT_KINDS = new Set([
  "break_all_but_n_subroutines_on_encounter",
  "break_all_destroyer_subroutines_on_encounter",
  "break_etr_subroutine_trash_installed",
  "break_encounter_etr_subroutine",
  "break_encounter_subroutine",
  "break_host_subroutine",
  "break_subroutine_on_self",
  "break_any_subroutine",
]);

/** Project Wotan: the approached ice must be a rezzed bioroid (CR 9.5.6b). */
const APPROACHED_REZZED_BIOROID_KINDS = new Set([
  "grant_approached_rezzed_bioroid_etr_subroutine_this_run",
]);

/**
 * CR 9.2.7b: a paid ability that is not an action can be used in every
 * window marked (P), unless the card names a narrower window.
 */
function unrestrictedPaidAbility(ability: PaidAbility): boolean {
  if (costBeginsWithClick(ability) || ability.startsRun) return false;
  return (
    ability.windows.length > 0 &&
    ability.windows.every(
      (window) =>
        window === "corp_action_paw" || window === "runner_action_paw",
    )
  );
}

/** Every paid ability window of a run (CR 6.9.1e, 6.9.2b, 6.9.3b, 6.9.4b, 6.9.4e). */
const RUN_PAID_WINDOWS = new Set<PaidAbility["windows"][number]>([
  "run_initiate_paw",
  "approach_paw",
  "encounter_paw",
  "run_movement_paw",
  "run_after_move_paw",
]);

/**
 * CR 9.2.7b: a paid ability that is not an action and is declared for both
 * approaching ice and encounters is usable "during a run", so it is open in
 * every paid ability window of the run.
 */
function runWidePaidAbility(ability: PaidAbility): boolean {
  if (costBeginsWithClick(ability) || ability.startsRun) return false;
  return (
    ability.windows.includes("approach_paw") &&
    ability.windows.includes("encounter_paw")
  );
}

/**
 * An ability that is used only when the Runner approaches the server
 * (CR 6.9.4g), such as Anoetic Void. CR 6.9.4g is not a paid ability
 * window, so nothing else may be used or rezzed at that step.
 */
export function approachServerAbility(ability: PaidAbility): boolean {
  return (
    ability.windows.length === 1 && ability.windows[0] === "approach_server_paw"
  );
}

export function paidAbilityOpenIn(
  ability: PaidAbility,
  paw: PaidAbility["windows"][number] | null,
): boolean {
  if (!paw) return false;
  if (encounterBeginsConditional(ability)) return false;
  if (paw === "approach_server_paw") return approachServerAbility(ability);
  if (ability.windows.includes(paw)) return true;
  if (runWidePaidAbility(ability) && RUN_PAID_WINDOWS.has(paw)) return true;
  return unrestrictedPaidAbility(ability) && REGULAR_PAID_WINDOWS.has(paw);
}

export function effectHasKind(effect: unknown, kinds: Set<string>): boolean {
  if (!effect || typeof effect !== "object") return false;
  const node = effect as {
    kind?: string;
    action?: unknown;
    effects?: unknown[];
    effect?: unknown;
    then?: unknown;
    else?: unknown;
  };
  if (node.kind && kinds.has(node.kind)) return true;
  if (node.action && effectHasKind(node.action, kinds)) return true;
  if (node.effect && effectHasKind(node.effect, kinds)) return true;
  if (node.then && effectHasKind(node.then, kinds)) return true;
  if (node.else && effectHasKind(node.else, kinds)) return true;
  return (node.effects ?? []).some((child) => effectHasKind(child, kinds));
}

/**
 * Security Nexus: "When you encounter a piece of ice, you may…" is an
 * optional conditional ability whose trigger condition is met when the
 * encounter begins (CR 6.5.2, 6.9.3a, 9.6.9), not a paid ability. The catalog
 * declares it as a paid ability; the engine offers it at the start of each
 * encounter instead, so no paid ability window opens it.
 */
const ENCOUNTER_BEGINS_CONDITIONAL_KINDS = new Set(["trace_bypass_or_tag_etr"]);

export function encounterBeginsConditional(ability: PaidAbility): boolean {
  return effectHasKind(ability.effect, ENCOUNTER_BEGINS_CONDITIONAL_KINDS);
}

/** Break-during-encounter effects are legal only while an encounter is open. */
export function abilityNeedsEncounter(ability: PaidAbility): boolean {
  return effectHasKind(ability.effect, ENCOUNTER_EFFECT_KINDS);
}

/**
 * The approached ice fails a stipulation the paid ability uses to refer to it
 * (CR 9.5.6b). Abilities that do not refer to approached ice are unaffected.
 */
export function approachedIceMissesStipulation(
  state: GameState,
  ability: PaidAbility,
): boolean {
  if (!effectHasKind(ability.effect, APPROACHED_REZZED_BIOROID_KINDS)) {
    return false;
  }
  const run = state.run;
  if (!run || run.position === null) return true;
  const iceId = iceAtRunnerPosition(state);
  const ice = iceId ? state.cards[iceId] : undefined;
  return !(ice?.rezzed && (ice.subtypes ?? []).includes("bioroid"));
}

export function abilityCost(
  ability: PaidAbility,
  state?: GameState,
  source?: CardInstance,
): CostSpec {
  const base = ability.cost
    ? { ...ability.cost }
    : {
        clicks: ability.clickCost,
        credits: ability.creditCost,
      };
  if (
    state &&
    (base.creditsPerEncounterSubroutine ?? 0) > 0 &&
    state.run?.encounter
  ) {
    const ice = state.cards[state.run.encounter.iceId];
    const subs = ice?.subroutines?.length ?? 0;
    const per = base.creditsPerEncounterSubroutine ?? 0;
    base.credits = (base.credits ?? 0) + per * subs;
    delete base.creditsPerEncounterSubroutine;
  }
  if (
    state &&
    base.powerCountersEqualEncounterStrength &&
    state.run?.encounter
  ) {
    const iceId = state.run.encounter.iceId;
    const str = Math.max(0, effectiveIceStrength(state, iceId));
    base.powerCounters = (base.powerCounters ?? 0) + str;
    delete base.powerCountersEqualEncounterStrength;
  } else if (base.powerCountersEqualEncounterStrength) {
    // Not encountering — unpayable.
    base.powerCounters = (base.powerCounters ?? 0) + 999;
    delete base.powerCountersEqualEncounterStrength;
  }
  const discount =
    source?.paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn ?? 0;
  if (
    discount > 0 &&
    state?.turn.runnerTrashedOwnInstalledThisTurn &&
    (base.credits ?? 0) > 0
  ) {
    base.credits = Math.max(0, (base.credits ?? 0) - discount);
  }
  const runEventDiscount =
    source?.paidAbilityCreditDiscountIfRunEventActive ?? 0;
  if (runEventDiscount > 0 && state?.run && (base.credits ?? 0) > 0) {
    const srcId = state.run.runSourceId;
    const src = srcId ? state.cards[srcId] : undefined;
    const active = Boolean(
      src?.runEvent ||
      (src?.type === "event" && (src.subtypes ?? []).includes("run")),
    );
    if (active) {
      base.credits = Math.max(0, (base.credits ?? 0) - runEventDiscount);
    }
  }
  if (source?.paidAbilitiesUseStealthCreditsOnly && (base.credits ?? 0) > 0) {
    base.creditsFromStealthOnly = true;
  }
  return base;
}

/** Cards a cost has its payer pick (CR 1.16.1). */
export interface CostCardNeed {
  payer: Side;
  candidates: string[];
  count: number;
  /** What the cards are for, as "trash from HQ as a cost". */
  what: string;
  /** The other player may not see the candidates (HQ, the grip). */
  hidden: boolean;
  sourceId: string;
}

/**
 * The cards this cost has its payer pick, if any. Card data never combines
 * two of these on one cost, so the first that applies is the answer.
 */
export function costCardNeed(
  state: GameState,
  side: Side,
  cost: CostSpec,
  source?: CardInstance,
): CostCardNeed | null {
  const sourceId = source?.id ?? "";
  if ((cost.trashFromHq ?? 0) > 0) {
    return {
      payer: "corp",
      candidates: [...state.corp.hand],
      count: cost.trashFromHq ?? 0,
      what: "trash from HQ as a cost",
      hidden: true,
      sourceId,
    };
  }
  if ((cost.trashFromGrip ?? 0) > 0) {
    return {
      payer: "runner",
      candidates: [...state.runner.hand],
      count: cost.trashFromGrip ?? 0,
      what: "trash from the grip as a cost",
      hidden: true,
      sourceId,
    };
  }
  if (cost.trashFromGripSameTypeAsPendingTrash) {
    return {
      payer: "runner",
      candidates: gripCardsOfPendingTrashType(state),
      count: 1,
      what: "trash from the grip as a cost",
      hidden: true,
      sourceId,
    };
  }
  if (cost.trashProgramFromGrip) {
    return {
      payer: "runner",
      candidates: state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      ),
      count: 1,
      what: "trash from the grip as a cost",
      hidden: true,
      sourceId,
    };
  }
  if (
    cost.trashInstalledProgramUnlessOwnInstalledTrashedThisTurn &&
    !state.turn.installedProgramTrashedThisTurn
  ) {
    return {
      payer: "runner",
      candidates: installedProgramsForSimulchipCost(state, source?.id),
      count: 1,
      what: "trash as an additional cost",
      hidden: false,
      sourceId,
    };
  }
  if (cost.forfeitAgenda) {
    const score =
      side === "corp" ? state.corp.scoreArea : state.runner.scoreArea;
    return {
      payer: side,
      candidates: score.filter((id) => !state.cards[id]?.cannotForfeit),
      count: 1,
      what: "forfeit as a cost",
      hidden: false,
      sourceId,
    };
  }
  return null;
}

/** Grip cards of the same type as the installed card whose trash is pending. */
function gripCardsOfPendingTrashType(state: GameState): string[] {
  const pendingId = state.pendingTrashPrevent?.cardId;
  const type = pendingId ? state.cards[pendingId]?.type : undefined;
  if (!type) return [];
  return state.runner.hand.filter((id) => state.cards[id]?.type === type);
}

/**
 * The cards to take from `pool` for a cost: the payer's picks first. When
 * the payer was not asked (every card must go, or the cards are copies of
 * one card), the rest come from one end of the pool.
 */
function takeCostCards(
  state: GameState,
  pool: readonly string[],
  count: number,
  fallback: "first" | "last",
): string[] {
  const named = (state.costCardIds ?? []).filter((id) => pool.includes(id));
  const rest = pool.filter((id) => !named.includes(id));
  const missing = Math.max(0, count - named.length);
  const filler =
    fallback === "first"
      ? rest.slice(0, missing)
      : rest.slice(rest.length - missing);
  return [...named, ...filler].slice(0, count);
}

export function canPayCost(
  state: GameState,
  side: Side,
  cost: CostSpec,
  source?: CardInstance,
): boolean {
  const p = side === "corp" ? state.corp : state.runner;
  if ((cost.clicks ?? 0) + (cost.loseClicks ?? 0) > p.clicks) return false;
  const creditNeed = cost.credits ?? 0;
  if (side === "runner") {
    if (cost.creditsFromStealthOnly) {
      if (creditNeed > stealthHostedCreditsAvailable(state)) return false;
    } else if ((cost.minCreditsFromStealth ?? 0) > 0) {
      const minS = cost.minCreditsFromStealth ?? 0;
      if (stealthHostedCreditsAvailable(state) < minS) return false;
      let available = runnerAvailableCredits(state);
      if (source?.type === "program") {
        available += recurringCreditsForProgramOrHardware(state, "program");
        available += hostedCreditsSpendableToUseProgramsDuringRuns(state);
      }
      available += hostedCreditsSpendableForAnything(state);
      if (creditNeed > available) return false;
    } else {
      let available = runnerAvailableCredits(state);
      if (source?.type === "program") {
        available += recurringCreditsForProgramOrHardware(state, "program");
        available += hostedCreditsSpendableToUseProgramsDuringRuns(state);
      } else if (source?.type === "hardware") {
        available += recurringCreditsForProgramOrHardware(state, "hardware");
      }
      available += hostedCreditsSpendableForAnything(state);
      if (creditNeed > available) return false;
    }
  } else {
    if (creditNeed > p.credits) return false;
  }
  if ((cost.recurringCredits ?? 0) > 0) {
    if (
      !source ||
      (source.recurringCredits ?? 0) < (cost.recurringCredits ?? 0)
    ) {
      return false;
    }
  }
  if ((cost.virusCounters ?? 0) > 0) {
    if (!source || (source.virusCounters ?? 0) < (cost.virusCounters ?? 0)) {
      return false;
    }
  }
  if ((cost.agendaCounters ?? 0) > 0) {
    if (!source || (source.agendaCounters ?? 0) < (cost.agendaCounters ?? 0)) {
      return false;
    }
  }
  if ((cost.powerCounters ?? 0) > 0) {
    if (!source || (source.powerCounters ?? 0) < (cost.powerCounters ?? 0)) {
      return false;
    }
  }
  if ((cost.advancementCounters ?? 0) > 0) {
    if (
      !source ||
      (source.advancementCounters ?? 0) < (cost.advancementCounters ?? 0)
    ) {
      return false;
    }
  }
  if (
    (cost.credits ?? 0) > 0 &&
    side === "runner" &&
    state.run?.runnerCannotSpendCreditsForRun
  ) {
    return false;
  }
  if (
    (cost.credits ?? 0) > 0 &&
    side === "runner" &&
    state.run?.runnerCannotSpendCredits
  ) {
    return false;
  }
  if ((cost.trashFromHq ?? 0) > 0) {
    if (state.corp.hand.length < (cost.trashFromHq ?? 0)) return false;
  }
  if ((cost.trashFromGrip ?? 0) > 0) {
    if (state.runner.hand.length < (cost.trashFromGrip ?? 0)) return false;
  }
  if (cost.trashFromGripSameTypeAsPendingTrash) {
    if (gripCardsOfPendingTrashType(state).length === 0) return false;
  }
  // trashEntireGrip is always payable (including empty grip).
  if (cost.trashProgramFromGrip) {
    if (!state.runner.hand.some((id) => state.cards[id]?.type === "program")) {
      return false;
    }
  }
  if ((cost.removeTags ?? 0) > 0) {
    if (state.runner.tags < (cost.removeTags ?? 0)) return false;
  }
  if (cost.trashInstalledProgramUnlessOwnInstalledTrashedThisTurn) {
    if (!state.turn.installedProgramTrashedThisTurn) {
      const programs = installedProgramsForSimulchipCost(state, source?.id);
      if (programs.length === 0) return false;
    }
  }
  if (cost.forfeitAgenda) {
    const score =
      side === "corp" ? state.corp.scoreArea : state.runner.scoreArea;
    if (!score.some((id) => !state.cards[id]?.cannotForfeit)) return false;
  }
  if (cost.forfeitSelf) {
    // Only a scored agenda can be forfeited (CR 8.2.5); unpayable means unusable (CR 1.16.1).
    const score =
      side === "corp" ? state.corp.scoreArea : state.runner.scoreArea;
    if (!source || !score.includes(source.id) || source.cannotForfeit)
      return false;
  }
  // coreDamage / tags (add) are always payable (may flatline when paid).
  return true;
}

/** The trash ability has finished; set-aside virus counters leave play (CR 9.5.5). */
export function returnSetAsideVirusCounters(state: GameState): void {
  const aside = state.resolvingSetAsideVirus;
  state.resolvingSetAsideVirus = undefined;
  state.pendingTrashSetAsideVirus = undefined;
  if (!aside || aside.count <= 0) return;
  const title = state.cards[aside.sourceId]?.title ?? aside.sourceId;
  log(
    state,
    `${title}'s ${aside.count} set-aside virus counter(s) return to the bank (CR ${CR.trashAbilityKeepsHosted.number}).`,
  );
}

/** Leftover set-aside advancement counters leave play when the trash ability finishes (CR 9.5.5). */
export function returnSetAsideAdvancements(state: GameState): void {
  const aside = state.resolvingSetAsideAdvancements;
  state.resolvingSetAsideAdvancements = undefined;
  state.pendingTrashSetAsideAdvancements = undefined;
  if (!aside || aside.count <= 0) return;
  const title = state.cards[aside.sourceId]?.title ?? aside.sourceId;
  log(
    state,
    `${title}'s ${aside.count} set-aside advancement counter(s) return to the bank (CR ${CR.trashAbilityKeepsHosted.number}).`,
  );
}

/** The trash ability has finished. Leftover hosted cards meet the next checkpoint (CR 9.5.5). */
export function releaseSetAsideHostedCards(state: GameState): void {
  const pending = state.resolvingSetAsideHosted;
  if (!pending) return;
  state.resolvingSetAsideHosted = undefined;
  let restored = 0;
  for (const id of pending.cardIds) {
    const card = state.cards[id];
    if (!card) continue;
    if (card.zone !== "runner:set-aside" && card.zone !== "corp:set-aside") {
      continue;
    }
    state.runner.setAside = (state.runner.setAside ?? []).filter(
      (x) => x !== id,
    );
    if (state.corp.corpSetAside) {
      state.corp.corpSetAside = state.corp.corpSetAside.filter((x) => x !== id);
    }
    card.zone = `hosted:${pending.sourceId}`;
    hostCard(state, card.id, pending.sourceId, { installed: true });
    restored += 1;
  }
  if (restored === 0) return;
  occurCheckpoint(
    state,
    "instruction",
    "Trash ability finished",
    [CR.trashAbilityKeepsHosted],
    pending.sourceId,
  );
}

/**
 * Mark Yale: "Whenever you spend an agenda counter, gain 1[credit]", for
 * each counter the Corp spends, as a cost of any ability (Firmware Updates,
 * High-Risk Investment) or of Mark Yale's own (CR 1.2.1).
 */
export function noteCorpSpentAgendaCounters(state: GameState, n: number): void {
  if (n <= 0) return;
  for (const id of Object.keys(state.cards)) {
    const c = state.cards[id]!;
    const per = c.gainCreditsOnSpendAgendaCounter ?? 0;
    if (per <= 0 || c.side !== "corp" || !c.rezzed) continue;
    if (abilitiesSuppressed(state, id)) continue;
    state.corp.credits += per * n;
    log(state, `${c.title} — gain ${per * n}¢ (agenda counter spent).`);
  }
}

export function payCost(
  state: GameState,
  side: Side,
  cost: CostSpec,
  openedBy: string,
  source?: CardInstance,
): void {
  const p = side === "corp" ? state.corp : state.runner;
  withCostCheckpoint(state, openedBy, () => {
    p.clicks -= cost.clicks ?? 0;
    if (side === "runner" && (cost.clicks ?? 0) > 0) {
      noteRunnerClickDuringRun(state);
    }
    // CR 1.11.3b: a lost click reduces the clicks but is not spent.
    const lost = cost.loseClicks ?? 0;
    if (lost > 0) {
      p.clicks -= lost;
      if (side === "runner") noteRunnerClickDuringRun(state);
      log(
        state,
        `${side === "corp" ? "Corp" : "Runner"} loses ${lost} [click] as a cost (CR ${CR.spendClicks.number}).`,
      );
    }
    let creditsLeft = cost.credits ?? 0;
    if (side === "runner") {
      if (cost.creditsFromStealthOnly) {
        creditsLeft = takeFromStealthHostedCredits(state, creditsLeft);
        if (creditsLeft > 0) {
          // Should not happen when canPayCost gated; leave unpaid remainder.
          log(
            state,
            `Stealth-only cost shortfall ${creditsLeft}¢ (insufficient stealth hosted credits).`,
          );
        }
        creditsLeft = 0;
      } else if ((cost.minCreditsFromStealth ?? 0) > 0) {
        const minS = cost.minCreditsFromStealth ?? 0;
        const before = creditsLeft;
        const afterStealth = takeFromStealthHostedCredits(state, minS);
        const takenStealth = minS - afterStealth;
        creditsLeft = before - takenStealth;
        creditsLeft = takeFromHostedCreditsForAnything(state, creditsLeft);
        creditsLeft = takeFromHostedCreditsDuringRuns(state, creditsLeft);
        // The pool covers the remainder first so stealth-source recurring
        // credits stay available for later stealth minimums; recurring
        // credits only cover a shortfall the pool cannot (canPayCost
        // already counted them toward this cost).
        if (creditsLeft > p.credits && source?.type === "program") {
          const subs = source.subtypes ?? [];
          const shortfall = creditsLeft - p.credits;
          creditsLeft -=
            shortfall -
            takeFromProgramOrHardwareRecurring(
              state,
              shortfall,
              "program",
              subs.includes("decoder"),
              subs.includes("fracter"),
              subs.includes("killer"),
            );
        } else if (creditsLeft > p.credits && source?.type === "hardware") {
          const shortfall = creditsLeft - p.credits;
          creditsLeft -=
            shortfall -
            takeFromProgramOrHardwareRecurring(state, shortfall, "hardware");
        }
        // remainder from pool below
      } else {
        creditsLeft = takeFromCentralRunRecurring(state, creditsLeft);
        if (source?.type === "program") {
          const subs = source.subtypes ?? [];
          creditsLeft = takeFromProgramOrHardwareRecurring(
            state,
            creditsLeft,
            "program",
            subs.includes("decoder"),
            subs.includes("fracter"),
            subs.includes("killer"),
          );
          creditsLeft = takeFromHostedCreditsToUseProgramsDuringRuns(
            state,
            creditsLeft,
          );
        } else if (source?.type === "hardware") {
          creditsLeft = takeFromProgramOrHardwareRecurring(
            state,
            creditsLeft,
            "hardware",
          );
        }
        if (state.run && (state.run.eventCredits ?? 0) > 0) {
          const fromEvent = Math.min(creditsLeft, state.run.eventCredits ?? 0);
          state.run.eventCredits = (state.run.eventCredits ?? 0) - fromEvent;
          creditsLeft -= fromEvent;
          if (fromEvent > 0) {
            log(
              state,
              `Spend ${fromEvent}¢ from run event credits (Overclock pool).`,
            );
            noteOutsideCreditPoolSpendDuringRun(state);
          }
        }
        creditsLeft = takeFromHostedCreditsDuringRuns(state, creditsLeft);
        creditsLeft = takeFromHostedCreditsForAnything(state, creditsLeft);
      }
    }
    if (side === "runner" && runnerCreditPoolLocked(state)) {
      if (creditsLeft > 0) {
        log(
          state,
          `Cannot spend ${creditsLeft}¢ from credit pool (Aircheck-class block).`,
        );
      }
      creditsLeft = 0;
    }
    if (side === "runner" && source?.hostId) {
      const flame = state.cards[source.hostId];
      if (
        flame?.spendHostedCreditsToUseHostedProgram &&
        !abilitiesSuppressed(state, source.hostId) &&
        creditsLeft > 0
      ) {
        const pool = flame.hostedCredits ?? 0;
        const take = Math.min(creditsLeft, pool);
        flame.hostedCredits = pool - take;
        creditsLeft -= take;
      }
    }
    if (cost.trashSelf) onTrashAbility(state, side);
    if (side === "runner") subtractRunnerCreditPool(state, creditsLeft);
    else p.credits -= creditsLeft;
    if (source && (cost.recurringCredits ?? 0) > 0) {
      source.recurringCredits =
        (source.recurringCredits ?? 0) - (cost.recurringCredits ?? 0);
      if (
        side === "runner" &&
        state.runner.installed.includes(source.id) &&
        (cost.recurringCredits ?? 0) > 0
      ) {
        noteInstalledCardCreditSpend(state, source);
      }
    }
    if (source && (cost.virusCounters ?? 0) > 0) {
      source.virusCounters =
        (source.virusCounters ?? 0) - (cost.virusCounters ?? 0);
    }
    if (source && (cost.agendaCounters ?? 0) > 0) {
      source.agendaCounters =
        (source.agendaCounters ?? 0) - (cost.agendaCounters ?? 0);
      log(
        state,
        `Spend ${cost.agendaCounters} agenda counter(s) from ${source.title} → ${source.agendaCounters}.`,
      );
      if (side === "corp")
        noteCorpSpentAgendaCounters(state, cost.agendaCounters!);
    }
    if (source && (cost.powerCounters ?? 0) > 0) {
      source.powerCounters =
        (source.powerCounters ?? 0) - (cost.powerCounters ?? 0);
      log(
        state,
        `Spend ${cost.powerCounters} power counter(s) from ${source.title} → ${source.powerCounters}.`,
      );
      if (source.trashWhenPowerEmpty && (source.powerCounters ?? 0) <= 0) {
        // Its own ability trashes it (CR 1.14.5).
        trashCard(state, source.id, { by: source.side });
        log(
          state,
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
      } else if (source.rfgWhenPowerEmpty && (source.powerCounters ?? 0) <= 0) {
        removeCardFromGame(state, source.id);
        log(
          state,
          `${source.title} removed from the game — power counters empty.`,
        );
      }
    }
    if (source && (cost.advancementCounters ?? 0) > 0) {
      source.advancementCounters =
        (source.advancementCounters ?? 0) - (cost.advancementCounters ?? 0);
      log(
        state,
        `Spend ${cost.advancementCounters} advancement(s) from ${source.title} → ${source.advancementCounters} (CR ${CR.advancing.number}).`,
      );
    }
    if ((cost.trashFromHq ?? 0) > 0) {
      for (const id of takeCostCards(
        state,
        state.corp.hand,
        cost.trashFromHq ?? 0,
        "last",
      )) {
        const c = state.cards[id];
        // The Runner could not see a card in HQ, so it is facedown (CR 4.4.6b).
        trashCard(state, id, { by: "corp", cause: "cost" });
        log(state, `Trash ${c.title} from HQ as cost.`);
      }
    }
    if ((cost.trashFromGrip ?? 0) > 0) {
      for (const id of takeCostCards(
        state,
        state.runner.hand,
        cost.trashFromGrip ?? 0,
        "last",
      )) {
        const c = state.cards[id];
        trashCard(state, id, { by: "runner", cause: "cost" });
        log(state, `Trash ${c.title} from grip as cost.`);
      }
    }
    if (cost.trashEntireGrip) {
      const grip = [...state.runner.hand];
      for (const id of grip) {
        const c = state.cards[id];
        trashCard(state, id, { by: "runner", cause: "cost" });
        log(state, `Trash ${c.title} from grip as cost (entire grip).`);
      }
      if (grip.length === 0) {
        log(state, `Trash entire grip as cost (already empty).`);
      }
    }
    if (cost.trashFromGripSameTypeAsPendingTrash) {
      const id = takeCostCards(
        state,
        gripCardsOfPendingTrashType(state),
        1,
        "first",
      )[0];
      if (id) {
        const c = state.cards[id];
        trashCard(state, id, { by: "runner", cause: "cost" });
        log(state, `Trash ${c.title} (${c.type}) from grip as cost.`);
      }
    }
    if (cost.trashProgramFromGrip) {
      const id = takeCostCards(
        state,
        state.runner.hand.filter((cid) => state.cards[cid]?.type === "program"),
        1,
        "first",
      )[0];
      if (id) {
        const c = state.cards[id];
        trashCard(state, id, { by: "runner", cause: "cost" });
        log(state, `Trash ${c.title} (program) from grip as cost.`);
      }
    }
    if (cost.trashInstalledProgramUnlessOwnInstalledTrashedThisTurn) {
      if (!state.turn.installedProgramTrashedThisTurn) {
        const programs = installedProgramsForSimulchipCost(state, source?.id);
        const pick = takeCostCards(state, programs, 1, "first")[0];
        if (pick) {
          const prog = state.cards[pick]!;
          trashCard(state, pick, { by: "runner", cause: "cost" });
          log(
            state,
            `Trash ${prog.title} as additional cost (Simulchip-class; CR ${CR.trashing.number}).`,
          );
        }
      } else {
        log(
          state,
          `Ignore additional program-trash cost — own installed already trashed this turn.`,
        );
      }
    }
    if (cost.trashSelf && source) {
      // The {trash} cost: no interrupt cancels it (CR 1.16.1a, 1.19.4).
      trashCard(state, source.id, { by: source.side, cause: "cost" });
      log(state, `${source.title} trashed as cost (CR ${CR.trashing.number}).`);
      const setAside = state.pendingTrashSetAsideVirus;
      if (setAside?.sourceId === source.id) {
        const n = source.virusCounters ?? 0;
        source.virusCounters = 0;
        state.pendingTrashSetAsideVirus = undefined;
        if (n > 0) {
          state.resolvingSetAsideVirus = { sourceId: source.id, count: n };
          log(
            state,
            `Set aside ${n} virus counter(s) from ${source.title} (CR ${CR.trashAbilityKeepsHosted.number}).`,
          );
        }
      }
      const hostedAside = state.pendingTrashSetAsideHosted;
      if (hostedAside?.sourceId === source.id) {
        state.pendingTrashSetAsideHosted = undefined;
        const ids = [...(source.hostedCardIds ?? [])].filter(
          (id) => state.cards[id],
        );
        if (ids.length > 0) {
          const side = source.side === "runner" ? "runner" : "corp";
          const bag = side === "runner" ? "setAside" : "corpSetAside";
          // Keep each card's face; facedown peers share one group (CR 4.8.6 / 4.8.7).
          const faceupIds = ids.filter((id) => state.cards[id]!.faceup);
          const facedownIds = ids.filter((id) => !state.cards[id]!.faceup);
          if (faceupIds.length) {
            enterSetAside(state, faceupIds, { side, faceup: true, bag });
          }
          if (facedownIds.length) {
            enterSetAside(state, facedownIds, { side, faceup: false, bag });
          }
          state.resolvingSetAsideHosted = { sourceId: source.id, cardIds: ids };
          log(
            state,
            `Set aside ${ids.length} hosted card(s) from ${source.title} (CR ${CR.trashAbilityKeepsHosted.number}).`,
          );
        }
      }
      const advAside = state.pendingTrashSetAsideAdvancements;
      if (advAside?.sourceId === source.id) {
        const n = source.advancementCounters ?? 0;
        source.advancementCounters = 0;
        state.pendingTrashSetAsideAdvancements = undefined;
        if (n > 0) {
          state.resolvingSetAsideAdvancements = {
            sourceId: source.id,
            count: n,
          };
          log(
            state,
            `Set aside ${n} advancement counter(s) from ${source.title} (CR ${CR.trashAbilityKeepsHosted.number}).`,
          );
        }
      }
    }
    if (cost.rfgSelf && source) {
      removeCardFromGame(state, source.id);
      log(
        state,
        `${source.title} removed from the game as cost (CR ${CR.trashing.number}).`,
      );
    }
    if ((cost.coreDamage ?? 0) > 0 && source) {
      dealDamage(state, "core", cost.coreDamage ?? 0, source.id);
    }
    if ((cost.netDamage ?? 0) > 0 && source) {
      dealDamage(state, "net", cost.netDamage ?? 0, source.id);
    }
    if ((cost.tags ?? 0) > 0) {
      const n = cost.tags ?? 0;
      const tagsBefore = state.runner.tags;
      state.runner.tags += n;
      state.turn.tagsGivenThisTurn += n;
      log(state, `Take ${n} tag(s) as cost → ${state.runner.tags}.`);
      fireOnTakeTagsWhenUntagged(state, tagsBefore, n);
    }
    if ((cost.removeTags ?? 0) > 0) {
      const n = Math.min(cost.removeTags ?? 0, state.runner.tags);
      state.runner.tags -= n;
      log(state, `Remove ${n} tag(s) as cost → ${state.runner.tags}.`);
      if (n > 0) {
        const r = fireOnRemoveTags(state);
        if (!r.ok) {
          log(state, `onRemoveTags failed: ${r.error}`);
        }
      }
    }
    if (cost.forfeitAgenda) {
      const score =
        side === "corp" ? state.corp.scoreArea : state.runner.scoreArea;
      const id = takeCostCards(
        state,
        score.filter((x) => !state.cards[x]?.cannotForfeit),
        1,
        "first",
      )[0];
      if (id) forfeitAgendaAsCost(state, id);
    }
    if (cost.forfeitSelf && source) {
      forfeitAgendaAsCost(state, source.id);
    }
  });
}

/**
 * Forfeit a scored agenda to pay a cost: it is removed from the game, not
 * trashed, and its points no longer count (CR 8.2.5, 4.9.3). A "when you
 * forfeit" ability is noted after the move, and the cost checkpoint marks
 * and resolves it (CR 1.16.3, 9.6.6), still active in its new zone
 * (CR 9.1.8g). Only an agenda in the Corp's score area is active; one in
 * the Runner's score area is not (CR 3.2.3).
 */
function forfeitAgendaAsCost(state: GameState, id: string): void {
  const card = state.cards[id];
  if (!card) return;
  const triggers =
    state.corp.scoreArea.includes(id) &&
    !!card.onForfeit &&
    !abilitiesSuppressed(state, id);
  removeCardFromCurrentZone(state, id);
  moveForfeitedAgendaOutOfGame(state, id);
  log(
    state,
    `Forfeit ${card.title} as a cost: it is removed from the game (CR ${CR.forfeit.number}).`,
  );
  if (triggers) {
    noteStoredConditionals(state, [
      {
        abilityKey: "on-forfeit",
        sourceId: id,
        controller: "corp",
        mandatory: true,
        effectKey: "onForfeit",
        logLine: `${card.title} becomes pending — forfeited.`,
      },
    ]);
  }
}

/**
 * Step 8.5.16d of installing a card: pay the install cost, then the
 * cost-paid checkpoint, even when the cost is 0 (CR 8.5.16d, 1.16.3a,
 * 10.3.4). It is the only checkpoint inside an install (CR 9.11.2a.ex1).
 */
export function payInstallCost(
  state: GameState,
  side: Side,
  amount: number,
  forCard?: CardInstance,
  destinationServerId?: ServerId,
): void {
  // A new remote created for this install is not yet empty in the rules
  // sense: the card moves into it at 8.5.16e (CR 8.5.9, 10.3.1h).
  const spared = state.turn.installDestinationServerId;
  if (destinationServerId && !spared) {
    state.turn.installDestinationServerId = destinationServerId;
  }
  try {
    withCostCheckpoint(state, "install_cost", () => {
      spendCreditsForInstall(state, side, amount, forCard);
    });
  } finally {
    state.turn.installDestinationServerId = spared;
  }
}

/**
 * Sum of installed Runner cards’ `eventPlayCostDiscount` (Ghosttongue-class).
 * CR §1.16.2a — lower after increases; caller floors at 0.
 */
export function eventPlayCostDiscountTotal(state: GameState): number {
  let n = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    n += state.cards[id].eventPlayCostDiscount ?? 0;
  }
  return n;
}

/**
 * Effective event play cost after continuous discounts (CR §1.16.2a / §3.7.2).
 */

/** Rolling Brownout-class: +N to operation and event play costs from active currents. */
export function operationAndEventPlayCostIncreaseTotal(
  state: GameState,
): number {
  let n = 0;
  for (const c of Object.values(state.cards)) {
    if (abilitiesSuppressed(state, c.id)) continue;
    if (c.zone === "corp:play-area" || c.zone === "runner:play-area") {
      n += c.operationAndEventPlayCostIncrease ?? 0;
    }
  }
  // Donut Taganes: an installed resource raises both players' play costs
  // while it is active (CR 1.16.2a, 1.8.3a).
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    n += state.cards[id]?.corpPlayCostIncreaseForRunnerEventsOps ?? 0;
  }
  return n;
}

export function effectiveEventPlayCost(
  state: GameState,
  playCost: number | undefined,
  card?: CardInstance,
): number {
  let discount = eventPlayCostDiscountTotal(state);
  if (card?.playCostDiscountPerIceProtectingServer) {
    const sid = card.playCostDiscountPerIceProtectingServer;
    discount += state.servers[sid]?.ice.length ?? 0;
  }
  if (card?.playCostReducedByLink) {
    discount += state.runner.link ?? 0;
  }
  if (state.turn.patchworkPendingDiscountThisAction > 0) {
    discount += state.turn.patchworkPendingDiscountThisAction;
  }
  let extra = 0;
  if (card?.defId) {
    const copyInHeap = state.runner.discardPile.some(
      (id) => state.cards[id]?.defId === card.defId,
    );
    if (copyInHeap) {
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          if (abilitiesSuppressed(state, id)) continue;
          const asset = state.cards[id];
          if (!asset?.rezzed) continue;
          const n = asset.eventPlayExtraCostIfCopyInHeap ?? 0;
          if (n > 0) extra += n;
        }
      }
    }
  }
  const increase = operationAndEventPlayCostIncreaseTotal(state);
  return Math.max(0, (playCost ?? 0) - discount + extra + increase);
}

/**
 * Synchrocyclotron-class: max first-double click discount from rezzed Corp cards,
 * or 0 if already used this turn.
 */
export function firstDoubleOperationClickDiscountAvailable(
  state: GameState,
): number {
  if (state.turn.doubleOpClickDiscountUsedThisTurn) return 0;
  let best = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      if (abilitiesSuppressed(state, id)) continue;
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      const n = c.firstDoubleOperationClickDiscount ?? 0;
      if (n > best) best = n;
    }
  }
  return best;
}

/**
 * Extra clicks beyond the base play click for an operation, after Synchro-class
 * first-double discount (CR play operation / additional costs).
 */
export function effectiveOperationExtraClicks(
  state: GameState,
  card: CardInstance,
): number {
  const extra =
    typeof card.playAdditionalClicks === "number"
      ? card.playAdditionalClicks
      : card.playAdditionalClick
        ? 1
        : 0;
  if (extra <= 0) return 0;
  const discount = Math.min(
    extra,
    firstDoubleOperationClickDiscountAvailable(state),
  );
  return extra - discount;
}

/**
 * What the Corp pays to install this card (CR 1.16.6b, 8.5.11a).
 * Ice costs 1 credit per ice already protecting the destination.
 * Assets, agendas, and upgrades have no install cost.
 * The catalog `installCost` on those types is the Null Signal `cost`
 * copied onto both install and rez, which is the rez cost.
 */
export function corpInstallCost(
  card: { type: string; installCost?: number },
  iceAlreadyProtecting = 0,
): number {
  if (card.type === "ice") return Math.max(0, iceAlreadyProtecting);
  if (
    card.type === "asset" ||
    card.type === "agenda" ||
    card.type === "upgrade"
  ) {
    return 0;
  }
  return Math.max(0, card.installCost ?? 0);
}

/** Click-and-2¢ trash resource, after an identity reduction (CR 5.2.6g). */
export function basicTrashResourceCreditCost(state: GameState): number {
  const identity = state.cards[state.corp.identityId];
  const reduction =
    identity?.identityFlipped &&
    !abilitiesSuppressed(state, state.corp.identityId)
      ? (identity.basicTrashResourceCreditReductionWhileFlipped ?? 0)
      : 0;
  return Math.max(0, 2 - reduction);
}

/** SYNC front-class: ¢ cost of the Runner's basic remove-tag action. */
export function basicRemoveTagCreditCost(state: GameState): number {
  let cost = 2;
  const identityId = state.corp.identityId;
  if (!abilitiesSuppressed(state, identityId)) {
    const identity = state.cards[identityId];
    if (
      !identity?.identityFlipped &&
      typeof identity?.basicRemoveTagAdditionalCostCreditsWhileUnflipped ===
        "number"
    ) {
      cost += identity.basicRemoveTagAdditionalCostCreditsWhileUnflipped;
    }
  }
  return cost;
}

/** Wireless Net Pavilion-class: additional ¢ on Corp basic trash resource. */
export function wirelessNetPavilionExtra(state: GameState): number {
  let extra = 0;
  for (const rid of state.runner.installed) {
    if (abilitiesSuppressed(state, rid)) continue;
    const c = state.cards[rid];
    if (typeof c?.basicTrashResourceAdditionalCostCredits === "number") {
      extra = Math.max(extra, c.basicTrashResourceAdditionalCostCredits);
    }
  }
  return extra;
}

/** Credits to install and rez after a declared split of a total discount (CR 1.16.2f). */
export function installAndRezPaid(
  installCost: number,
  rezCost: number,
  installDiscount: number,
  rezDiscount: number,
): number {
  return (
    Math.max(0, installCost - installDiscount) +
    Math.max(0, rezCost - rezDiscount)
  );
}
