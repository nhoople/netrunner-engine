/**
 * Primitive kinds for Runner installs from the stack, the heap, hosted cards
 * and set-aside cards. The kind registry (`applyCoreKinds`) dispatches here.
 */
import {
  type EffectCtx,
  type EvalResult,
  evalEffect,
  applyPrimitive,
  fireOnInstall,
} from "../eval.js";
import { finishMuseInstall } from "./installChoices.js";
import { type Effect, type Primitive, fx } from "../ir.js";
import {
  creditsAvailableForInstall,
  subtractRunnerCreditPool,
} from "../../state/keywordsAndCredits/runnerCredits.js";
import {
  payInstallCost,
  canPayCost,
  payCost,
} from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { fireOnInstallProgramFromHeap } from "../../state/triggers/miscConditionalHooks.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  noteInstalledThisTurn,
  noteProgramOrHardwareInstalled,
} from "../../state/install/programHardwareInstall.js";
import {
  memoryLimit,
  usedMemory,
  memoryNeededToInstall,
} from "../../state/turnAndActions/turn.js";
import { noteVirusProgramInstalled } from "../../state/install/virusInstall.js";
import { CR } from "../../timing/labels.js";
import { chooseCards } from "../triggers/chooseCards.js";
import {
  canInstallHeapCard,
  gripInstallCostAfterDiscount,
  installHeapCardDiscounted,
  installSetAsideCardPayingNoShuffle,
  installSetAsideIgnoringCosts,
  installSetAsideProgramPaying,
  installStackCardPaying,
  installStackProgramPaying,
  shuffleRunnerStack,
  canInstallSetAsideIgnoringCosts,
  shuffleRunnerSetAsideIntoStack,
} from "./runnerInstall.js";
import { random, shuffleInPlace } from "../../state/rng.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { unhostCard } from "../../state/hostingAndTrash/host.js";
import { recomputeRunnerLink } from "../../state/hostingAndTrash/trashHooks.js";
import { enterSetAside } from "../../state/zones.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import type { GameState } from "../../state/types.js";

/** Compile's run-end ability: the program it installed goes to the bottom of the stack. */
export function addCompileInstalledToBottom(state: GameState): void {
  const id = state.run?.winCompileInstalledProgramId;
  if (!id) return;
  const card = state.cards[id];
  if (!card || !state.runner.installed.includes(id)) return;
  uninstallCard(state, id, "deck-bottom", {
    logLine: `Compile — add ${card.title} to bottom of stack.`,
  });
}

export function applyRunnerInstallFromOtherZonesKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "install_set_aside": {
      return installSetAsideCardPayingNoShuffle(
        state,
        action.cardId,
        Math.max(0, action.discount),
      );
    }

    case "install_stack_program_ignore_costs_track": {
      const id = action.cardId;
      if (!state.runner.deck.includes(id)) {
        log(state, `Install from stack — not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      // shuffle rest
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      const card = state.cards[id]!;
      // console limit / install into installed ignoring costs
      if ((card.subtypes ?? []).includes("console")) {
        for (const rid of [...state.runner.installed]) {
          const other = state.cards[rid];
          if ((other?.subtypes ?? []).includes("console")) {
            // Cannot be prevented (CR 3.8.5b).
            trashCard(state, rid, { by: "runner", preventable: false });
          }
        }
      }
      state.runner.installed.push(id);
      card.zone = "runner:installed";
      card.faceup = true;
      if ((card.powerCountersOnInstall ?? 0) > 0) {
        card.powerCounters = card.powerCountersOnInstall;
      }
      fireOnInstall(state, id);
      noteProgramOrHardwareInstalled(state, id);
      if (state.run) {
        state.run.betaBuildTrackedInstallId = id;
      } else {
        // track on source until run starts
        (
          source as { betaBuildPendingTrackId?: string }
        ).betaBuildPendingTrackId = id;
      }
      log(state, `Install ${card.title} from stack ignoring all costs.`);
      return { ok: true };
    }

    case "may_install_one_hosted_program": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted programs to install.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((cardId) => ({
            id: cardId,
            label: `Install ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hosted_program" as const,
                cardId,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
        logLine: `${source.title} — may install 1 hosted program.`,
      });
      return { ok: true };
    }

    case "install_hosted_program": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        card.type !== "program" ||
        !(source.hostedCardIds ?? []).includes(cardId)
      ) {
        log(state, `install_hosted_program — invalid hosted program.`);
        return { ok: true };
      }
      const need = memoryNeededToInstall(state, cardId);
      if (usedMemory(state) + need > memoryLimit(state)) {
        log(state, `install_hosted_program — insufficient MU.`);
        return { ok: true };
      }
      const cost = Math.max(0, card.installCost ?? 0);
      if (state.runner.credits < cost) {
        log(state, `install_hosted_program — insufficient credits (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      unhostCard(state, card.id);
      card.zone = "runner:installed";
      card.faceup = true;
      state.runner.installed.push(cardId);
      noteVirusProgramInstalled(state, cardId);
      noteProgramOrHardwareInstalled(state, cardId);
      log(state, `Install hosted ${card.title} for ${cost}¢.`);
      fireOnInstall(state, cardId);
      return { ok: true };
    }

    case "may_install_one_hosted_card": {
      const hosted = (source.hostedCardIds ?? []).filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted program/hardware to install.`);
        return { ok: true };
      }
      const discountFlag = Boolean(
        action.firstThisTurnDiscountPerUniqueConnection,
      );
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((cardId) => ({
            id: cardId,
            label: `Install ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hosted_card" as const,
                cardId,
                ...(discountFlag
                  ? { firstThisTurnDiscountPerUniqueConnection: true }
                  : {}),
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
        logLine: `${source.title} — may install 1 hosted card.`,
      });
      return { ok: true };
    }

    case "install_hosted_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        (card.type !== "program" && card.type !== "hardware") ||
        !(source.hostedCardIds ?? []).includes(cardId)
      ) {
        log(state, `install_hosted_card — invalid hosted card.`);
        return { ok: true };
      }
      if (card.type === "program") {
        const need = memoryNeededToInstall(state, cardId);
        if (usedMemory(state) + need > memoryLimit(state)) {
          log(state, `install_hosted_card — insufficient MU.`);
          return { ok: true };
        }
      }
      let cost = Math.max(0, card.installCost ?? 0);
      if (
        action.firstThisTurnDiscountPerUniqueConnection &&
        !state.turn.paulesCafeInstallUsedThisTurn
      ) {
        const uniqueConnections = state.runner.installed.filter((id) => {
          const c = state.cards[id];
          return (
            Boolean(c?.unique) && (c?.subtypes ?? []).includes("connection")
          );
        }).length;
        cost = Math.max(0, cost - uniqueConnections);
        state.turn.paulesCafeInstallUsedThisTurn = true;
      }
      if (state.runner.credits < cost) {
        log(state, `install_hosted_card — insufficient credits (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      unhostCard(state, card.id);
      card.zone = "runner:installed";
      card.faceup = true;
      state.runner.installed.push(cardId);
      noteVirusProgramInstalled(state, cardId);
      noteProgramOrHardwareInstalled(state, cardId);
      log(state, `Install hosted ${card.title} for ${cost}¢.`);
      fireOnInstall(state, cardId);
      return { ok: true };
    }

    case "install_program_from_stack_or_heap_free": {
      // The printed "Search either your stack or your heap for 1 program."
      //
      // The player searching picks where to look, then the card it finds
      // (CR 8.7.1, 1.15.2).
      if (!action.from) {
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: (["stack", "heap"] as const).map((from) => ({
            id: `search-${from}`,
            label: `Search your ${from} for 1 program`,
            effect: fx.do({
              kind: "install_program_from_stack_or_heap_free",
              from,
            }),
          })),
          logLine: `${source?.title ?? "Test Run"} — the Runner chooses to search the stack or the heap.`,
        });
        return { ok: true };
      }
      const fromStackSearch = action.from === "stack";
      if (!action.cardIds) {
        const zone = fromStackSearch
          ? state.runner.deck
          : state.runner.discardPile;
        // A deck search may find nothing, and the Corp does not learn how
        // many programs the stack holds (CR 8.7.2e, 10.2.2b). The heap is
        // not a deck: a program there must be found (8.7.2e grants failing
        // to find only for a deck), and the heap is open to both players.
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: zone.filter(
              (cid) => state.cards[cid]?.type === "program",
            ),
            count: 1,
            ...(fromStackSearch ? { search: true } : { open: true }),
            purpose: "resume",
            label: "install ignoring all costs",
            resume: {
              kind: "install_program_from_stack_or_heap_free",
              from: action.from,
            },
          }),
        );
      }
      const zoneNow = fromStackSearch
        ? state.runner.deck
        : state.runner.discardPile;
      const id = action.cardIds.find((cid) => zoneNow.includes(cid));
      // The stack is shuffled once the search is complete, before the found
      // card is installed (CR 8.7.3).
      if (fromStackSearch) {
        shuffleRunnerStack(state);
        log(
          state,
          `${source?.title ?? "Test Run"} — shuffle the stack after searching it (CR ${CR.shuffleDeckAfterSearch.number}).`,
        );
      }
      if (!id) {
        log(
          state,
          `${source?.title ?? "Test Run"} — no program found in the ${action.from}.`,
        );
        return { ok: true };
      }
      const fromHeap = action.from === "heap";
      const card = state.cards[id];
      state.runner.discardPile = state.runner.discardPile.filter(
        (x) => x !== id,
      );
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      state.runner.installed.push(id);
      card.zone = "runner:installed";
      card.faceup = true;
      card.bounceToStackAtTurnEnd = true;
      if ((card.recurringCreditsMax ?? 0) > 0) {
        card.recurringCredits = card.recurringCreditsMax;
      }
      log(
        state,
        `Install ${card.title} ignoring costs (will bounce to stack at turn end).`,
      );
      log(
        state,
        `${source?.title ?? "Test Run"} creates a lingering effect: ${card.title} returns to the stack at the end of the turn, independent of ${source?.title ?? "Test Run"}. ${source?.title ?? "Test Run"} is fully resolved (CR ${CR.playingLingeringEffects.number}).`,
      );
      fireOnInstall(state, id);
      noteVirusProgramInstalled(state, id);
      noteProgramOrHardwareInstalled(state, id);
      // Exile treats a program set aside from the heap, then installed, as
      // installed from the heap (CR 4.8.3).
      if (fromHeap && card.type === "program") {
        const idCard = state.cards[state.runner.identityId];
        if (idCard?.onInstallProgramFromHeap) {
          fireOnInstallProgramFromHeap(state, idCard.id);
          if (state.pendingChoice) return { ok: true };
        }
      }
      return { ok: true };
    }

    case "may_install_from_heap": {
      const types = new Set(action.types);
      const discount = Math.max(0, action.discount ?? 0);
      const candidates = state.runner.discardPile.filter((id) => {
        const c = state.cards[id];
        return (
          c &&
          types.has(c.type as "program" | "hardware" | "resource") &&
          canInstallHeapCard(state, id, discount)
        );
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — may install from heap: none affordable.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `install:${id}`,
              label: `Install ${c.title}`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_heap_card" as const,
                  cardId: id,
                  discount,
                },
              },
            };
          }),
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
        logLine: `${source.title} — may install from heap (${[...types].join("/")}).`,
      });
      return { ok: true };
    }

    case "install_scavenge_program": {
      const discount = Math.max(
        0,
        state.turn.lastTrashedOwnProgramInstallCost ?? 0,
      );
      const gripCandidates = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        if (c.installOnIce || (c.subtypes ?? []).includes("trojan")) {
          return false;
        }
        const need = memoryNeededToInstall(state, id);
        if (usedMemory(state) + need > memoryLimit(state)) return false;
        const cost = gripInstallCostAfterDiscount(state, c, discount);
        return creditsAvailableForInstall(state, "runner") >= cost;
      });
      const heapCandidates = state.runner.discardPile.filter((id) => {
        const c = state.cards[id];
        return (
          c && c.type === "program" && canInstallHeapCard(state, id, discount)
        );
      });
      if (gripCandidates.length === 0 && heapCandidates.length === 0) {
        log(state, `${source.title} — no affordable program to install.`);
        return { ok: true };
      }
      const options = [
        ...gripCandidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `scavenge-grip:${id}`,
            label: `Install ${c.title} (from grip)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_grip_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
        ...heapCandidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `scavenge-heap:${id}`,
            label: `Install ${c.title} (from heap)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_heap_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
      ];
      if (options.length === 1) {
        return evalEffect(ctx, options[0]!.effect);
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `${source.title} — choose a program to install (${discount}¢ discount; CR ${CR.runnerBasicInstall.number}).`,
      });
      return { ok: true };
    }

    case "install_from_heap": {
      const types = new Set(action.types);
      const discount = Math.max(0, action.discount ?? 0);
      const candidates = state.runner.discardPile.filter((id) => {
        const c = state.cards[id];
        return (
          c &&
          types.has(c.type as "program" | "hardware" | "resource") &&
          canInstallHeapCard(state, id, discount)
        );
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — install from heap: none affordable.`);
        return { ok: true };
      }
      if (candidates.length === 1) {
        return evalEffect(ctx, {
          op: "do",
          action: {
            kind: "install_heap_card",
            cardId: candidates[0]!,
            discount,
          },
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `install:${id}`,
            label: `Install ${c.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_heap_card" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
        logLine: `${source.title} — install from heap (${[...types].join("/")}).`,
      });
      return { ok: true };
    }

    case "install_stack_program": {
      return installStackProgramPaying(
        state,
        action.cardId,
        sourceId,
        action.gripCardId,
      );
    }

    case "install_set_aside_program": {
      return installSetAsideProgramPaying(
        state,
        action.cardId,
        action.discount,
        sourceId,
      );
    }

    case "install_heap_card": {
      return installHeapCardDiscounted(
        state,
        action.cardId,
        action.discount,
        sourceId,
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

    case "install_hosted_card_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        (card.type !== "program" && card.type !== "hardware") ||
        !(source.hostedCardIds ?? []).includes(cardId)
      ) {
        log(state, `install_hosted_card_ignore_costs — invalid hosted card.`);
        return { ok: true };
      }
      if (card.type === "program") {
        const need = memoryNeededToInstall(state, cardId);
        if (usedMemory(state) + need > memoryLimit(state)) {
          log(state, `install_hosted_card_ignore_costs — insufficient MU.`);
          return { ok: true };
        }
      }
      unhostCard(state, card.id);
      card.powerCounters = undefined;
      card.zone = "runner:installed";
      card.faceup = true;
      state.runner.installed.push(cardId);
      noteVirusProgramInstalled(state, cardId);
      noteProgramOrHardwareInstalled(state, cardId);
      log(state, `Install hosted ${card.title} ignoring all costs.`);
      fireOnInstall(state, cardId);
      return { ok: true };
    }

    case "install_up_to_from_heap_facedown": {
      return applyPrimitive(ctx, {
        kind: "install_up_to_from_heap_facedown_continue",
        remaining: Math.max(0, action.max),
      });
    }

    case "install_up_to_from_heap_facedown_continue": {
      let remaining = Math.max(0, action.remaining);
      if (action.justInstalledId) {
        const id = action.justInstalledId;
        const idx = state.runner.discardPile.indexOf(id);
        if (idx >= 0) {
          state.runner.discardPile.splice(idx, 1);
          state.runner.installed.push(id);
          const card = state.cards[id]!;
          card.zone = "runner:installed";
          card.faceup = false;
          card.rezzed = false;
          noteInstalledThisTurn(state, id);
          remaining = Math.max(0, remaining - 1);
          log(
            state,
            `Install ${card.title} from heap facedown (${remaining} remaining).`,
          );
        }
      }
      if (remaining <= 0 || state.runner.discardPile.length === 0) {
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "done-heap-facedown",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...state.runner.discardPile.map((id) => ({
            id: `heap-fd:${id}`,
            label: `Install ${state.cards[id]!.title} facedown`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_up_to_from_heap_facedown_continue" as const,
                remaining,
                justInstalledId: id,
              },
            },
          })),
        ],
        logLine: `Install up to ${remaining} more from heap facedown.`,
      });
      return { ok: true };
    }

    case "install_on_ice": {
      return finishMuseInstall(
        state,
        action.cardId,
        action.from,
        sourceId,
        action.iceId,
        true,
      );
    }

    case "install_on_daemon": {
      return finishMuseInstall(
        state,
        action.cardId,
        action.from,
        sourceId,
        sourceId,
        false,
      );
    }

    case "install_wizard_chest": {
      return installSetAsideIgnoringCosts(state, action.cardId, sourceId);
    }

    case "install_heap_paying_click": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.discardPile.includes(action.cardId)) {
        log(state, `install_heap_paying_click — card not in heap.`);
        return { ok: true };
      }
      if (state.runner.clicks < action.clickCost) {
        log(state, `install_heap_paying_click — not enough clicks.`);
        return { ok: true };
      }
      const cost = card.installCost ?? 0;
      if (creditsAvailableForInstall(state, "runner") < cost) {
        log(state, `install_heap_paying_click — cannot afford ${card.title}.`);
        return { ok: true };
      }
      state.runner.clicks -= action.clickCost;
      payInstallCost(state, "runner", cost);
      state.runner.discardPile = state.runner.discardPile.filter(
        (x) => x !== action.cardId,
      );
      state.runner.installed.push(action.cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      if ((card.powerCountersOnInstall ?? 0) > 0) {
        card.powerCounters = card.powerCountersOnInstall;
      }
      noteInstalledThisTurn(state, action.cardId);
      log(
        state,
        `Install ${card.title} from heap for ${action.clickCost}[click] + ${cost}¢.`,
      );
      fireOnInstall(state, action.cardId);
      noteProgramOrHardwareInstalled(state, action.cardId);
      return { ok: true };
    }

    case "wizard_chest_for_type": {
      const aside: string[] = [];
      const matches: string[] = [];
      while (
        state.runner.deck.length > 0 &&
        matches.length < action.untilCount
      ) {
        const id = state.runner.deck.shift()!;
        aside.push(id);
        if (state.cards[id]!.type === action.cardType) {
          matches.push(id);
        }
      }
      enterSetAside(state, aside, {
        side: "runner",
        faceup: true,
        replace: true,
      });
      log(
        state,
        `${source.title} — set aside ${aside.length} card(s); ${matches.length} ${action.cardType}(s).`,
      );
      if (matches.length === 0) {
        shuffleRunnerSetAsideIntoStack(state);
        return { ok: true };
      }
      const installable = matches.filter((id) =>
        canInstallSetAsideIgnoringCosts(state, id),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        ...installable.map((id) => ({
          id: `wizard-install:${id}`,
          label: `Install ${state.cards[id]!.title} ignoring all costs`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_wizard_chest" as const,
              cardId: id,
            },
          },
        })),
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do" as const,
            action: { kind: "shuffle_runner_set_aside_into_stack" as const },
          },
        },
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `${source.title} — may install 1 of ${matches.length} ${action.cardType}(s) ignoring costs.`,
      });
      return { ok: true };
    }

    case "install_reclaim_from_heap": {
      const candidates = state.runner.discardPile.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (c.type === "program" || c.type === "hardware") return true;
        return c.type === "resource" && (c.subtypes ?? []).includes("virtual");
      });
      if (candidates.length === 0) {
        log(state, `Reclaim — no program/hardware/virtual in heap.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `reclaim:${id}`,
          label: `Install ${state.cards[id]!.title} from heap (pay install cost)`,
          effect: fx.do({ kind: "install_reclaim_resolve", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "install_reclaim_resolve": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const cost = card.installCost ?? 0;
      if (state.runner.credits < cost) {
        log(state, `Reclaim — cannot afford ${card.title} (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      const idx = state.runner.discardPile.indexOf(action.cardId);
      if (idx >= 0) state.runner.discardPile.splice(idx, 1);
      card.zone = "runner:installed";
      unhostCard(state, card.id);
      state.runner.installed.push(action.cardId);
      log(state, `Reclaim — install ${card.title} for ${cost}¢.`);
      return { ok: true };
    }
    case "install_supplier_turn_begin": {
      const host = state.cards[sourceId];
      const hosted = host?.hostedCardIds ?? [];
      if (hosted.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Do not install hosted card",
            effect: fx.gainCredits("runner", 0),
          },
          ...hosted.map((id) => ({
            id: `install:${id}`,
            label: `Install ${state.cards[id]!.title} (-2¢)`,
            effect: fx.do({ kind: "install_supplier_hosted", cardId: id }),
          })),
        ],
      });
      return { ok: true };
    }
    case "install_supplier_hosted": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      const host = state.cards[sourceId];
      if (!card || !host?.hostedCardIds?.includes(cardId)) return { ok: true };
      const cost = Math.max(0, (card.installCost ?? 0) - 2);
      if (!canPayCost(state, "runner", { credits: cost })) {
        return { ok: false, error: "Cannot pay install cost.", cites: [] };
      }
      payCost(state, "runner", { credits: cost }, "supplier-install", card);
      unhostCard(state, card.id);
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      recomputeRunnerLink(state);
      log(state, `The Supplier — install ${card.title} for ${cost}¢.`);
      return { ok: true };
    }

    case "install_crypt_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card) return { ok: true };
      const cost = card.installCost ?? 0;
      if (state.runner.credits < cost) {
        log(
          state,
          `Crypt — cannot pay ${cost}¢ to install ${card.title}; shuffle.`,
        );
        shuffleInPlace(state, state.runner.deck);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      shuffleInPlace(state, state.runner.deck);
      log(state, `Crypt — install ${card.title} for ${cost}¢; shuffle stack.`);
      return { ok: true };
    }

    case "install_top_n_of_stack_facedown": {
      const n = action.amount ?? 3;
      for (let i = 0; i < n; i++) {
        const id = state.runner.deck.shift();
        if (!id) break;
        const card = state.cards[id]!;
        state.runner.installed.push(id);
        card.zone = "runner:installed";
        card.faceup = false;
        log(state, `Install ${card.title} facedown from stack.`);
      }
      return { ok: true };
    }

    case "install_from_stack": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.deck.includes(cardId)) {
        log(state, `Artist Colony — card not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      // Shuffle remaining stack.
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      log(state, `Artist Colony — install ${card.title} from stack.`);
      return { ok: true };
    }

    case "win_compile_bottom_of_stack": {
      addCompileInstalledToBottom(state);
      return { ok: true };
    }

    case "may_install_crowdfunding_from_heap_ignore_costs": {
      const minRuns = action.minSuccessfulRuns ?? 3;
      if (!state.runner.discardPile.includes(sourceId)) {
        log(state, `Crowdfunding — not in heap.`);
        return { ok: true };
      }
      const runs = state.turn.successfulRunCountThisTurn ?? 0;
      if (runs < minRuns) {
        log(
          state,
          `Crowdfunding — need ${minRuns} successful runs this turn (have ${runs}).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "accept",
            label: "Install Crowdfunding from heap, ignoring all costs",
            effect: fx.do({ kind: "install_crowdfunding_resolve" }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({
              kind: "gain_credits",
              side: "runner",
              amount: 0,
            }),
          },
        ],
        logLine: `Crowdfunding — may install from heap ignoring costs (${runs} successful runs).`,
      });
      return { ok: true };
    }

    case "install_crowdfunding_resolve": {
      if (!state.runner.discardPile.includes(sourceId)) {
        log(state, `Crowdfunding — not in heap.`);
        return { ok: true };
      }
      state.runner.discardPile = state.runner.discardPile.filter(
        (id) => id !== sourceId,
      );
      state.runner.installed.push(sourceId);
      source.zone = "runner:installed";
      source.faceup = true;
      unhostCard(state, source.id);
      if ((source.hostedCreditsOnInstall ?? 0) > 0) {
        source.hostedCredits = source.hostedCreditsOnInstall;
      }
      log(state, `Crowdfunding — install from heap ignoring all costs.`);
      fireOnInstall(state, sourceId);
      return { ok: true };
    }

    case "install_customized_secretary_hosted_program": {
      const hosted = (source?.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (hosted.length === 0) {
        log(state, `Customized Secretary — no hosted program.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: hosted.map((cardId) => ({
          id: `install:${cardId}`,
          label: `Install ${state.cards[cardId]!.title}`,
          effect: fx.do({ kind: "install_hosted_program", cardId }),
        })),
      });
      return { ok: true };
    }

    case "install_rosetta_from_stack": {
      const cardId = action.cardId;
      const discount = action.discount ?? 0;
      const card = state.cards[cardId];
      if (!card || !state.runner.deck.includes(cardId)) {
        log(state, `Rosetta 2.0 — install target not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      const cost = Math.max(0, (card.installCost ?? 0) - discount);
      if (state.runner.credits < cost) {
        state.runner.hand.push(cardId);
        card.zone = "runner:grip";
        log(
          state,
          `Rosetta 2.0 — cannot pay ${cost}¢; ${card.title} added to grip.`,
        );
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      log(
        state,
        `Rosetta 2.0 — install ${card.title} for ${cost}¢ (−${discount}).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyRunnerInstallFromOtherZonesKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "install_hosted": {
      const discount = action.discount ?? 1;
      const hosted = (source.hostedCardIds ?? []).filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware" || t === "resource";
      });
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted installable card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: hosted.map((cardId) => ({
          id: `peddler:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} (−${discount}¢)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_street_peddler_hosted_card" as const,
              cardId,
              discount,
            },
          },
        })),
        logLine: `${source.title} — choose a hosted card to install.`,
      });
      return { ok: true };
    }

    case "install_street_peddler_hosted_card": {
      const cardId = action.cardId;
      const discount = action.discount ?? 1;
      const card = state.cards[cardId];
      if (
        !card ||
        !(source.hostedCardIds ?? []).includes(cardId) ||
        (card.type !== "program" &&
          card.type !== "hardware" &&
          card.type !== "resource")
      ) {
        log(state, `Street Peddler — invalid hosted card.`);
        return { ok: true };
      }
      const cost = Math.max(0, (card.installCost ?? 0) - discount);
      if (state.runner.credits < cost) {
        log(state, `Street Peddler — insufficient credits (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.setAside = (state.runner.setAside ?? []).filter(
        (id) => id !== cardId,
      );
      unhostCard(state, card.id);
      card.zone = "runner:installed";
      card.faceup = true;
      state.runner.installed.push(cardId);
      log(state, `Street Peddler — install ${card.title} for ${cost}¢.`);
      fireOnInstall(state, cardId);
      return { ok: true };
    }
    default:
      return null;
  }
}
