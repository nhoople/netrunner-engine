/**
 * Runner basic install from grip (and cards hosted as if in grip).
 * Effect-driven installs stay in the effect evaluator.
 */
import { log } from "../state/createGame.js";
import { evalEffect } from "../effects/eval.js";
import {
  creditsAvailableForInstall,
  spendCreditsForInstall,
} from "../state/costs.js";
import { noteVirusProgramInstalled } from "../state/virusInstall.js";
import {
  noteInstalledThisTurn,
  noteProgramOrHardwareInstalled,
} from "../state/programHardwareInstall.js";
import {
  azJobConnectionOrHardwareInstallDiscount,
  noteJobConnectionOrHardwareInstalled,
} from "../state/azInstallDiscount.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";
import { moveRunnerCardToHeap, recomputeRunnerLink } from "../state/trashHooks.js";
import {
  effectiveMemoryCost,
  memoryLimit,
  usedMemory,
} from "../state/turn.js";
import type {
  ApplyResult,
  GameState,
  InstallDestination,
  RuleCite,
} from "../state/types.js";
import { CR } from "../timing/labels.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

function countInstalledIcebreakers(state: GameState): number {
  return state.runner.rig.filter(
    (id) =>
      Boolean(state.cards[id].breaker) ||
      (state.cards[id].subtypes ?? []).includes("icebreaker"),
  ).length;
}

function runnerInstallCost(
  state: GameState,
  card: GameState["cards"][string],
  destination?: InstallDestination,
): number {
  let cost = card.installCost;
  if (card.type === "resource") {
    for (const c of Object.values(state.cards)) {
      if (
        c?.zone === "corp:play-area" &&
        typeof c.resourceInstallCostIncrease === "number"
      ) {
        cost += c.resourceInstallCostIncrease;
      }
      // Water Monopoly: scored agenda increases non-virtual resource install cost.
      if (
        c?.zone === "corp:score" &&
        typeof c.nonVirtualResourceInstallCostIncrease === "number" &&
        !(card.subtypes ?? []).some((s) => s.toLowerCase() === "virtual")
      ) {
        cost += c.nonVirtualResourceInstallCostIncrease;
      }
    }
  }
  // TechnoCo: +1 install for program / hardware / virtual resource while rezzed.
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      if (
        card.type === "program" &&
        typeof c.programInstallCostIncrease === "number"
      ) {
        cost += c.programInstallCostIncrease;
      }
      if (
        card.type === "hardware" &&
        typeof c.hardwareInstallCostIncrease === "number"
      ) {
        cost += c.hardwareInstallCostIncrease;
      }
      if (
        card.type === "resource" &&
        (card.subtypes ?? []).includes("virtual") &&
        typeof c.virtualResourceInstallCostIncrease === "number"
      ) {
        cost += c.virtualResourceInstallCostIncrease;
      }
    }
  }
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
          countInstalledIcebreakers(state),
    );
  }
  if (card.type === "program" && state.turn.programsInstalledThisTurn === 0) {
    for (const id of state.runner.rig) {
      const discount = state.cards[id].firstProgramInstallDiscount ?? 0;
      if (discount > 0) cost = Math.max(0, cost - discount);
    }
  }
  if (
    (card.type === "program" || card.type === "hardware") &&
    state.turn.programsInstalledThisTurn === 0 &&
    state.turn.hardwareInstalledThisTurn === 0
  ) {
    const idCard = state.cards[state.runner.identityId];
    let kate = idCard?.firstProgramOrHardwareInstallDiscount ?? 0;
    for (const id of state.runner.rig) {
      kate = Math.max(
        kate,
        state.cards[id]?.firstProgramOrHardwareInstallDiscount ?? 0,
      );
    }
    if (kate > 0) cost = Math.max(0, cost - kate);
  }
  {
    const azDisc = azJobConnectionOrHardwareInstallDiscount(state, card);
    if (azDisc > 0) cost = Math.max(0, cost - azDisc);
  }
  if (state.turn.patchworkPendingDiscountThisAction > 0) {
    cost = Math.max(0, cost - state.turn.patchworkPendingDiscountThisAction);
  }
  if (
    destination?.kind === "host_card" &&
    card.type === "resource" &&
    card.unique
  ) {
    const host = state.cards[destination.hostId];
    const disc = host?.hostsUniqueCompanionOrConnectionResources?.creditDiscount;
    if (
      typeof disc === "number" &&
      disc > 0 &&
      ((card.subtypes ?? []).includes("companion") ||
        (card.subtypes ?? []).includes("connection"))
    ) {
      cost = Math.max(0, cost - disc);
    }
  }
  if (
    card.type === "program" ||
    card.type === "hardware" ||
    card.type === "resource"
  ) {
    const isFirst =
      state.turn.programsInstalledThisTurn === 0 &&
      state.turn.hardwareInstalledThisTurn === 0;
    if (isFirst) {
      let bump = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const root = state.cards[id];
          if (!root?.rezzed) continue;
          const per =
            root.runnerFirstInstallCostIncreasePerPowerCounterOnThis ?? 0;
          if (per > 0) bump += per * (root.powerCounters ?? 0);
        }
      }
      if (bump > 0) cost += bump;
    }
  }
  return cost;
}

function trashExistingConsoles(state: GameState, keepId: string): void {
  const toTrash = state.runner.rig.filter((id) => {
    if (id === keepId) return false;
    return (state.cards[id].subtypes ?? []).includes("console");
  });
  for (const id of toTrash) {
    const card = state.cards[id];
    moveRunnerCardToHeap(state, id);
    log(
      state,
      `Trash ${card.title} — console limit (CR ${CR.trashing.number}).`,
    );
  }
}

function fireCookbookOnVirusInstall(state: GameState, installedId: string): void {
  const installed = state.cards[installedId];
  if (!(installed.subtypes ?? []).includes("virus")) return;
  for (const id of state.runner.rig) {
    if (id === installedId) continue;
    if (state.cards[id].defId !== "cookbook") continue;
    // May place 1 virus counter on the installed virus — auto-apply (may).
    installed.virusCounters = (installed.virusCounters ?? 0) + 1;
    if (!state.turn.programsWithVirusPlacedThisTurn.includes(installedId)) {
      state.turn.programsWithVirusPlacedThisTurn.push(installedId);
    }
    log(
      state,
      `Cookbook places 1 virus counter on ${installed.title}.`,
    );
  }
}

export function hostedPlayableAsGrip(state: GameState, cardId: string): string | null {
  const card = state.cards[cardId];
  if (!card?.hostId) return null;
  const host = state.cards[card.hostId];
  if (!host?.hostedCardsPlayableAsGrip) return null;
  if (!(host.hostedCardIds ?? []).includes(cardId)) return null;
  return card.hostId;
}

export function installRunner(
  state: GameState,
  cardId: string,
  destination?: InstallDestination,
): ApplyResult {
  const card = state.cards[cardId];
  if (!card || card.side !== "runner") {
    return fail("Card not a Runner card.", [CR.runnerBasicInstall]);
  }
  const handIdx = state.runner.hand.indexOf(cardId);
  const blingHostId = handIdx < 0 ? hostedPlayableAsGrip(state, cardId) : null;
  if (handIdx < 0 && !blingHostId) {
    return fail("Card not in grip.", [CR.runnerBasicInstall]);
  }
  if (!["program", "hardware", "resource"].includes(card.type)) {
    return fail("Runner install supports program/hardware/resource.", [
      CR.runnerBasicInstall,
    ]);
  }
  if (card.installRequiresSuccessfulCentralRunThisTurn) {
    const okCentral =
      state.turn.successfulHqRunThisTurn ||
      state.turn.successfulRdRunThisTurn ||
      state.turn.successfulArchivesRunThisTurn;
    if (!okCentral) {
      return fail(
        "Install requires a successful run on a central server this turn.",
        [CR.runnerBasicInstall],
      );
    }
  }
  if (card.installRequiresSuccessfulHqRunThisTurn) {
    if (!state.turn.successfulHqRunThisTurn) {
      return fail(
        "Install requires a successful run on HQ this turn.",
        [CR.runnerBasicInstall],
      );
    }
  }
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    if (!destination || destination.kind !== "host_ice") {
      return fail("Trojan must be installed hosted on ice.", [
        CR.runnerBasicInstall,
      ]);
    }
    const host = state.cards[destination.iceId];
    if (!host || host.type !== "ice") {
      return fail("Host must be installed ice.", [CR.runnerBasicInstall]);
    }
    if (card.hostGainsAllIceSubtypes && !host.rezzed) {
      return fail("Egret must be installed on rezzed ice.", [
        CR.runnerBasicInstall,
      ]);
    }
    let found = false;
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(destination.iceId)) {
        found = true;
        break;
      }
    }
    if (!found) {
      return fail("Host ice is not installed.", [CR.runnerBasicInstall]);
    }
    card.hostId = destination.iceId;
  } else if (destination && destination.kind === "host_ice") {
    return fail("Only trojans install hosted on ice.", [CR.runnerBasicInstall]);
  } else if (destination && destination.kind === "host_card") {
    const host = state.cards[destination.hostId];
    if (!host || !state.runner.rig.includes(destination.hostId)) {
      return fail("Invalid host.", [CR.runnerBasicInstall]);
    }
    if (host.hostNonAiIcebreaker) {
      const max = host.maxHostedCards ?? 1;
      const have = (host.hostedCardIds ?? []).length;
      if (have >= max) {
        return fail("Host has no free host slots.", [CR.runnerBasicInstall]);
      }
      if (card.type !== "program" || !card.breaker) {
        return fail("Only icebreakers may host on Dinosaurus.", [
          CR.runnerBasicInstall,
        ]);
      }
      if ((card.subtypes ?? []).includes("ai") || card.breaker.breaksSubtype === "*") {
        return fail("Cannot host an AI icebreaker here.", [
          CR.runnerBasicInstall,
        ]);
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
    } else if (host.hostsAnyProgramMemoryCostLte !== undefined) {
      const max = host.maxHostedCards ?? 1;
      const have = (host.hostedCardIds ?? []).length;
      if (have >= max) {
        return fail("Host has no free host slots.", [CR.runnerBasicInstall]);
      }
      if (card.type !== "program") {
        return fail("Only programs may host here.", [CR.runnerBasicInstall]);
      }
      const printedMu = card.memoryCost ?? 0;
      if (printedMu > host.hostsAnyProgramMemoryCostLte) {
        return fail(
          `Only programs with ${host.hostsAnyProgramMemoryCostLte} MU or less may host here.`,
          [CR.runnerBasicInstall],
        );
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
    } else if (host.daemonHost) {
      if (card.type !== "program") {
        return fail("Only programs may host on a daemon.", [
          CR.runnerBasicInstall,
        ]);
      }
      if ((card.subtypes ?? []).includes("daemon")) {
        return fail("Cannot host a daemon on a daemon.", [
          CR.runnerBasicInstall,
        ]);
      }
      if (
        host.daemonHostExcludeIcebreaker &&
        (card.breaker || (card.subtypes ?? []).includes("icebreaker"))
      ) {
        return fail("This daemon cannot host icebreakers.", [
          CR.runnerBasicInstall,
        ]);
      }
      const maxMu = host.daemonHostMaxMu;
      if (typeof maxMu === "number") {
        const used = (host.hostedCardIds ?? []).reduce((sum, id) => {
          return sum + effectiveMemoryCost(state, id);
        }, 0);
        const need = effectiveMemoryCost(state, cardId);
        if (used + need > maxMu) {
          return fail("Daemon has insufficient hosting MU.", [
            CR.runnerBasicInstall,
          ]);
        }
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
    } else if (host.hostsUniqueCompanionOrConnectionResources) {
      if (card.type !== "resource" || !card.unique) {
        return fail(
          "Only unique companion/connection resources host here.",
          [CR.runnerBasicInstall],
        );
      }
      const subs = card.subtypes ?? [];
      if (!subs.includes("companion") && !subs.includes("connection")) {
        return fail(
          "Only unique companion/connection resources host here.",
          [CR.runnerBasicInstall],
        );
      }
      card.hostId = destination.hostId;
    } else if (host.hostsConnectionResources) {
      if (
        card.type !== "resource" ||
        !(card.subtypes ?? []).includes("connection")
      ) {
        return fail("Only connections host on Off-Campus Apartment.", [
          CR.runnerBasicInstall,
        ]);
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
      const drawN = host.drawOnHostConnectionInstall ?? 0;
      if (drawN > 0) {
        for (let i = 0; i < drawN; i++) {
          if (state.runner.deck.length === 0) break;
          const top = state.runner.deck.shift()!;
          state.runner.hand.push(top);
          const drawn = state.cards[top];
          if (drawn) drawn.zone = "runner:grip";
        }
        log(
          state,
          `Off-Campus Apartment — draw ${drawN} (hosted connection).`,
        );
      }
    } else {
      return fail("Invalid host for card.", [CR.runnerBasicInstall]);
    }
  }
  if (card.type === "program") {
    const hostExempt =
      destination?.kind === "host_card" &&
      Boolean(
        state.cards[destination.hostId]?.hostedIcebreakerMemoryDoesNotCount ||
          state.cards[destination.hostId]?.daemonHost ||
          state.cards[destination.hostId]?.hostsAnyProgramMemoryCostLte !==
            undefined,
      );
    const need = effectiveMemoryCost(state, cardId);
    if (!hostExempt && usedMemory(state) + need > memoryLimit(state)) {
      return fail("Insufficient memory units to install program.", [
        CR.runnerBasicInstall,
      ]);
    }
  }
  const cost = runnerInstallCost(state, card, destination);
  if (creditsAvailableForInstall(state, "runner", card) < cost) {
    return fail("Insufficient credits for install cost.", [
      { number: "8.5.11", id: "sec_install_cost" },
    ]);
  }
  spendCreditsForInstall(state, "runner", cost, card);
  if (handIdx >= 0) {
    state.runner.hand.splice(handIdx, 1);
  } else if (blingHostId) {
    const host = state.cards[blingHostId]!;
    host.hostedCardIds = (host.hostedCardIds ?? []).filter((id) => id !== cardId);
    card.hostId = undefined;
  }
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
  if (card.installSpendCreditsForPowerCounters) {
    const x = state.runner.credits;
    if (x > 0) {
      state.runner.credits = 0;
      card.powerCounters = (card.powerCounters ?? 0) + x;
      log(
        state,
        `${card.title} — spend ${x}¢ for ${x} power counter(s).`,
      );
    }
  }
  if (card.chooseBreakerSubtypeOnInstall && card.breaker) {
    // Honesty: default to barrier when no interactive choice.
    card.breaker.breaksSubtype = "barrier";
    card.subtypes = [
      ...(card.subtypes ?? []).filter(
        (s) => s !== "barrier" && s !== "code gate" && s !== "sentry",
      ),
      "barrier",
    ];
    log(state, `${card.title} — choose barrier (auto).`);
  }
  if (card.chooseIceOnInstallForBypass || card.chooseIceOnInstall) {
    let pick: string | undefined;
    for (const server of Object.values(state.servers)) {
      if (server.ice.length > 0) {
        pick = server.ice[0];
        break;
      }
    }
    if (pick) {
      card.chosenIceId = pick;
      log(
        state,
        card.chooseIceOnInstallForBypass
          ? `${card.title} — choose ${state.cards[pick].title} for bypass.`
          : `${card.title} — choose ${state.cards[pick].title} (chosen ice).`,
      );
    }
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0 ||
    (card.hostId &&
      state.cards[card.hostId]?.handSizeBonusIfHostingCompanionAndConnection)
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashExistingConsoles(state, cardId);
  }
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  if (card.type === "resource") {
    state.turn.runnerInstalledResourceThisTurn = true;
  }
  if (card.type === "program" && card.hostId) {
    const host = state.cards[card.hostId];
    const bonus = host?.gainCreditsWhenRunnerHostsProgramOnSelf ?? 0;
    if (bonus > 0) {
      state.runner.credits += bonus;
      log(
        state,
        `${host!.title} — gain ${bonus}¢ for hosting ${card.title}.`,
      );
    }
  }
  noteJobConnectionOrHardwareInstalled(state, card);
  log(
    state,
    card.hostId
      ? `Runner installs ${card.title} hosted on ${state.cards[card.hostId].title} for ${cost}¢ (CR ${CR.runnerBasicInstall.number}).`
      : `Runner installs ${card.title} for ${cost}¢ (CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return fail(r.error, r.cites);
  }
  fireCookbookOnVirusInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  recomputeRunnerLink(state);
  if (
    card.type === "program" &&
    (card.subtypes ?? []).includes("icebreaker") &&
    !(card.subtypes ?? []).includes("ai")
  ) {
    for (const rid of state.runner.rig) {
      if (rid === cardId) continue;
      const host = state.cards[rid];
      const bonus = host?.nonAiIcebreakerInstallStrengthBonusThisTurn;
      if (!bonus) continue;
      state.turn.breakerStrengthBoostsThisTurn[cardId] =
        (state.turn.breakerStrengthBoostsThisTurn[cardId] ?? 0) + bonus;
      log(
        state,
        `${host.title} — ${card.title} +${bonus} strength this turn.`,
      );
    }
  }
  if (cost === 0) {
    for (const rid of state.runner.rig) {
      const host = state.cards[rid];
      if (!host?.onInstallWithoutSpendingCredits) continue;
      const r = evalEffect(
        { state, sourceId: rid },
        host.onInstallWithoutSpendingCredits,
      );
      if (!r.ok) {
        log(state, `onInstallWithoutSpendingCredits failed on ${host.title}: ${r.error}`);
      }
    }
  }
  return ok(state);
}
