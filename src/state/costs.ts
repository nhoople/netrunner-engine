/** Richer cost model + recurring credit refill (CR 1.10 / 1.16). */

import { log } from "./createGame.js";
import { dealDamage } from "./damage.js";
import { removeCardFromCurrentZone } from "./scoring.js";
import { fireOnRemoveTags, fireOnTakeTagsWhenUntagged } from "./trashHooks.js";
import type {
  CardInstance,
  CostSpec,
  GameState,
  PaidAbility,
  RecurringSpendPurpose,
  Side,
} from "./types.js";
import { CR } from "../timing/labels.js";
import { withCostCheckpoint } from "../legality/checkpoints.js";
import { noteOutsideCreditPoolSpendDuringRun } from "./outsidePoolSpend.js";

export { noteOutsideCreditPoolSpendDuringRun } from "./outsidePoolSpend.js";

/**
 * First time each turn the Runner spends credits from an installed card,
 * place 1 power on each card with powerOnFirstInstalledCardCreditSpendThisTurn.
 */
export function noteInstalledCardCreditSpend(state: GameState): void {
  if (state.turn.installedCardCreditSpendThisTurn) return;
  state.turn.installedCardCreditSpendThisTurn = true;
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (!card?.powerOnFirstInstalledCardCreditSpendThisTurn) continue;
    card.powerCounters = (card.powerCounters ?? 0) + 1;
    log(
      state,
      `${card.title} — place 1 power (first installed-card credit spend this turn) → ${card.powerCounters}.`,
    );
  }
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
  return base;
}

/** True when there is an active run attacking HQ, R&D, or Archives. */
export function isAttackingCentral(state: GameState): boolean {
  const sid = state.run?.attackedServerId;
  return sid === "hq" || sid === "rd" || sid === "archives";
}

/** Recurring ¢ from installed cards with `run_central` while attacking a central. */
export function recurringCreditsForCentralRun(state: GameState): number {
  if (!isAttackingCentral(state)) return 0;
  let n = 0;
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if ((card.recurringSpendFor ?? []).includes("run_central")) {
      n += card.recurringCredits ?? 0;
    }
  }
  return n;
}

/**
 * Runner credit pool for any payment: bank + run event credits + Cezve-class
 * `run_central` recurring while attacking a central (CR §1.10.5a / §6.3.4) +
 * Touchstone-class hosted credits spendable during runs.
 */
export function runnerAvailableCredits(state: GameState): number {
  return (
    state.runner.credits +
    (state.run ? (state.run.eventCredits ?? 0) : 0) +
    recurringCreditsForCentralRun(state) +
    hostedCreditsSpendableDuringRuns(state)
  );
}

/** Hosted ¢ on rig cards with `spendHostedCreditsDuringRuns` while a run is active. */
export function hostedCreditsSpendableDuringRuns(state: GameState): number {
  if (!state.run) return 0;
  let n = 0;
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (!card?.spendHostedCreditsDuringRuns) continue;
    n += card.hostedCredits ?? 0;
  }
  return n;
}

function takeFromHostedCreditsDuringRuns(
  state: GameState,
  amount: number,
): number {
  if (!state.run || amount <= 0) return amount;
  let left = amount;
  for (const id of state.runner.rig) {
    if (left <= 0) break;
    const card = state.cards[id];
    if (!card?.spendHostedCreditsDuringRuns) continue;
    const pool = card.hostedCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.hostedCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} hosted credits (during run).`,
      );
      noteInstalledCardCreditSpend(state);
      noteOutsideCreditPoolSpendDuringRun(state);
    }
  }
  return left;
}

/**
 * Spend Runner credits drawing from `run_central` recurring (when attacking a
 * central), then run event credits, then hosted-during-run pools, then bank.
 */
export function spendRunnerCredits(state: GameState, amount: number): void {
  let left = amount;
  if (left <= 0) return;
  left = takeFromCentralRunRecurring(state, left);
  if (left > 0 && state.run && (state.run.eventCredits ?? 0) > 0) {
    const fromEvent = Math.min(left, state.run.eventCredits ?? 0);
    state.run.eventCredits = (state.run.eventCredits ?? 0) - fromEvent;
    left -= fromEvent;
    if (fromEvent > 0) {
      log(state, `Spend ${fromEvent}¢ from run event credits.`);
      noteOutsideCreditPoolSpendDuringRun(state);
    }
  }
  left = takeFromHostedCreditsDuringRuns(state, left);
  state.runner.credits -= left;
}

function takeFromCentralRunRecurring(
  state: GameState,
  amount: number,
): number {
  if (!isAttackingCentral(state) || amount <= 0) return amount;
  let left = amount;
  for (const id of state.runner.rig) {
    if (left <= 0) break;
    const card = state.cards[id];
    if (!(card.recurringSpendFor ?? []).includes("run_central")) continue;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (run_central).`,
      );
      noteInstalledCardCreditSpend(state);
      noteOutsideCreditPoolSpendDuringRun(state);
    }
  }
  return left;
}

export function canPayCost(
  state: GameState,
  side: Side,
  cost: CostSpec,
  source?: CardInstance,
): boolean {
  const p = side === "corp" ? state.corp : state.runner;
  if ((cost.clicks ?? 0) > p.clicks) return false;
  const creditNeed = cost.credits ?? 0;
  if (side === "runner") {
    if (creditNeed > runnerAvailableCredits(state)) return false;
  } else {
    if (creditNeed > p.credits) return false;
  }
  if ((cost.recurringCredits ?? 0) > 0) {
    if (!source || (source.recurringCredits ?? 0) < (cost.recurringCredits ?? 0)) {
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
  if ((cost.advancementTokens ?? 0) > 0) {
    if (
      !source ||
      (source.advancementTokens ?? 0) < (cost.advancementTokens ?? 0)
    ) {
      return false;
    }
  }
  if ((cost.credits ?? 0) > 0 && side === "runner" && state.run?.runnerCannotSpendCredits) {
    return false;
  }
  if ((cost.trashFromHq ?? 0) > 0) {
    if (state.corp.hand.length < (cost.trashFromHq ?? 0)) return false;
  }
  if ((cost.trashFromGrip ?? 0) > 0) {
    if (state.runner.hand.length < (cost.trashFromGrip ?? 0)) return false;
  }
  if ((cost.removeTags ?? 0) > 0) {
    if (state.runner.tags < (cost.removeTags ?? 0)) return false;
  }
  // coreDamage / tags (add) are always payable (may flatline when paid).
  return true;
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
    let creditsLeft = cost.credits ?? 0;
    if (side === "runner") {
      creditsLeft = takeFromCentralRunRecurring(state, creditsLeft);
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
    }
    p.credits -= creditsLeft;
    if (source && (cost.recurringCredits ?? 0) > 0) {
      source.recurringCredits =
        (source.recurringCredits ?? 0) - (cost.recurringCredits ?? 0);
      if (
        side === "runner" &&
        state.runner.rig.includes(source.id) &&
        (cost.recurringCredits ?? 0) > 0
      ) {
        noteInstalledCardCreditSpend(state);
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
    }
    if (source && (cost.powerCounters ?? 0) > 0) {
      source.powerCounters =
        (source.powerCounters ?? 0) - (cost.powerCounters ?? 0);
      log(
        state,
        `Spend ${cost.powerCounters} power counter(s) from ${source.title} → ${source.powerCounters}.`,
      );
      if (
        source.trashWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
        removeCardFromCurrentZone(state, source.id);
        if (source.side === "runner") {
          state.runner.discard.push(source.id);
          source.zone = "runner:heap";
        } else {
          state.corp.discard.push(source.id);
          source.zone = "corp:archives";
        }
        source.faceup = true;
        log(
          state,
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
      } else if (
        source.rfgWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
        removeCardFromCurrentZone(state, source.id);
        source.zone = "removed-from-game";
        source.faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(source.id)) {
          state.removedFromGame.push(source.id);
        }
        log(
          state,
          `${source.title} removed from the game — power counters empty.`,
        );
      }
    }
    if (source && (cost.advancementTokens ?? 0) > 0) {
      source.advancementTokens =
        (source.advancementTokens ?? 0) - (cost.advancementTokens ?? 0);
      log(
        state,
        `Spend ${cost.advancementTokens} advancement(s) from ${source.title} → ${source.advancementTokens} (CR ${CR.advancing.number}).`,
      );
    }
    if ((cost.trashFromHq ?? 0) > 0) {
      for (let i = 0; i < (cost.trashFromHq ?? 0); i++) {
        const id = state.corp.hand.pop();
        if (!id) break;
        state.corp.discard.push(id);
        const c = state.cards[id];
        c.zone = "corp:archives";
        c.faceup = true;
        log(state, `Trash ${c.title} from HQ as cost.`);
      }
    }
    if ((cost.trashFromGrip ?? 0) > 0) {
      for (let i = 0; i < (cost.trashFromGrip ?? 0); i++) {
        const id = state.runner.hand.pop();
        if (!id) break;
        state.runner.discard.push(id);
        const c = state.cards[id];
        c.zone = "runner:heap";
        c.faceup = true;
        log(state, `Trash ${c.title} from grip as cost.`);
      }
    }
    if (cost.trashSelf && source) {
      removeCardFromCurrentZone(state, source.id);
      if (source.side === "runner") {
        state.runner.discard.push(source.id);
        source.zone = "runner:heap";
      } else {
        state.corp.discard.push(source.id);
        source.zone = "corp:archives";
      }
      source.faceup = true;
      log(
        state,
        `${source.title} trashed as cost (CR ${CR.trashing.number}).`,
      );
    }
    if ((cost.coreDamage ?? 0) > 0 && source) {
      dealDamage(state, "core", cost.coreDamage ?? 0, source.id);
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
  });
}

function runnerCardsForHostedSpend(
  state: GameState,
  purpose: "install" | "trash",
  forCard?: CardInstance,
): CardInstance[] {
  const ids = new Set<string>();
  for (const id of state.runner.rig) ids.add(id);
  if (state.run?.runSourceId) ids.add(state.run.runSourceId);
  for (const id of state.runner.discard) ids.add(id);
  const out: CardInstance[] = [];
  for (const id of ids) {
    const card = state.cards[id];
    if (!card) continue;
    if (!(card.hostedCreditsSpendFor ?? []).includes(purpose)) continue;
    if (
      purpose === "install" &&
      card.hostedCreditsSpendForInstallSubtypes?.length
    ) {
      if (!forCard || forCard.type !== "resource") continue;
      const need = card.hostedCreditsSpendForInstallSubtypes;
      const have = forCard.subtypes ?? [];
      if (!need.some((s) => have.includes(s))) continue;
    }
    out.push(card);
  }
  return out;
}

/** Cards that can spend non-recurring hosted credits for install costs. */
function hostedInstallSpendCards(
  state: GameState,
  side: Side,
  forCard?: CardInstance,
): CardInstance[] {
  if (side === "runner") {
    return runnerCardsForHostedSpend(state, "install", forCard);
  }
  const out: CardInstance[] = [];
  for (const card of Object.values(state.cards)) {
    if (
      card.side === "corp" &&
      card.rezzed &&
      (card.hostedCreditsSpendFor ?? []).includes("install")
    ) {
      out.push(card);
    }
  }
  return out;
}

function hostedTrashSpendCards(state: GameState): CardInstance[] {
  return runnerCardsForHostedSpend(state, "trash");
}

/** Bank + hosted-credit pools spendable for install costs. */
export function creditsAvailableForInstall(
  state: GameState,
  side: Side,
  forCard?: CardInstance,
): number {
  const p = side === "corp" ? state.corp : state.runner;
  let total = p.credits;
  for (const card of hostedInstallSpendCards(state, side, forCard)) {
    total += card.hostedCredits ?? 0;
  }
  return total;
}

/**
 * Pay an install cost, drawing from `hostedCreditsSpendFor: ["install"]`
 * pools before the credit bank (Cybersand / Urban Art Vernissage).
 * Optional `forCard` gates Open Market–class subtype-restricted pools.
 */
export function spendCreditsForInstall(
  state: GameState,
  side: Side,
  amount: number,
  forCard?: CardInstance,
): void {
  let left = amount;
  if (left <= 0) return;
  for (const card of hostedInstallSpendCards(state, side, forCard)) {
    if (left <= 0) break;
    const pool = card.hostedCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.hostedCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} hosted credits (install).`,
      );
      if (side === "runner") noteInstalledCardCreditSpend(state);
    }
  }
  const p = side === "corp" ? state.corp : state.runner;
  p.credits -= left;
}

/** Refill recurring credit pools on installed/rezzed cards for a side. */
export function refillRecurringCredits(state: GameState, side: Side): void {
  const ids =
    side === "corp"
      ? Object.values(state.cards)
          .filter((c) => c.side === "corp" && c.rezzed && (c.recurringCreditsMax ?? 0) > 0)
          .map((c) => c.id)
      : state.runner.rig.filter(
          (id) => (state.cards[id].recurringCreditsMax ?? 0) > 0,
        );

  for (const id of ids) {
    const card = state.cards[id];
    const max = card.recurringCreditsMax ?? 0;
    card.recurringCredits = max;
  }
  if (ids.length > 0) {
    log(
      state,
      `${side} recurring credits refill on ${ids.length} card(s) (CR ${CR.recurringCredits.number}).`,
    );
  }
}

/**
 * Spend Runner credits for trash / play_event, drawing from matching
 * recurringSpendFor pools (incl. `run_central` while attacking a central)
 * before the credit bank / run event credits.
 */
export function spendRunnerCreditsFor(
  state: GameState,
  amount: number,
  purpose: Exclude<RecurringSpendPurpose, "run_central">,
): void {
  let left = amount;
  if (left <= 0) return;
  for (const id of state.runner.rig) {
    if (left <= 0) break;
    const card = state.cards[id];
    if (!recurringMatchesPurpose(state, card, purpose)) continue;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      const label = (card.recurringSpendFor ?? []).includes("run_central")
        ? "run_central"
        : purpose;
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (${label}).`,
      );
      noteInstalledCardCreditSpend(state);
    }
  }
  if (
    (purpose === "trash" || purpose === "trash_asset") &&
    left > 0
  ) {
    for (const card of hostedTrashSpendCards(state)) {
      if (left <= 0) break;
      const pool = card.hostedCredits ?? 0;
      if (pool <= 0) continue;
      const take = Math.min(left, pool);
      card.hostedCredits = pool - take;
      left -= take;
      if (take > 0) {
        log(
          state,
          `Spend ${take}¢ from ${card.title} hosted credits (trash).`,
        );
        noteInstalledCardCreditSpend(state);
      }
    }
  }
  if (left > 0 && state.run && (state.run.eventCredits ?? 0) > 0) {
    const fromEvent = Math.min(left, state.run.eventCredits ?? 0);
    state.run.eventCredits = (state.run.eventCredits ?? 0) - fromEvent;
    left -= fromEvent;
    if (fromEvent > 0) {
      noteOutsideCreditPoolSpendDuringRun(state);
    }
  }
  left = takeFromHostedCreditsDuringRuns(state, left);
  state.runner.credits -= left;
}

/** Credits available for a purpose including matching recurring pools. */
export function runnerCreditsFor(
  state: GameState,
  purpose: Exclude<RecurringSpendPurpose, "run_central">,
): number {
  let total = state.runner.credits + (state.run?.eventCredits ?? 0);
  total += hostedCreditsSpendableDuringRuns(state);
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (recurringMatchesPurpose(state, card, purpose)) {
      total += card.recurringCredits ?? 0;
    }
  }
  if (purpose === "trash" || purpose === "trash_asset") {
    for (const card of hostedTrashSpendCards(state)) {
      total += card.hostedCredits ?? 0;
    }
  }
  return total;
}

/**
 * Sum of installed Runner cards’ `eventPlayCostDiscount` (Ghosttongue-class).
 * CR §1.16.2a — lower after increases; caller floors at 0.
 */
export function eventPlayCostDiscountTotal(state: GameState): number {
  let n = 0;
  for (const id of state.runner.rig) {
    n += state.cards[id].eventPlayCostDiscount ?? 0;
  }
  return n;
}

/**
 * Effective event play cost after continuous discounts (CR §1.16.2a / §3.7.2).
 */
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
  return Math.max(0, (playCost ?? 0) - discount);
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

function recurringMatchesPurpose(
  state: GameState,
  card: CardInstance,
  purpose: Exclude<RecurringSpendPurpose, "run_central">,
): boolean {
  const purposes = card.recurringSpendFor ?? [];
  if (purposes.includes(purpose)) return true;
  // Generic "trash" also covers asset trash costs.
  if (purpose === "trash_asset" && purposes.includes("trash")) return true;
  // Cezve-class: any purpose while attacking a central.
  if (purposes.includes("run_central") && isAttackingCentral(state)) return true;
  return false;
}
