/**
 * Primitive kinds whose procedure is add.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type {
  Effect,
  Primitive,
} from "../ir.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import {
  removeCardFromCurrentZone,
  checkWinConditions,
} from "../../state/scoring.js";
import {
  fireOnAgendaAddedToRunnerScore,
  moveRunnerCardToHeap,
} from "../../state/trashHooks.js";
import { CR } from "../../timing/labels.js";

export function applyAddKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "add_to_runner_score_as_agenda": {
      const pts = action.agendaPoints ?? source.agendaPoints ?? 0;
      source.agendaPoints = pts;
      if (action.addSubtypes?.length) {
        const merged = new Set([
          ...(source.subtypes ?? []),
          ...action.addSubtypes,
        ]);
        source.subtypes = [...merged];
      }
      removeCardFromCurrentZone(state, sourceId);
      state.runner.scoreArea.push(sourceId);
      source.zone = "runner:score";
      source.faceup = true;
      source.rezzed = true;
      source.convertedInto = "agenda";
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
      fireOnAgendaAddedToRunnerScore(state);
      checkWinConditions(state);
      return { ok: true };
    }

case "add_to_corp_score_as_agenda": {
      const pts = action.agendaPoints;
      source.agendaPoints = pts;
      if (action.cannotForfeit) source.cannotForfeit = true;
      removeCardFromCurrentZone(state, sourceId);
      state.corp.scoreArea.push(sourceId);
      source.zone = "corp:score";
      source.faceup = true;
      source.rezzed = true;
      source.convertedInto = "agenda";
      state.turn.agendaPointsScoredThisTurn += pts;
      log(
        state,
        `Corp adds ${source.title} to the score area as a ${pts}-point agenda` +
          (action.cannotForfeit ? " (cannot forfeit)" : "") +
          ` (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }

case "may_add_archives_card_to_rd_top": {
      const archives = [...state.corp.discardPile];
      if (archives.length === 0) {
        log(state, `${source.title} — Archives empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...archives.map((id) => ({
          id: `rd-top:${id}`,
          label: `Add ${state.cards[id]!.title} to top of R&D`,
          effect: {
            op: "do" as const,
            action: {
              kind: "add_archives_card_to_rd_top" as const,
              cardId: id,
            },
          },
        })),
      ];
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — may add 1 Archives card to top of R&D.`,
});
      return { ok: true };
    }

case "add_archives_card_to_rd_top": {
      const id = action.cardId;
      if (!state.corp.discardPile.includes(id)) {
        log(state, `Add Archives to R&D — card not in Archives.`);
        return { ok: true };
      }
      state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
      state.corp.deck.unshift(id);
      const card = state.cards[id]!;
      card.zone = "corp:rd";
      card.faceup = false;
      log(state, `Add ${card.title} from Archives to top of R&D.`);
      return { ok: true };
    }

case "add_from_heap_to_grip": {
      const moveToGrip = (id: string): { ok: true } => {
        const idx = state.runner.discardPile.indexOf(id);
        if (idx < 0) {
          log(state, `Add from heap — ${id} not in heap.`);
          return { ok: true };
        }
        state.runner.discardPile.splice(idx, 1);
        state.runner.hand.push(id);
        state.cards[id].zone = "runner:grip";
        state.cards[id].faceup = false;
        log(state, `Add ${state.cards[id].title} from heap to grip.`);
        return { ok: true };
      };
      if (action.cardId) {
        return moveToGrip(action.cardId);
      }
      const idFaction = state.cards[state.runner.identityId]?.faction;
      const heap = state.runner.discardPile.filter((id) => {
        if (!action.matchingIdentityFaction) return true;
        return Boolean(idFaction) && state.cards[id]?.faction === idFaction;
      });
      if (heap.length === 0) {
        log(
          state,
          action.matchingIdentityFaction
            ? `Add from heap — no card matching identity faction.`
            : `Add from heap — heap empty.`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && heap.length > 1) {
        openPendingChoose(state, {
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
logLine: `Choose a card in the heap to add to grip.`,
});
        return { ok: true };
      }
      return moveToGrip(heap[0]!);
    }

case "may_add_hq_agenda_ap_lte_to_score": {
      const maxAp = Math.max(0, action.maxAgendaPoints);
      const candidates = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "agenda" && (c.agendaPoints ?? 0) <= maxAp
        );
      });
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — no HQ agenda with ≤${maxAp} AP to add to score.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...candidates.map((id) => ({
            id: `score-hq:${id}`,
            label: `Add ${state.cards[id]!.title} to score area`,
            effect: {
              op: "do" as const,
              action: {
                kind: "add_hq_agenda_to_score" as const,
                cardId: id,
              },
            },
          })),
        ],
logLine: `${source.title} — may add an HQ agenda (≤${maxAp} AP) to the score area.`,
});
      return { ok: true };
    }

case "add_hq_agenda_to_score": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "agenda" || !state.corp.hand.includes(action.cardId)) {
        log(state, `Add HQ agenda to score — card not an HQ agenda.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      state.corp.scoreArea.push(action.cardId);
      card.zone = "corp:score";
      card.faceup = true;
      card.rezzed = true;
      state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
      log(
        state,
        `Add ${card.title} from HQ to Corp score area (${card.agendaPoints ?? 0} AP).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }

case "may_add_archives_card_to_rd_top_or_bottom": {
      const archives = [...state.corp.discardPile];
      if (archives.length === 0) {
        log(state, `${source.title} — Archives empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-archives-rd",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const id of archives) {
        const title = state.cards[id]!.title;
        options.push({
          id: `arch-top:${id}`,
          label: `Add ${title} to top of R&D`,
          effect: {
            op: "do",
            action: {
              kind: "add_archives_card_to_rd",
              cardId: id,
              position: "top",
            },
          },
        });
        options.push({
          id: `arch-bottom:${id}`,
          label: `Add ${title} to bottom of R&D`,
          effect: {
            op: "do",
            action: {
              kind: "add_archives_card_to_rd",
              cardId: id,
              position: "bottom",
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — may move Archives card to R&D.`,
});
      return { ok: true };
    }

case "add_archives_card_to_rd": {
      const cardId = action.cardId;
      if (!state.corp.discardPile.includes(cardId)) {
        log(state, `Archives→R&D — card not in Archives.`);
        return { ok: true };
      }
      const card = state.cards[cardId]!;
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== cardId);
      if (action.position === "top") {
        state.corp.deck.unshift(cardId);
      } else {
        state.corp.deck.push(cardId);
      }
      card.zone = "corp:rd";
      card.faceup = false;
      log(
        state,
        `Add ${card.title} to ${action.position} of R&D from Archives.`,
      );
      return { ok: true };
    }

case "add_installed_runner_to_grip": {
      const targets = [...state.runner.installed];
      if (targets.length === 0) {
        log(state, `${source.title} — no installed Runner cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `grip:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: {
            op: "do" as const,
            action: {
              kind: "add_installed_runner_card_to_grip" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — choose installed Runner card for grip.`,
});
      return { ok: true };
    }

case "add_installed_runner_card_to_grip": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.installed.includes(cardId)) {
        log(state, `Add to grip — card not installed.`);
        return { ok: true };
      }
      state.runner.installed = state.runner.installed.filter((id) => id !== cardId);
      // Unhost hosted cards if any host relationship.
      for (const id of [...state.runner.installed]) {
        const c = state.cards[id];
        if (c?.hostId === cardId) {
          c.hostId = undefined;
        }
      }
      card.hostId = undefined;
      card.zone = "runner:grip";
      card.rezzed = false;
      state.runner.hand.push(cardId);
      log(state, `Add ${card.title} to the grip.`);
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
      openPendingChoose(state, {
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
logLine: `${source.title} — may add 1 hosted card to grip.`,
});
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

case "may_add_from_heap_to_stack_bottom": {
      const typeFilter = action.types?.length
        ? new Set(action.types)
        : null;
      const candidates = state.runner.discardPile.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (!typeFilter) return true;
        return typeFilter.has(
          c.type as "program" | "hardware" | "resource" | "event",
        );
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — may add from heap to stack: none.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((id) => ({
            id: `heap-stack:${id}`,
            label: `Add ${state.cards[id].title} to bottom of stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "add_from_heap_to_stack_bottom" as const,
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
logLine: `${source.title} — may add from heap to bottom of stack.`,
});
      return { ok: true };
    }

case "add_from_heap_to_stack_bottom": {
      const id = action.cardId;
      const idx = state.runner.discardPile.indexOf(id);
      if (idx < 0) {
        log(state, `Add from heap — ${id} not in heap.`);
        return { ok: true };
      }
      state.runner.discardPile.splice(idx, 1);
      state.runner.deck.push(id);
      state.cards[id].zone = "runner:stack";
      state.cards[id].faceup = false;
      log(state, `Add ${state.cards[id].title} from heap to bottom of stack.`);
      return { ok: true };
    }

case "may_add_from_heap_to_stack_top": {
      const candidates = [...state.runner.discardPile];
      if (candidates.length === 0) {
        log(state, `${source.title} — may add from heap to stack top: none.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((id) => ({
            id: `heap-stack-top:${id}`,
            label: `Add ${state.cards[id].title} to top of stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "add_from_heap_to_stack_top" as const,
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
logLine: `${source.title} — may add from heap to top of stack.`,
});
      return { ok: true };
    }

case "add_from_heap_to_stack_top": {
      const id = action.cardId;
      const idx = state.runner.discardPile.indexOf(id);
      if (idx < 0) {
        log(state, `Add from heap to top — ${id} not in heap.`);
        return { ok: true };
      }
      state.runner.discardPile.splice(idx, 1);
      state.runner.deck.unshift(id);
      state.cards[id].zone = "runner:stack";
      state.cards[id].faceup = false;
      log(state, `Add ${state.cards[id].title} from heap to top of stack.`);
      return { ok: true };
    }

case "may_add_one_of_card_ids_to_stack_bottom": {
      const ids = (
        action.cardIds ??
        state.turn.pendingGripOrStackTrashBatchIds ??
        []
      ).filter((id) => state.runner.discardPile.includes(id));
      // Options bake card ids; clear the turn snapshot after reading.
      state.turn.pendingGripOrStackTrashBatchIds = [];
      if (ids.length === 0) {
        log(state, `${source.title} — no batch cards in heap to bottom.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...ids.map((id) => ({
            id: `batch-bottom:${id}`,
            label: `Add ${state.cards[id]!.title} to bottom of stack`,
            effect: {
              op: "do" as const,
              action: {
                kind: "add_card_id_to_stack_bottom" as const,
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
logLine: `${source.title} — may add 1 of the trashed cards to bottom of stack.`,
});
      return { ok: true };
    }

case "add_card_id_to_stack_bottom": {
      const id = action.cardId;
      const idx = state.runner.discardPile.indexOf(id);
      if (idx < 0) {
        log(state, `Add card to stack bottom — ${id} not in heap.`);
        return { ok: true };
      }
      state.runner.discardPile.splice(idx, 1);
      state.runner.deck.push(id);
      state.cards[id].zone = "runner:stack";
      state.cards[id].faceup = false;
      log(state, `Add ${state.cards[id].title} to bottom of stack.`);
      return { ok: true };
    }

case "add_ice_additional_rez_cost_this_turn": {
      const target = state.cards[action.cardId];
      if (!target) {
        log(
          state,
          `Add ice rez cost — unknown card ${action.cardId}.`,
        );
        return { ok: true };
      }
      state.turn.iceAdditionalRezCostThisTurn[action.cardId] =
        (state.turn.iceAdditionalRezCostThisTurn[action.cardId] ?? 0) +
        action.amount;
      log(
        state,
        `${target.title} costs +${action.amount}¢ to rez this turn.`,
      );
      return { ok: true };
    }

case "add_random_grip_to_stack_bottom": {
      const n = Math.max(0, action.count);
      const moved: string[] = [];
      for (let i = 0; i < n && state.runner.hand.length > 0; i++) {
        moved.push(state.runner.hand.shift()!);
      }
      for (const id of moved) {
        state.runner.deck.push(id);
        state.cards[id].zone = "runner:stack";
        state.cards[id].faceup = false;
      }
      log(
        state,
        `Move ${moved.length} card(s) from grip to bottom of stack (v0: first ${n} in hand order).`,
      );
      return { ok: true };
    }

case "add_random_grip_to_stack_top": {
      const n = Math.max(0, action.count);
      const moved: string[] = [];
      for (let i = 0; i < n && state.runner.hand.length > 0; i++) {
        moved.push(state.runner.hand.shift()!);
      }
      for (let i = moved.length - 1; i >= 0; i--) {
        const id = moved[i]!;
        state.runner.deck.unshift(id);
        state.cards[id].zone = "runner:stack";
        state.cards[id].faceup = false;
      }
      log(
        state,
        `Move ${moved.length} card(s) from grip to top of stack (v0: first ${n} in hand order).`,
      );
      return { ok: true };
    }

case "add_installed_resource_to_stack_top": {
      const resources = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `Add installed resource to stack top — none installed.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: resources.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `res:${id}`,
            label: `Add ${c.title} to stack top`,
            effect: {
              op: "do" as const,
              action: {
                kind: "move_runner_card_to_stack_top" as const,
                cardId: id,
              },
            },
          };
        }),
logLine: `${source.title} — choose an installed resource for stack top.`,
});
      return { ok: true };
    }

case "add_installed_program_to_stack_top": {
      const programs = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Add installed program to stack top — none installed.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: programs.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `prog:${id}`,
            label: `Add ${c.title} to stack top`,
            effect: {
              op: "do" as const,
              action: {
                kind: "move_runner_card_to_stack_top" as const,
                cardId: id,
              },
            },
          };
        }),
logLine: `${source.title} — choose an installed program for stack top.`,
});
      return { ok: true };
    }

case "add_agenda_counters_equal_to_bad_publicity": {
      const n = state.corp.badPublicity ?? 0;
      source.agendaCounters = (source.agendaCounters ?? 0) + n;
      log(
        state,
        `Place ${n} agenda counter(s) on ${source.title} (equal to bad publicity) → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }

case "add_agenda_from_hq_to_score_worth_exact_hosted_power": {
      const pts = source.powerCounters ?? 0;
      const candidates = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (candidates.length === 0) {
        log(state, `${source.title} — no agenda in HQ to add to score.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `lady-liberty:${id}`,
          label: `Add ${state.cards[id]!.title} worth ${pts} AP`,
          effect: {
            op: "do" as const,
            action: {
              kind: "add_hq_agenda_to_score_with_agenda_points" as const,
              cardId: id,
              agendaPoints: pts,
            },
          },
        })),
logLine: `${source.title} — add an HQ agenda worth ${pts} AP (hosted power).`,
});
      return { ok: true };
    }

case "add_hq_agenda_to_score_with_agenda_points": {
      const card = state.cards[action.cardId];
      if (
        !card ||
        card.type !== "agenda" ||
        !state.corp.hand.includes(action.cardId)
      ) {
        log(state, `Add HQ agenda to score — card not an HQ agenda.`);
        return { ok: true };
      }
      const pts = Math.max(0, action.agendaPoints);
      state.corp.hand = state.corp.hand.filter((id) => id !== action.cardId);
      state.corp.scoreArea.push(action.cardId);
      card.zone = "corp:score";
      card.faceup = true;
      card.rezzed = true;
      card.agendaPoints = pts;
      state.turn.agendaPointsScoredThisTurn += pts;
      log(
        state,
        `Add ${card.title} from HQ to Corp score area (${pts} AP).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }

case "add_power_counter_equal_to_last_access_trash_cost": {
      const n = Math.max(0, state.turn.lastAccessTrashCost ?? 0);
      if (n <= 0) {
        log(state, `${source.title} — trash cost 0; no power placed.`);
        return { ok: true };
      }
      source.powerCounters = (source.powerCounters ?? 0) + n;
      log(
        state,
        `${source.title} — place ${n} power (access trash cost) → ${source.powerCounters}.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
