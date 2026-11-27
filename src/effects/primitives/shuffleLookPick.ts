import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { fireOnAgendaAddedToRunnerScore } from "../../state/hostingAndTrash/trashHooks.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import type { Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { shuffleInPlace } from "../../state/rng.js";
import { unhostCard } from "../../state/hostingAndTrash/host.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanOhPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;

  switch (action.kind) {
    case "shuffle_n_heap_cards_into_stack_per_power_counter": {
      // Snapshot power from RFG'd source or lingering counters.
      const n = Math.max(0, source.powerCounters ?? 0);
      if (n <= 0 || state.runner.discardPile.length === 0) {
        log(state, `${source.title} — no heap cards to shuffle.`);
        return { ok: true };
      }
      const heap = [...state.runner.discardPile];
      if (heap.length <= n) {
        for (const id of heap) {
          state.runner.discardPile = state.runner.discardPile.filter(
            (x) => x !== id,
          );
          const c = state.cards[id]!;
          c.zone = "runner:stack";
          c.faceup = false;
          state.runner.deck.push(id);
        }
        shuffleInPlace(state, state.runner.deck);
        log(
          state,
          `${source.title} — shuffle all ${heap.length} heap card(s) into stack.`,
        );
        return { ok: true };
      }
      state.turn.ohTropeShuffleRemaining = n;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: heap.map((cardId) => ({
          id: `trope-shuffle:${cardId}`,
          label: `Shuffle ${state.cards[cardId]!.title} into stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_trope_pick" as const,
              cardId,
            },
          },
        })),
        logLine: `${source.title} — choose ${n} heap card(s) to shuffle.`,
      });
      return { ok: true };
    }

    case "shuffle_trope_pick": {
      const cardId = action.cardId;
      const remaining = state.turn.ohTropeShuffleRemaining ?? 0;
      if (!state.runner.discardPile.includes(cardId) || remaining <= 0) {
        log(state, `Trope — invalid shuffle pick.`);
        return { ok: true };
      }
      state.runner.discardPile = state.runner.discardPile.filter(
        (id) => id !== cardId,
      );
      const c = state.cards[cardId]!;
      c.zone = "runner:stack";
      c.faceup = false;
      state.runner.deck.push(cardId);
      state.turn.ohTropeShuffleRemaining = remaining - 1;
      log(state, `Trope — shuffle ${c.title} into stack.`);
      if ((state.turn.ohTropeShuffleRemaining ?? 0) <= 0) {
        shuffleInPlace(state, state.runner.deck);
        state.turn.ohTropeShuffleRemaining = undefined;
        return { ok: true };
      }
      const heap = [...state.runner.discardPile];
      if (heap.length === 0) {
        shuffleInPlace(state, state.runner.deck);
        state.turn.ohTropeShuffleRemaining = undefined;
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: heap.map((id) => ({
          id: `trope-shuffle:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_trope_pick" as const,
              cardId: id,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "pick_stack_arrange": {
      const cardId = action.cardId;
      const looked = state.turn.ohStackLookedCards ?? [];
      const idx = looked.indexOf(cardId);
      if (idx < 0) {
        log(state, `Arrange stack — card not in look zone.`);
        return { ok: true };
      }
      looked.splice(idx, 1);
      state.turn.ohStackLookedCards = looked;
      const placed = state.turn.ohStackArrangePlaced ?? [];
      placed.push(cardId);
      state.turn.ohStackArrangePlaced = placed;
      return offerStackArrangeChoice(ctx);
    }

    case "an_offer_you_cant_refuse": {
      const centrals: ServerId[] = ["hq", "rd", "archives"];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: centrals.map((serverId) => ({
          id: `offer-central:${serverId}`,
          label: `Choose ${serverId.toUpperCase()}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "offer_central_chosen" as const,
              serverId,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "offer_central_chosen": {
      const serverId = action.serverId as ServerId;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "offer-run",
            label: `Run ${serverId.toUpperCase()} (cannot jack out)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "offer_start_run" as const,
                serverId,
              },
            },
          },
          {
            id: "offer-decline",
            label: "Decline — Corp scores An Offer as 1-point agenda",
            effect: {
              op: "do" as const,
              action: {
                kind: "add_to_corp_score_as_agenda" as const,
                agendaPoints: 1,
              },
            },
          },
        ],
      });
      return { ok: true };
    }

    case "offer_start_run": {
      const serverId = action.serverId as ServerId;
      state.pendingStartRun = {
        sourceId,
        serverId,
      };
      state.turn.ohForcedRunCannotJackOut = true;
      log(state, `An Offer — Runner runs ${serverId} (cannot jack out).`);
      return { ok: true };
    }

    case "add_hosted_agenda_to_runner_score": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted agenda.`);
        return { ok: true };
      }
      const agendaId = hosted[0]!;
      const agenda = state.cards[agendaId]!;
      unhostCard(state, agenda.id);
      removeCardFromCurrentZone(state, agendaId);
      state.runner.scoreArea.push(agendaId);
      agenda.zone = "runner:score";
      agenda.faceup = true;
      agenda.rezzed = true;
      log(
        state,
        `${source.title} — add hosted ${agenda.title} to Runner score.`,
      );
      fireOnAgendaAddedToRunnerScore(state);
      return { ok: true };
    }

    default:
      return null;
  }
}

export function offerStackArrangeChoice(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const looked = state.turn.ohStackLookedCards ?? [];
  if (looked.length === 0) {
    // Place arranged cards back on top in reverse pick order (last pick = top).
    const placed = state.turn.ohStackArrangePlaced ?? [];
    for (let i = placed.length - 1; i >= 0; i--) {
      const id = placed[i]!;
      state.cards[id]!.faceup = false;
      state.cards[id]!.zone = "runner:stack";
      state.runner.deck.unshift(id);
    }
    state.turn.ohStackLookedCards = undefined;
    state.turn.ohStackArrangePlaced = undefined;
    log(state, `Arrange stack — ${placed.length} card(s) replaced.`);
    return { ok: true };
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: looked.map((cardId) => ({
      id: `stack-arr:${cardId}`,
      label: `Place ${state.cards[cardId]!.title} (next from top)`,
      effect: {
        op: "do" as const,
        action: {
          kind: "pick_stack_arrange" as const,
          cardId,
        },
      },
    })),
  });
  return { ok: true };
}
