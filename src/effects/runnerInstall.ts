/**
 * Runner install from grip, heap, stack, and set-aside.
 * Helpers moved out of eval.ts; the switch still calls them.
 */
import { log } from "../state/createGame.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { fireOnInstall } from "../state/cardLifecycleHooks.js";
import {
  creditsAvailableForInstall,
  spendCreditsForInstall,
  subtractRunnerCreditPool,
} from "../state/costs.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";
import {
  azJobConnectionOrHardwareInstallDiscount,
  noteJobConnectionOrHardwareInstalled,
} from "../state/azInstallDiscount.js";
import {
  noteInstalledThisTurn,
  noteProgramOrHardwareInstalled,
} from "../state/programHardwareInstall.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import {
  effectiveMemoryCost,
  memoryLimit,
  usedMemory,
} from "../state/turn.js";
import type { GameState } from "../state/types.js";
import { noteVirusProgramInstalled } from "../state/virusInstall.js";
import {
  daemonInstallDiscount,
  hostLimitReason,
} from "../state/cardDeclarations.js";
import { CR } from "../timing/labels.js";
import { type EvalResult } from "./eval.js";
import {
  fireOnInstallProgramFromHeap,
} from "../state/miscConditionalHooks.js";

export function countInstalledIcebreakersForCost(state: GameState): number {
  return state.runner.installed.filter(
    (id) =>
      Boolean(state.cards[id].breaker) ||
      (state.cards[id].subtypes ?? []).includes("icebreaker"),
  ).length;
}

export function gripInstallCostAfterDiscount(
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
  if (
    card.installCostDiscountIfSuccessfulHqRunThisTurn &&
    state.turn.successfulHqRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - card.installCostDiscountIfSuccessfulHqRunThisTurn,
    );
  }
  if (card.installCostDiscountPerInstalledIcebreaker) {
    cost = Math.max(
      0,
      cost -
        card.installCostDiscountPerInstalledIcebreaker *
          countInstalledIcebreakersForCost(state),
    );
  }
  if (card.type === "program" && state.turn.programsInstalledThisTurn === 0) {
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
      const d = state.cards[id].firstProgramInstallDiscount ?? 0;
      if (d > 0) cost = Math.max(0, cost - d);
    }
  }
  const azDisc = azJobConnectionOrHardwareInstallDiscount(state, card);
  if (azDisc > 0) cost = Math.max(0, cost - azDisc);
  return Math.max(0, cost - discount);
}

export function trashOtherConsoles(state: GameState, keepId: string): void {
  const toTrash = state.runner.installed.filter((id) => {
    if (id === keepId) return false;
    return (state.cards[id].subtypes ?? []).includes("console");
  });
  for (const id of toTrash) {
    const card = state.cards[id];
    removeCardFromCurrentZone(state, id);
    state.runner.discardPile.push(id);
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
export function installGripCardDiscounted(
  state: GameState,
  cardId: string,
  discount: number,
  sourceId: string,
  hostId?: string,
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
  const host = hostId ? state.cards[hostId] : undefined;
  if (hostId) {
    if (!host?.daemonHost || !state.runner.installed.includes(hostId)) {
      return {
        ok: false,
        error: `install_grip_card: ${hostId} cannot host ${card.title}.`,
        cites: [CR.runnerBasicInstall],
      };
    }
    const reason = hostLimitReason(state, host, card);
    if (reason) {
      return { ok: false, error: reason, cites: [CR.runnerBasicInstall] };
    }
    const hosted = state.runner.installed.filter(
      (id) => state.cards[id]?.hostId === hostId,
    ).length;
    if (
      host.maxHostedCards !== undefined &&
      hosted >= host.maxHostedCards
    ) {
      return {
        ok: false,
        error: `${host.title} cannot host another card.`,
        cites: [CR.runnerBasicInstall],
      };
    }
  }
  if (card.type === "program" && !host?.daemonHost) {
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) {
      log(
        state,
        `Install ${card.title} discounted — insufficient MU.`,
      );
      return { ok: true };
    }
  }
  const cost = Math.max(
    0,
    gripInstallCostAfterDiscount(state, card, discount) -
      (host ? daemonInstallDiscount(host) : 0),
  );
  if (creditsAvailableForInstall(state, "runner") < cost) {
    log(
      state,
      `Install ${card.title} discounted — cannot afford ${cost}¢.`,
    );
    return { ok: true };
  }
  spendCreditsForInstall(state, "runner", cost);
  state.runner.hand = state.runner.hand.filter((x) => x !== cardId);
  state.runner.installed.push(cardId);
  card.zone = "runner:installed";
  card.faceup = true;
  if (hostId) card.hostId = hostId;
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
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  noteJobConnectionOrHardwareInstalled(state, card);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    host
      ? `Install ${card.title} on ${host.title} for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`
      : `Install ${card.title} for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  fireOnInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

export function canInstallHeapCard(
  state: GameState,
  cardId: string,
  discount: number,
): boolean {
  const card = state.cards[cardId];
  if (!card || !state.runner.discardPile.includes(cardId)) return false;
  if (!["program", "hardware", "resource"].includes(card.type)) return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  if (card.type === "program") {
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) return false;
  }
  return (
    creditsAvailableForInstall(state, "runner") >=
    gripInstallCostAfterDiscount(state, card, discount)
  );
}

export function installHeapCardDiscounted(
  state: GameState,
  cardId: string,
  discount: number,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !state.runner.discardPile.includes(cardId)) {
    return {
      ok: false,
      error: `install_heap_card: ${cardId} not in heap.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!["program", "hardware", "resource"].includes(card.type)) {
    return {
      ok: false,
      error: "install_heap_card supports program/hardware/resource.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    log(
      state,
      `Install ${card.title} from heap — host-ice installs not supported here.`,
    );
    return { ok: true };
  }
  if (card.type === "program") {
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) {
      log(state, `Install ${card.title} from heap — insufficient MU.`);
      return { ok: true };
    }
  }
  const cost = gripInstallCostAfterDiscount(state, card, discount);
  if (creditsAvailableForInstall(state, "runner") < cost) {
    log(state, `Install ${card.title} from heap — cannot afford ${cost}¢.`);
    return { ok: true };
  }
  spendCreditsForInstall(state, "runner", cost);
  state.runner.discardPile = state.runner.discardPile.filter((x) => x !== cardId);
  state.runner.installed.push(cardId);
  card.zone = "runner:installed";
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
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Install ${card.title} from heap for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  fireOnInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  // Exile: whenever the Runner installs a program from the heap, draw 1.
  if (card.type === "program") {
    const idCard = state.cards[state.runner.identityId];
    if (idCard?.onInstallProgramFromHeap) {
      fireOnInstallProgramFromHeap(state, idCard.id);
    }
  }
  return { ok: true };
}


export function shuffleRunnerStack(state: GameState): void {
  state.runner.deck.reverse();
}

export function stackProgramInstallCost(
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
  if (
    card.installCostDiscountIfSuccessfulHqRunThisTurn &&
    state.turn.successfulHqRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - card.installCostDiscountIfSuccessfulHqRunThisTurn,
    );
  }
  if (card.installCostDiscountPerInstalledIcebreaker) {
    cost = Math.max(
      0,
      cost -
        card.installCostDiscountPerInstalledIcebreaker *
          countInstalledIcebreakersForCost(state),
    );
  }
  if (card.type === "program" && state.turn.programsInstalledThisTurn === 0) {
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
      const discount = state.cards[id].firstProgramInstallDiscount ?? 0;
      if (discount > 0) cost = Math.max(0, cost - discount);
    }
  }
  return cost;
}

/** Patchwork: trash 1 grip card for this discount, once each turn. */
function patchworkInstallDiscount(state: GameState): number {
  if (state.turn.patchworkDiscountUsedThisTurn) return 0;
  if (state.runner.hand.length === 0) return 0;
  let discount = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    discount = Math.max(
      discount,
      state.cards[id]?.playOrInstallDiscountByTrashingGripOncePerTurn ?? 0,
    );
  }
  return discount;
}

export function canInstallStackProgram(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card || card.type !== "program") return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  const need = effectiveMemoryCost(state, cardId);
  if (usedMemory(state) + need > memoryLimit(state)) return false;
  return (
    state.runner.credits + patchworkInstallDiscount(state) >=
    stackProgramInstallCost(state, card)
  );
}

/**
 * Install a program from the Runner's stack paying full install cost.
 * Shuffles the remaining stack afterward.
 */
export function installStackProgramPaying(
  state: GameState,
  cardId: string,
  sourceId: string,
  gripCardId?: string,
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
  const full = stackProgramInstallCost(state, card);
  const patchwork = patchworkInstallDiscount(state);
  let cost = full;
  if (state.runner.credits < full) {
    if (state.runner.hand.length > 1 && !gripCardId) {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: state.runner.hand.map((id) => ({
          id: `patchwork-grip:${id}`,
          label: `Trash ${state.cards[id]?.title ?? id} from grip`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_stack_program" as const,
              cardId,
              gripCardId: id,
            },
          },
        })),
      };
      log(state, `Patchwork — trash 1 card from grip to pay the install.`);
      return { ok: true };
    }
    const gripId = gripCardId ?? state.runner.hand[0];
    const trashed = gripId ? state.cards[gripId] : undefined;
    if (!gripId || !trashed || !state.runner.hand.includes(gripId)) {
      log(state, `Install ${card.title} from stack — no grip card to trash.`);
      shuffleRunnerStack(state);
      return { ok: true };
    }
    removeCardFromCurrentZone(state, gripId);
    state.runner.discardPile.push(gripId);
    trashed.zone = "runner:heap";
    trashed.faceup = true;
    state.turn.patchworkDiscountUsedThisTurn = true;
    cost = Math.max(0, full - patchwork);
    log(
      state,
      `Patchwork — trash ${trashed.title} from grip (−${patchwork}¢).`,
    );
  }
  if (state.runner.credits < cost) {
    log(state, `Install ${card.title} from stack — cannot afford ${cost}¢.`);
    shuffleRunnerStack(state);
    return { ok: true };
  }
  subtractRunnerCreditPool(state, cost);
  state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
  state.runner.installed.push(cardId);
  card.zone = "runner:installed";
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
  noteInstalledThisTurn(state, cardId);
  state.turn.programsInstalledThisTurn += 1;
  shuffleRunnerStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Search stack — install ${card.title} for ${cost}¢ (from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  fireOnInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

export function stackCardInstallCost(
  state: GameState,
  card: GameState["cards"][string],
  discount: number,
): number {
  return gripInstallCostAfterDiscount(state, card, discount);
}

export function canInstallStackCard(
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
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) return false;
  }
  return (
    creditsAvailableForInstall(state, "runner") >=
    stackCardInstallCost(state, card, discount)
  );
}

/**
 * Install program/hardware/resource from stack paying `discount`¢ less.
 * Shuffles the remaining stack afterward.
 */
export function installStackCardPaying(
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
  spendCreditsForInstall(state, "runner", cost);
  state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
  state.runner.installed.push(cardId);
  card.zone = "runner:installed";
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
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  shuffleRunnerStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Search stack — install ${card.title} for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  fireOnInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

export function searchStackTypeInstall(
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


export function installSetAsideCardPayingNoShuffle(
  state: GameState,
  cardId: string,
  discount: number,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !(state.runner.setAside ?? []).includes(cardId)) {
    return {
      ok: false,
      error: `set-aside install: ${cardId} not set aside.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  const isProg = card.type === "program";
  const isVirt =
    card.type === "resource" && (card.subtypes ?? []).includes("virtual");
  if (!isProg && !isVirt) {
    return {
      ok: false,
      error: "Gachapon install requires a program or virtual resource.",
      cites: [CR.runnerBasicInstall],
    };
  }
  if (isProg) {
    if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
      return { ok: true };
    }
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) {
      log(state, `Install ${card.title} — insufficient MU.`);
      return { ok: true };
    }
  }
  const cost = Math.max(0, (card.installCost ?? 0) - discount);
  if (state.runner.credits < cost) {
    log(state, `Install ${card.title} — cannot afford ${cost}¢.`);
    return { ok: true };
  }
  subtractRunnerCreditPool(state, cost);
  state.runner.setAside = (state.runner.setAside ?? []).filter((x) => x !== cardId);
  state.runner.installed.push(cardId);
  card.zone = "runner:installed";
  card.faceup = true;
  card.setAsideGroupId = undefined;
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
  noteInstalledThisTurn(state, cardId);
  if (isProg) state.turn.programsInstalledThisTurn += 1;
  log(
    state,
    `Install ${card.title} from set-aside for ${cost}¢ (−${discount}¢; CR ${CR.runnerBasicInstall.number}).`,
  );
  fireOnInstall(state, cardId);
  if (isProg) noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}


export function shuffleRunnerSetAsideIntoStack(state: GameState): void {
  const aside = state.runner.setAside ?? [];
  for (const id of aside) {
    if (state.cards[id]?.zone !== "runner:set-aside") continue;
    state.runner.deck.push(id);
    state.cards[id]!.zone = "runner:stack";
    state.cards[id]!.faceup = false;
    state.cards[id]!.setAsideGroupId = undefined;
  }
  state.runner.setAside = [];
  shuffleRunnerStack(state);
  log(
    state,
    `Shuffle ${aside.length} set-aside card(s) into the stack.`,
  );
}


export function canInstallSetAsideIgnoringCosts(
  state: GameState,
  cardId: string,
): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  if (!["program", "hardware", "resource"].includes(card.type)) return false;
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    return false;
  }
  const aside = state.runner.setAside ?? [];
  if (!aside.includes(cardId)) return false;
  if (card.type === "program") {
    const need = effectiveMemoryCost(state, cardId);
    if (usedMemory(state) + need > memoryLimit(state)) return false;
  }
  return true;
}

export function installSetAsideIgnoringCosts(
  state: GameState,
  cardId: string,
  sourceId: string,
): EvalResult {
  const card = state.cards[cardId];
  if (!card || !(state.runner.setAside ?? []).includes(cardId)) {
    return {
      ok: false,
      error: `wizard_chest_install: ${cardId} not set aside.`,
      cites: [CR.runnerBasicInstall],
    };
  }
  if (!canInstallSetAsideIgnoringCosts(state, cardId)) {
    log(
      state,
      `Install ${card.title} from set-aside ignoring costs — cannot (MU/type).`,
    );
    shuffleRunnerSetAsideIntoStack(state);
    return { ok: true };
  }
  state.runner.setAside = (state.runner.setAside ?? []).filter(
    (x) => x !== cardId,
  );
  state.runner.installed.push(cardId);
  card.zone = "runner:installed";
  card.faceup = true;
  card.setAsideGroupId = undefined;
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
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  shuffleRunnerSetAsideIntoStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Install ${card.title} from set-aside ignoring all costs (from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  fireOnInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

export function canInstallSetAsideProgram(
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
  const need = effectiveMemoryCost(state, cardId);
  if (usedMemory(state) + need > memoryLimit(state)) return false;
  return state.runner.credits >= stackCardInstallCost(state, card, discount);
}

export function installSetAsideProgramPaying(
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
  subtractRunnerCreditPool(state, cost);
  state.runner.setAside = (state.runner.setAside ?? []).filter(
    (x) => x !== cardId,
  );
  state.runner.installed.push(cardId);
  card.zone = "runner:installed";
  card.faceup = true;
  card.setAsideGroupId = undefined;
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
  noteInstalledThisTurn(state, cardId);
  state.turn.programsInstalledThisTurn += 1;
  shuffleRunnerSetAsideIntoStack(state);
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Install ${card.title} from set-aside for ${cost}¢ (${discount}¢ discount; from ${src}; CR ${CR.runnerBasicInstall.number}).`,
  );
  fireOnInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  return { ok: true };
}

export function searchStackProgramInstall(
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

