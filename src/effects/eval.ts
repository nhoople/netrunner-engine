import { addRestriction } from "../legality/checkpoints.js";
import { dealDamage } from "../state/damage.js";
import { log } from "../state/createGame.js";
import {
  chargeableInstalledIds,
  chargeCard,
  identifyMark,
  resolveSabotageAmount,
} from "../state/msKeywords.js";
import { noteVirusProgramInstalled } from "../state/virusInstall.js";
import { noteProgramOrHardwareInstalled } from "../state/programHardwareInstall.js";
import { maybeFirePowerCountersGte, syncEtrPerPowerCounterSubs } from "../state/powerCounters.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";
import {
  fireCorpOnTrash,
  moveRunnerCardToHeap,
  noteCorpCardAddedToArchives,
  purgeVirusCounters,
} from "../state/trashHooks.js";
import { removeCardFromCurrentZone, canScoreAgenda, checkWinConditions, scoreAgenda, stealAgenda } from "../state/scoring.js";
import { autoResolveTrace, startTrace } from "../state/trace.js";
import { memoryLimit, usedMemory } from "../state/turn.js";
import type { GameState, RuleCite, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { fx, type Cond, type Effect, type Primitive, type SideRef } from "./ir.js";

export interface EffectCtx {
  state: GameState;
  /** Card whose ability/sub is firing. */
  sourceId: string;
  /** Who paid (paid abilities); defaults to source.side. */
  payerSide?: Side;
}

export type EvalResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function breakerStrength(state: GameState, breakerId: string): number {
  const card = state.cards[breakerId];
  let base = card.breaker?.strength ?? card.strength ?? 0;
  if (card.strengthBonusPerIcebreaker) {
    const n = state.runner.rig.filter(
      (id) =>
        Boolean(state.cards[id].breaker) ||
        (state.cards[id].subtypes ?? []).includes("icebreaker"),
    ).length;
    base += card.strengthBonusPerIcebreaker * n;
  }
  if (card.strengthBonusPerCoreDamageThisGame) {
    base += card.strengthBonusPerCoreDamageThisGame * state.runner.brainDamage;
  }
  if (card.strengthPerPowerCounter) {
    base += card.powerCounters ?? 0;
  }
  const runBoost = state.run?.strengthBoosts[breakerId] ?? 0;
  const encBoost = state.run?.encounterStrengthBoosts[breakerId] ?? 0;
  return base + runBoost + encBoost;
}

function iceStrength(state: GameState, iceId: string): number {
  const card = state.cards[iceId];
  const base = card.strength ?? 0;
  return base + (state.run?.iceStrengthBoosts[iceId] ?? 0);
}

function resolveSide(ctx: EffectCtx, ref: SideRef): Side {
  if (ref === "corp" || ref === "runner") return ref;
  if (ref === "payer") {
    return ctx.payerSide ?? ctx.state.cards[ctx.sourceId].side;
  }
  return ctx.state.cards[ctx.sourceId].side;
}

/** Install cost after card-level discounts, then effect discount. */
function gripInstallCostAfterDiscount(
  state: GameState,
  card: GameState["cards"][string],
  discount: number,
): number {
  let cost = card.installCost;
  if (
    card.installCostDiscountIfSuccessfulRunThisTurn &&
    state.turn.successfulRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - card.installCostDiscountIfSuccessfulRunThisTurn,
    );
  }
  if (card.type === "program" && state.turn.programsInstalledThisTurn === 0) {
    for (const id of state.runner.rig) {
      const d = state.cards[id].firstProgramInstallDiscount ?? 0;
      if (d > 0) cost = Math.max(0, cost - d);
    }
  }
  return Math.max(0, cost - discount);
}

function trashOtherConsoles(state: GameState, keepId: string): void {
  const toTrash = state.runner.rig.filter((id) => {
    if (id === keepId) return false;
    return (state.cards[id].subtypes ?? []).includes("console");
  });
  for (const id of toTrash) {
    const card = state.cards[id];
    removeCardFromCurrentZone(state, id);
    state.runner.discard.push(id);
    card.zone = "runner:heap";
    card.faceup = true;
    log(
      state,
      `Trash ${card.title} (console limit; CR 3.8.5b).`,
    );
  }
}

/**
 * Install a grip program/hardware/resource paying `discount`¢ less.
 * Places powerCountersOnInstall before returning so may-charge sees them.
 */
function installGripCardDiscounted(
  state: GameState,
  cardId: string,
  discount: number,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !state.runner.hand.includes(cardId)) {
    return {
      ok: false,
      error: `install_grip_card: ${cardId} not in grip.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!["program", "hardware", "resource"].includes(card.type)) {
    return {
      ok: false,
      error: "install_grip_card supports program/hardware/resource.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    log(
      state,
      `Install ${card.title} discounted — host-ice installs not supported here.`,
    );
    return { ok: true };
  }
  if (card.type === "program") {
    const need = card.memoryCost ?? 1;
    if (usedMemory(state) + need > memoryLimit(state)) {
      log(
        state,
        `Install ${card.title} discounted — insufficient MU.`,
      );
      return { ok: true };
    }
  }
  const cost = gripInstallCostAfterDiscount(state, card, discount);
  if (state.runner.credits < cost) {
    log(
      state,
      `Install ${card.title} discounted — cannot afford ${cost}¢.`,
    );
    return { ok: true };
  }
  state.runner.credits -= cost;
  state.runner.hand = state.runner.hand.filter((x) => x !== cardId);
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  state.turn.installedThisTurn.push(cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Install ${card.title} for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

/**
 * Flux Capacitor: after the first subroutine break this encounter with host
 * ice, offer may-charge. Returns true when a pendingChoice was opened.
 */
export function maybeFireFluxFirstBreakCharge(state: GameState): boolean {
  const enc = state.run?.encounter;
  if (!enc) return false;
  const brokenCount = enc.broken.filter(Boolean).length;
  if (brokenCount !== 1) return false;
  const fired = enc.firstBreakChargeFiredIds ?? [];
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (
      !card?.chargeOnFirstBreakDuringHostEncounter ||
      card.hostId !== enc.iceId ||
      fired.includes(id)
    ) {
      continue;
    }
    enc.firstBreakChargeFiredIds = [...fired, id];
    const r = evalEffect({ state, sourceId: id }, fx.mayChargeChoose());
    if (!r.ok) {
      log(state, `Flux first-break charge failed on ${card.title}: ${r.error}`);
      continue;
    }
    if (state.pendingChoice) return true;
  }
  return false;
}

function offerMayChargeCard(
  state: GameState,
  cardId: string,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || (card.powerCounters ?? 0) < 1) {
    log(
      state,
      `May charge ${card?.title ?? cardId} — not able (CR ${CR.chargeRequiresCounter.number}).`,
    );
    return { ok: true };
  }
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: [
      {
        id: "charge",
        label: `Charge ${card.title}`,
        effect: {
          op: "do" as const,
          action: {
            kind: "charge" as const,
            pick: "card" as const,
            cardId,
          },
        },
      },
      {
        id: "decline",
        label: "Decline to charge",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "runner" as const,
            amount: 0,
          },
        },
      },
    ],
  };
  log(
    state,
    `May charge ${card.title} (CR ${CR.charge.number}).`,
  );
  return { ok: true };
}

/** Deterministic stack shuffle used after searches (v0). */
function shuffleRunnerStack(state: GameState): void {
  state.runner.deck.reverse();
}

function stackProgramInstallCost(
  state: GameState,
  card: GameState["cards"][string],
): number {
  let cost = card.installCost;
  if (
    card.installCostDiscountIfSuccessfulRunThisTurn &&
    state.turn.successfulRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - card.installCostDiscountIfSuccessfulRunThisTurn,
    );
  }
  if (card.type === "program" && state.turn.programsInstalledThisTurn === 0) {
    for (const id of state.runner.rig) {
      const discount = state.cards[id].firstProgramInstallDiscount ?? 0;
      if (discount > 0) cost = Math.max(0, cost - discount);
    }
  }
  return cost;
}

function canInstallStackProgram(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card || card.type !== "program") return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  const need = card.memoryCost ?? 1;
  if (usedMemory(state) + need > memoryLimit(state)) return false;
  return state.runner.credits >= stackProgramInstallCost(state, card);
}

/**
 * Install a program from the Runner's stack paying full install cost.
 * Shuffles the remaining stack afterward.
 */
function installStackProgramPaying(
  state: GameState,
  cardId: string,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !state.runner.deck.includes(cardId)) {
    return {
      ok: false,
      error: `install_stack_program: ${cardId} not in stack.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (card.type !== "program") {
    return {
      ok: false,
      error: "install_stack_program requires a program.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!canInstallStackProgram(state, cardId)) {
    log(
      state,
      `Install ${card.title} from stack — cannot afford or insufficient MU.`,
    );
    shuffleRunnerStack(state);
    return { ok: true };
  }
  const cost = stackProgramInstallCost(state, card);
  state.runner.credits -= cost;
  state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  state.turn.installedThisTurn.push(cardId);
  state.turn.programsInstalledThisTurn += 1;
  shuffleRunnerStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Search stack — install ${card.title} for ${cost}¢ (from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

function stackCardInstallCost(
  state: GameState,
  card: GameState["cards"][string],
  discount: number,
): number {
  return gripInstallCostAfterDiscount(state, card, discount);
}

function canInstallStackCard(
  state: GameState,
  cardId: string,
  discount: number,
): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  if (!["program", "hardware", "resource"].includes(card.type)) return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  if (card.type === "program") {
    const need = card.memoryCost ?? 1;
    if (usedMemory(state) + need > memoryLimit(state)) return false;
  }
  return state.runner.credits >= stackCardInstallCost(state, card, discount);
}

/**
 * Install program/hardware/resource from stack paying `discount`¢ less.
 * Shuffles the remaining stack afterward.
 */
function installStackCardPaying(
  state: GameState,
  cardId: string,
  discount: number,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !state.runner.deck.includes(cardId)) {
    return {
      ok: false,
      error: `install_stack_card: ${cardId} not in stack.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!["program", "hardware", "resource"].includes(card.type)) {
    return {
      ok: false,
      error: "install_stack_card supports program/hardware/resource.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!canInstallStackCard(state, cardId, discount)) {
    log(
      state,
      `Install ${card.title} from stack — cannot afford or insufficient MU.`,
    );
    shuffleRunnerStack(state);
    return { ok: true };
  }
  const cost = stackCardInstallCost(state, card, discount);
  state.runner.credits -= cost;
  state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  state.turn.installedThisTurn.push(cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  shuffleRunnerStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Search stack — install ${card.title} for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

function searchStackTypeInstall(
  state: GameState,
  sourceId: string,
  cardType: "program" | "hardware" | "resource",
  discount: number,
): EvalResult {
  const matches = state.runner.deck.filter((id) => {
    const c = state.cards[id];
    return (
      c.type === cardType &&
      !c.installOnIce &&
      !(c.subtypes ?? []).includes("trojan")
    );
  });
  if (matches.length === 0) {
    shuffleRunnerStack(state);
    log(state, `Search stack for a ${cardType} — none found.`);
    return { ok: true };
  }
  const affordable = matches.filter((id) =>
    canInstallStackCard(state, id, discount),
  );
  if (affordable.length === 0) {
    shuffleRunnerStack(state);
    log(
      state,
      `Search stack for a ${cardType} — ${matches.length} found but none affordable.`,
    );
    return { ok: true };
  }
  if (affordable.length === 1) {
    return installStackCardPaying(
      state,
      affordable[0]!,
      discount,
      sourceId,
    );
  }
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: affordable.map((id) => {
      const c = state.cards[id];
      const cost = stackCardInstallCost(state, c, discount);
      return {
        id: `stack-install-${id}`,
        label: `Install ${c.title} for ${cost}¢`,
        effect: {
          op: "do" as const,
          action: {
            kind: "install_stack_card" as const,
            cardId: id,
            discount,
          },
        },
      };
    }),
  };
  log(
    state,
    `Search stack — choose among ${affordable.length} ${cardType}(s) to install.`,
  );
  return { ok: true };
}

function shuffleRunnerSetAsideIntoStack(state: GameState): void {
  const aside = state.runner.setAside ?? [];
  for (const id of aside) {
    if (state.cards[id]?.zone !== "runner:set-aside") continue;
    state.runner.deck.push(id);
    state.cards[id]!.zone = "runner:stack";
    state.cards[id]!.faceup = false;
  }
  state.runner.setAside = [];
  shuffleRunnerStack(state);
  log(
    state,
    `Shuffle ${aside.length} set-aside card(s) into the stack.`,
  );
}

function canInstallSetAsideProgram(
  state: GameState,
  cardId: string,
  discount: number,
): boolean {
  const card = state.cards[cardId];
  if (!card || card.type !== "program") return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  const aside = state.runner.setAside ?? [];
  if (!aside.includes(cardId)) return false;
  const need = card.memoryCost ?? 1;
  if (usedMemory(state) + need > memoryLimit(state)) return false;
  return state.runner.credits >= stackCardInstallCost(state, card, discount);
}

function installSetAsideProgramPaying(
  state: GameState,
  cardId: string,
  discount: number,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !(state.runner.setAside ?? []).includes(cardId)) {
    return {
      ok: false,
      error: `install_set_aside_program: ${cardId} not set aside.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (card.type !== "program") {
    return {
      ok: false,
      error: "install_set_aside_program requires a program.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!canInstallSetAsideProgram(state, cardId, discount)) {
    log(
      state,
      `Install ${card.title} from set-aside — cannot afford or insufficient MU.`,
    );
    shuffleRunnerSetAsideIntoStack(state);
    return { ok: true };
  }
  const cost = stackCardInstallCost(state, card, discount);
  state.runner.credits -= cost;
  state.runner.setAside = (state.runner.setAside ?? []).filter(
    (x) => x !== cardId,
  );
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashOtherConsoles(state, cardId);
  }
  state.turn.installedThisTurn.push(cardId);
  state.turn.programsInstalledThisTurn += 1;
  shuffleRunnerSetAsideIntoStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Install ${card.title} from set-aside for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return r;
  }
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

function searchStackProgramInstall(
  state: GameState,
  sourceId: string,
): EvalResult {
  const matches = state.runner.deck.filter((id) => {
    const c = state.cards[id];
    return (
      c.type === "program" &&
      !c.installOnIce &&
      !(c.subtypes ?? []).includes("trojan")
    );
  });
  if (matches.length === 0) {
    shuffleRunnerStack(state);
    log(state, `Search stack for a program — none found.`);
    return { ok: true };
  }
  const affordable = matches.filter((id) => canInstallStackProgram(state, id));
  if (affordable.length === 0) {
    shuffleRunnerStack(state);
    log(
      state,
      `Search stack for a program — ${matches.length} found but none affordable.`,
    );
    return { ok: true };
  }
  if (affordable.length === 1) {
    return installStackProgramPaying(state, affordable[0]!, sourceId);
  }
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: affordable.map((id) => {
      const c = state.cards[id];
      const cost = stackProgramInstallCost(state, c);
      return {
        id: `stack-install-${id}`,
        label: `Install ${c.title} for ${cost}¢`,
        effect: {
          op: "do" as const,
          action: {
            kind: "install_stack_program" as const,
            cardId: id,
          },
        },
      };
    }),
  };
  log(
    state,
    `Search stack — choose among ${affordable.length} programs to install.`,
  );
  return { ok: true };
}

/**
 * Offer the next unused exclusive option, or auto-resolve when only one
 * remains. Clears `pendingExclusiveChoices` when done.
 */
export function offerNextExclusiveChoice(state: GameState): EvalResult {
  const pend = state.pendingExclusiveChoices;
  if (!pend || pend.remaining <= 0) {
    state.pendingExclusiveChoices = null;
    return { ok: true };
  }
  const available = pend.options.filter((o) => !pend.usedIds.includes(o.id));
  if (available.length === 0) {
    state.pendingExclusiveChoices = null;
    log(state, `Exclusive choices — no unused options left.`);
    return { ok: true };
  }
  if (available.length === 1) {
    const o = available[0]!;
    pend.usedIds.push(o.id);
    pend.remaining -= 1;
    log(state, `Exclusive choice auto-resolve "${o.label}".`);
    const r = evalEffect({ state, sourceId: pend.sourceId }, o.effect);
    if (!r.ok) return r;
    if (
      state.pendingChoice ||
      state.pendingTrashProgram ||
      state.pendingSabotage ||
      state.pendingDamage ||
      state.trace
    ) {
      return r;
    }
    return offerNextExclusiveChoice(state);
  }
  state.pendingChoice = {
    sourceId: pend.sourceId,
    chooser: pend.chooser,
    options: available.map((o) => ({
      id: o.id,
      label: o.label,
      effect: structuredClone(o.effect),
    })),
  };
  log(
    state,
    `Exclusive choices — ${pend.remaining} remaining among ${available.length} options (from ${state.cards[pend.sourceId]?.title ?? pend.sourceId}).`,
  );
  return { ok: true };
}

/**
 * After a nested pendingChoice resolves, continue exclusive multi-choice
 * if any remain. Call from choose_option after the selected effect settles.
 */
export function resumeExclusiveChoicesIfPending(state: GameState): EvalResult {
  if (!state.pendingExclusiveChoices) return { ok: true };
  if (
    state.pendingChoice ||
    state.pendingTrashProgram ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.trace
  ) {
    return { ok: true };
  }
  return offerNextExclusiveChoice(state);
}

function startExclusiveChoicesPerPassedIce(
  state: GameState,
  sourceId: string,
  options: Array<{ id: string; label: string; effect: Effect }>,
): EvalResult {
  const passed = state.run?.passedIceIds?.length ?? 0;
  const remaining = Math.min(passed, options.length);
  if (remaining <= 0) {
    log(
      state,
      `Exclusive choices per passed ice — passed ${passed}; nothing to resolve.`,
    );
    return { ok: true };
  }
  state.pendingExclusiveChoices = {
    sourceId,
    chooser: "runner",
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      effect: structuredClone(o.effect),
    })),
    remaining,
    usedIds: [],
  };
  log(
    state,
    `Exclusive choices per passed ice — passed ${passed}, resolve ${remaining} (CR ${CR.successfulRun.number}).`,
  );
  return offerNextExclusiveChoice(state);
}

function iceProtectsRemote(state: GameState, iceId: string): boolean {
  for (const server of Object.values(state.servers)) {
    if (server.ice.includes(iceId)) {
      return server.kind === "remote";
    }
  }
  return false;
}

function evalCond(ctx: EffectCtx, cond: Cond): boolean {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (cond.op) {
    case "true":
      return true;
    case "false":
      return false;
    case "during_run":
      return state.run !== null;
    case "source_is_breaker":
      return Boolean(source.breaker);
    case "source_is_ice":
      return source.type === "ice";
    case "source_rezzed":
      return Boolean(source.rezzed);
    case "grip_nonempty":
      return state.runner.hand.length > 0;
    case "has_installed_program":
      return state.runner.rig.some((id) => state.cards[id].type === "program");
    case "runner_tagged":
      return state.runner.tags > 0;
    case "clicks_remaining": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.clicks > 0;
    }
    case "credits_lte": {
      const side = resolveSide(ctx, cond.side);
      const p = side === "corp" ? state.corp : state.runner;
      return p.credits <= cond.amount;
    }
    case "protecting_remote":
      return iceProtectsRemote(state, sourceId);
    case "hq_nonempty":
      return state.corp.hand.length > 0;
    case "has_installed_resource":
      return state.runner.rig.some((id) => state.cards[id].type === "resource");
    case "grip_count_odd":
      return state.runner.hand.length % 2 === 1;
    case "successful_run_this_turn":
      return state.turn.successfulRunThisTurn;
    case "attacking_central": {
      const sid = state.run?.attackedServerId;
      return sid === "hq" || sid === "rd" || sid === "archives";
    }
    case "attacking_rd":
      return state.run?.attackedServerId === "rd";
    case "attacking_hq":
      return state.run?.attackedServerId === "hq";
    case "advancements_gte":
      return (source.advancementTokens ?? 0) >= cond.amount;
    case "power_counters_gte":
      return (source.powerCounters ?? 0) >= cond.amount;
    case "has_mark":
      return state.markServerId !== null;
    case "attacking_mark":
      return (
        state.markServerId !== null &&
        state.run?.attackedServerId === state.markServerId
      );
    case "source_protects_attacked_server": {
      if (!state.run) return false;
      const server = state.servers[state.run.attackedServerId];
      return server?.ice.includes(sourceId) ?? false;
    }
    case "source_installed": {
      const zone = source.zone ?? "";
      return zone.endsWith(":root") || zone.endsWith(":ice");
    }
    default: {
      const _c: never = cond;
      return _c;
    }
  }
}

function trashToHeap(state: GameState, cardId: string): void {
  moveRunnerCardToHeap(state, cardId);
}

function trashCorpCardToArchives(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  const wasRezzed = Boolean(card.rezzed);
  const printedRez = card.rezCost ?? null;
  const zoneBefore = card.zone;
  const wasInstalled = zoneBefore.startsWith("server:");
  // Marilyn Campaign: when would be trashed, may shuffle into R&D instead.
  if (card.mayShuffleIntoRdWhenTrashed && card.rezzed) {
    removeCardFromCurrentZone(state, cardId);
    state.corp.deck.push(cardId);
    card.zone = "corp:rd";
    card.faceup = false;
    card.rezzed = false;
    card.hostedCredits = undefined;
    log(state, `${card.title} — shuffle into R&D instead of trash.`);
    return;
  }
  removeCardFromCurrentZone(state, cardId);
  state.corp.discard.push(cardId);
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
  noteCorpCardAddedToArchives(state);
  fireCorpOnTrash(state, cardId);
  maybeFireOnRezzedCardTrashed(state, wasRezzed, printedRez);
  maybeFireHostileArchitecture(state, wasInstalled, cardId, wasRezzed);
  maybeFireYakovCredits(state, wasInstalled, cardId, zoneBefore);
}

function maybeFireHostileArchitecture(
  state: GameState,
  wasInstalled: boolean,
  trashedId: string,
  trashedWasRezzed: boolean,
): void {
  if (!wasInstalled || state.turn.hostileArchitectureUsedThisTurn) return;
  // Include the just-trashed card (Hostile Architecture can fire on itself).
  const candidates: string[] = [trashedId];
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) candidates.push(id);
  }
  for (const id of candidates) {
    const card = state.cards[id];
    const n = card?.meatDamageOnInstalledCorpTrashOncePerTurn ?? 0;
    if (n <= 0) continue;
    const active =
      id === trashedId ? trashedWasRezzed : Boolean(card?.rezzed);
    if (!active) continue;
    state.turn.hostileArchitectureUsedThisTurn = true;
    const r = evalEffect(
      { state, sourceId: id },
      { op: "do", action: { kind: "meat_damage", amount: n } },
    );
    if (!r.ok) {
      log(state, `${card!.title} meat damage failed: ${r.error}`);
    }
    return;
  }
}

function maybeFireYakovCredits(
  state: GameState,
  wasInstalled: boolean,
  trashedId: string,
  zoneBefore: string,
): void {
  if (!wasInstalled || state.turn.corpInstallInProgress) return;
  // zone like server:remote-1:root or server:hq:ice
  const m = /^server:([^:]+):(root|ice)$/.exec(zoneBefore);
  if (!m) return;
  const sid = m[1]!;
  const server = state.servers[sid as import("../state/types.js").ServerId];
  const candidates = new Set<string>([trashedId]);
  if (server) {
    for (const id of [...server.root, ...server.ice]) candidates.add(id);
  }
  for (const id of candidates) {
    const card = state.cards[id];
    const n = card?.creditsOnTrashFromThisServer ?? 0;
    if (n <= 0) continue;
    // Trashed Yakov still pays; other cards must be rezzed.
    if (id !== trashedId && !card?.rezzed) continue;
    state.corp.credits += n;
    log(state, `${card!.title} — gain ${n}¢ (card trashed from this server).`);
  }
}

function maybeFireOnRezzedCardTrashed(
  state: GameState,
  wasRezzed: boolean,
  printedRez: number | null,
): void {
  if (!wasRezzed) return;
  // Always record printed rez for Kimberlite / Ob Superheavy consumers.
  if (printedRez !== null) {
    state.turn.lastTrashedRezzedPrintedRezCost = printedRez;
  }
  if (state.turn.corpInstallInProgress) return;
  if (state.turn.obSuperheavyUsedThisTurn) return;
  const idCard = state.cards[state.corp.identityId];
  if (!idCard?.onRezzedCardTrashed) return;
  if (printedRez === null) return;
  state.turn.obSuperheavyUsedThisTurn = true;
  log(
    state,
    `${idCard.title} — rezzed card trashed (printed rez ${printedRez}¢).`,
  );
  const r = evalEffect(
    { state, sourceId: idCard.id },
    idCard.onRezzedCardTrashed,
  );
  if (!r.ok) {
    log(state, `onRezzedCardTrashed failed on ${idCard.title}: ${r.error}`);
  }
}

function drawCards(state: GameState, side: Side, amount: number): number {
  const p = side === "corp" ? state.corp : state.runner;
  let drew = 0;
  for (let i = 0; i < amount; i++) {
    const top = p.deck.shift();
    if (!top) break;
    p.hand.push(top);
    const card = state.cards[top];
    card.zone = side === "corp" ? "corp:hq" : "runner:grip";
    card.faceup = side === "runner";
    drew += 1;
  }
  return drew;
}

function pendingTrashAmong(
  state: GameState,
  sourceId: string,
  candidates: string[],
  label: string,
): EvalResult {
  if (candidates.length === 0) {
    log(state, `Trash ${label} — no targets (CR ${CR.trashing.number}).`);
    return { ok: true };
  }
  if (candidates.length > 1) {
    state.pendingTrashProgram = {
      sourceId,
      candidates: [...candidates],
    };
    log(
      state,
      `Trash ${label} — Corp must choose among ${candidates.length} (CR ${CR.trashing.number}).`,
    );
    return { ok: true };
  }
  const id = candidates[0]!;
  const title = state.cards[id].title;
  trashToHeap(state, id);
  log(state, `Trash installed ${title} (CR ${CR.trashing.number}).`);
  return { ok: true };
}

function applyPrimitive(ctx: EffectCtx, action: Primitive): EvalResult {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "end_the_run": {
      if (!state.run) {
        return {
          ok: false,
          error: "End the run with no active run.",
          cites: [CR.endTheRun],
        };
      }
      state.run.endedTheRun = true;
      state.run.successful = false;
      log(
        state,
        `End the run (CR ${CR.endTheRun.number}) — run is unsuccessful.`,
      );
      return { ok: true };
    }
    case "gain_credits": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += action.amount;
      log(
        state,
        `${side} gains ${action.amount}¢ (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "lose_credits": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const lost = Math.min(action.amount, p.credits);
      p.credits -= lost;
      log(
        state,
        `${side} loses ${lost}¢ (requested ${action.amount}) → ${p.credits} (CR ${CR.gainCredits.number}).`,
      );
      // "If they do" — only when at least 1 credit was actually lost.
      if (lost > 0 && action.then) {
        return evalEffect(ctx, action.then);
      }
      return { ok: true };
    }
    case "pump_strength": {
      if (!state.run) {
        return {
          ok: false,
          error: "Pump requires an active run.",
          cites: [CR.icebreakerStrengthImplicit],
        };
      }
      if (!source.breaker) {
        return {
          ok: false,
          error: "Pump requires an icebreaker.",
          cites: [CR.programStrength],
        };
      }
      let amount = action.amount;
      if (source.breaker.pumpUsesIcebreakerCount) {
        amount = state.runner.rig.filter(
          (id) =>
            Boolean(state.cards[id].breaker) ||
            (state.cards[id].subtypes ?? []).includes("icebreaker"),
        ).length;
      }
      const duration = action.duration ?? "encounter";
      const bucket =
        duration === "run"
          ? state.run.strengthBoosts
          : state.run.encounterStrengthBoosts;
      bucket[sourceId] = (bucket[sourceId] ?? 0) + amount;
      const eff = breakerStrength(state, sourceId);
      log(
        state,
        `Pump ${source.title} +${amount} (${duration}) → strength ${eff} (CR ${CR.icebreakerStrengthImplicit.number}, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "fortify_ice": {
      if (!state.run || source.type !== "ice") {
        return {
          ok: false,
          error: "Fortify requires ice during a run.",
          cites: [CR.iceStrength],
        };
      }
      state.run.iceStrengthBoosts[sourceId] =
        (state.run.iceStrengthBoosts[sourceId] ?? 0) + action.amount;
      const eff = iceStrength(state, sourceId);
      log(
        state,
        `Fortify ${source.title} +${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "weaken_ice": {
      if (!state.run) {
        return {
          ok: false,
          error: "Weaken ice requires an active run/encounter.",
          cites: [CR.iceStrength],
        };
      }
      const iceId = state.run.encounter?.iceId;
      if (!iceId) {
        return {
          ok: false,
          error: "Weaken ice requires an encounter.",
          cites: [CR.iceStrength],
        };
      }
      const ice = state.cards[iceId];
      if (ice.strengthCannotBeLowered) {
        log(
          state,
          `Weaken ${ice.title} prevented — strength cannot be lowered.`,
        );
        return { ok: true };
      }
      state.run.iceStrengthBoosts[iceId] =
        (state.run.iceStrengthBoosts[iceId] ?? 0) - action.amount;
      const eff = iceStrength(state, iceId);
      log(
        state,
        `Weaken ${ice.title} −${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}).`,
      );
      return { ok: true };
    }
    case "net_damage":
    case "meat_damage":
    case "core_damage":
    case "brain_damage": {
      const dtype =
        action.kind === "net_damage"
          ? "net"
          : action.kind === "meat_damage"
            ? "meat"
            : action.kind === "core_damage"
              ? "core"
              : "brain";
      const interactive =
        action.kind === "core_damage" && Boolean(action.interactive);
      const preventByLoseAllClicks =
        action.kind === "core_damage" &&
        Boolean(action.preventByLoseAllClicks);
      dealDamage(state, dtype, action.amount, sourceId, {
        interactive,
        preventByLoseAllClicks,
      });
      return { ok: true };
    }
    case "give_tags": {
      const beforeTags = state.turn.tagsGivenThisTurn;
      state.runner.tags += action.amount;
      state.turn.tagsGivenThisTurn += action.amount;
      log(
        state,
        `Runner receives ${action.amount} tag(s) → ${state.runner.tags} (CR ${CR.tags.number}).`,
      );
      if (beforeTags === 0 && action.amount > 0) {
        const idCard = state.cards[state.corp.identityId];
        if (idCard?.onFirstTagThisTurn) {
          const r = evalEffect(
            { state, sourceId: idCard.id },
            idCard.onFirstTagThisTurn,
          );
          if (!r.ok) return r;
        }
      }
      return { ok: true };
    }
    case "give_tags_per_advancement": {
      const base = action.base ?? 0;
      const per = action.per ?? 1;
      const adv = source.advancementTokens ?? 0;
      const amount = base + per * adv;
      if (amount <= 0) {
        log(state, `Give tags per advancement — 0 tags.`);
        return { ok: true };
      }
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "give_tags", amount },
      });
    }
    case "trash_program": {
      let programs = state.runner.rig.filter(
        (id) => state.cards[id].type === "program",
      );
      if (action.aiOnly) {
        programs = programs.filter((id) => {
          const c = state.cards[id];
          return (
            (c.subtypes ?? []).includes("ai") ||
            c.breaker?.breaksSubtype === "*"
          );
        });
      }
      if (programs.length === 0) {
        log(
          state,
          `Trash program — no installed ${action.aiOnly ? "AI " : ""}program (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && programs.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...programs],
        };
        log(
          state,
          `Trash program — Corp must choose among ${programs.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const progId = programs[0]!;
      const title = state.cards[progId].title;
      trashToHeap(state, progId);
      log(
        state,
        `Trash installed program ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_resource": {
      const resources = state.runner.rig.filter(
        (id) => state.cards[id].type === "resource",
      );
      if (resources.length === 0) {
        log(
          state,
          `Trash resource — no installed resource (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && resources.length > 1) {
        state.pendingTrashProgram = {
          sourceId,
          candidates: [...resources],
        };
        log(
          state,
          `Trash resource — Corp must choose among ${resources.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const resId = resources[0]!;
      const title = state.cards[resId].title;
      trashToHeap(state, resId);
      log(
        state,
        `Trash installed resource ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "take_hosted_credits": {
      const available = source.hostedCredits ?? 0;
      const taken = Math.min(action.amount, available);
      source.hostedCredits = available - taken;
      const side = source.side;
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += taken;
      log(
        state,
        `Take ${taken}¢ from ${source.title} (hosted ${source.hostedCredits}) (CR ${CR.gainCredits.number}).`,
      );
      if ((source.hostedCredits ?? 0) <= 0) {
        if (side === "corp" && source.mayShuffleIntoRdWhenTrashed) {
          removeCardFromCurrentZone(state, sourceId);
          state.corp.deck.push(sourceId);
          source.zone = "corp:rd";
          source.faceup = false;
          source.rezzed = false;
          log(
            state,
            `${source.title} — shuffle into R&D instead of trash (hosted empty).`,
          );
        } else {
          removeCardFromCurrentZone(state, sourceId);
          if (side === "runner") {
            state.runner.discard.push(sourceId);
            source.zone = "runner:heap";
          } else {
            state.corp.discard.push(sourceId);
            source.zone = "corp:archives";
          }
          source.faceup = true;
          log(
            state,
            `${source.title} trashed — hosted credits empty (CR ${CR.trashing.number}).`,
          );
        }
        const drawN = source.drawOnHostedEmpty ?? 0;
        if (drawN > 0) {
          const n = drawCards(state, side, drawN);
          log(
            state,
            `${side} draws ${n} from empty ${source.title} (CR ${CR.drawing.number}).`,
          );
        }
      }
      return { ok: true };
    }
    case "place_hosted_credits": {
      source.hostedCredits = (source.hostedCredits ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount}¢ on ${source.title} → ${source.hostedCredits} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "add_virus_counter": {
      source.virusCounters = (source.virusCounters ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount} virus counter(s) on ${source.title} → ${source.virusCounters}.`,
      );
      // Tranquilizer: at threshold, derez host ice.
      const threshold = source.derezHostAtVirus;
      if (
        threshold !== undefined &&
        (source.virusCounters ?? 0) >= threshold &&
        source.hostId
      ) {
        const host = state.cards[source.hostId];
        if (host?.type === "ice" && host.rezzed) {
          host.rezzed = false;
          log(
            state,
            `${source.title} derezzes host ${host.title} (${source.virusCounters} virus).`,
          );
        }
      }
      return { ok: true };
    }
    case "gain_credits_per_virus": {
      const n = source.virusCounters ?? 0;
      const gained = n * action.per;
      const side = source.side;
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += gained;
      log(
        state,
        `${side} gains ${gained}¢ (${n} virus × ${action.per}) from ${source.title} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "increase_hand_size": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.maxHandSize += action.amount;
      log(
        state,
        `${side} max hand size +${action.amount} → ${p.maxHandSize} (CR ${CR.maxHandSize.number}).`,
      );
      return { ok: true };
    }
    case "trash_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Trash from HQ — HQ empty (CR ${CR.trashing.number}).`);
        return { ok: true };
      }
      if (action.pick === "choose" && hq.length > 1) {
        // Multi-card HQ choose leaves pending; `then` deferred until host
        // resolves the trash (Anemone uses pick:"first" for auto).
        state.pendingTrashProgram = { sourceId, candidates: hq };
        log(
          state,
          `Trash from HQ — Corp must choose among ${hq.length} (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = hq[hq.length - 1]!;
      trashCorpCardToArchives(state, id);
      log(
        state,
        `Trash ${state.cards[id].title} from HQ (CR ${CR.trashing.number}).`,
      );
      if (action.then) {
        return evalEffect(ctx, action.then);
      }
      return { ok: true };
    }
    case "trash_hq_card": {
      if (!state.corp.hand.includes(action.cardId)) {
        log(state, `Trash HQ card — not in HQ.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      trashCorpCardToArchives(state, action.cardId);
      log(
        state,
        `Trash ${title} from HQ (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_hardware": {
      const hw = state.runner.rig.filter(
        (id) => state.cards[id].type === "hardware",
      );
      if (action.pick === "choose") {
        return pendingTrashAmong(state, sourceId, hw, "hardware");
      }
      if (hw.length === 0) {
        log(state, `Trash hardware — none installed (CR ${CR.trashing.number}).`);
        return { ok: true };
      }
      const id = hw[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed hardware ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_program_or_hardware": {
      const cands = state.runner.rig.filter((id) => {
        const t = state.cards[id].type;
        return t === "program" || t === "hardware";
      });
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          cands,
          "program or hardware",
        );
      }
      if (cands.length === 0) {
        log(
          state,
          `Trash program/hardware — none installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "shuffle_hq_to_rd": {
      const n = Math.min(action.amount, state.corp.hand.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      // Deterministic "shuffle": reverse then rotate by hand size (stable for tests).
      state.corp.deck.reverse();
      log(
        state,
        `Shuffle ${n} from HQ into R&D (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "shuffle_archives_to_rd": {
      const n = Math.min(action.amount, state.corp.discard.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.discard.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      log(
        state,
        `Shuffle ${n} from Archives into R&D (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "net_damage_agenda_points_this_turn": {
      const amount = state.turn.agendaPointsScoredThisTurn;
      if (amount <= 0) {
        log(state, `Neurospike — 0 agenda points scored this turn.`);
        return { ok: true };
      }
      dealDamage(state, "net", amount, sourceId);
      return { ok: true };
    }
    case "forbid_scoring_agendas_this_turn": {
      state.turn.cannotScoreAgendas = true;
      log(state, `Cannot score agendas for the remainder of this turn.`);
      return { ok: true };
    }
    case "skip_discard_this_turn": {
      state.turn.skipDiscardThisTurn = true;
      log(state, `Skip discard step this turn.`);
      return { ok: true };
    }
    case "place_advancements": {
      const installed: string[] = [];
      if (action.sameServerRootAsSource) {
        const zone = source.zone;
        if (zone.startsWith("server:") && zone.endsWith(":root")) {
          const serverId = zone
            .replace(/^server:/, "")
            .replace(/:root$/, "") as import("../state/types.js").ServerId;
          const server = state.servers[serverId];
          if (server) {
            for (const id of server.root) {
              if (action.excludeSelf && id === sourceId) continue;
              const c = state.cards[id];
              if (c && (c.type === "agenda" || c.canAdvance)) {
                installed.push(id);
              }
            }
          }
        }
      } else {
        for (const server of Object.values(state.servers)) {
          for (const id of [...server.root, ...server.ice]) {
            if (action.excludeSelf && id === sourceId) continue;
            const c = state.cards[id];
            // Advanceable only: agendas always; other cards need canAdvance
            // (CR §1.9.5f / Vasilisa; Seamless Launch).
            if (c.type === "agenda" || c.canAdvance) {
              installed.push(id);
            }
          }
        }
      }
      let candidates = installed;
      if (action.preferNotInstalledThisTurn) {
        const filtered = installed.filter(
          (id) => !state.turn.installedThisTurn.includes(id),
        );
        if (filtered.length > 0) candidates = filtered;
      }
      if (candidates.length === 0) {
        log(state, `Place advancements — no eligible card.`);
        if (action.then) return evalEffect(ctx, action.then);
        return { ok: true };
      }
      // Auto-pick first eligible (v0); hosts can extend with choose later.
      const targetId = candidates[0]!;
      const target = state.cards[targetId];
      target.advancementTokens =
        (target.advancementTokens ?? 0) + action.amount;
      state.turn.lastAdvancementTargetId = targetId;
      log(
        state,
        `Place ${action.amount} advancement(s) on ${target.title} → ${target.advancementTokens}.`,
      );
      const after = action.then;
      if (action.thenMayScore && canScoreAgenda(state, target)) {
        const scoreFx: Effect = {
          op: "do",
          action: { kind: "score_agenda_card", cardId: targetId },
        };
        const options: Array<{ id: string; label: string; effect: Effect }> = [
          {
            id: `score:${targetId}`,
            label: `Score ${target.title}`,
            effect: after
              ? { op: "seq", effects: [scoreFx, structuredClone(after)] }
              : scoreFx,
          },
          {
            id: "decline",
            label: "Decline",
            effect: after
              ? structuredClone(after)
              : {
                  op: "do",
                  action: {
                    kind: "gain_credits",
                    side: "corp",
                    amount: 0,
                  },
                },
          },
        ];
        state.pendingChoice = {
          sourceId,
          chooser: "corp",
          options,
        };
        log(
          state,
          `${source.title} — may score ${target.title} (CR ${CR.scoringAgenda.number}).`,
        );
        return { ok: true };
      }
      if (after) return evalEffect(ctx, after);
      return { ok: true };
    }
    case "score_self_as_agenda": {
      const pts = action.agendaPoints ?? source.agendaPoints ?? 1;
      source.agendaPoints = pts;
      removeCardFromCurrentZone(state, sourceId);
      state.corp.score.push(sourceId);
      source.zone = "corp:score";
      source.faceup = true;
      source.rezzed = true;
      state.turn.agendaPointsScoredThisTurn += pts;
      log(
        state,
        `Corp adds ${source.title} to the score area as a ${pts}-point agenda (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }
    case "add_to_runner_score_as_agenda": {
      const pts = action.agendaPoints ?? source.agendaPoints ?? 0;
      source.agendaPoints = pts;
      removeCardFromCurrentZone(state, sourceId);
      state.runner.score.push(sourceId);
      source.zone = "runner:score";
      source.faceup = true;
      source.rezzed = true;
      if (state.run) {
        state.run.accessCandidates = state.run.accessCandidates.filter(
          (id) => id !== sourceId,
        );
        state.run.accessingCardId = null;
      }
      log(
        state,
        `Runner adds ${source.title} to the score area as a ${pts}-point agenda (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }
    case "may_pay_credits_for_core_damage": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.corp.credits >= action.amount) {
        options.push({
          id: "pay",
          label: `Pay ${action.amount}¢: do ${action.damage} core damage`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "corp",
                  amount: action.amount,
                },
              },
              {
                op: "do",
                action: {
                  kind: "core_damage",
                  amount: action.damage,
                  interactive: true,
                  preventByLoseAllClicks: true,
                },
              },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.amount}¢ to do ${action.damage} core damage.`,
      );
      return { ok: true };
    }
    case "score_agenda_card": {
      const card = state.cards[action.cardId];
      if (!card) {
        return {
          ok: false,
          error: "Unknown agenda to score.",
          cites: [CR.scoringAgenda],
        };
      }
      if (state.turn.cannotScoreAgendas) {
        log(
          state,
          `Cannot score agendas this turn — skip (CR ${CR.scoringAgenda.number}).`,
        );
        return { ok: true };
      }
      if (!canScoreAgenda(state, card)) {
        log(
          state,
          `${card.title} cannot be scored — skip (CR ${CR.scoringAgenda.number}).`,
        );
        return { ok: true };
      }
      scoreAgenda(state, action.cardId);
      state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
      return { ok: true };
    }
    case "trash_any_rezzed_give_tags": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c || c.side !== "corp" || !c.rezzed) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `Trash any rezzed — no rezzed Corp cards (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash-tag:${id}`,
            label: `Trash ${title} (give 1 tag)`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "trash_corp_card" as const, cardId: id },
                },
                {
                  op: "do" as const,
                  action: { kind: "give_tags" as const, amount: 1 },
                },
                {
                  op: "do" as const,
                  action: { kind: "trash_any_rezzed_give_tags" as const },
                },
              ],
            },
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — trash any number of rezzed cards, 1 tag each (CR ${CR.trashing.number}, ${CR.tags.number}).`,
      );
      return { ok: true };
    }
    case "rfg_self": {
      removeCardFromCurrentZone(state, sourceId);
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      log(
        state,
        `${source.title} is removed from the game (CR ${CR.playOperation.number}).`,
      );
      return { ok: true };
    }
    case "allotted_clicks_next_turn": {
      if (action.side !== "runner") {
        return {
          ok: false,
          error: "allotted_clicks_next_turn currently supports runner only.",
          cites: [CR.runnerAllottedClicks],
        };
      }
      state.runnerAllottedClicksDeltaNextTurn =
        (state.runnerAllottedClicksDeltaNextTurn ?? 0) + action.delta;
      log(
        state,
        `Runner allotted clicks next turn ${action.delta >= 0 ? "+" : ""}${action.delta} → pending ${state.runnerAllottedClicksDeltaNextTurn} (CR ${CR.runnerAllottedClicks.number}).`,
      );
      return { ok: true };
    }
    case "purge_virus_counters": {
      purgeVirusCounters(state, sourceId);
      return { ok: true };
    }
    case "search_rd_ice_to_hq": {
      const id = state.corp.deck.find((cid) => state.cards[cid].type === "ice");
      if (!id) {
        log(state, `Search R&D for ice — none found.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = true; // revealed
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — reveal ${state.cards[id].title} and add to HQ.`,
      );
      return { ok: true };
    }
    case "search_rd_operation_to_hq": {
      const id = state.corp.deck.find(
        (cid) => state.cards[cid].type === "operation",
      );
      if (!id) {
        log(state, `Search R&D for operation — none found.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = true;
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — reveal ${state.cards[id].title} and add to HQ.`,
      );
      return { ok: true };
    }
    case "gain_credits_per_rezzed_subtype": {
      const per = action.per ?? 1;
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed && (c.subtypes ?? []).includes(action.subtype)) n += 1;
        }
      }
      const gained = n * per;
      state.corp.credits += gained;
      log(
        state,
        `Corp gains ${gained}¢ (${n} rezzed ${action.subtype} × ${per}) (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "lose_credits_per_rezzed_subtype": {
      const per = action.per ?? 1;
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed && (c.subtypes ?? []).includes(action.subtype)) n += 1;
        }
      }
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const loseAmt = Math.min(n * per, p.credits);
      p.credits -= loseAmt;
      log(
        state,
        `${side} loses ${loseAmt}¢ (${n} rezzed ${action.subtype} × ${per}) → ${p.credits} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "add_from_heap_to_grip": {
      const moveToGrip = (id: string): { ok: true } => {
        const idx = state.runner.discard.indexOf(id);
        if (idx < 0) {
          log(state, `Add from heap — ${id} not in heap.`);
          return { ok: true };
        }
        state.runner.discard.splice(idx, 1);
        state.runner.hand.push(id);
        state.cards[id].zone = "runner:grip";
        state.cards[id].faceup = false;
        log(state, `Add ${state.cards[id].title} from heap to grip.`);
        return { ok: true };
      };
      if (action.cardId) {
        return moveToGrip(action.cardId);
      }
      const heap = [...state.runner.discard];
      if (heap.length === 0) {
        log(state, `Add from heap — heap empty.`);
        return { ok: true };
      }
      if (action.pick === "choose" && heap.length > 1) {
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: heap.map((id) => ({
            id: `heap-grip:${id}`,
            label: `Add ${state.cards[id].title} to grip`,
            effect: {
              op: "do" as const,
              action: {
                kind: "add_from_heap_to_grip" as const,
                pick: "first" as const,
                cardId: id,
              },
            },
          })),
        };
        log(state, `Choose a card in the heap to add to grip.`);
        return { ok: true };
      }
      return moveToGrip(heap[0]!);
    }
    case "choose_rezzed_bioroid_forbid_runner_break": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed && (c.subtypes ?? []).includes("bioroid")) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Trieste — no rezzed bioroid ice to choose.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        state.cards[id].cannotBreakWithRunnerCardAbilities = true;
        log(
          state,
          `${source.title} — choose ${state.cards[id].title}; Runner card abilities cannot break its subs.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `trieste:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "trash_corp_card" as const, // placeholder replaced below
              cardId: id,
            },
          },
        })),
      };
      // Use a dedicated leaf via encoding in option effect as gain 0 then set flag in chooseOption — simpler: use custom option ids handled in chooseOption OR set via a new primitive set_flag.
      // Rebuild options with a seq that uses a new micro-primitive: encode as choose that evaluates a do with kind we handle specially.
      // Simpler approach: set flag synchronously on choose via option id prefix in chooseOption.
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((id) => ({
            id: `forbid-runner-break:${id}`,
            label: `Choose ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          })),
        ],
      };
      log(
        state,
        `${source.title} — choose a rezzed bioroid ice (CR ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "score_facedown_agenda_from_archives_if_clean": {
      if (state.turn.corpCardsAddedToArchivesThisTurn > 0) {
        log(
          state,
          `Regenesis — Corp cards were added to Archives this turn; skip.`,
        );
        return { ok: true };
      }
      const facedown = state.corp.discard.find((id) => {
        const c = state.cards[id];
        return c?.type === "agenda" && !c.faceup;
      });
      if (!facedown) {
        log(state, `Regenesis — no facedown agenda in Archives.`);
        return { ok: true };
      }
      const card = state.cards[facedown];
      state.corp.discard = state.corp.discard.filter((id) => id !== facedown);
      state.corp.score.push(facedown);
      card.zone = "corp:score";
      card.faceup = true;
      card.rezzed = true;
      state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
      log(
        state,
        `Regenesis — score facedown ${card.title} from Archives for ${card.agendaPoints ?? 0} points (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }

    case "remove_advancements": {
      const have = source.advancementTokens ?? 0;
      const removed = Math.min(action.amount, have);
      if (removed <= 0) {
        log(
          state,
          `Remove advancements — ${source.title} has none (CR ${CR.advancing.number}).`,
        );
        return { ok: true };
      }
      source.advancementTokens = have - removed;
      log(
        state,
        `Remove ${removed} advancement(s) from ${source.title} → ${source.advancementTokens} (CR ${CR.advancing.number}).`,
      );
      if (action.then) {
        return evalEffect(ctx, action.then);
      }
      return { ok: true };
    }
    case "meat_damage_per_advancement": {
      const amount = source.advancementTokens ?? 0;
      if (amount <= 0) {
        log(state, `Meat damage per advancement — 0 tokens.`);
        return { ok: true };
      }
      dealDamage(state, "meat", amount, sourceId);
      return { ok: true };
    }
    case "net_damage_per_advancement": {
      const amount = (action.base ?? 0) + (source.advancementTokens ?? 0);
      if (amount <= 0) {
        log(state, `Net damage per advancement — 0.`);
        return { ok: true };
      }
      dealDamage(state, "net", amount, sourceId);
      return { ok: true };
    }
    case "trash_self": {
      removeCardFromCurrentZone(state, sourceId);
      if (source.side === "runner") {
        state.runner.discard.push(sourceId);
        source.zone = "runner:heap";
      } else {
        state.corp.discard.push(sourceId);
        source.zone = "corp:archives";
      }
      source.faceup = true;
      log(
        state,
        `${source.title} trashed (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_attacked_server_root": {
      const sid = state.run?.attackedServerId;
      if (!sid) {
        log(state, `Trash attacked-server root — no run.`);
        return { ok: true };
      }
      const server = state.servers[sid];
      const rootIds = [...server.root];
      for (const id of rootIds) {
        const card = state.cards[id];
        removeCardFromCurrentZone(state, id);
        state.corp.discard.push(id);
        card.zone = "corp:archives";
        card.faceup = true;
        card.rezzed = false;
        log(
          state,
          `Trash ${card.title} from ${sid} root (CR ${CR.trashing.number}).`,
        );
      }
      if (rootIds.length === 0) {
        log(state, `Trash ${sid} root — empty.`);
      }
      return { ok: true };
    }
    case "archives_to_hq": {
      const n = Math.min(action.amount, state.corp.discard.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.discard.pop()!;
        state.corp.hand.push(id);
        state.cards[id].zone = "corp:hq";
        state.cards[id].faceup = false;
      }
      log(
        state,
        `Add ${n} card(s) from Archives to HQ (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "trash_installed_runner": {
      const cands = [...state.runner.rig];
      if (action.pick === "choose" || cands.length > 1) {
        return pendingTrashAmong(state, sourceId, cands, "installed Runner card");
      }
      if (cands.length === 0) {
        log(state, `Trash installed Runner card — none installed.`);
        return { ok: true };
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "trash_installed_runner_lte_last_trashed_rez": {
      const maxCost = state.turn.lastTrashedRezzedPrintedRezCost;
      if (maxCost === null || maxCost === undefined) {
        log(state, `Trash Runner ≤ rez — no last trashed rez cost.`);
        return { ok: true };
      }
      const cands = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        const cost = c.installCost ?? 0;
        return cost <= maxCost;
      });
      if (cands.length === 0) {
        log(
          state,
          `Trash Runner ≤ ${maxCost}¢ install — none eligible.`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && cands.length > 1) {
        return pendingTrashAmong(
          state,
          sourceId,
          cands,
          `installed Runner card (≤${maxCost}¢)`,
        );
      }
      const id = cands[0]!;
      trashToHeap(state, id);
      log(
        state,
        `Trash installed ${state.cards[id].title} (≤${maxCost}¢) (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "forbid_steal_trash_this_run": {
      if (state.run) {
        state.run.cannotStealOrTrash = true;
        log(state, `Runner cannot steal or trash Corp cards for the remainder of this run.`);
      }
      return { ok: true };
    }
    case "access_one_root_other_server": {
      if (!state.run) {
        return {
          ok: false,
          error: "access_one_root_other_server requires an active run.",
          cites: [CR.breach],
        };
      }
      const attacked = state.run.attackedServerId;
      const cands: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === attacked) continue;
        for (const id of server.root) {
          cands.push(id);
        }
      }
      state.run.cannotStealOrTrash = true;
      state.run.accessCandidates = cands;
      state.run.accessRemaining = cands.length > 0 ? 1 : 0;
      state.run.accessCandidatesPreset = true;
      state.run.accessedCardIds = state.run.accessedCardIds ?? [];
      if (cands.length > 0) {
        // Enter breach instead of ending the run after skipBreach replace.
        state.run.skipBreach = false;
        log(
          state,
          `${source.title} — instead of breach, access 1 root card among ${cands.length} other-server candidate(s) (cannot steal/trash).`,
        );
      } else {
        log(
          state,
          `${source.title} — no other-server root cards to access.`,
        );
      }
      return { ok: true };
    }
    case "install_hq_new_remotes_with_advancements": {
      const max = Math.max(0, action.max);
      const adv = Math.max(0, action.advancements);
      const eligible = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        return t === "agenda" || t === "asset" || t === "ice";
      });
      let installed = 0;
      for (const pick of eligible) {
        if (installed >= max) break;
        const card = state.cards[pick];
        const cost = card.installCost ?? 0;
        if (state.corp.credits < cost) {
          log(
            state,
            `Mitosis install — skip ${card.title} (need ${cost}¢, have ${state.corp.credits}).`,
          );
          continue;
        }
        state.corp.credits -= cost;
        state.corp.hand = state.corp.hand.filter((id) => id !== pick);
        const remoteNum = state.nextRemoteNumber++;
        const sid =
          `remote-${remoteNum}` as import("../state/types.js").ServerId;
        state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
        state.turn.remotesCreatedThisTurn += 1;
        if (card.type === "ice") {
          state.servers[sid].ice.push(pick);
          card.zone = `server:${sid}:ice`;
        } else {
          state.servers[sid].root.push(pick);
          card.zone = `server:${sid}:root`;
        }
        card.rezzed = false;
        card.faceup = false;
        card.advancementTokens = (card.advancementTokens ?? 0) + adv;
        state.turn.installedThisTurn.push(pick);
        if (!state.turn.cannotScoreOrRezCardIds.includes(pick)) {
          state.turn.cannotScoreOrRezCardIds.push(pick);
        }
        installed += 1;
        log(
          state,
          `${source.title} — install ${card.title} on ${sid} with ${adv} advancement(s); cannot score/rez this turn.`,
        );
      }
        if (installed === 0) {
        log(state, `${source.title} — no HQ cards installed.`);
      }
      return { ok: true };
    }
    case "moon_pool_resolve": {
      // RFG self (typically after trashSelf cost left it in Archives).
      removeCardFromCurrentZone(state, sourceId);
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      log(
        state,
        `${source.title} is removed from the game (Moon Pool).`,
      );

      const trashN = Math.min(
        Math.max(0, action.trashHqMax),
        state.corp.hand.length,
      );
      for (let i = 0; i < trashN; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.discard.push(id);
        state.cards[id].zone = "corp:archives";
        state.cards[id].faceup = true;
        noteCorpCardAddedToArchives(state);
        log(
          state,
          `${source.title} — trash ${state.cards[id].title} from HQ.`,
        );
      }

      const facedown = state.corp.discard.filter(
        (id) => !state.cards[id].faceup,
      );
      const revealN = Math.min(
        Math.max(0, action.revealArchivesMax),
        facedown.length,
      );
      const revealed: string[] = [];
      for (let i = 0; i < revealN; i++) {
        const id = facedown[i]!;
        revealed.push(id);
        state.cards[id].faceup = true;
        state.corp.discard = state.corp.discard.filter((x) => x !== id);
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false; // facedown once shuffled into R&D
        log(
          state,
          `${source.title} — reveal ${state.cards[id].title} from Archives → R&D.`,
        );
      }
      if (revealN > 0) {
        state.corp.deck.reverse();
      }

      const agendaRevealed = revealed.filter(
        (id) => state.cards[id].type === "agenda",
      );
      for (const _agendaId of agendaRevealed) {
        let target: string | null = null;
        for (const server of Object.values(state.servers)) {
          for (const id of [...server.root, ...server.ice]) {
            const c = state.cards[id];
            if (c.type === "agenda" || c.canAdvance) {
              target = id;
              break;
            }
          }
          if (target) break;
        }
        if (!target) {
          log(
            state,
            `${source.title} — agenda revealed; no advanceable card for token.`,
          );
          continue;
        }
        const card = state.cards[target]!;
        card.advancementTokens = (card.advancementTokens ?? 0) + 1;
        log(
          state,
          `${source.title} — place 1 advancement on ${card.title} → ${card.advancementTokens}.`,
        );
      }
      return { ok: true };
    }
    case "simulation_reset_resolve": {
      const trashN = Math.min(
        Math.max(0, action.trashHqMax),
        state.corp.hand.length,
      );
      for (let i = 0; i < trashN; i++) {
        const id = state.corp.hand.pop()!;
        state.corp.discard.push(id);
        state.cards[id].zone = "corp:archives";
        state.cards[id].faceup = true;
        noteCorpCardAddedToArchives(state);
        log(
          state,
          `${source.title} — trash ${state.cards[id].title} from HQ.`,
        );
      }
      const shuffleN = Math.min(trashN, state.corp.discard.length);
      for (let i = 0; i < shuffleN; i++) {
        const id = state.corp.discard.pop()!;
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      if (shuffleN > 0) {
        // Deterministic "shuffle": reverse then leave (v0; same as moon pool).
        state.corp.deck.reverse();
        log(
          state,
          `${source.title} — shuffle ${shuffleN} from Archives into R&D.`,
        );
      }
      if (trashN > 0) {
        const drawn = drawCards(state, "corp", trashN);
        log(
          state,
          `${source.title} — Corp draws ${drawn} (requested ${trashN}).`,
        );
      }
      removeCardFromCurrentZone(state, sourceId);
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      log(state, `${source.title} is removed from the game.`);
      return { ok: true };
    }
    case "search_rd_install_rez_by_printed_rez_cost": {
      const base = state.turn.lastTrashedRezzedPrintedRezCost;
      if (base === null) {
        log(
          state,
          `${source.title} — no trashed rezzed printed rez cost recorded.`,
        );
        return { ok: true };
      }
      const targetCost = base + action.delta;
      const pick = state.corp.deck.find((id) => {
        const c = state.cards[id];
        if (c.rezCost === undefined) return false;
        return c.rezCost === targetCost;
      });
      if (!pick) {
        log(
          state,
          `${source.title} — no R&D card with printed rez ${targetCost}¢.`,
        );
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((id) => id !== pick);
      const card = state.cards[pick]!;
      const remoteNum = state.nextRemoteNumber++;
      const sid =
        `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      state.turn.remotesCreatedThisTurn += 1;
      if (card.type === "ice") {
        state.servers[sid].ice.push(pick);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(pick);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = true;
      card.faceup = true;
      state.corp.deck.reverse();
      log(
        state,
        `${source.title} — install and rez ${card.title} from R&D on ${sid} (printed rez ${card.rezCost}¢; ignore credit costs).`,
      );
      return { ok: true };
    }
    case "deep_dive_resolve": {
      const setAsideN = Math.max(0, action.setAside ?? 8);
      const initial = Math.max(1, action.initialAccess ?? 1);
      const aside: string[] = [];
      for (let i = 0; i < setAsideN && state.corp.deck.length > 0; i++) {
        const id = state.corp.deck.shift()!;
        aside.push(id);
        state.cards[id].faceup = true;
        state.cards[id].zone = "corp:set-aside";
      }
      state.corp.corpSetAside = aside;
      log(
        state,
        `${source.title} — set aside top ${aside.length} of R&D faceup.`,
      );
      // Access 1, then may spend clicks for more (auto: spend available clicks).
      let accesses = Math.min(initial, aside.length);
      const extraClicks = Math.max(0, state.runner.clicks);
      const more = Math.min(extraClicks, Math.max(0, aside.length - accesses));
      if (more > 0) {
        state.runner.clicks -= more;
        accesses += more;
        log(
          state,
          `${source.title} — spend ${more} [click] for ${more} additional access(es).`,
        );
      }
      const accessed = aside.slice(0, accesses);
      const remainder = aside.slice(accesses);
      for (const id of accessed) {
        const card = state.cards[id]!;
        log(state, `${source.title} — access ${card.title} from set-aside.`);
        if (card.type === "agenda") {
          stealAgenda(state, id);
        }
      }
      // Shuffle remainder + any still in corpSetAside back into R&D.
      const back = [
        ...remainder,
        ...(state.corp.corpSetAside ?? []).filter(
          (id) => !accessed.includes(id) && !remainder.includes(id),
        ),
      ];
      // Also remove stolen agendas from set-aside tracking.
      const toShuffle = back.filter(
        (id) => state.cards[id]?.zone === "corp:set-aside",
      );
      for (const id of toShuffle) {
        state.corp.deck.push(id);
        state.cards[id].zone = "corp:rd";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      state.corp.corpSetAside = [];
      log(
        state,
        `${source.title} — shuffle ${toShuffle.length} set-aside card(s) into R&D.`,
      );
      return { ok: true };
    }
    case "install_from_hq_or_archives": {
      // May install 1 card from HQ or Archives (Ansel). Auto: first from HQ, else Archives.
      const pick =
        state.corp.hand.find((id) => {
          const t = state.cards[id].type;
          return (
            t === "agenda" ||
            t === "asset" ||
            t === "ice" ||
            t === "upgrade" ||
            t === "operation"
          );
        }) ??
        state.corp.discard.find((id) => {
          const t = state.cards[id].type;
          return (
            t === "agenda" ||
            t === "asset" ||
            t === "ice" ||
            t === "upgrade"
          );
        });
      if (!pick) {
        log(state, `Install from HQ/Archives — no eligible card.`);
        return { ok: true };
      }
      const card = state.cards[pick];
      if (card.type === "operation") {
        log(state, `Install from HQ/Archives — operations are not installable.`);
        return { ok: true };
      }
      // Remove from current zone
      state.corp.hand = state.corp.hand.filter((id) => id !== pick);
      state.corp.discard = state.corp.discard.filter((id) => id !== pick);
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(pick);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(pick);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      log(
        state,
        `Install ${card.title} from HQ/Archives onto ${sid} (ignoring costs).`,
      );
      return { ok: true };
    }
    case "may_install_facedown_from_archives": {
      const installable = state.corp.discard.filter((id) => {
        const t = state.cards[id].type;
        return (
          t === "agenda" ||
          t === "asset" ||
          t === "ice" ||
          t === "upgrade"
        );
      });
      if (installable.length === 0) {
        log(state, `Install facedown from Archives — no eligible card.`);
        return { ok: true };
      }
      if (installable.length > 1) {
        state.pendingChoice = {
          sourceId,
          chooser: "corp",
          options: installable.map((id) => ({
            id: `arch-install:${id}`,
            label: `Install ${state.cards[id].title} facedown`,
            effect: {
              op: "do" as const,
              action: {
                kind: "may_install_facedown_from_archives" as const,
                // handled below via single-card path after filtering
              },
            },
          })),
        };
        // Store pick via option evaluation: simplify — auto first for multi
        // by collapsing to first (deterministic v0). Clear choice.
        state.pendingChoice = null;
      }
      const pick = installable[0]!;
      state.corp.discard = state.corp.discard.filter((id) => id !== pick);
      const card = state.cards[pick]!;
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      if (card.type === "ice") {
        state.servers[sid].ice.push(pick);
        card.zone = `server:${sid}:ice`;
      } else {
        state.servers[sid].root.push(pick);
        card.zone = `server:${sid}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      log(
        state,
        `Install ${card.title} facedown from Archives onto ${sid}.`,
      );
      return { ok: true };
    }
    case "return_installed_corp_to_hq": {
      const moveToHq = (pick: string): { ok: true } => {
        const card = state.cards[pick];
        if (!card) {
          log(state, `Return to HQ — card missing.`);
          return { ok: true };
        }
        removeCardFromCurrentZone(state, pick);
        state.corp.hand.push(pick);
        card.zone = "corp:hq";
        card.faceup = false;
        card.rezzed = false;
        card.advancementTokens = undefined;
        log(state, `Add ${card.title} to HQ.`);
        return { ok: true };
      };
      if (action.cardId) {
        return moveToHq(action.cardId);
      }
      const installed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          installed.push(id);
        }
      }
      if (installed.length === 0) {
        log(state, `Return installed Corp to HQ — none installed.`);
        return { ok: true };
      }
      if (action.pick === "choose" && installed.length > 1) {
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: installed.map((id) => ({
            id: `corp-hq:${id}`,
            label: `Add ${state.cards[id].title} to HQ`,
            effect: {
              op: "do" as const,
              action: {
                kind: "return_installed_corp_to_hq" as const,
                pick: "first" as const,
                cardId: id,
              },
            },
          })),
        };
        log(state, `Choose an installed Corp card to add to HQ.`);
        return { ok: true };
      }
      return moveToHq(installed[0]!);
    }
    case "may_trash_from_grip_to_draw": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `May trash from grip to draw — grip empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((id) => ({
            id: `trash-draw:${id}`,
            label: `Trash ${state.cards[id]!.title} to draw 1`,
            effect: {
              op: "do" as const,
              action: {
                kind: "trash_grip_card_draw" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `May trash 1 from grip to draw 1.`);
      return { ok: true };
    }
    case "trash_grip_card_draw": {
      const id = action.cardId;
      if (!state.runner.hand.includes(id)) {
        log(state, `Trash grip to draw — card not in grip.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, id);
      const drawn = drawCards(state, "runner", 1);
      log(
        state,
        `Trash ${state.cards[id]!.title} from grip; draw ${drawn}.`,
      );
      return { ok: true };
    }
    case "may_trash_one_from_grip": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `May trash from grip — grip empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...grip.map((id) => ({
            id: `trash-grip:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_grip_card" as const, cardId: id },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `May trash 1 card from the grip.`);
      return { ok: true };
    }
    case "trash_grip_card": {
      const id = action.cardId;
      if (!state.runner.hand.includes(id)) {
        log(state, `Trash grip — card not in grip.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, id);
      log(state, `Trash ${state.cards[id]!.title} from grip.`);
      return { ok: true };
    }
    case "spend_power_for_bonus_access": {
      const have = source.powerCounters ?? 0;
      const n = Math.min(action.amount, have);
      if (n <= 0 || !state.run) return { ok: true };
      source.powerCounters = have - n;
      state.run.bonusAccess = (state.run.bonusAccess ?? 0) + n;
      log(
        state,
        `${source.title} — spend ${n} power → +${n} bonus access.`,
      );
      return { ok: true };
    }
    case "reveal_top_stack_to_grip_place_hosted_credits": {
      const top = state.runner.deck[0];
      if (!top) {
        log(state, `Reveal top of stack — empty.`);
        return { ok: true };
      }
      state.runner.deck.shift();
      const card = state.cards[top]!;
      const cost =
        card.playCost ?? card.installCost ?? 0;
      source.hostedCredits = (source.hostedCredits ?? 0) + cost;
      state.runner.hand.push(top);
      card.zone = "runner:grip";
      card.faceup = true;
      log(
        state,
        `Reveal ${card.title} — place ${cost}¢ on ${source.title}; add to grip.`,
      );
      return { ok: true };
    }
    case "forbid_runner_break_on_source": {
      source.cannotBreakWithRunnerCardAbilities = true;
      if (state.run?.encounter?.iceId === sourceId) {
        state.run.encounter.forbidRunnerBreakThisEncounter = true;
      }
      log(
        state,
        `${source.title} — Runner cannot break its printed subroutines with card abilities this encounter.`,
      );
      return { ok: true };
    }
    case "may_trash_hq_then": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `${source.title} — may trash HQ: HQ empty.`);
        return { ok: true };
      }
      const chooseOpts: Array<{ id: string; label: string; effect: Effect }> =
        hq.map((id) => ({
          id: `trash-hq:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: { kind: "trash_hq_card" as const, cardId: id },
              },
              structuredClone(action.then),
            ],
          },
        }));
      chooseOpts.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "corp" as const,
            amount: 0,
          },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: chooseOpts,
      };
      log(state, `${source.title} — may trash 1 card from HQ.`);
      return { ok: true };
    }
    case "forbid_installed_runner_break_for_run": {
      const cands = [...state.runner.rig];
      if (cands.length === 0) {
        log(state, `${source.title} — no installed Runner cards to forbid.`);
        return { ok: true };
      }
      if (cands.length === 1) {
        const id = cands[0]!;
        state.cards[id]!.cannotBreakSubsThisRun = true;
        log(
          state,
          `${state.cards[id]!.title} — abilities cannot break subs this run.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `forbid-break:${id}`,
          label: `Forbid break with ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "forbid_runner_card_break_for_run" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose installed Runner card to forbid break.`);
      return { ok: true };
    }
    case "forbid_runner_card_break_for_run": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.rig.includes(action.cardId)) {
        log(state, `Forbid break — card not installed.`);
        return { ok: true };
      }
      card.cannotBreakSubsThisRun = true;
      log(
        state,
        `${card.title} — abilities cannot break subroutines for the remainder of the run.`,
      );
      return { ok: true };
    }
    case "may_give_runner_credits_then": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "give-credits",
            label: `Runner gains ${action.amount}¢`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "gain_credits" as const,
                    side: "runner" as const,
                    amount: action.amount,
                  },
                },
                structuredClone(action.then),
              ],
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may have the Runner gain ${action.amount}¢.`,
      );
      return { ok: true };
    }
    case "blank_installed_resource_until_corp_turn_end": {
      const resources = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `${source.title} — no installed resource to blank.`);
        return { ok: true };
      }
      if (resources.length === 1) {
        const id = resources[0]!;
        const card = state.cards[id]!;
        card.abilitiesBlanked = true;
        card.abilitiesBlankedCorpTurnsRemaining = 1;
        log(
          state,
          `${card.title} — abilities blanked until Corp turn ends.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: resources.map((id) => ({
          id: `blank-res:${id}`,
          label: `Blank ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "blank_resource_until_corp_turn_end" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `${source.title} — choose installed resource to blank.`);
      return { ok: true };
    }
    case "blank_resource_until_corp_turn_end": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "resource" || !state.runner.rig.includes(action.cardId)) {
        log(state, `Blank resource — not an installed resource.`);
        return { ok: true };
      }
      card.abilitiesBlanked = true;
      card.abilitiesBlankedCorpTurnsRemaining = 1;
      log(
        state,
        `${card.title} — abilities blanked until Corp turn ends.`,
      );
      return { ok: true };
    }
    case "limit_printed_breaks_on_source_for_run": {
      source.maxPrintedSubsBreakablePerEncounter = action.max;
      log(
        state,
        `${source.title} — Runner cannot break more than ${action.max} printed subroutine(s) per encounter this run.`,
      );
      return { ok: true };
    }
    case "install_ice_inward_free": {
      // Brân: may install ice from HQ protecting this server, inward of source.
      if (!state.run || source.type !== "ice") {
        log(state, `Install ice inward — not during encounter of ice.`);
        return { ok: true };
      }
      const iceFromHq = state.corp.hand.find(
        (id) => state.cards[id].type === "ice",
      );
      if (!iceFromHq) {
        log(state, `Install ice inward — no ice in HQ.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      const server = state.servers[serverId];
      const pos = server.ice.indexOf(sourceId);
      if (pos < 0) {
        log(state, `Install ice inward — source not protecting attacked server.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== iceFromHq);
      const card = state.cards[iceFromHq];
      // Insert immediately inward (higher index) of source.
      server.ice.splice(pos + 1, 0, iceFromHq);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementTokens = card.advancementTokens ?? 0;
      log(
        state,
        `Install ${card.title} inward of ${source.title} on ${serverId} (ignoring costs).`,
      );
      return { ok: true };
    }
    case "break_host_subroutine": {
      const hostId = source.hostId;
      const enc = state.run?.encounter;
      if (!hostId || !enc || enc.iceId !== hostId) {
        log(state, `Break host subroutine — not encountering host.`);
        return { ok: true };
      }
      const idx = enc.broken.findIndex((b) => !b);
      if (idx < 0) {
        log(state, `Break host subroutine — no unbroken subs.`);
        return { ok: true };
      }
      enc.broken[idx] = true;
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      const sub = state.cards[hostId].subroutines?.[idx];
      log(
        state,
        `${source.title} breaks "${sub?.text ?? `sub ${idx}`}" on host.`,
      );
      maybeFireFluxFirstBreakCharge(state);
      return { ok: true };
    }
    case "break_encounter_subroutine": {
      if (state.run?.encounter) {
        const ice = state.cards[state.run.encounter.iceId];
        if (ice?.cannotBreakWithRunnerCardAbilities) {
          return {
            ok: false,
            error: "Runner card abilities cannot break subroutines on this ice (Trieste).",
            cites: [CR.encounterBreakPaw],
          };
        }
      }

      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Break encounter subroutine — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      if (
        action.requireSubtype &&
        !(ice.subtypes ?? []).includes(action.requireSubtype)
      ) {
        log(
          state,
          `Break encounter subroutine — ice is not ${action.requireSubtype}.`,
        );
        return { ok: true };
      }
      const maxSubs = Math.max(1, action.maxSubs ?? 1);
      let broken = 0;
      for (let n = 0; n < maxSubs; n++) {
        const idx = enc.broken.findIndex((b) => !b);
        if (idx < 0) break;
        enc.broken[idx] = true;
        broken += 1;
        const sub = ice.subroutines?.[idx];
        log(
          state,
          `${source.title} breaks "${sub?.text ?? `sub ${idx}`}" on ${ice.title}.`,
        );
      }
      if (broken === 0) {
        log(state, `Break encounter subroutine — no unbroken subs.`);
        return { ok: true };
      }
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      maybeFireFluxFirstBreakCharge(state);
      return { ok: true };
    }
    case "offer_jack_out": {
      if (state.run && !state.run.cannotJackOut) {
        state.run.pendingJackOutOffer = true;
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "jack_out",
              label: "Jack out",
              effect: { op: "do", action: { kind: "end_the_run" } },
            },
            {
              id: "continue",
              label: "Continue the run",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
          ],
        };
        // end_the_run via jack out should mark unsuccessful — handle in choose
        log(state, `Runner may jack out (Karunā).`);
      }
      return { ok: true };
    }
    case "search_stack_icebreaker": {
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return (
          Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker")
        );
      });
      if (matches.length === 0) {
        log(state, `Search stack for icebreaker — none found.`);
        return { ok: true };
      }
      // Auto-select first match (deterministic). Optionally install.
      const id = matches[0]!;
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id].zone = "runner:grip";
      state.cards[id].faceup = true;
      state.runner.deck.reverse();
      log(
        state,
        matches.length === 1
          ? `Search stack — add ${state.cards[id].title} to grip.`
          : `Search stack — add ${state.cards[id].title} to grip (${matches.length} matches; first selected).`,
      );
      if (
        action.mayInstallIfSuccessfulRunThisTurn &&
        state.turn.successfulRunThisTurn
      ) {
        const card = state.cards[id];
        const cost = card.installCost;
        if (state.runner.credits >= cost) {
          state.runner.credits -= cost;
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          state.runner.rig.push(id);
          card.zone = "runner:rig";
          log(state, `Install ${card.title} from Mutual Favor (${cost}¢).`);
          if (card.onInstall) {
            const r = evalEffect({ state, sourceId: id }, card.onInstall);
            if (!r.ok) return r;
          }
        }
      }
      return { ok: true };
    }
    case "search_rd_non_agenda": {
      const matches = state.corp.deck.filter(
        (id) => state.cards[id].type !== "agenda",
      );
      if (matches.length === 0) {
        log(state, `Search R&D for non-agenda — none found.`);
        return { ok: true };
      }
      const id = matches[0]!;
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id].zone = "corp:hq";
      state.cards[id].faceup = false;
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — add ${state.cards[id].title} to HQ (non-agenda).`,
      );
      return { ok: true };
    }
    case "search_rd_to_hq": {
      const n = Math.min(action.amount, state.corp.deck.length);
      for (let i = 0; i < n; i++) {
        const id = state.corp.deck[0]!;
        // Prefer first card; for multi-search take sequential tops after shuffle sense:
        // Deterministic: take first N distinct from current deck order.
        void id;
      }
      const taken: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = state.corp.deck.shift();
        if (!id) break;
        taken.push(id);
        state.corp.hand.push(id);
        state.cards[id].zone = "corp:hq";
        state.cards[id].faceup = false;
      }
      state.corp.deck.reverse();
      log(
        state,
        `Search R&D — add ${taken.length} card(s) to HQ (${taken.map((id) => state.cards[id].title).join(", ") || "none"}).`,
      );
      return { ok: true };
    }
    case "swap_two_ice": {
      const allIce: string[] = [];
      for (const server of Object.values(state.servers)) {
        allIce.push(...server.ice);
      }
      if (allIce.length < 2) {
        log(state, `Swap ice — fewer than 2 ice installed.`);
        return { ok: true };
      }
      const options: Array<{
        id: string;
        label: string;
        effect: Effect;
      }> = [
        {
          id: "decline",
          label: "Decline to swap ice",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      // Offer swap of first with each other ice (bounded).
      const a = allIce[0]!;
      for (let i = 1; i < allIce.length; i++) {
        const b = allIce[i]!;
        options.push({
          id: `swap-${a}-${b}`,
          label: `Swap ${state.cards[a].title} with ${state.cards[b].title}`,
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      // Stash swap pairs: handled in chooseOption by parsing option id.
      log(state, `Tāo Salonga — may swap two ice.`);
      return { ok: true };
    }
    case "rez_ice_ignoring_costs": {
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id].rezzed) unrezzed.push(id);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Rez ice ignoring costs — no unrezzed ice.`);
        return { ok: true };
      }
      const options = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 0,
            },
          },
        },
        ...unrezzed.map((id) => ({
          id,
          label: `Rez ${state.cards[id].title} (ignore costs)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 0,
            },
          },
        })),
      ];
      state.pendingChoice = {
        sourceId,
        chooser: source.side === "runner" ? "corp" : "corp",
        options,
      };
      log(state, `Send a Message — may rez ice ignoring all costs.`);
      return { ok: true };
    }
    case "may_install_from_grip": {
      const installable = state.runner.hand.filter((id) =>
        ["program", "hardware", "resource"].includes(state.cards[id].type),
      );
      const options = [
        {
          id: "decline",
          label: "Decline to install",
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "runner" as const,
              amount: 0,
            },
          },
        },
        ...installable.map((id) => ({
          id,
          label: `Install ${state.cards[id].title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "runner" as const,
              amount: 0,
            },
          },
        })),
      ];
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(state, `Pantograph — may install a card from grip.`);
      return { ok: true };
    }
    case "draw": {
      const side = resolveSide(ctx, action.side);
      const n = drawCards(state, side, action.amount);
      log(
        state,
        `${side} draws ${n} (requested ${action.amount}) (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "add_agenda_counter": {
      source.agendaCounters = (source.agendaCounters ?? 0) + action.amount;
      log(
        state,
        `Add ${action.amount} agenda counter(s) to ${source.title} → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }
    case "add_agenda_counters_from_overadvance": {
      const past = action.past;
      const per = action.per ?? 1;
      const adv = source.advancementTokens ?? 0;
      const over = Math.max(0, adv - past);
      const n = Math.floor(over / per);
      source.agendaCounters = (source.agendaCounters ?? 0) + n;
      log(
        state,
        `Add ${n} agenda counter(s) from overadvance (${adv}−${past}, per ${per}) → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }
    case "lose_clicks": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const lost = Math.min(action.amount, p.clicks);
      p.clicks -= lost;
      log(
        state,
        `${side} loses ${lost} click(s) (requested ${action.amount}) → ${p.clicks} (CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    case "gain_clicks": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.clicks += action.amount;
      log(
        state,
        `${side} gains ${action.amount} click(s) → ${p.clicks} (CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    case "trace": {
      if (action.interactive) {
        startTrace(
          state,
          sourceId,
          action.strength,
          action.onSuccess,
          action.onFailure,
        );
        return { ok: true };
      }
      const r = autoResolveTrace(
        state,
        sourceId,
        action.strength,
        action.onSuccess,
        action.onFailure,
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [CR.trace] };
      return { ok: true };
    }
    case "remove_tags": {
      const removed = Math.min(action.amount, state.runner.tags);
      state.runner.tags -= removed;
      log(
        state,
        `Remove ${removed} tag(s) → ${state.runner.tags} (CR ${CR.tags.number}).`,
      );
      return { ok: true };
    }
    case "lose_credits_per_advancement": {
      const n = (source.advancementTokens ?? 0) * action.per;
      const lost = Math.min(n, state.runner.credits);
      state.runner.credits -= lost;
      log(
        state,
        `Runner loses ${lost}¢ (${action.per}×${source.advancementTokens ?? 0} advancements) (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "gain_credits_per_advancement": {
      const n = source.advancementTokens ?? 0;
      const gained = n * action.per;
      const side = source.side;
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += gained;
      log(
        state,
        `${side} gains ${gained}¢ (${n} advancement × ${action.per}) from ${source.title} (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "bypass_current_ice": {
      if (!state.run?.encounter) {
        return {
          ok: false,
          error: "Bypass requires an encounter.",
          cites: [CR.encounterBreakPaw],
        };
      }
      const iceId = state.run.encounter.iceId;
      const ice = state.cards[iceId];
      if (
        action.requireSubtype &&
        !(ice.subtypes ?? []).includes(action.requireSubtype)
      ) {
        return {
          ok: false,
          error: `Bypass requires encountering ${action.requireSubtype}.`,
          cites: [CR.encounterBreakPaw],
        };
      }
      // Mark all subs broken and skip to movement via ended encounter.
      state.run.encounter.broken = (ice.subroutines ?? []).map(() => true);
      state.run.bypassedIceIds = [
        ...(state.run.bypassedIceIds ?? []),
        iceId,
      ];
      log(state, `Bypass ${ice.title} (encounter ends without resolving subs).`);
      return { ok: true };
    }
    case "remove_power_counter": {
      const have = source.powerCounters ?? 0;
      const rem = Math.min(action.amount, have);
      source.powerCounters = have - rem;
      log(
        state,
        `Remove ${rem} power counter(s) from ${source.title} → ${source.powerCounters}.`,
      );
      syncEtrPerPowerCounterSubs(source);
      if (
        source.handSizePerPowerCounter ||
        source.runnerHandSizePenaltyPerPowerCounter
      ) {
        recomputeRunnerMaxHandSize(state);
      }
      if (
        source.trashWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
        removeCardFromCurrentZone(state, sourceId);
        if (source.side === "runner") {
          state.runner.discard.push(sourceId);
          source.zone = "runner:heap";
        } else {
          state.corp.discard.push(sourceId);
          source.zone = "corp:archives";
        }
        source.faceup = true;
        log(
          state,
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
        recomputeRunnerMaxHandSize(state);
      }
      return { ok: true };
    }
    case "add_power_counter": {
      source.powerCounters = (source.powerCounters ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount} power counter(s) on ${source.title} → ${source.powerCounters}.`,
      );
      syncEtrPerPowerCounterSubs(source);
      if (
        source.handSizePerPowerCounter ||
        source.runnerHandSizePenaltyPerPowerCounter
      ) {
        recomputeRunnerMaxHandSize(state);
      }
      maybeFirePowerCountersGte(state, sourceId);
      return { ok: true };
    }
    case "draw_per_power_counter": {
      const side = resolveSide(ctx, action.side);
      const per = action.per ?? 1;
      const n = (source.powerCounters ?? 0) * per;
      const drawn = drawCards(state, side, n);
      log(
        state,
        `${side} draws ${drawn} (${n} from ${source.powerCounters ?? 0} power × ${per}) (CR ${CR.drawing.number}).`,
      );
      return { ok: true };
    }
    case "take_hosted_bad_publicity": {
      const have = source.badPublicityCounters ?? 0;
      const take = Math.min(action.amount, have);
      source.badPublicityCounters = have - take;
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + take;
      log(
        state,
        `Take ${take} bad publicity from ${source.title} → player BP ${state.corp.badPublicity} (hosted ${source.badPublicityCounters}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }
    case "pay_credits_or_etr": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      if (p.credits >= action.amount) {
        p.credits -= action.amount;
        log(
          state,
          `${side} pays ${action.amount}¢ (forced — able to pay) → ${p.credits}.`,
        );
        return { ok: true };
      }
      log(
        state,
        `${side} cannot pay ${action.amount}¢ — end the run.`,
      );
      return applyPrimitive(ctx, { kind: "end_the_run" });
    }
    case "meat_damage_stolen_last_turn": {
      const n = state.turn.agendaPointsStolenLastTurn;
      if (n <= 0) {
        log(state, `Meat damage from stolen AP last turn — 0.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, { kind: "meat_damage", amount: n });
    }
    case "derez_ice": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id].rezzed) iceIds.push(id);
        }
      }
      if (iceIds.length === 0) {
        log(state, `Derez ice — no rezzed ice.`);
        return { ok: true };
      }
      if (action.pick === "choose" && iceIds.length > 1) {
        // Deterministic: derez first rezzed ice (multi-match auto-pick).
      }
      const target = iceIds[0]!;
      state.cards[target].rezzed = false;
      state.cards[target].faceup = false;
      log(
        state,
        iceIds.length > 1
          ? `Derez ${state.cards[target].title} (${iceIds.length} rezzed; first selected).`
          : `Derez ${state.cards[target].title}.`,
      );
      return { ok: true };
    }
    case "derez_card": {
      const card = state.cards[action.cardId];
      if (!card || !card.rezzed) {
        log(
          state,
          `Derez card — ${card?.title ?? action.cardId} not rezzed (CR ${CR.derez.number}).`,
        );
        return { ok: true };
      }
      card.rezzed = false;
      card.faceup = false;
      log(
        state,
        `Derez ${card.title} (CR ${CR.derez.number}, ${CR.derezByAbility.number}).`,
      );
      return { ok: true };
    }
    case "may_derez_installed": {
      const excludeSelf = action.excludeSelf !== false;
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c?.rezzed) continue;
          if (excludeSelf && id === sourceId) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `May derez installed — no other rezzed installed cards (CR ${CR.derez.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          const effects: Effect[] = [
            { op: "do", action: { kind: "derez_card", cardId: id } },
          ];
          if (action.then) {
            effects.push(structuredClone(action.then));
          }
          return {
            id: `derez:${id}`,
            label: `Derez ${title}`,
            effect:
              effects.length === 1
                ? effects[0]!
                : { op: "seq" as const, effects },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may derez another installed card (CR ${CR.derez.number}).`,
      );
      return { ok: true };
    }
    case "trash_corp_card": {
      const card = state.cards[action.cardId];
      if (!card || card.side !== "corp") {
        log(
          state,
          `Trash corp card — ${card?.title ?? action.cardId} not a Corp card (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const installed =
        card.zone.endsWith(":ice") || card.zone.endsWith(":root");
      if (!installed) {
        log(
          state,
          `Trash corp card — ${card.title} not installed (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      trashCorpCardToArchives(state, action.cardId);
      log(
        state,
        `Trash ${card.title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "may_trash_installed": {
      const excludeSelf = action.excludeSelf !== false;
      const rezzedOnly = Boolean(action.rezzedOnly);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          if (excludeSelf && id === sourceId) continue;
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          if (rezzedOnly && !c.rezzed) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `May trash installed — no other installed Corp cards (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          const effects: Effect[] = [
            { op: "do", action: { kind: "trash_corp_card", cardId: id } },
          ];
          if (action.then) {
            effects.push(structuredClone(action.then));
          }
          return {
            id: `trash:${id}`,
            label: `Trash ${title}`,
            effect:
              effects.length === 1
                ? effects[0]!
                : { op: "seq" as const, effects },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may trash another installed card (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "must_trash_installed": {
      const excludeSelf = action.excludeSelf !== false;
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          if (excludeSelf && id === sourceId) continue;
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        return {
          ok: false,
          error: "Must trash an installed Corp card — none available.",
          cites: [CR.trashing],
        };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          return {
            id: `trash:${id}`,
            label: `Trash ${title}`,
            effect: {
              op: "do" as const,
              action: { kind: "trash_corp_card" as const, cardId: id },
            },
          };
        });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — must trash another installed card (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "forbid_bioroid_ice_paid_abilities_this_turn": {
      state.turn.bioroidIcePaidAbilitiesForbidden = true;
      log(
        state,
        `Runner cannot use paid abilities printed on bioroid ice for the remainder of this turn (CR ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "install_and_rez_asset_or_upgrade_free": {
      const pick =
        state.corp.hand.find((id) => {
          const t = state.cards[id].type;
          return t === "asset" || t === "upgrade";
        }) ??
        state.corp.discard.find((id) => {
          const t = state.cards[id].type;
          return t === "asset" || t === "upgrade";
        });
      if (!pick) {
        log(state, `Install+rez asset/upgrade — none in HQ/Archives.`);
        return { ok: true };
      }
      const card = state.cards[pick];
      state.corp.hand = state.corp.hand.filter((id) => id !== pick);
      state.corp.discard = state.corp.discard.filter((id) => id !== pick);
      let serverId: import("../state/types.js").ServerId;
      if (card.type === "upgrade") {
        // Prefer first remote, else create
        const remotes = Object.values(state.servers).filter(
          (s) => s.kind === "remote",
        );
        if (remotes.length > 0) {
          serverId = remotes[0]!.id;
        } else {
          const remoteNum = state.nextRemoteNumber++;
          serverId = `remote-${remoteNum}`;
          state.servers[serverId] = {
            id: serverId,
            kind: "remote",
            ice: [],
            root: [],
          };
        }
      } else {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}`;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      state.servers[serverId].root.push(pick);
      card.zone = `server:${serverId}:root`;
      card.rezzed = true;
      card.faceup = true;
      if ((card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      if ((card.badPublicityCountersOnRez ?? 0) > 0 && card.rezzed) {
        card.badPublicityCounters = card.badPublicityCountersOnRez;
      }
      log(
        state,
        `Install and rez ${card.title} on ${serverId} ignoring costs.`,
      );
      if (card.onRez) {
        const r = evalEffect({ state, sourceId: pick }, card.onRez);
        if (!r.ok) return r;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: pick }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "install_and_rez_from_archives_free": {
      const pick = state.corp.discard.find((id) => {
        const t = state.cards[id].type;
        return (
          t === "asset" || t === "upgrade" || t === "ice" || t === "agenda"
        );
      });
      if (!pick) {
        log(state, `Install+rez from Archives — none available.`);
        return { ok: true };
      }
      const card = state.cards[pick];
      state.corp.discard = state.corp.discard.filter((id) => id !== pick);
      const remoteNum = state.nextRemoteNumber++;
      const serverId =
        `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[serverId] = {
        id: serverId,
        kind: "remote",
        ice: [],
        root: [],
      };
      if (card.type === "ice") {
        state.servers[serverId].ice.push(pick);
        card.zone = `server:${serverId}:ice`;
      } else {
        state.servers[serverId].root.push(pick);
        card.zone = `server:${serverId}:root`;
      }
      if (card.type !== "agenda") {
        card.rezzed = true;
      }
      card.faceup = true;
      if ((card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      log(
        state,
        `Install${card.type !== "agenda" ? " and rez" : ""} ${card.title} from Archives on ${serverId} ignoring costs.`,
      );
      if (card.onRez && card.rezzed) {
        const r = evalEffect({ state, sourceId: pick }, card.onRez);
        if (!r.ok) return r;
      }
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: pick }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "may_return_self_to_grip": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.runner.credits >= action.creditCost) {
        options.push({
          id: "return",
          label: `Pay ${action.creditCost}¢: add to grip`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: action.creditCost,
                },
              },
              { op: "do", action: { kind: "return_source_to_grip" } },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Leave in heap",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(
        state,
        `${source.title} — may pay ${action.creditCost}¢ to return to grip.`,
      );
      return { ok: true };
    }
    case "return_source_to_grip": {
      // Move source from heap to grip.
      state.runner.discard = state.runner.discard.filter((id) => id !== sourceId);
      if (!state.runner.hand.includes(sourceId)) {
        state.runner.hand.push(sourceId);
      }
      source.zone = "runner:grip";
      source.faceup = true;
      log(state, `Return ${source.title} to grip.`);
      return { ok: true };
    }
    case "install_resource_discount": {
      const matches = state.runner.hand.filter(
        (id) => state.cards[id].type === "resource",
      );
      if (matches.length === 0) {
        log(state, `Install resource discounted — none in grip.`);
        return { ok: true };
      }
      // Auto-first match, pay installCost - discount
      const id = matches[0]!;
      const card = state.cards[id];
      const cost = Math.max(0, card.installCost - action.discount);
      if (state.runner.credits < cost) {
        log(
          state,
          `Install ${card.title} discounted — cannot afford ${cost}¢.`,
        );
        return { ok: true };
      }
      state.runner.credits -= cost;
      state.runner.hand = state.runner.hand.filter((x) => x !== id);
      state.runner.rig.push(id);
      card.zone = "runner:rig";
      card.faceup = true;
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      if ((card.hostedCreditsOnInstall ?? 0) > 0) {
        card.hostedCredits = card.hostedCreditsOnInstall;
      }
      log(
        state,
        `Install ${card.title} for ${cost}¢ (${action.discount}¢ discount).`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: id }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "install_grip_card": {
      return installGripCardDiscounted(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }
    case "may_charge_card": {
      return offerMayChargeCard(state, action.cardId, sourceId);
    }
    case "install_from_grip_discount": {
      const typeSet = new Set(action.types);
      const candidates = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!typeSet.has(c.type as "program" | "hardware" | "resource")) {
          return false;
        }
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        if (c.type === "program") {
          const need = c.memoryCost ?? 1;
          if (usedMemory(state) + need > memoryLimit(state)) return false;
        }
        const cost = gripInstallCostAfterDiscount(state, c, action.discount);
        return state.runner.credits >= cost;
      });
      if (candidates.length === 0) {
        log(
          state,
          `Install from grip discounted — no affordable ${action.types.join("/")}.`,
        );
        return { ok: true };
      }
      const buildEffect = (id: string): Effect => {
        const installFx: Effect = {
          op: "do",
          action: {
            kind: "install_grip_card",
            cardId: id,
            discount: action.discount,
          },
        };
        if (!action.mayCharge) return installFx;
        return {
          op: "seq",
          effects: [
            installFx,
            {
              op: "do",
              action: { kind: "may_charge_card", cardId: id },
            },
          ],
        };
      };
      if (candidates.length === 1) {
        return evalEffect({ state, sourceId }, buildEffect(candidates[0]!));
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => {
          const c = state.cards[id];
          const cost = gripInstallCostAfterDiscount(state, c, action.discount);
          return {
            id: `install-${id}`,
            label: `Install ${c.title} for ${cost}¢`,
            effect: buildEffect(id),
          };
        }),
      };
      log(
        state,
        `Install from grip — choose among ${candidates.length} cards (${action.discount}¢ discount).`,
      );
      return { ok: true };
    }
    case "give_bad_publicity": {
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + action.amount;
      log(
        state,
        `Corp takes ${action.amount} bad publicity → ${state.corp.badPublicity}.`,
      );
      return { ok: true };
    }
    case "reveal_hq_gain_credits": {
      const n = Math.min(action.maxCards, state.corp.hand.length);
      const gain = n * action.creditsEach;
      state.corp.credits += gain;
      log(
        state,
        `Reveal ${n} card(s) from HQ → gain ${gain}¢ (${action.creditsEach}¢ each).`,
      );
      return { ok: true };
    }
    case "move_advancements": {
      const sources = Object.values(state.cards).filter(
        (c) =>
          (c.advancementTokens ?? 0) > 0 &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      const dests = Object.values(state.cards).filter(
        (c) =>
          (c.type === "agenda" ||
            c.type === "asset" ||
            c.type === "ice" ||
            c.canAdvance) &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      if (sources.length === 0 || dests.length < 2) {
        log(state, `Move advancements — no valid source/dest.`);
        return { ok: true };
      }
      const from = sources[0]!;
      const to = dests.find((c) => c.id !== from.id);
      if (!to) {
        log(state, `Move advancements — no destination.`);
        return { ok: true };
      }
      const move = Math.min(action.amount, from.advancementTokens ?? 0);
      from.advancementTokens = (from.advancementTokens ?? 0) - move;
      to.advancementTokens = (to.advancementTokens ?? 0) + move;
      log(
        state,
        `Move ${move} advancement(s) from ${from.title} to ${to.title}.`,
      );
      return { ok: true };
    }
    case "trash_passed_unrezzed_ice": {
      const ids = (state.turn.lastRunPassedUnrezzedIceIds ?? []).filter(
        (id) => {
          const c = state.cards[id];
          return c && c.type === "ice" && !c.rezzed && c.zone.endsWith(":ice");
        },
      );
      if (ids.length === 0) {
        log(state, `Trash passed unrezzed ice — none available.`);
        return { ok: true };
      }
      const id = ids[0]!;
      const card = state.cards[id];
      trashCorpCardToArchives(state, id);
      log(state, `Trash unrezzed ${card.title} (passed last run).`);
      return { ok: true };
    }
    case "forged_activation_orders": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id].rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Forged Activation Orders — no unrezzed ice.`);
        return { ok: true };
      }
      const iceId = targets[0]!;
      const ice = state.cards[iceId];
      const rezCost = ice.rezCost ?? 0;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.corp.credits >= rezCost) {
        options.push({
          id: "rez",
          label: `Rez ${ice.title} for ${rezCost}¢`,
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        });
      }
      options.push({
        id: "trash",
        label: `Trash ${ice.title}`,
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      // Resolve immediately with Corp preference: rez if able, else trash.
      // Honesty: auto-rez when affordable, otherwise trash.
      if (state.corp.credits >= rezCost) {
        state.corp.credits -= rezCost;
        ice.rezzed = true;
        ice.faceup = true;
        log(state, `Forged Activation Orders — Corp rezzes ${ice.title}.`);
        if (ice.onRez) {
          const r = evalEffect({ state, sourceId: iceId }, ice.onRez);
          if (!r.ok) return r;
        }
      } else {
        trashCorpCardToArchives(state, iceId);
        log(
          state,
          `Forged Activation Orders — Corp cannot rez; trash ${ice.title}.`,
        );
      }
      return { ok: true };
    }
    case "install_program_from_stack_or_heap_free": {
      const fromHeap = state.runner.discard.find(
        (id) => state.cards[id].type === "program",
      );
      const fromStack = state.runner.deck.find(
        (id) => state.cards[id].type === "program",
      );
      const id = fromHeap ?? fromStack;
      if (!id) {
        log(state, `Install program from stack/heap — none found.`);
        return { ok: true };
      }
      const card = state.cards[id];
      state.runner.discard = state.runner.discard.filter((x) => x !== id);
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.rig.push(id);
      card.zone = "runner:rig";
      card.faceup = true;
      card.bounceToStackAtTurnEnd = true;
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      log(
        state,
        `Install ${card.title} ignoring costs (will bounce to stack at turn end).`,
      );
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: id }, card.onInstall);
        if (!r.ok) return r;
      }
      noteVirusProgramInstalled(state, id);
      noteProgramOrHardwareInstalled(state, id);
      return { ok: true };
    }
    case "place_advancements_x_from_tags": {
      const x = Math.min(state.corp.credits, state.runner.tags);
      if (x <= 0) {
        log(state, `Psychographics — X=0 (no tags or credits).`);
        return { ok: true };
      }
      state.corp.credits -= x;
      const targets = Object.values(state.cards).filter(
        (c) =>
          (c.type === "agenda" ||
            c.type === "asset" ||
            c.type === "ice" ||
            c.canAdvance) &&
          (c.zone.endsWith(":root") || c.zone.endsWith(":ice")),
      );
      if (targets.length === 0) {
        log(state, `Psychographics — spend ${x}¢ but no advanceable target.`);
        return { ok: true };
      }
      const t = targets[0]!;
      t.advancementTokens = (t.advancementTokens ?? 0) + x;
      log(
        state,
        `Psychographics — spend ${x}¢, place ${x} advancement(s) on ${t.title}.`,
      );
      return { ok: true };
    }
    case "troubleshooter_fortify": {
      const x = state.corp.credits;
      if (x <= 0) {
        log(state, `Corporate Troubleshooter — no credits to spend.`);
        // Still trash self via cost if paid ability includes trashSelf
        return { ok: true };
      }
      const iceTargets = Object.values(state.cards).filter(
        (c) => c.type === "ice" && c.zone.endsWith(":ice") && c.rezzed,
      );
      if (iceTargets.length === 0) {
        log(state, `Corporate Troubleshooter — no rezzed ice.`);
        return { ok: true };
      }
      state.corp.credits = 0;
      const ice = iceTargets[0]!;
      state.turn.iceStrengthBoostsThisTurn[ice.id] =
        (state.turn.iceStrengthBoostsThisTurn[ice.id] ?? 0) + x;
      log(
        state,
        `Corporate Troubleshooter — spend ${x}¢, ${ice.title} +${x} strength this turn.`,
      );
      return { ok: true };
    }
    case "resolve_bioroid_subroutine": {
      const others: Array<{ iceId: string; subIndex: number }> = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === sourceId) continue;
          const ice = state.cards[id];
          if (!ice.rezzed) continue;
          if (!(ice.subtypes ?? []).includes("bioroid")) continue;
          const subs = ice.subroutines ?? [];
          for (let i = 0; i < subs.length; i++) {
            others.push({ iceId: id, subIndex: i });
          }
        }
      }
      if (others.length === 0) {
        log(state, `Resolve bioroid sub — no other rezzed bioroid ice.`);
        return { ok: true };
      }
      const pick = others[0]!;
      const ice = state.cards[pick.iceId];
      const sub = ice.subroutines![pick.subIndex]!;
      log(
        state,
        `Resolve "${sub.text}" on ${ice.title} (via ${source.title}).`,
      );
      return evalEffect({ state, sourceId: pick.iceId }, sub.effect);
    }
    case "may_flip_archives_ice_resolve_subroutine": {
      const facedownIce = state.corp.discard.filter((id) => {
        const c = state.cards[id];
        return c.type === "ice" && !c.faceup;
      });
      if (facedownIce.length === 0) {
        log(state, `${source.title} — no facedown ice in Archives.`);
        return { ok: true };
      }
      const options: Array<{
        id: string;
        label: string;
        effect: import("./ir.js").Effect;
      }> = [];
      for (const iceId of facedownIce) {
        const ice = state.cards[iceId]!;
        const subs = ice.subroutines ?? [];
        for (let i = 0; i < subs.length; i++) {
          const sub = subs[i]!;
          options.push({
            id: `flip:${iceId}:${i}`,
            label: `Turn ${ice.title} faceup, resolve "${sub.text}"`,
            effect: {
              op: "do",
              action: {
                kind: "flip_archives_ice_resolve_subroutine",
                iceId,
                subIndex: i,
              },
            },
          });
        }
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${source.title} — may turn 1 facedown Archives ice faceup and resolve a subroutine.`,
      );
      return { ok: true };
    }
    case "flip_archives_ice_resolve_subroutine": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice" || !state.corp.discard.includes(action.iceId)) {
        log(state, `Flip Archives ice — invalid target.`);
        return { ok: true };
      }
      ice.faceup = true;
      const sub = ice.subroutines?.[action.subIndex];
      if (!sub) {
        log(state, `Flip ${ice.title} faceup — no subroutine ${action.subIndex}.`);
        return { ok: true };
      }
      log(
        state,
        `Turn ${ice.title} faceup in Archives; resolve "${sub.text}".`,
      );
      return evalEffect({ state, sourceId: action.iceId }, sub.effect);
    }
    case "trash_encounter_ice_resolve_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Trash encounter ice — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      if (!ice) {
        log(state, `Trash encounter ice — missing ice.`);
        return { ok: true };
      }
      const sub = ice.subroutines?.[action.subIndex];
      if (!sub) {
        log(state, `Trash encounter ice — no subroutine ${action.subIndex}.`);
        return { ok: true };
      }
      // Trash ice; mark all subs broken so the encounter does not keep firing.
      removeCardFromCurrentZone(state, enc.iceId);
      state.corp.discard.push(enc.iceId);
      ice.zone = "corp:archives";
      ice.faceup = true;
      ice.rezzed = false;
      enc.broken = (ice.subroutines ?? []).map(() => true);
      log(
        state,
        `Trash ${ice.title}; resolve "${sub.text}" (ZATO City Grid).`,
      );
      return evalEffect({ state, sourceId: enc.iceId }, sub.effect);
    }
    case "may_choose_server": {
      const servers = Object.keys(state.servers);
      if (servers.length === 0) {
        log(state, `${source.title} — no servers to name.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...servers.map((serverId) => ({
            id: `server:${serverId}`,
            label: `Name ${serverId}`,
            effect: {
              op: "do" as const,
              action: { kind: "set_named_server" as const, serverId },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may choose a server.`);
      return { ok: true };
    }
    case "set_named_server": {
      source.namedServerId = action.serverId as import("../state/types.js").ServerId;
      log(state, `${source.title} names ${action.serverId}.`);
      return { ok: true };
    }
    case "search_stack_host_virus_or_weapon": {
      const max = Math.max(1, action.max);
      const eligible = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        const subs = c.subtypes ?? [];
        return subs.includes("virus") || subs.includes("weapon");
      });
      const picks: string[] = [];
      const seenTitles = new Set<string>();
      for (const id of eligible) {
        if (picks.length >= max) break;
        const title = state.cards[id]!.title;
        if (seenTitles.has(title)) continue;
        seenTitles.add(title);
        picks.push(id);
      }
      if (picks.length === 0) {
        shuffleRunnerStack(state);
        log(
          state,
          `${source.title} — search stack for virus/weapon; none found.`,
        );
        return { ok: true };
      }
      if (!source.hostedCardIds) source.hostedCardIds = [];
      for (const id of picks) {
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        const card = state.cards[id]!;
        card.hostId = sourceId;
        card.faceup = true;
        card.zone = `hosted:${sourceId}`;
        source.hostedCardIds.push(id);
        log(
          state,
          `${source.title} hosts ${card.title} faceup (not installed).`,
        );
      }
      shuffleRunnerStack(state);
      return { ok: true };
    }
    case "host_stack_card_on_source": {
      if (!state.runner.deck.includes(action.cardId)) {
        log(state, `Host stack card — ${action.cardId} not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((x) => x !== action.cardId);
      const card = state.cards[action.cardId]!;
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(action.cardId);
      log(
        state,
        `${source.title} hosts ${card.title} faceup (not installed).`,
      );
      return { ok: true };
    }
    case "may_add_hosted_card_to_grip": {
      const hosted = source.hostedCardIds ?? [];
      if (hosted.length === 0) {
        if (source.trashWhenNoHostedCards) {
          moveRunnerCardToHeap(state, sourceId);
          log(state, `${source.title} trashed — no hosted cards.`);
        }
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((cardId) => ({
            id: `grip:${cardId}`,
            label: `Add ${state.cards[cardId]!.title} to grip`,
            effect: {
              op: "do" as const,
              action: { kind: "add_hosted_card_to_grip" as const, cardId },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      log(state, `${source.title} — may add 1 hosted card to grip.`);
      return { ok: true };
    }
    case "add_hosted_card_to_grip": {
      const hosted = source.hostedCardIds ?? [];
      if (!hosted.includes(action.cardId)) {
        log(state, `Add hosted to grip — ${action.cardId} not hosted.`);
        return { ok: true };
      }
      source.hostedCardIds = hosted.filter((id) => id !== action.cardId);
      const card = state.cards[action.cardId]!;
      card.hostId = undefined;
      card.zone = "runner:grip";
      card.faceup = true;
      state.runner.hand.push(action.cardId);
      log(state, `Add ${card.title} to grip from ${source.title}.`);
      if (
        (source.hostedCardIds?.length ?? 0) === 0 &&
        source.trashWhenNoHostedCards
      ) {
        moveRunnerCardToHeap(state, sourceId);
        log(state, `${source.title} trashed — no hosted cards remain.`);
      }
      return { ok: true };
    }
    case "turn_hosted_cards_faceup": {
      let n = 0;
      for (const id of source.hostedCardIds ?? []) {
        const c = state.cards[id];
        if (!c) continue;
        if (!c.faceup) {
          c.faceup = true;
          n += 1;
        }
      }
      log(
        state,
        n > 0
          ? `${source.title} — turn ${n} hosted card(s) faceup.`
          : `${source.title} — no facedown hosted cards.`,
      );
      return { ok: true };
    }
    case "host_copy_from_grip": {
      const match = state.runner.hand.find(
        (id) => state.cards[id]?.title === action.title,
      );
      if (!match) {
        log(
          state,
          `${source.title} — no ${action.title} in grip to host.`,
        );
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== match);
      const card = state.cards[match]!;
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(match);
      log(
        state,
        `${source.title} hosts ${card.title} faceup (not installed).`,
      );
      return { ok: true };
    }
    case "matryoshka_break": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Matryoshka break — no encounter.`);
        return { ok: true };
      }
      if (state.cards[enc.iceId]?.cannotBreakWithRunnerCardAbilities) {
        return {
          ok: false,
          error:
            "Runner card abilities cannot break subroutines on this ice (Trieste).",
          cites: [CR.encounterBreakPaw],
        };
      }
      const ice = state.cards[enc.iceId]!;
      const brStr = breakerStrength(state, sourceId);
      const iceStr = iceStrength(state, enc.iceId);
      if (brStr < iceStr) {
        log(
          state,
          `${source.title} — strength ${brStr} < ice ${iceStr}; cannot interface.`,
        );
        return { ok: true };
      }
      const faceupHosted = (source.hostedCardIds ?? []).filter((id) => {
        const c = state.cards[id];
        return c && c.faceup && c.title === source.title;
      });
      if (faceupHosted.length === 0) {
        log(state, `${source.title} — no faceup hosted copy to turn facedown.`);
        return { ok: true };
      }
      const unbroken = enc.broken.filter((b) => !b).length;
      if (unbroken === 0) {
        log(state, `${source.title} — no unbroken subroutines.`);
        return { ok: true };
      }
      const hostedId = faceupHosted[0]!;
      const maxX = Math.min(unbroken, state.runner.credits);
      if (maxX < 1) {
        log(state, `${source.title} — insufficient credits to break.`);
        return { ok: true };
      }
      if (maxX === 1) {
        return evalEffect(
          { state, sourceId },
          {
            op: "do",
            action: {
              kind: "matryoshka_break_resolve",
              amount: 1,
              hostedId,
            },
          },
        );
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: Array.from({ length: maxX }, (_, i) => {
          const amount = i + 1;
          return {
            id: `break:${amount}`,
            label: `Pay ${amount}¢, turn hosted facedown, break ${amount}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "matryoshka_break_resolve" as const,
                amount,
                hostedId,
              },
            },
          };
        }),
      };
      log(
        state,
        `${source.title} — choose how many subroutines to break (1–${maxX}).`,
      );
      return { ok: true };
    }
    case "matryoshka_break_resolve": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Matryoshka break resolve — no encounter.`);
        return { ok: true };
      }
      const hosted = state.cards[action.hostedId];
      if (
        !hosted ||
        !(source.hostedCardIds ?? []).includes(action.hostedId) ||
        !hosted.faceup
      ) {
        log(state, `Matryoshka break resolve — invalid hosted copy.`);
        return { ok: true };
      }
      if (state.runner.credits < action.amount) {
        log(state, `Matryoshka break resolve — insufficient credits.`);
        return { ok: true };
      }
      state.runner.credits -= action.amount;
      hosted.faceup = false;
      log(
        state,
        `${source.title} spends ${action.amount}¢; turn hosted ${hosted.title} facedown.`,
      );
      let broken = 0;
      for (let n = 0; n < action.amount; n++) {
        const idx = enc.broken.findIndex((b) => !b);
        if (idx < 0) break;
        enc.broken[idx] = true;
        broken += 1;
        const sub = state.cards[enc.iceId]?.subroutines?.[idx];
        log(
          state,
          `${source.title} breaks "${sub?.text ?? `sub ${idx}`}".`,
        );
      }
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      return { ok: true };
    }
    case "host_ice_program_on_self": {
      // Magnet: host a program already hosted on another ice.
      const hosted: string[] = [];
      for (const id of Object.keys(state.cards)) {
        const c = state.cards[id];
        if (
          c.type === "program" &&
          c.hostId &&
          c.hostId !== sourceId &&
          state.runner.rig.includes(id)
        ) {
          hosted.push(id);
        }
      }
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted programs on other ice.`);
        return { ok: true };
      }
      const pid = hosted[0]!;
      const prog = state.cards[pid];
      prog.hostId = sourceId;
      prog.abilitiesBlanked = true;
      log(
        state,
        `${source.title} hosts ${prog.title} (abilities blanked).`,
      );
      return { ok: true };
    }
    case "rehost_on_other_ice": {
      const currentHost = source.hostId;
      const others: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          if (iceId !== currentHost) others.push(iceId);
        }
      }
      if (others.length === 0) {
        log(state, `${source.title} — no other installed ice to host on.`);
        return { ok: true };
      }
      if (others.length === 1) {
        const iceId = others[0]!;
        source.hostId = iceId;
        log(
          state,
          `${source.title} hosts on ${state.cards[iceId]!.title}.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: others.map((iceId) => ({
          id: `rehost:${iceId}`,
          label: `Host on ${state.cards[iceId]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "rehost_to_ice" as const, iceId },
          },
        })),
      };
      log(state, `${source.title} — choose another installed ice to host on.`);
      return { ok: true };
    }
    case "rehost_to_ice": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Rehost — ${action.iceId} is not ice.`);
        return { ok: true };
      }
      let installed = false;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(action.iceId)) {
          installed = true;
          break;
        }
      }
      if (!installed) {
        log(state, `Rehost — ${ice.title} is not installed.`);
        return { ok: true };
      }
      source.hostId = action.iceId;
      log(state, `${source.title} hosts on ${ice.title}.`);
      return { ok: true };
    }
    case "return_subliminal_from_archives": {
      // Handled at Corp turn begin when conditions met — this primitive
      // returns the source from Archives to HQ if present.
      if (!state.corp.discard.includes(sourceId)) {
        return { ok: true };
      }
      state.corp.discard = state.corp.discard.filter((id) => id !== sourceId);
      state.corp.hand.push(sourceId);
      source.zone = "corp:hq";
      source.faceup = false;
      log(state, `Return ${source.title} from Archives to HQ.`);
      return { ok: true };
    }
    case "aesop_trash_for_credits": {
      const owned = state.runner.rig.filter((id) => id !== sourceId);
      if (owned.length === 0) {
        log(state, `Aesop's Pawnshop — no other installed card.`);
        return { ok: true };
      }
      const id = owned[0]!;
      const card = state.cards[id];
      trashToHeap(state, id);
      state.runner.credits += action.amount;
      log(
        state,
        `Aesop's Pawnshop — trash ${card.title}, gain ${action.amount}¢.`,
      );
      return { ok: true };
    }
    case "ayla_set_aside_to_grip": {
      const setAside = state.runner.setAside ?? [];
      if (setAside.length === 0) {
        log(state, `Ayla — set-aside empty.`);
        return { ok: true };
      }
      const id = setAside[0]!;
      state.runner.setAside = setAside.filter((x) => x !== id);
      state.runner.hand.push(id);
      state.cards[id].zone = "runner:grip";
      state.cards[id].faceup = true;
      log(state, `Ayla — add ${state.cards[id].title} from set-aside to grip.`);
      return { ok: true };
    }
    case "sabotage": {
      if (action.interactive) {
        state.pendingSabotage = { sourceId, amount: action.amount };
        log(
          state,
          `Sabotage ${action.amount} pending — Corp chooses HQ cards (CR ${CR.sabotageResolution.number}).`,
        );
        return { ok: true };
      }
      return resolveSabotageAmount(state, sourceId, action.amount);
    }
    case "identify_mark": {
      identifyMark(state, sourceId);
      return { ok: true };
    }
    case "start_run_on_mark": {
      if (state.markServerId === null) {
        log(
          state,
          `Start run on mark — no mark designated (CR ${CR.mark.number}).`,
        );
        return { ok: true };
      }
      state.pendingStartRunOnMark = { sourceId };
      log(
        state,
        `Pending run on mark ${state.markServerId} (from ${source.title}; CR ${CR.mark.number}).`,
      );
      return { ok: true };
    }
    case "charge": {
      if (action.pick === "self") {
        return chargeCard(state, sourceId, sourceId);
      }
      if (action.pick === "card") {
        if (!action.cardId) {
          return {
            ok: false,
            error: "charge pick=card requires cardId.",
            cites: [CR.charge],
          };
        }
        return chargeCard(state, action.cardId, sourceId);
      }
      // choose among controller's installed chargeable cards
      const side = source.side;
      const cands = chargeableInstalledIds(state, side);
      if (cands.length === 0) {
        log(
          state,
          `Charge — no installed card with power counters (CR ${CR.chargeTargets.number}).`,
        );
        return { ok: true };
      }
      if (cands.length === 1) {
        return chargeCard(state, cands[0]!, sourceId);
      }
      state.pendingChoice = {
        sourceId,
        chooser: side,
        options: cands.map((id) => ({
          id: `charge-${id}`,
          label: `Charge ${state.cards[id].title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "charge" as const,
              pick: "card" as const,
              cardId: id,
            },
          },
        })),
      };
      log(
        state,
        `Charge — ${side} chooses among ${cands.length} cards (CR ${CR.chargeTargets.number}).`,
      );
      return { ok: true };
    }
    case "bonus_access": {
      if (!state.run) {
        return {
          ok: false,
          error: "bonus_access requires an active run.",
          cites: [CR.breach],
        };
      }
      const n = action.amount;
      if (n <= 0) return { ok: true };
      state.run.bonusAccess = (state.run.bonusAccess ?? 0) + n;
      log(
        state,
        `${source.title} — +${n} bonus access (CR ${CR.breach.number}).`,
      );
      return { ok: true };
    }
    case "breach_server_when_run_ends": {
      if (!state.run) {
        return {
          ok: false,
          error: "breach_server_when_run_ends requires an active run.",
          cites: [CR.breach],
        };
      }
      state.run.breachWhenRunEnds = action.server;
      log(
        state,
        `${source.title} — breach ${action.server} when the run ends (CR ${CR.breach.number}).`,
      );
      return { ok: true };
    }
    case "search_stack_program_install": {
      return searchStackProgramInstall(state, sourceId);
    }
    case "install_stack_program": {
      return installStackProgramPaying(state, action.cardId, sourceId);
    }
    case "spark_of_inspiration_resolve": {
      const discount = Math.max(0, action.discount ?? 10);
      const aside: string[] = [];
      let programId: string | null = null;
      while (state.runner.deck.length > 0) {
        const id = state.runner.deck.shift()!;
        aside.push(id);
        state.cards[id]!.faceup = true;
        state.cards[id]!.zone = "runner:set-aside";
        if (state.cards[id]!.type === "program") {
          programId = id;
          break;
        }
      }
      state.runner.setAside = aside;
      log(
        state,
        `${source.title} — set aside ${aside.length} card(s) from stack faceup.`,
      );
      if (!programId) {
        shuffleRunnerSetAsideIntoStack(state);
        return { ok: true };
      }
      const prog = state.cards[programId]!;
      if (!canInstallSetAsideProgram(state, programId, discount)) {
        log(
          state,
          `${source.title} — cannot install ${prog.title}; shuffle set-aside.`,
        );
        shuffleRunnerSetAsideIntoStack(state);
        return { ok: true };
      }
      const cost = stackCardInstallCost(state, prog, discount);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "install",
            label: `Install ${prog.title} for ${cost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_set_aside_program" as const,
                cardId: programId,
                discount,
              },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "shuffle_runner_set_aside_into_stack" as const },
            },
          },
        ],
      };
      log(
        state,
        `${source.title} — may install ${prog.title} (${discount}¢ discount).`,
      );
      return { ok: true };
    }
    case "install_set_aside_program": {
      return installSetAsideProgramPaying(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }
    case "shuffle_runner_set_aside_into_stack": {
      shuffleRunnerSetAsideIntoStack(state);
      return { ok: true };
    }
    case "may_trash_other_installed_search_stack_same_type_install": {
      const discount = Math.max(0, action.discount);
      const targets = state.runner.rig.filter((id) => id !== sourceId);
      if (targets.length === 0) {
        log(
          state,
          `${source.title} — may trash other installed: none available.`,
        );
        return { ok: true };
      }
      const installTypes = new Set(["program", "hardware", "resource"]);
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets
          .filter((id) => installTypes.has(state.cards[id]!.type))
          .map((id) => {
            const c = state.cards[id]!;
            const cardType = c.type as "program" | "hardware" | "resource";
            return {
              id: `trash:${id}`,
              label: `Trash ${c.title}; search for a ${cardType}`,
              effect: {
                op: "seq" as const,
                effects: [
                  {
                    op: "do" as const,
                    action: {
                      kind: "trash_runner_rig_card" as const,
                      cardId: id,
                    },
                  },
                  {
                    op: "do" as const,
                    action: {
                      kind: "search_stack_type_install" as const,
                      cardType,
                      discount,
                    },
                  },
                ],
              },
            };
          });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "runner" as const,
            amount: 0,
          },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(
        state,
        `${source.title} — may trash another installed card to search stack.`,
      );
      return { ok: true };
    }
    case "trash_runner_rig_card": {
      if (!state.runner.rig.includes(action.cardId)) {
        log(state, `Trash runner card — ${action.cardId} not installed.`);
        return { ok: true };
      }
      const title = state.cards[action.cardId]!.title;
      trashToHeap(state, action.cardId);
      log(
        state,
        `Trash installed ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    case "search_stack_type_install": {
      return searchStackTypeInstall(
        state,
        sourceId,
        action.cardType,
        action.discount,
      );
    }
    case "install_stack_card": {
      return installStackCardPaying(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }
    case "exclusive_choices_per_passed_ice": {
      return startExclusiveChoicesPerPassedIce(
        state,
        sourceId,
        action.options,
      );
    }
    default: {
      const _a: never = action;
      return {
        ok: false,
        error: `Unhandled primitive: ${JSON.stringify(_a)}`,
        cites: [],
      };
    }
  }
}

/** Execute an effect tree against game state (mutates). */
export function evalEffect(ctx: EffectCtx, effect: Effect): EvalResult {
  switch (effect.op) {
    case "seq": {
      for (const e of effect.effects) {
        const r = evalEffect(ctx, e);
        if (!r.ok) return r;
        // Pause seq when a choice / pending target is opened.
        if (
          ctx.state.pendingChoice ||
          ctx.state.pendingTrashProgram ||
          ctx.state.pendingSabotage ||
          ctx.state.pendingDamage ||
          ctx.state.trace
        ) {
          return { ok: true };
        }
      }
      return { ok: true };
    }
    case "do":
      return applyPrimitive(ctx, effect.action);
    case "if": {
      if (evalCond(ctx, effect.cond)) {
        return evalEffect(ctx, effect.then);
      }
      if (effect.else) return evalEffect(ctx, effect.else);
      return { ok: true };
    }
    case "prevent": {
      if (effect.forbid === "jack_out") {
        if (ctx.state.run) ctx.state.run.cannotJackOut = true;
        addRestriction(
          ctx.state,
          "jack_out",
          CR.cannotPrecedence,
          ctx.sourceId,
        );
        return { ok: true };
      }
      return { ok: true };
    }
    case "choose": {
      ctx.state.pendingChoice = {
        sourceId: ctx.sourceId,
        chooser: effect.chooser,
        options: effect.options.map((o) => ({
          id: o.id,
          label: o.label,
          effect: structuredClone(o.effect),
        })),
      };
      log(
        ctx.state,
        `Choice pending for ${effect.chooser} (${effect.options.length} options) from ${ctx.state.cards[ctx.sourceId].title}.`,
      );
      return { ok: true };
    }
    default: {
      const _e: never = effect;
      return {
        ok: false,
        error: `Unhandled effect op: ${JSON.stringify(_e)}`,
        cites: [],
      };
    }
  }
}

/**
 * Preconditions for paying a paid ability whose effect is this tree.
 * Returns a failure result if illegal, otherwise null.
 */
export function validatePaidEffect(
  ctx: EffectCtx,
  effect: Effect,
): Extract<EvalResult, { ok: false }> | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  const walk = (e: Effect): Extract<EvalResult, { ok: false }> | null => {
    switch (e.op) {
      case "seq": {
        for (const child of e.effects) {
          const r = walk(child);
          if (r) return r;
        }
        return null;
      }
      case "if":
        return walk(e.then) ?? (e.else ? walk(e.else) : null);
      case "prevent":
        return null;
      case "choose":
        return null;
      case "do": {
        const a = e.action;
        if (a.kind === "pump_strength") {
          if (!state.run) {
            return {
              ok: false,
              error: "Pump requires an active run/encounter.",
              cites: [CR.icebreakerStrengthImplicit],
            };
          }
          if (!source.breaker) {
            return {
              ok: false,
              error: "Pump requires an icebreaker.",
              cites: [CR.programStrength],
            };
          }
        }
        if (a.kind === "fortify_ice") {
          if (!state.run || source.type !== "ice") {
            return {
              ok: false,
              error: "Fortify requires approached ice during a run.",
              cites: [CR.iceStrength],
            };
          }
        }
        if (a.kind === "weaken_ice") {
          if (!state.run?.encounter) {
            return {
              ok: false,
              error: "Weaken ice requires an encounter.",
              cites: [CR.iceStrength],
            };
          }
        }
        if (a.kind === "gain_credits_per_virus") {
          // Always legal; may gain 0.
        }
        return null;
      }
      default: {
        const _e: never = e;
        return _e;
      }
    }
  };
  return walk(effect);
}

// trashCorpCardToArchives used by trash_hq / shuffle paths.
