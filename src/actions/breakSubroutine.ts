/**
 * Breaking ice subroutines, including bioroid break and the Tyrs Hand interrupt.
 */
import { log } from "../state/createGame.js";
import {
  cannotBreakExceptIcebreakerActive,
  cardHasIcebreakerSubtype,
} from "../state/lockdowns.js";
import { withCostCheckpoint } from "../legality/checkpoints.js";
import {
  ensurePriorityWindow,
  nestPriorityAfterAbility,
} from "../legality/priority.js";
import {
  evalEffect,
  fireAfterBreakSubroutineHooks,
  maybeFireFluxFirstBreakCharge,
} from "../effects/eval.js";
import {
  effectiveBreakerStrength,
  effectiveIceStrength,
  effectiveIceSubtypes,
  iceBlocksAiBreak,
  isAiBreaker,
} from "../cards/stubs.js";
import {
  runnerAvailableCreditsForBreaker,
  spendRunnerCredits,
} from "../state/costs.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { ApplyResult, GameState, RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

export function breakSubroutine(
  state: GameState,
  breakerId: string,
  subIndex: number,
): ApplyResult {
  if (state.timingKey !== "run.encounterPaw") {
    return fail("Subroutines can only be broken during the encounter PAW.", [
      CR.encounterBreakPaw,
    ]);
  }
  ensurePriorityWindow(state);
  const run = state.run;
  if (!run?.encounter) {
    return fail("No encounter in progress.", [CR.encounterIce]);
  }
  const ice = state.cards[run.encounter.iceId];
  const subs = ice.subroutines ?? [];
  if (subIndex < 0 || subIndex >= subs.length) {
    return fail("Invalid subroutine index.", [CR.encounterSubResolve]);
  }
  if (run.encounter.broken[subIndex]) {
    return fail("Subroutine already broken.", [CR.fullyBreak]);
  }
  if (!state.runner.rig.includes(breakerId)) {
    return fail("Breaker is not installed.", [CR.encounterBreakPaw]);
  }
  const breaker = state.cards[breakerId];
  if (!breaker.breaker) {
    return fail("Card is not an icebreaker.", [CR.encounterBreakPaw]);
  }
  if (breaker.breaker.breakViaPaidAbilityOnly) {
    return fail(
      `${breaker.title} breaks only via paid abilities (not credit break).`,
      [CR.encounterBreakPaw],
    );
  }
  if (breaker.cannotBreakSubsThisRun) {
    return fail(
      `${breaker.title}'s abilities cannot break subroutines this run (Hafrún).`,
      [CR.encounterBreakPaw],
    );
  }
  if (breaker.breakOnAtMostOneIcePerRun && state.run?.encounter?.iceId) {
    const used = state.run.kgBreakerUsedOnIceIds ?? {};
    const prior = used[breakerId];
    const encIce = state.run.encounter.iceId;
    if (prior && prior !== encIce) {
      return fail(
        `Cannot use ${breaker.title} on more than one ice per run.`,
        [CR.encounterBreakPaw],
      );
    }
  }
  let maxPrinted = ice.maxPrintedSubsBreakablePerEncounter;
  const atAdv = ice.maxPrintedSubsBreakablePerEncounterAtAdvancements;
  if (
    atAdv &&
    (ice.advancementTokens ?? 0) >= atAdv.threshold
  ) {
    maxPrinted = atAdv.max;
  }
  const exceptSub = ice.maxPrintedSubsBreakExceptSubtype;
  const breakerExempt =
    exceptSub && (breaker.subtypes ?? []).includes(exceptSub);
  if (
    typeof maxPrinted === "number" &&
    !breakerExempt &&
    run.encounter.broken.filter(Boolean).length >= maxPrinted
  ) {
    return fail(
      `Cannot break more than ${maxPrinted} printed subroutine(s) on ${ice.title} this encounter.`,
      [CR.encounterBreakPaw],
    );
  }
  if (breaker.breaker.breakRequiresAttackingMark) {
    if (!state.run || state.run.attackedServerId !== state.markServerId) {
      return fail(
        `${breaker.title} can only break ice protecting the mark.`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (typeof breaker.breaker.breakRequiresIceStrengthLte === "number") {
    const iceStr = effectiveIceStrength(state, ice.id);
    if (iceStr > breaker.breaker.breakRequiresIceStrengthLte) {
      return fail(
        `${breaker.title} can only break ice with ${breaker.breaker.breakRequiresIceStrengthLte} or less strength (current ${iceStr}).`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (typeof breaker.breaker.breakRequiresIceSubtypeCountGte === "number") {
    const need = breaker.breaker.breakRequiresIceSubtypeCountGte;
    const count = effectiveIceSubtypes(state, ice.id).length;
    if (count < need) {
      return fail(
        `${breaker.title} can only break ice with ${need}+ subtypes (this ice has ${count}).`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (typeof breaker.breaker.breakRequiresIceExactSubroutineCount === "number") {
    const need = breaker.breaker.breakRequiresIceExactSubroutineCount;
    const count = (ice.subroutines ?? []).length;
    if (count !== need) {
      return fail(
        `${breaker.title} can only break ice with exactly ${need} subroutine(s) (this ice has ${count}).`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (typeof breaker.breaker.breakRequiresIceRezCostGte === "number") {
    const need = breaker.breaker.breakRequiresIceRezCostGte;
    const rez = ice.rezCost ?? 0;
    if (rez < need) {
      return fail(
        `${breaker.title} can only break ice with rez cost ≥ ${need} (this ice is ${rez}).`,
        [CR.encounterBreakPaw],
      );
    }
  }
  const iceSubs = effectiveIceSubtypes(state, ice.id);
  const breaksAny = breaker.breaker.breaksSubtype === "*";
  if (!breaksAny && !iceSubs.includes(breaker.breaker.breaksSubtype)) {
    return fail(
      `Breaker cannot break ${breaker.breaker.breaksSubtype} on this ice.`,
      [CR.encounterBreakPaw],
    );
  }
  if (iceBlocksAiBreak(state, ice.id) && isAiBreaker(breaker)) {
    return fail("This ice cannot be broken by AI programs.", [
      CR.encounterBreakPaw,
    ]);
  }
  if (ice.cannotBreakExceptSubtype) {
    const need = ice.cannotBreakExceptSubtype;
    if (!(breaker.subtypes ?? []).includes(need)) {
      return fail(
        `Subroutines on ${ice.title} can only be broken by a ${need}.`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (ice.cannotBreakWithRunnerCardAbilities) {
    return fail(
      "Runner card abilities cannot break subroutines on this ice (Trieste).",
      [CR.encounterBreakPaw],
    );
  }
  if (
    cannotBreakExceptIcebreakerActive(state) &&
    !cardHasIcebreakerSubtype(breaker)
  ) {
    return fail(
      "Cannot break subroutines with a non-icebreaker card while NEXT Activation Command is active.",
      [CR.encounterBreakPaw, CR.lockdownOperation],
    );
  }

  const iceStr = effectiveIceStrength(state, ice.id);
  const brStr = effectiveBreakerStrength(state, breakerId);
  if (breaker.interfaceRequiresTrojanHost) {
    const hasTrojan = Object.values(state.cards).some(
      (c) =>
        c.hostId === ice.id &&
        (c.subtypes ?? []).includes("trojan") &&
        state.runner.rig.includes(c.id),
    );
    if (!hasTrojan) {
      return fail(
        `${breaker.title} can only interface ice hosting a trojan.`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (breaker.interfaceRequiresEqualStrength) {
    if (brStr !== iceStr) {
      return fail(
        `Breaker strength ${brStr} must equal ice strength ${iceStr}.`,
        [CR.encounterBreakPaw, CR.icebreakerInterfaceStrength],
      );
    }
  } else if (brStr < iceStr) {
    return fail(
      `Breaker strength ${brStr} < ice strength ${iceStr} (CR ${CR.icebreakerInterfaceStrength.number}).`,
      [CR.encounterBreakPaw, CR.icebreakerInterfaceStrength],
    );
  }

  const free = run.encounter.freeBreaksRemaining;
  let cost = 0;
  if (free && free.breakerId === breakerId && free.remaining > 0) {
    free.remaining -= 1;
    if (free.remaining <= 0) {
      delete run.encounter.freeBreaksRemaining;
    }
    cost = 0;
  } else {
    cost = breaker.breaker.breakCredits + (state.run?.kgIcebreakerBreakAdditionalCost ?? 0);
    if (
      breaker.breaker.breakCreditsDiscountIfSuccessfulRunThisTurn &&
      state.turn.successfulRunThisTurn
    ) {
      cost = Math.max(
        0,
        cost - breaker.breaker.breakCreditsDiscountIfSuccessfulRunThisTurn,
      );
    }
    if (breaker.breaker.breakCreditsDiscountPerInstalledSubtype) {
      const { subtype, amount } =
        breaker.breaker.breakCreditsDiscountPerInstalledSubtype;
      const n = state.runner.rig.filter((id) =>
        (state.cards[id].subtypes ?? []).includes(subtype),
      ).length;
      cost = Math.max(0, cost - amount * n);
    }
    const attacked = state.run!.attackedServerId;
    for (const rid of state.servers[attacked].root) {
      const up = state.cards[rid];
      if (
        up?.rezzed &&
        up.runnerIcebreakerAbilityAdditionalCostOnThisServer
      ) {
        cost += up.runnerIcebreakerAbilityAdditionalCostOnThisServer;
      }
    }
    if (runnerAvailableCreditsForBreaker(state) < cost) {
      return fail("Insufficient credits to break.", [CR.encounterBreakPaw]);
    }
    withCostCheckpoint(state, "break_subroutine", () => {
      spendRunnerCredits(state, cost);
    });
    const maxSubs = breaker.breaker.breakMaxSubs ?? 1;
    if (maxSubs > 1) {
      run.encounter.freeBreaksRemaining = {
        breakerId,
        remaining: maxSubs - 1,
      };
    }
  }
  run.encounter.broken[subIndex] = true;
  if (run.encounter.broken.every(Boolean)) {
    run.encounter.fullyBrokenByRunner = true;
  }
  maybeFireOnHostFullyBrokenThisEncounter(state);
  if (!run.breakersThatBroke) run.breakersThatBroke = [];
  if (!run.breakersThatBroke.includes(breakerId)) {
    run.breakersThatBroke.push(breakerId);
  }
  if (run.encounter) {
    if (!run.encounter.breakersThatBrokeThisEncounter) {
      run.encounter.breakersThatBrokeThisEncounter = [];
    }
    if (!run.encounter.breakersThatBrokeThisEncounter.includes(breakerId)) {
      run.encounter.breakersThatBrokeThisEncounter.push(breakerId);
    }
  }
  if (breaker.breakOnAtMostOneIcePerRun && run.encounter?.iceId) {
    run.kgBreakerUsedOnIceIds = run.kgBreakerUsedOnIceIds ?? {};
    run.kgBreakerUsedOnIceIds[breakerId] = run.encounter.iceId;
  }
  if ((breaker.subtypes ?? []).includes("decoder")) {
    run.encounter.brokePrintedSubWithDecoder = true;
  }
  log(
    state,
    `Runner breaks "${subs[subIndex].text}" with ${breaker.title} (str ${brStr}) for ${cost}¢ (CR ${CR.encounterBreakPaw.number}, ${CR.fullyBreak.number}).`,
  );
  // Chiyashi: break while AI installed → trash top N of stack.
  const chiyashiN = ice.trashTopOfStackOnBreakSubIfRunnerHasAi ?? 0;
  if (chiyashiN > 0) {
    const hasAi = state.runner.rig.some((id) =>
      (state.cards[id]?.subtypes ?? []).includes("ai"),
    );
    if (hasAi) {
      for (let i = 0; i < chiyashiN; i++) {
        if (state.runner.deck.length === 0) break;
        const top = state.runner.deck.shift()!;
        moveRunnerCardToHeap(state, top);
      }
      log(
        state,
        `${ice.title} — trash top ${chiyashiN} of stack (AI installed).`,
      );
    }
  }
  const loseOnBreak = ice.runnerLoseCreditsOnBreakPrintedSubroutine ?? 0;
  if (loseOnBreak > 0) {
    const lost = Math.min(loseOnBreak, state.runner.credits);
    state.runner.credits -= lost;
    log(
      state,
      `${ice.title} — Runner loses ${lost}¢ for breaking a printed subroutine → ${state.runner.credits}¢.`,
    );
  }
  if (maybeFireFluxFirstBreakCharge(state) && state.pendingChoice) {
    return ok(state);
  }
  // Curupira: every full break.
  if (breaker.onFullyBreak && run.encounter.broken.every(Boolean)) {
    const r = evalEffect(
      { state, sourceId: breakerId },
      breaker.onFullyBreak,
    );
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice) return ok(state);
  }
  // Orca / Abaasy: first full break this turn by this program
  if (
    breaker.onFullyBreakOncePerTurn &&
    run.encounter.broken.every(Boolean) &&
    !state.turn.onFullyBreakFiredIds.includes(breakerId)
  ) {
    state.turn.onFullyBreakFiredIds.push(breakerId);
    const r = evalEffect(
      { state, sourceId: breakerId },
      breaker.onFullyBreakOncePerTurn,
    );
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice) return ok(state);
  }
  fireAfterBreakSubroutineHooks(state, breakerId);
  if (state.pendingChoice) return ok(state);
  nestPriorityAfterAbility(state, "break_subroutine");
  return ok(state);
}

/**
 * Bioroid Efficiency Research: fire `onHostFullyBrokenThisEncounter` once
 * per encounter for condition counters hosted on the just-fully-broken ice.
 */
function maybeFireOnHostFullyBrokenThisEncounter(state: GameState): void {
  const enc = state.run?.encounter;
  if (!enc?.fullyBrokenByRunner) return;
  const ice = state.cards[enc.iceId];
  if (ice?.trashSelfWhenFullyBrokenByRunner) {
    evalEffect(
      { state, sourceId: enc.iceId },
      { op: "do", action: { kind: "trash_self" } },
    );
  }
  // Valley Grid: fully break ice protecting this server.
  {
    const server = Object.values(state.servers).find((s) =>
      s.ice.includes(enc.iceId),
    );
    if (server) {
      for (const rid of server.root) {
        const up = state.cards[rid];
        if (!up?.rezzed || !up.onFullyBreakProtectingIce) continue;
        const r = evalEffect(
          { state, sourceId: rid },
          up.onFullyBreakProtectingIce,
        );
        if (!r.ok) {
          log(state, `onFullyBreakProtectingIce failed on ${up.title}: ${r.error}`);
        }
      }
    }
  }
  const fired = enc.hostFullyBrokenFiredIds ?? [];
  for (const [id, card] of Object.entries(state.cards)) {
    if (card.hostId !== enc.iceId) continue;
    if (!card.onHostFullyBrokenThisEncounter) continue;
    if (fired.includes(id)) continue;
    fired.push(id);
    enc.hostFullyBrokenFiredIds = fired;
    log(
      state,
      `${card.title} — host ice fully broken this encounter.`,
    );
    const r = evalEffect(
      { state, sourceId: id },
      card.onHostFullyBrokenThisEncounter,
    );
    if (!r.ok) {
      log(
        state,
        `onHostFullyBrokenThisEncounter failed on ${card.title}: ${r.error}`,
      );
    }
    if (state.pendingChoice || state.done) return;
  }
}

/**
 * Tyr's Hand-class: opens a `break_interrupt_paw` pending window instead of
 * immediately marking `subIndex` broken, when the encountered ice is a
 * bioroid protecting a server with an eligible upgrade (rezzed — always
 * eligible via its `[trash]` ability — or unrezzed and affordable to rez).
 * Returns true when the window was opened (caller must not finalize yet).
 */
function maybeOpenTyrsHandInterrupt(
  state: GameState,
  ice: GameState["cards"][string],
  subIndex: number,
): boolean {
  if (!(ice.subtypes ?? []).includes("bioroid")) return false;
  const server = Object.values(state.servers).find((s) =>
    s.ice.includes(ice.id),
  );
  if (!server) return false;
  const eligible = server.root.some((id) => {
    const c = state.cards[id];
    if (!c?.preventSubroutineBreakOnBioroidByTrash) return false;
    if (c.rezzed) return true;
    return state.corp.credits >= (c.rezCost ?? 0);
  });
  if (!eligible) return false;
  state.pendingSubroutineBreak = { iceId: ice.id, subIndex };
  log(
    state,
    `Interrupt — "${ice.subroutines?.[subIndex]?.text ?? ""}" on ${ice.title} would be broken (Tyr's Hand-class).`,
  );
  return true;
}

/**
 * Rez an upgrade eligible for the `break_interrupt_paw` window as an
 * interrupt reaction, bypassing the normal PAW-window gate on `rezAsset`
 * (this window is a `pendingSubroutineBreak` pause, not a graph step).
 */
export function resolveTyrsHandRezDuringBreakInterrupt(
  state: GameState,
  cardId: string,
): ApplyResult {
  const pending = state.pendingSubroutineBreak;
  if (!pending) {
    return fail("No pending subroutine-break interrupt.", [
      CR.encounterBreakPaw,
    ]);
  }
  const card = state.cards[cardId];
  if (!card || card.type !== "upgrade" || !card.preventSubroutineBreakOnBioroidByTrash) {
    return fail("Not eligible to rez during this interrupt.", [
      CR.rezProcedure,
    ]);
  }
  if (card.rezzed) {
    return fail("Already rezzed.", [CR.rezProcedure]);
  }
  const server = Object.values(state.servers).find((s) =>
    s.root.includes(cardId),
  );
  if (!server || !server.ice.includes(pending.iceId)) {
    return fail("This upgrade does not protect the ice's server.", [
      CR.rezProcedure,
    ]);
  }
  const cost = card.rezCost ?? 0;
  if (state.corp.credits < cost) {
    return fail("Insufficient credits to rez.", [CR.inherentRezCost]);
  }
  withCostCheckpoint(state, "rez_asset", () => {
    state.corp.credits -= cost;
  });
  card.rezzed = true;
  card.faceup = true;
  const ice = state.cards[pending.iceId];
  log(
    state,
    `Rez ${card.title} (interrupt — subroutine break on ${ice?.title ?? "bioroid ice"}).`,
  );
  if (card.onRez) {
    const r = evalEffect({ state, sourceId: cardId }, card.onRez);
    if (!r.ok) return fail(r.error, r.cites);
  }
  return ok(state);
}

/**
 * Finalize a `pendingSubroutineBreak` window: either the subroutine is
 * marked broken as normal (`prevented` false — Corp declined/passed), or it
 * is not (Tyr's Hand-class `[trash]` prevented it).
 */
export function finalizePendingSubroutineBreak(
  state: GameState,
  prevented: boolean,
): ApplyResult {
  const pending = state.pendingSubroutineBreak;
  if (!pending) {
    return fail("No pending subroutine-break interrupt.", [
      CR.encounterBreakPaw,
    ]);
  }
  state.pendingSubroutineBreak = null;
  const ice = state.cards[pending.iceId];
  const run = state.run;
  if (
    prevented ||
    !run?.encounter ||
    run.encounter.iceId !== pending.iceId ||
    !ice
  ) {
    if (prevented) {
      log(
        state,
        `Prevent "${ice?.subroutines?.[pending.subIndex]?.text ?? ""}" from being broken on ${ice?.title ?? pending.iceId}.`,
      );
    }
    nestPriorityAfterAbility(state, "break_bioroid_subroutine");
    return ok(state);
  }
  run.encounter.broken[pending.subIndex] = true;
  log(
    state,
    `Break "${ice.subroutines?.[pending.subIndex]?.text ?? ""}" on bioroid ${ice.title} (CR ${CR.encounterBreakPaw.number}).`,
  );
  if (ice.bioroidBreakGivesCorpAllottedClickNextTurn) {
    state.corpAllottedClicksDeltaNextTurn =
      (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
    log(
      state,
      `${ice.title} — Corp allotted clicks next turn +1 → pending ${state.corpAllottedClicksDeltaNextTurn} (CR ${CR.corpAllottedClicks.number}).`,
    );
  }
  if (run.encounter.broken.every(Boolean)) {
    run.encounter.fullyBrokenByRunner = true;
  }
  maybeFireOnHostFullyBrokenThisEncounter(state);
  if (state.pendingChoice) return ok(state);
  if (maybeFireFluxFirstBreakCharge(state) && state.pendingChoice) {
    return ok(state);
  }
  fireAfterBreakSubroutineHooks(state, null);
  if (state.pendingChoice) return ok(state);
  nestPriorityAfterAbility(state, "break_bioroid_subroutine");
  return ok(state);
}

export function breakBioroidSubroutine(
  state: GameState,
  subIndex: number,
): ApplyResult {
  const run = state.run;
  if (!run?.encounter) {
    return fail("No encounter in progress.", [CR.encounterIce]);
  }
  if (state.turn.bioroidIcePaidAbilitiesForbidden) {
    return fail(
      "Runner cannot use paid abilities printed on bioroid ice this turn.",
      [CR.paidAbility, CR.cannotPrecedence],
    );
  }
  const ice = state.cards[run.encounter.iceId];
  if (!(ice.subtypes ?? []).includes("bioroid")) {
    return fail("Encountered ice is not a bioroid.", [CR.encounterBreakPaw]);
  }
  const subs = ice.subroutines ?? [];
  if (subIndex < 0 || subIndex >= subs.length) {
    return fail("Invalid subroutine index.", [CR.encounterSubResolve]);
  }
  if (run.encounter.broken[subIndex]) {
    return fail("Subroutine already broken.", [CR.fullyBreak]);
  }
  if (subs[subIndex].requireLostClickToBreakThisRun && !run.lostClickToBreakThisRun) {
    return fail(
      "This subroutine cannot be broken unless the Runner has spent [click] to break a subroutine on a bioroid this run.",
      [CR.encounterBreakPaw],
    );
  }
  if (state.runner.clicks < 1) {
    return fail("Insufficient clicks to break bioroid subroutine.", [
      CR.spendClicks,
      CR.encounterBreakPaw,
    ]);
  }
  withCostCheckpoint(state, "break_bioroid_subroutine", () => {
    state.runner.clicks -= 1;
  });
  run.lostClickToBreakThisRun = true;
  if (maybeOpenTyrsHandInterrupt(state, ice, subIndex)) {
    log(
      state,
      `Runner spends [click] to attempt to break "${subs[subIndex].text}" on bioroid ${ice.title} — Corp may interrupt (Tyr's Hand-class).`,
    );
    return ok(state);
  }
  run.encounter.broken[subIndex] = true;
  log(
    state,
    `Runner spends [click] to break "${subs[subIndex].text}" on bioroid ${ice.title} (CR ${CR.encounterBreakPaw.number}, ${CR.spendClicks.number}).`,
  );
  if (ice.bioroidBreakGivesCorpAllottedClickNextTurn) {
    state.corpAllottedClicksDeltaNextTurn =
      (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
    log(
      state,
      `${ice.title} — Corp allotted clicks next turn +1 → pending ${state.corpAllottedClicksDeltaNextTurn} (CR ${CR.corpAllottedClicks.number}).`,
    );
  }
  if (run.encounter.broken.every(Boolean)) {
    run.encounter.fullyBrokenByRunner = true;
  }
  maybeFireOnHostFullyBrokenThisEncounter(state);
  if (state.pendingChoice) return ok(state);
  if (maybeFireFluxFirstBreakCharge(state) && state.pendingChoice) {
    return ok(state);
  }
  fireAfterBreakSubroutineHooks(state, null);
  if (state.pendingChoice) return ok(state);
  nestPriorityAfterAbility(state, "break_bioroid_subroutine");
  return ok(state);
}

/**
 * Bioroid 2.0-class (Heimdall/Ichi/Viktor 2.0): [click] × N breaks up to N
 * subroutines on this bioroid in one paid ability. Cost is always
 * `ice.bioroidBreakMaxSubs` clicks, regardless of how many subs (1..N) are
 * chosen (card text: "[click][click]: Break up to N subroutines").
 */
export function breakBioroidSubroutines(
  state: GameState,
  subIndexes: number[],
): ApplyResult {
  const run = state.run;
  if (!run?.encounter) {
    return fail("No encounter in progress.", [CR.encounterIce]);
  }
  if (state.turn.bioroidIcePaidAbilitiesForbidden) {
    return fail(
      "Runner cannot use paid abilities printed on bioroid ice this turn.",
      [CR.paidAbility, CR.cannotPrecedence],
    );
  }
  const ice = state.cards[run.encounter.iceId];
  if (!(ice.subtypes ?? []).includes("bioroid")) {
    return fail("Encountered ice is not a bioroid.", [CR.encounterBreakPaw]);
  }
  const maxSubs = ice.bioroidBreakMaxSubs;
  if (!maxSubs || maxSubs < 2) {
    return fail("This bioroid does not support multi-sub breaking.", [
      CR.encounterBreakPaw,
    ]);
  }
  const uniq = [...new Set(subIndexes)];
  if (uniq.length === 0 || uniq.length > maxSubs) {
    return fail(`Choose 1 to ${maxSubs} subroutines to break.`, [
      CR.encounterBreakPaw,
    ]);
  }
  const subs = ice.subroutines ?? [];
  for (const subIndex of uniq) {
    if (subIndex < 0 || subIndex >= subs.length) {
      return fail("Invalid subroutine index.", [CR.encounterSubResolve]);
    }
    if (run.encounter.broken[subIndex]) {
      return fail("Subroutine already broken.", [CR.fullyBreak]);
    }
    if (
      subs[subIndex].requireLostClickToBreakThisRun &&
      !run.lostClickToBreakThisRun
    ) {
      return fail(
        "This subroutine cannot be broken unless the Runner has spent [click] to break a subroutine on a bioroid this run.",
        [CR.encounterBreakPaw],
      );
    }
  }
  if (state.runner.clicks < maxSubs) {
    return fail("Insufficient clicks to break bioroid subroutines.", [
      CR.spendClicks,
      CR.encounterBreakPaw,
    ]);
  }
  withCostCheckpoint(state, "break_bioroid_subroutines", () => {
    state.runner.clicks -= maxSubs;
  });
  for (const subIndex of uniq) {
    run.encounter.broken[subIndex] = true;
  }
  run.lostClickToBreakThisRun = true;
  log(
    state,
    `Runner spends [click]×${maxSubs} to break ${uniq.length} subroutine(s) on bioroid ${ice.title} (CR ${CR.encounterBreakPaw.number}, ${CR.spendClicks.number}).`,
  );
  if (ice.bioroidBreakGivesCorpAllottedClickNextTurn) {
    state.corpAllottedClicksDeltaNextTurn =
      (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
    log(
      state,
      `${ice.title} — Corp allotted clicks next turn +1 → pending ${state.corpAllottedClicksDeltaNextTurn} (CR ${CR.corpAllottedClicks.number}).`,
    );
  }
  if (run.encounter.broken.every(Boolean)) {
    run.encounter.fullyBrokenByRunner = true;
  }
  maybeFireOnHostFullyBrokenThisEncounter(state);
  if (state.pendingChoice) return ok(state);
  if (maybeFireFluxFirstBreakCharge(state) && state.pendingChoice) {
    return ok(state);
  }
  fireAfterBreakSubroutineHooks(state, null);
  if (state.pendingChoice) return ok(state);
  nestPriorityAfterAbility(state, "break_bioroid_subroutines");
  return ok(state);
}

