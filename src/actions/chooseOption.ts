/** chooseOption: resolve the option a player picked in an open choice (the choose_option action), with the two helpers only it uses. */
import type { Effect } from "../effects/ir.js";
import type {
  GameState,
  ApplyResult,
  ServerId,
  Server,
} from "../state/types.js";
import { CR } from "../timing/labels.js";
import { pendingOptionHiddenFromOpponent } from "../api/library.js";
import { log } from "../state/setupAndEnd/createGame.js";
import {
  playEvent,
  continuePlayedOperation,
  playOperation,
  notePlayEffectComplete,
  settleDeferredPlayedEvent,
  settleDeferredTerminalOperation,
} from "./play.js";
import {
  installRunner,
  resolveMuProgramTrash,
  chooseServerOnInstalledCard,
  chooseBreakerSubtype,
  chooseInstalledIce,
} from "./installRunner.js";
import {
  afterBasicAction,
  getStep,
  enterStep,
  autoWalk,
} from "../timing/machine.js";
import { usePaidAbility } from "./paidAbility.js";
import { resolveDeclaration } from "../state/cardFlags/cardDeclarations.js";
import {
  jackOut,
  advanceRunUntilStop,
  finishRunReturnToAction,
  resolvePortAnsonProgramTrash,
  startRun,
} from "./run.js";
import { resolveChronosFirstNetPick } from "../state/damageAndPrevention/damage.js";
import {
  resolveRestrictionChoice,
  declareRootEntry,
} from "../legality/checkpoints.js";
import {
  operationAndEventPlayCostIncreaseTotal,
  releaseSetAsideHostedCards,
  returnSetAsideAdvancements,
} from "../state/keywordsAndCredits/costs.js";
import { activeCreditLockEvent } from "../state/keywordsAndCredits/runnerCredits.js";
import { forfeitSpecificAgenda, rezIce } from "./rez.js";
import { openPendingChoose } from "../state/triggers/pendingChoice.js";
import {
  trashCard,
  resolveSkorpiosTrash,
} from "../state/hostingAndTrash/trash.js";
import { remoteRootAccessTax } from "../state/cardFlags/staticFlags.js";
import {
  spendAccessLimitOnChoice,
  armNestedBreachIfPending,
  beginBreachAccess,
} from "../state/access/access.js";
import { hostCorpCardFaceupOn, completeStealAgenda } from "./access.js";
import {
  fireOnRez,
  fireOnScore,
} from "../state/triggers/cardLifecycleHooks.js";
import {
  fireHostRezStateTriggers,
  evalEffect,
  resumeExclusiveChoicesIfPending,
  resumePendingEffectContinuation,
  payPendingSwapContinuation,
} from "../effects/eval.js";
import { chooseNextSubroutineToResolve } from "../timing/subroutineOrder.js";
import { chooseSparedSubroutine } from "../effects/turnAndActions/breakKinds.js";
import { chooseSubroutinePosition } from "../effects/visibility/visibilityKinds.js";
import { resolveDeferredPersistentAmaze } from "../timing/graph/stepHelpers.js";
import {
  resumePendingOnCorpDrawCard,
  resumePendingStoredConditionals,
} from "../state/triggers/storedTriggers.js";
import { resolvePendingOnEncounter } from "../state/run/onEncounter.js";
import { resolveDelayedRunEndOrder } from "../effects/run/runKinds.js";
import { setRunnerPosition } from "../state/uninstallAndPosition/runPosition.js";
import { currentMark } from "../state/keywordsAndCredits/keywords.js";
import { modifiersFromStartsRun } from "../state/run/runStart.js";
import { scoreAgendaAction } from "./score.js";
import { finishPendingDraw } from "../effects/searchAndDeck/draw.js";
import { resumeExposeUpTo } from "../effects/visibility/exposeAndReveal.js";
import { resumeRunnerTurnBeginAbilities } from "../timing/graph.js";
import {
  fail,
  ok,
  applyActionCore,
  continueRunAfterPausedStep,
} from "./apply.js";

/**
 * A choice option whose effect is the "gain 0" placeholder: the id-keyed
 * branches of chooseOption carry out what it names (Send a Message's rez).
 * An option with an effect of its own resolves that effect instead, so a
 * choice keyed by a card id (Midori's swap) is not taken for a rez or an
 * install of that card.
 */
function isPlaceholderEffect(effect: Effect): boolean {
  return (
    effect.op === "do" &&
    effect.action.kind === "gain_credits" &&
    (effect.action as { amount?: unknown }).amount === 0
  );
}

export function chooseOption(state: GameState, optionId: string): ApplyResult {
  const pending = state.pendingChoice;
  if (!pending) {
    return fail("No pending choice.", [CR.paidAbility]);
  }
  // Read before the option resolves and the card moves (CR 1.21.2).
  const namesHiddenCard = pendingOptionHiddenFromOpponent(state, optionId);
  if (pending.loopCount && optionId.startsWith("loop-times:")) {
    const times = Number(optionId.slice("loop-times:".length));
    if (!Number.isInteger(times) || times < 0) {
      return fail("Choose how many times the loop resolves.", [
        CR.mandatoryLoop,
      ]);
    }
    state.pendingChoice = null;
    log(
      state,
      `The loop resolves ${times} time(s), then ends (CR ${CR.mandatoryLoop.number}).`,
    );
    return ok(state);
  }
  if (
    optionId.startsWith("decl:") ||
    optionId.startsWith("bribery-x:") ||
    optionId.startsWith("install-x:")
  ) {
    state.pendingChoice = null;
    if (optionId.startsWith("bribery-x:")) {
      const x = Number(optionId.slice("bribery-x:".length));
      const cardId = state.turn.briberyCardId ?? pending.sourceId;
      state.turn.briberyCardId = cardId;
      state.turn.briberyX = x;
      return playEvent(state, cardId);
    }
    if (optionId.startsWith("install-x:")) {
      const x = Number(optionId.slice("install-x:".length));
      state.turn.installCostX = x;
      state.turn.installCostXCardId = pending.sourceId;
      const destination = state.turn.installCostXDestination ?? {
        kind: "installed",
      };
      state.turn.installCostXDestination = undefined;
      const installed = installRunner(state, pending.sourceId, destination);
      if (!installed.ok) return installed;
      if (installed.state.pendingChoice) return installed;
      if (installed.state.deferAfterBasicAction) {
        installed.state.deferAfterBasicAction = false;
        afterBasicAction(installed.state);
      }
      return installed;
    }
    if (optionId.startsWith("decl:bazaar:")) {
      const cardId = optionId.slice("decl:bazaar:".length);
      return installRunner(state, cardId, { kind: "installed" });
    }
    if (optionId.startsWith("decl:deep:")) {
      const installedId = optionId.split(":")[3];
      const installed = installedId ? state.cards[installedId] : undefined;
      const ability = installed?.paidAbilities?.find(
        (candidate) => (candidate.cost?.clicks ?? candidate.clickCost ?? 0) > 0,
      );
      if (!installedId || !ability) return ok(state);
      state.turn.deepRedAbility = {
        cardId: installedId,
        abilityId: ability.id,
      };
      return usePaidAbility(state, installedId, ability.id);
    }
    const outcome = resolveDeclaration(state, optionId);
    if (outcome === "jackout") return jackOut(state);
    // A declaration offered inside a run step that has no window of its
    // own (passing ice, CR 6.9.4a): the run goes on once it is answered.
    if (
      state.run &&
      !state.run.endedTheRun &&
      !state.pendingChoice &&
      !state.pendingDamage &&
      !state.pendingTags &&
      !state.pendingTrashProgram &&
      !state.pendingSabotage &&
      !state.trace &&
      !state.psi
    ) {
      const step = getStep(state);
      if (step.kind === "auto" || step.kind === "branch") {
        const nextKey =
          typeof step.next === "function" ? step.next(state) : step.next;
        enterStep(state, nextKey);
        const cont = advanceRunUntilStop(state);
        if (!cont.ok) return cont;
        finishRunReturnToAction(cont.state);
        return cont;
      }
    }
    return ok(state);
  }
  if (optionId.startsWith("mu-trash:")) {
    const cardId = optionId.slice("mu-trash:".length);
    if (!cardId || !pending.options.some((option) => option.id === optionId)) {
      return fail("Choose an installed program to trash.", [
        CR.installTrashProgramsForMemory,
        CR.trashing,
      ]);
    }
    state.pendingChoice = null;
    const trashed = resolveMuProgramTrash(state, cardId);
    if (!trashed.ok) return trashed;
    if (trashed.state.pendingChoice) return trashed;
    if (trashed.state.deferAfterBasicAction) {
      trashed.state.deferAfterBasicAction = false;
      afterBasicAction(trashed.state);
    }
    return trashed;
  }
  if (optionId.startsWith("anson:")) {
    const cardId = optionId.slice("anson:".length);
    if (!cardId) {
      return fail("Choose an installed program to trash.", [
        CR.jackingOut,
        CR.trashing,
      ]);
    }
    state.pendingChoice = null;
    return resolvePortAnsonProgramTrash(state, cardId);
  }
  if (optionId.startsWith("chronos:")) {
    const cardId = optionId.slice("chronos:".length);
    if (!cardId || !pending.options.some((option) => option.id === optionId)) {
      return fail("Choose the first card for this net damage.", [
        CR.sequentialDamageSelection,
      ]);
    }
    state.pendingChoice = null;
    resolveChronosFirstNetPick(state, cardId === "random" ? null : cardId);
    return ok(state);
  }
  if (optionId.startsWith("diwan:")) {
    const serverId = optionId.slice("diwan:".length);
    if (
      !serverId ||
      !pending.options.some((option) => option.id === optionId)
    ) {
      return fail("Choose a server.", [CR.runnerBasicInstall]);
    }
    state.pendingChoice = null;
    chooseServerOnInstalledCard(state, pending.sourceId, serverId);
    return ok(state);
  }
  if (optionId.startsWith("subtype:")) {
    const subtype = optionId.slice("subtype:".length);
    if (!subtype || !pending.options.some((option) => option.id === optionId)) {
      return fail("Choose barrier, code gate, or sentry.", [
        CR.runnerBasicInstall,
      ]);
    }
    state.pendingChoice = null;
    chooseBreakerSubtype(state, pending.sourceId, subtype);
    return ok(state);
  }
  if (optionId.startsWith("chosen-ice:")) {
    const iceId = optionId.slice("chosen-ice:".length);
    if (!iceId || !pending.options.some((option) => option.id === optionId)) {
      return fail("Choose an installed piece of ice.", [CR.runnerBasicInstall]);
    }
    state.pendingChoice = null;
    chooseInstalledIce(state, pending.sourceId, iceId);
    return ok(state);
  }
  if (optionId.startsWith("restrict:")) {
    if (!pending.options.some((option) => option.id === optionId)) {
      return fail("Choose a set to trash.", [CR.checkpointCardRestrictions]);
    }
    state.pendingChoice = null;
    resolveRestrictionChoice(state, optionId);
    return ok(state);
  }
  if (optionId.startsWith("root-access:")) {
    const rest = optionId.slice("root-access:".length);
    const sep = rest.indexOf(":");
    const decision = rest.slice(0, sep);
    const cardId = rest.slice(sep + 1);
    if ((decision !== "yes" && decision !== "no") || !cardId) {
      return fail("Choose whether the card becomes a candidate.", [
        CR.checkpointCardEnteringRoot,
      ]);
    }
    state.pendingChoice = null;
    declareRootEntry(state, decision, cardId);
    return ok(state);
  }
  const option = pending.options.find((o) => o.id === optionId);
  if (!option) {
    return fail("Unknown choice option.", [CR.paidAbility]);
  }
  const sourceId = pending.sourceId;
  state.pendingChoice = null;
  if (state.run) state.run.pendingJackOutOffer = false;
  if (optionId === "st-decline" || optionId.startsWith("st-server:")) {
    const card = state.cards[sourceId];
    if (card?.securityTesting) {
      if (optionId === "st-decline") {
        card.namedServerId = undefined;
        log(
          state,
          `${card.title} — no server chosen this turn (CR ${CR.lingeringChoiceTurn.number}).`,
        );
      } else {
        const serverId = optionId.slice("st-server:".length);
        card.namedServerId = serverId as ServerId;
        log(
          state,
          `${card.title} — choose ${serverId} until this turn ends (CR ${CR.lingeringChoiceTurn.number}).`,
        );
      }
    }
    return ok(state);
  }

  if (optionId === "must-trash:pay" || optionId === "must-trash:imp") {
    const cardId = state.run?.accessingCardId;
    if (!cardId) {
      return fail("No card is being accessed.", [CR.trashing]);
    }
    return applyActionCore(state, {
      type:
        optionId === "must-trash:pay"
          ? "trash_accessed"
          : "access_trash_with_virus",
      cardId,
    });
  }

  if (
    optionId === "first-run-cost:pay" ||
    optionId === "first-run-cost:decline"
  ) {
    const serverId = state.turn.pendingFirstRunServerId;
    state.turn.pendingFirstRunServerId = undefined;
    if (optionId === "first-run-cost:decline") {
      state.turn.firstClickMustSatisfied = true;
      log(
        state,
        `Declined the additional cost — the first click can be spent on another action (CR ${CR.mustNotForceAdditionalCost.number}).`,
      );
      return ok(state);
    }
    if (!serverId) {
      return fail("No run is waiting on the additional cost.", [
        CR.runnerBasicRun,
      ]);
    }
    state.turn.payingFirstRunAdditionalCost = true;
    return applyActionCore(state, { type: "basic_run", serverId });
  }

  if (optionId.startsWith("play-cost-x:")) {
    const cardId = state.pendingPlayCostXCardId;
    state.pendingPlayCostXCardId = null;
    if (!cardId) {
      return fail("No play cost of X is waiting.", [CR.playCostX]);
    }
    const chosenX = Number(optionId.slice("play-cost-x:".length));
    const increase = operationAndEventPlayCostIncreaseTotal(state);
    if (
      !Number.isInteger(chosenX) ||
      chosenX < 0 ||
      state.corp.credits < chosenX + increase
    ) {
      return fail("Illegal value of X.", [CR.playCostX]);
    }
    return continuePlayedOperation(state, cardId, chosenX + increase, chosenX);
  }

  if (optionId.startsWith("forfeit-agenda:")) {
    const agendaId = optionId.slice("forfeit-agenda:".length);
    const op = state.cards[sourceId];
    if (!op?.playAdditionalCostForfeitAgenda) {
      return fail("No agenda forfeit is waiting.", [CR.playOperation]);
    }
    if (
      !state.corp.scoreArea.includes(agendaId) ||
      state.cards[agendaId]?.cannotForfeit
    ) {
      return fail("That agenda cannot be forfeited.", [CR.playOperation]);
    }
    forfeitSpecificAgenda(state, agendaId);
    const increase = operationAndEventPlayCostIncreaseTotal(state);
    const cost = (op.playCost ?? 0) + increase;
    return continuePlayedOperation(state, sourceId, cost);
  }

  if (
    optionId === "subcontract-done" ||
    optionId.startsWith("subcontract-play:")
  ) {
    if (optionId.startsWith("subcontract-play:")) {
      const cardId = optionId.slice("subcontract-play:".length);
      state.turn.ftmSubcontractRemaining = Math.max(
        0,
        (state.turn.ftmSubcontractRemaining ?? 1) - 1,
      );
      const played = playOperation(state, cardId, { fromAbility: true });
      if (!played.ok) return played;
      if (state.pendingChoice) return ok(state);
    }
    const remaining = state.turn.ftmSubcontractRemaining ?? 0;
    const more = state.corp.hand.filter(
      (id) => state.cards[id]?.type === "operation",
    );
    if (optionId !== "subcontract-done" && remaining > 0 && more.length > 0) {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...more.map((id) => ({
            id: `subcontract-play:${id}`,
            label: `Play ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          })),
          {
            id: "subcontract-done",
            label: "Done playing operations",
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
      });
      return ok(state);
    }
    notePlayEffectComplete(state);
    if (state.deferAfterBasicAction) {
      state.deferAfterBasicAction = false;
      afterBasicAction(state);
    }
    return ok(state);
  }

  // Trieste: option id forbid-runner-break:<iceId>
  if (optionId.startsWith("forbid-runner-break:")) {
    const iceId = optionId.slice("forbid-runner-break:".length);
    const ice = state.cards[iceId];
    const trieste = state.cards[sourceId];
    if (ice && trieste) {
      trieste.triesteChosenIceId = iceId;
      log(
        state,
        `Choose ${ice.title} — Runner card abilities cannot break its subroutines.`,
      );
    }
    if (state.deferAfterBasicAction) {
      state.deferAfterBasicAction = false;
      afterBasicAction(state);
    }
    return ok(state);
  }

  if (optionId.startsWith("immolation-replace:")) {
    const cardId = optionId.slice("immolation-replace:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    const chosen = state.cards[cardId];
    const copyId = Object.values(state.servers)
      .flatMap((server) => server.ice)
      .find((id) => {
        const ice = state.cards[id];
        return Boolean(
          ice?.rezzed && chosen && ice.title === chosen.title && id !== cardId,
        );
      });
    if (copyId) trashCard(state, copyId, { by: "runner" });
    const at = state.run.accessCandidates.indexOf(cardId);
    if (at >= 0) state.run.accessCandidates.splice(at, 1);
    state.run.immolationScriptAccessReplace = false;
    state.run.pendingImmolationAccessCardId = undefined;
    state.pendingChoice = null;
    log(
      state,
      `${chosen?.title ?? cardId} ceases to be a candidate and was not accessed (CR ${CR.candidatesAlreadyAccessed.number}).`,
    );
    return ok(state);
  }
  if (optionId.startsWith("immolation-access:")) {
    const cardId = optionId.slice("immolation-access:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    state.run.immolationScriptAccessReplace = false;
    state.pendingChoice = null;
    return applyActionCore(state, { type: "access_card", cardId });
  }
  if (optionId.startsWith("archives-rfg:")) {
    const cardId = optionId.slice("archives-rfg:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    const card = state.cards[cardId];
    state.turn.archivesInterfaceUsedThisBreach = true;
    const at = state.run.accessCandidates.indexOf(cardId);
    if (at >= 0) state.run.accessCandidates.splice(at, 1);
    if (card) {
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== cardId,
      );
      if (!state.removedFromGame.includes(cardId))
        state.removedFromGame.push(cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      log(
        state,
        `${card.title} is removed from the game instead of being accessed.`,
      );
    }
    state.pendingChoice = null;
    return ok(state);
  }
  if (optionId.startsWith("archives-access:")) {
    const cardId = optionId.slice("archives-access:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    state.run.archivesInterfaceSkippedCardId = cardId;
    state.pendingChoice = null;
    return applyActionCore(state, { type: "access_card", cardId });
  }
  if (optionId.startsWith("access-tax-pay:")) {
    const cardId = optionId.slice("access-tax-pay:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    const card = state.cards[cardId];
    const tax = card ? remoteRootAccessTax(state, card) : 0;
    if (state.runner.credits < tax) {
      return fail("Cannot pay the additional cost to access.", [
        CR.candidatesAlreadyAccessed,
      ]);
    }
    state.runner.credits -= tax;
    state.run.accessTaxPaidFor = cardId;
    state.pendingChoice = null;
    log(state, `Paid ${tax}¢ to access ${card?.title ?? cardId}.`);
    return applyActionCore(state, { type: "access_card", cardId });
  }
  if (optionId.startsWith("access-tax-decline:")) {
    const cardId = optionId.slice("access-tax-decline:".length);
    if (!state.run) return fail("No breach in progress.", [CR.breach]);
    const at = state.run.accessCandidates.indexOf(cardId);
    if (at >= 0) state.run.accessCandidates.splice(at, 1);
    state.pendingChoice = null;
    log(
      state,
      `${state.cards[cardId]?.title ?? cardId} ceases to be a candidate and was not accessed (CR ${CR.candidatesAlreadyAccessed.number}).`,
    );
    return ok(state);
  }

  // Heliamphora: host Archives card instead of accessing, or proceed to access.
  if (optionId.startsWith("heliamphora-host:")) {
    const cardId = optionId.slice("heliamphora-host:".length);
    if (!state.run) return fail("No run for Heliamphora.", [CR.breach]);
    const heliId = sourceId;
    if (
      !state.run.accessCandidates.includes(cardId) &&
      !state.corp.discardPile.includes(cardId)
    ) {
      // Still allow if only in discard (candidate list may lag).
    }
    const idx = state.run.accessCandidates.indexOf(cardId);
    if (idx >= 0) state.run.accessCandidates.splice(idx, 1);
    spendAccessLimitOnChoice(state, cardId);
    hostCorpCardFaceupOn(state, heliId, cardId);
    state.run.heliamphoraHostInsteadUsedThisBreach = true;
    state.run.pendingHeliamphoraAccessCardId = undefined;
    log(
      state,
      `Chose "${option.label}" on ${state.cards[heliId]?.title ?? heliId}.`,
    );
    enterStep(state, "breach.access");
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }
  if (optionId.startsWith("heliamphora-access:")) {
    const cardId = optionId.slice("heliamphora-access:".length);
    if (!state.run) return fail("No run for Heliamphora.", [CR.breach]);
    state.run.pendingHeliamphoraAccessCardId = cardId; // sentinel: skip re-offer
    // Mark so access_card won't re-offer: clear availability by setting used? No —
    // decline does not consume the once-per-breach. Use pending flag: access_card
    // skips offer when pendingHeliamphoraAccessCardId is already set to this card.
    log(
      state,
      `Chose "${option.label}" on ${state.cards[sourceId]?.title ?? sourceId}.`,
    );
    return applyActionCore(state, { type: "access_card", cardId });
  }

  const exclusive = state.pendingExclusiveChoices;
  const isExclusivePick =
    exclusive !== null && exclusive.options.some((o) => o.id === optionId);
  if (isExclusivePick && exclusive) {
    if (!exclusive.usedIds.includes(optionId)) {
      exclusive.usedIds.push(optionId);
      exclusive.remaining = Math.max(0, exclusive.remaining - 1);
    }
  }

  // Positional swap ids are `swap-${iceA}-${iceB}`. Other swap- prefixes,
  // such as Thimblerig's swap-ice:, carry their own effect (CR 8.8.3a).
  const allIce: string[] = [];
  for (const server of Object.values(state.servers)) {
    allIce.push(...server.ice);
  }
  let swapA: string | undefined;
  let swapB: string | undefined;
  for (const x of allIce) {
    for (const y of allIce) {
      if (x !== y && optionId === `swap-${x}-${y}`) {
        swapA = x;
        swapB = y;
      }
    }
  }
  if (swapA && swapB) {
    swapIcePositions(state, swapA, swapB);
    log(
      state,
      `Swap ${state.cards[swapA].title} with ${state.cards[swapB].title}.`,
    );
  } else if (
    state.cards[sourceId]?.mayRezIceIgnoringCostsOnScoreOrSteal ||
    (state.cards[optionId]?.type === "ice" &&
      state.cards[optionId]!.zone.endsWith(":ice") &&
      !state.cards[optionId]!.rezzed &&
      isPlaceholderEffect(option.effect))
  ) {
    if (optionId !== "decline" && state.cards[optionId]?.type === "ice") {
      const ice = state.cards[optionId];
      ice.rezzed = true;
      ice.faceup = true;
      log(state, `Rez ${ice.title} ignoring all costs.`);
      fireOnRez(state, optionId);
      fireHostRezStateTriggers(state, optionId, "rez");
    }
  } else if (
    state.cards[sourceId]?.mayInstallOnScoreOrSteal ||
    (optionId !== "decline" &&
      state.runner.hand.includes(optionId) &&
      ["program", "hardware", "resource"].includes(
        state.cards[optionId]?.type ?? "",
      ) &&
      isPlaceholderEffect(option.effect))
  ) {
    if (optionId !== "decline" && state.runner.hand.includes(optionId)) {
      const installed = installRunner(state, optionId);
      if (!installed.ok) return installed;
    }
  } else if (optionId === "zahya-gain" || optionId === "zahya-decline") {
    // The gain is applied after the choice is logged.
  } else if (optionId.startsWith("delayed-run-end:") && state.run) {
    state.run.delayedRunEndChoice = optionId;
  } else if (
    optionId.startsWith("skorpios-rfg:") ||
    optionId.startsWith("skorpios-heap:")
  ) {
    // Destination is applied after the choice is logged.
  } else if (optionId.startsWith("resolve-next:")) {
    const index = Number(optionId.slice("resolve-next:".length));
    const ordered = chooseNextSubroutineToResolve(state, index);
    if (!ordered.ok) return fail(ordered.error, ordered.cites);
    log(
      state,
      `Chose "${option.label}" on ${state.cards[sourceId]?.title ?? sourceId}.`,
    );
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    if (state.run) {
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
    return ok(state);
  } else if (optionId.startsWith("spare-sub:")) {
    const index = Number(optionId.slice("spare-sub:".length));
    const spared = chooseSparedSubroutine(state, index, sourceId);
    if (!spared.ok) return fail(spared.error, spared.cites);
  } else if (optionId.startsWith("grail-at:")) {
    const index = Number(optionId.slice("grail-at:".length));
    if (!Number.isInteger(index)) {
      return fail("Choose a position for the subroutine.", [
        CR.subroutineOrderChoice,
      ]);
    }
    chooseSubroutinePosition(state, index);
  } else if (optionId.startsWith("247:")) {
    const agendaId = optionId.slice("247:".length);
    const agenda = state.cards[agendaId];
    if (!agenda || !state.corp.scoreArea.includes(agendaId)) {
      return fail("That agenda is not scored.", [
        CR.whenScoredAdditionalRequirement,
      ]);
    }
    // The whole when-scored ability, its requirements checked as it
    // resolves (CR 9.6.14d; state/turnAndActions/whenScored.ts).
    fireOnScore(state, agendaId);
  } else {
    const r = evalEffect(
      {
        state,
        sourceId,
        runnerSuffers: /^suffer\b/i.test(option.label),
      },
      option.effect,
    );
    if (!r.ok) return fail(r.error, r.cites);
  }

  if (!state.pendingChoice && !state.pendingStartRun) {
    // Amaze deferred across a Doppelgänger run resolves at run.ends (CR 9.12.5d),
    // not while that follow-up run is already open.
    if (!state.run) resolveDeferredPersistentAmaze(state);
    resumePendingOnCorpDrawCard(state);
    resumePendingStoredConditionals(state);
  }

  const hiddenLook =
    namesHiddenCard ||
    optionId.startsWith("cultivate-") ||
    optionId.startsWith("rd-arrange:");
  const sourceTitle = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    hiddenLook
      ? `Chose on ${sourceTitle}.`
      : `Chose "${option.label}" on ${sourceTitle}.`,
  );
  if (
    state.turn.pendingZahyaRunEnd &&
    (optionId === "zahya-gain" || optionId === "zahya-decline")
  ) {
    const pending = state.turn.pendingZahyaRunEnd;
    state.turn.pendingZahyaRunEnd = undefined;
    const title = state.cards[sourceId]?.title ?? sourceId;
    if (optionId === "zahya-gain") {
      state.runner.credits += pending.credits;
      state.turn.zahyaRunEndUsed = true;
      log(
        state,
        `${title} — gain ${pending.credits}¢ (${pending.credits} access(es) on ${pending.serverId}).`,
      );
    } else {
      log(
        state,
        `${title}'s ability was not used (CR ${CR.oncePerTurnFlag.number}).`,
      );
    }
    if (state.timingKey === "run.ends") {
      const nextKey = state.run?.isPostRunBreach
        ? "breach.begin"
        : "runner.actionPaw";
      enterStep(state, nextKey);
      autoWalk(state);
      if (
        state.pendingChoice ||
        state.pendingTrashProgram ||
        state.pendingSabotage ||
        state.pendingDamage ||
        state.trace ||
        state.psi
      ) {
        return ok(state);
      }
      if (state.run) {
        const cont = advanceRunUntilStop(state);
        if (!cont.ok) return cont;
        finishRunReturnToAction(cont.state);
        return cont;
      }
      return ok(state);
    }
  }
  const encounter = state.run?.encounter;
  if (
    encounter?.onEncounterPending &&
    !state.pendingChoice &&
    !state.trace &&
    (state.cards[sourceId]?.chosenIceId === encounter.iceId ||
      state.cards[sourceId]?.paidAbilities?.some(
        (ability) => ability.id === "security-nexus-trace",
      ))
  ) {
    resolvePendingOnEncounter(state);
  }
  if (
    state.turn.pendingSkorpiosTrash &&
    (optionId.startsWith("skorpios-rfg:") ||
      optionId.startsWith("skorpios-heap:"))
  ) {
    resolveSkorpiosTrash(state, optionId);
  }
  if (state.run?.delayedRunEndChoice && state.timingKey === "run.ends") {
    const choice = state.run.delayedRunEndChoice;
    state.run.delayedRunEndChoice = undefined;
    resolveDelayedRunEndOrder(state, choice);
    autoWalk(state);
    if (
      state.pendingChoice ||
      state.pendingTrashProgram ||
      state.pendingSabotage ||
      state.pendingDamage ||
      state.trace ||
      state.psi
    ) {
      return ok(state);
    }
    const continued = advanceRunUntilStop(state);
    if (!continued.ok) return continued;
    finishRunReturnToAction(continued.state);
    return continued;
  }
  if (
    state.run?.runnerCannotSpendCredits &&
    !state.pendingChoice &&
    !state.pendingDamage
  ) {
    state.run.runnerCannotSpendCredits = false;
  }
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage
  ) {
    return ok(state);
  }
  // A paid ability's effect deferred behind this choice still needs the
  // cards and counters its trash cost set aside (Reconstruction Contract).
  if (!state.pendingEffectContinuation) {
    releaseSetAsideHostedCards(state);
    returnSetAsideAdvancements(state);
  }
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.done
  ) {
    return ok(state);
  }

  // Ganked!-class: mid-access forced encounter — divert to approachIce.
  if (
    state.run?.reencounterIceId &&
    state.run.resumeAccessAfterReencounter &&
    state.run.accessingCardId
  ) {
    const iceId = state.run.reencounterIceId;
    const server = state.servers[state.run.attackedServerId];
    const pos = server?.ice.indexOf(iceId) ?? -1;
    if (pos >= 0) {
      setRunnerPosition(state.run, pos);
      state.run.reencounterIceId = undefined;
      enterStep(state, "run.approachIce");
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
    if (state.cards[iceId]?.type === "ice") {
      state.run.forceEncounterIceId = iceId;
      state.run.reencounterIceId = undefined;
      enterStep(state, "run.approachIce");
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
    state.run.reencounterIceId = undefined;
    state.run.resumeAccessAfterReencounter = false;
  }

  // Konjin-class: nested encounter then resume parent — divert now.
  if (
    state.run?.reencounterIceId &&
    state.run.resumeEncounterIceId &&
    !state.run.resumeAccessAfterReencounter
  ) {
    const iceId = state.run.reencounterIceId;
    state.run.reencounterIceId = undefined;
    const server = state.servers[state.run.attackedServerId];
    const pos = server?.ice.indexOf(iceId) ?? -1;
    if (pos >= 0) {
      setRunnerPosition(state.run, pos);
    }
    state.run.forceEncounterIceId = iceId;
    enterStep(state, "run.approachIce");
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  // Shiro-class: mid-encounter nested breach then resume parent encounter.
  if (armNestedBreachIfPending(state)) {
    enterStep(state, "breach.begin");
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  const exclusiveCont = resumeExclusiveChoicesIfPending(state);
  if (!exclusiveCont.ok) {
    return fail(exclusiveCont.error, exclusiveCont.cites);
  }
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage
  ) {
    return ok(state);
  }

  if (state.pendingStartRunOnMark) {
    const mark = currentMark(state);
    const runSrc = state.pendingStartRunOnMark.sourceId;
    state.pendingStartRunOnMark = null;
    state.deferAfterBasicAction = false;
    if (mark && state.servers[mark]) {
      const walked = startRun(state, mark, { runSourceId: runSrc });
      if (!walked.ok) return walked;
      finishRunReturnToAction(walked.state);
      return walked;
    }
    log(state, `Run on mark declined — mark missing.`);
  }

  if (state.pendingStartRun) {
    const pending = state.pendingStartRun;
    state.pendingStartRun = null;
    state.deferAfterBasicAction = false;
    if (state.servers[pending.serverId]) {
      const mods: import("../state/run/runStart.js").RunModifiers = {
        runSourceId: pending.sourceId,
      };
      if (pending.bypassFirstEncounterForClicks !== undefined) {
        mods.bypassFirstEncounterForClicks =
          pending.bypassFirstEncounterForClicks;
      }
      if (pending.bonusAccess !== undefined) {
        mods.bonusAccess = pending.bonusAccess;
      }
      if (pending.skipBreach) {
        mods.skipBreach = true;
      }
      if (pending.onSuccessfulRunEffect) {
        mods.onSuccessfulRunEffect = pending.onSuccessfulRunEffect;
      }
      if (pending.onRunEndEffect) {
        mods.onRunEndEffect = pending.onRunEndEffect;
      }
      if (pending.hiredHelpAgendaTaxPaid) {
        mods.hiredHelpAgendaTaxPaid = true;
      }
      if (pending.forbidCorpRezIceDuringRun) {
        mods.forbidCorpRezIceDuringRun = true;
      }
      if (pending.preventAllTagsThisRun) {
        mods.preventAllTagsThisRun = true;
      }
      if (pending.rfgFirstNonAgendaAccess) {
        mods.rfgFirstNonAgendaAccess = true;
      }
      if (pending.lastingRfgCopiesOnAccess) {
        mods.lastingRfgCopiesOnAccess = true;
      }
      if (pending.backupPlanIgnoreAdditionalCosts) {
        mods.backupPlanIgnoreAdditionalCosts = true;
        mods.backupPlanBypassIceId = pending.backupPlanBypassIceId;
      }
      // Aircheck's follow-up run: the event is still active, so its hosted
      // credits are spendable and the credit pool stays locked (CR 8.6.5).
      const lockEvent = activeCreditLockEvent(state);
      if (lockEvent && lockEvent.id === pending.sourceId) {
        mods.blockCreditPoolSpendAndLose = true;
        const hosted = lockEvent.hostedCredits ?? 0;
        if (hosted > 0) {
          mods.eventCredits = (mods.eventCredits ?? 0) + hosted;
          lockEvent.hostedCredits = 0;
        }
      }
      const walked = startRun(
        state,
        pending.serverId as import("../state/types.js").ServerId,
        mods,
      );
      if (!walked.ok) return walked;
      if (walked.state.turn.ohForcedRunCannotJackOut && walked.state.run) {
        walked.state.run.cannotJackOut = true;
        walked.state.turn.ohForcedRunCannotJackOut = false;
        log(walked.state, `An Offer — Runner cannot jack out this run.`);
      }
      finishRunReturnToAction(walked.state);
      return walked;
    }
    log(state, `Pending run — server ${pending.serverId} missing.`);
  }

  if (state.run?.wakeImplantPending) {
    state.run.wakeImplantPending = false;
    state.run.wakeImplantResolved = true;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.mercuryBreachPending) {
    state.run.mercuryBreachPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.mediumBreachPending) {
    state.run.mediumBreachPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.cupellationBreachPending) {
    state.run.cupellationBreachPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.onBreachRdPending) {
    state.run.onBreachRdPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice || state.psi) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.pendingRunEventStart) {
    const pending = state.pendingRunEventStart;
    state.pendingRunEventStart = null;
    state.deferAfterBasicAction = false;
    const runCard = state.cards[pending.sourceId];
    const mods = runCard?.runEvent
      ? modifiersFromStartsRun(state, runCard.runEvent, pending.sourceId)
      : { runSourceId: pending.sourceId };
    const hosted = runCard?.hostedCredits ?? 0;
    if (hosted > 0) {
      mods.eventCredits = (mods.eventCredits ?? 0) + hosted;
      runCard!.hostedCredits = 0;
    }
    if (state.servers[pending.serverId]) {
      state.playedRunEventId = pending.sourceId;
      const title = state.cards[pending.sourceId]?.title;
      if (title) {
        log(
          state,
          `${title} remains in the play area for this run (CR ${CR.playingTimingStructure.number}).`,
        );
      }
      const walked = startRun(state, pending.serverId, mods);
      if (!walked.ok) return walked;
      finishRunReturnToAction(walked.state);
      return walked;
    }
    log(state, `Deferred run event — server missing.`);
  }

  if (state.pendingStealAgendaId) {
    const agendaId = state.pendingStealAgendaId;
    state.pendingStealAgendaId = null;
    const resumed = completeStealAgenda(state, { cardId: agendaId });
    if (!resumed.ok) return resumed;
    if (
      state.pendingChoice ||
      state.pendingTrashProgram ||
      state.pendingSabotage ||
      state.pendingDamage
    ) {
      return resumed;
    }
  }

  if (state.pendingTrashAccessedCardId) {
    const cardId = state.pendingTrashAccessedCardId;
    state.pendingTrashAccessedCardId = null;
    const trashed = applyActionCore(state, { type: "trash_accessed", cardId });
    return trashed;
  }

  // Resume scoring after scoreAdditionalCost (Azef must_trash).
  if (state.pendingScoreAgendaId) {
    if (
      state.pendingChoice ||
      state.pendingDamage ||
      state.pendingTrashProgram
    ) {
      return ok(state);
    }
    const agendaId = state.pendingScoreAgendaId;
    const scored = scoreAgendaAction(state, agendaId);
    if (!scored.ok) return scored;
    if (
      state.pendingTrashProgram ||
      state.pendingChoice ||
      state.pendingSabotage ||
      state.pendingDamage
    ) {
      return scored;
    }
  }

  // Resume rez after rezAdditionalCost (Valentão).
  if (state.pendingRezCardId) {
    const rezId = state.pendingRezCardId;
    const rezCard = state.cards[rezId];
    if (rezCard?.type === "ice") {
      const rezzed = rezIce(state, rezId);
      if (!rezzed.ok) return rezzed;
      if (
        state.pendingTrashProgram ||
        state.pendingChoice ||
        state.pendingSabotage ||
        state.pendingDamage
      ) {
        return rezzed;
      }
    }
  }

  // The rest of a seq that paused on this choice (Cell Portal derez after
  // the jack-out offer) resolves before the timing chart moves on.
  resumePendingEffectContinuation(state);
  if (
    state.pendingChoice ||
    state.pendingDamage ||
    state.pendingTags ||
    state.pendingTrashProgram ||
    state.pendingSabotage ||
    state.trace ||
    state.psi
  ) {
    return ok(state);
  }

  if (state.run) return continueRunAfterPausedStep(state);

  // Resume a seq that paused when this choice window opened.
  resumePendingEffectContinuation(state);
  payPendingSwapContinuation(state);
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.pendingTags ||
    state.trace ||
    state.psi
  ) {
    return ok(state);
  }

  if (state.pendingStandaloneBreach) {
    const pending = state.pendingStandaloneBreach;
    state.pendingStandaloneBreach = null;
    const sid = pending.serverId;
    if (state.servers[sid]) {
      log(
        state,
        `Standalone breach of ${sid} begins (CR ${CR.breach.number}).`,
      );
      state.run = {
        attackedServerId: sid,
        phase: "breach",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        accessingCardId: null,
        isPostRunBreach: true,
        runSourceId: pending.sourceId,
        ...(pending.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
      };
      enterStep(state, "breach.begin");
      beginBreachAccess(state);
      if (state.pendingChoice) return ok(state);
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
  }

  if (state.pendingStandaloneCardAccess) {
    const pending = state.pendingStandaloneCardAccess;
    state.pendingStandaloneCardAccess = null;
    const sid = pending.serverId;
    const card = state.cards[pending.cardId];
    if (state.servers[sid] && card) {
      log(
        state,
        `Standalone access of ${card.title} on ${sid} begins (CR ${CR.cardAccessed.number}).`,
      );
      state.run = {
        attackedServerId: sid,
        phase: "breach",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [pending.cardId],
        randomAccessLimit: 1,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        accessingCardId: null,
        isPostRunBreach: true,
        accessCandidatesPreset: true,
        runSourceId: pending.sourceId,
      };
      enterStep(state, "breach.begin");
      beginBreachAccess(state);
      if (state.pendingChoice) return ok(state);
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
  }

  finishPendingDraw(state);
  if (!state.pendingChoice) resumeExposeUpTo(state);
  if (!state.pendingChoice) resumeRunnerTurnBeginAbilities(state);
  if (!state.pendingChoice) settleDeferredPlayedEvent(state);
  if (!state.pendingChoice) settleDeferredTerminalOperation(state);
  if (state.pendingChoice) return ok(state);
  if (state.deferAfterBasicAction) {
    state.deferAfterBasicAction = false;
    afterBasicAction(state);
  }
  return ok(state);
}

function swapIcePositions(state: GameState, a: string, b: string): void {
  let serverA: Server | null = null;
  let idxA = -1;
  let serverB: Server | null = null;
  let idxB = -1;
  for (const server of Object.values(state.servers)) {
    const ia = server.ice.indexOf(a);
    const ib = server.ice.indexOf(b);
    if (ia >= 0) {
      serverA = server;
      idxA = ia;
    }
    if (ib >= 0) {
      serverB = server;
      idxB = ib;
    }
  }
  if (!serverA || !serverB || idxA < 0 || idxB < 0) return;
  serverA.ice[idxA] = b;
  serverB.ice[idxB] = a;
  state.cards[a].zone = `server:${serverB.id}:ice`;
  state.cards[b].zone = `server:${serverA.id}:ice`;
}
