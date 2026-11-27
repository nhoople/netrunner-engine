/**
 * Primitive kinds for clicks, playing operations and events, traces, psi games
 * and turn steps. The kind registry (`applyCoreKinds`) dispatches here.
 */
import { log } from "../../state/setupAndEnd/createGame.js";
import { type Effect } from "../ir/effect.js";
import { fx } from "../ir/fx.js";
import { type Primitive } from "../ir/primitive.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import { beginExtraDifferentAction } from "../../state/turnAndActions/corpActionHooks.js";
import { lookAtCards } from "../../state/visibility/reveal.js";
import {
  applyPrimitive,
  evalEffect,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { trashCard, controllerOf } from "../../state/hostingAndTrash/trash.js";
import {
  autoResolveTrace,
  startTrace,
} from "../../state/turnAndActions/trace.js";
import { dealDamage } from "../../state/damageAndPrevention/damage.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { effectiveIceStrength } from "../../cards/stubs.js";
import { enterLingeringPlayArea } from "../../state/zones.js";
import {
  fireOnPlay,
  noteCorpOperationPlayed,
} from "../../state/triggers/cardLifecycleHooks.js";
import { playEffectFromCard } from "../abilityRecord.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { placeCurrentAfterPlay } from "../../state/continuous/currents.js";
import { markAbilityUsed } from "../../state/turnAndActions/turn.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/runnerCredits.js";
import { random } from "../../state/rng.js";
import type { GameState } from "../../state/types/game.js";

/** Jeeves: first time spend ≥N clicks on same paid ability each turn → gain click. */
export function fireSiAfterPaidAbilityClicks(
  state: GameState,
  clicksSpent: number,
): void {
  if (clicksSpent < 1) return;
  if (state.turn.siJeevesGainClickUsedThisTurn) return;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const jeeves = state.cards[rid];
      if (!jeeves?.rezzed) continue;
      // A blanked Jeeves gives no click (CR 9.1.9a).
      if (abilitiesSuppressed(state, rid)) continue;
      const need = jeeves.gainClickFirstTimeSpendClicksGteOnSameActionEachTurn;
      if (typeof need !== "number" || clicksSpent < need) continue;
      state.corp.clicks += 1;
      state.turn.siJeevesGainClickUsedThisTurn = true;
      log(
        state,
        `${jeeves.title} — spent ${clicksSpent} [click] on one action; gain [click] → ${state.corp.clicks}.`,
      );
      return;
    }
  }
}

function lastAgendaAdvancementRequirement(state: EffectCtx["state"]): number {
  const id = state.turn.lastScoredOrStolenAgendaId;
  if (id) {
    const c = state.cards[id];
    if (c?.advancementRequirement != null) return c.advancementRequirement;
  }
  return 0;
}

export function applyTurnAndActionKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "skip_discard_this_turn": {
      state.turn.skipDiscardThisTurn = true;
      log(state, `Skip discard step this turn.`);
      return { ok: true };
    }

    case "turn_begin_continue": {
      if (action.remaining <= 0) return { ok: true };
      const used = new Set(action.used);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      const afterPick = (optId: string, effect: Effect): Effect => ({
        op: "seq",
        effects: [
          effect,
          {
            op: "do",
            action: {
              kind: "turn_begin_continue",
              remaining: action.remaining - 1,
              used: [...action.used, optId],
              mustPick: false,
            },
          },
        ],
      });
      if (!used.has("draw")) {
        options.push({
          id: "w2w-draw",
          label: "Draw 1 card",
          effect: afterPick("draw", {
            op: "do",
            action: { kind: "draw", side: "corp", amount: 1 },
          }),
        });
      }
      if (!used.has("credits")) {
        options.push({
          id: "w2w-credits",
          label: "Gain 1¢",
          effect: afterPick("credits", {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 1 },
          }),
        });
      }
      if (!used.has("adv")) {
        const iceIds: string[] = [];
        for (const server of Object.values(state.servers)) {
          for (const id of server.ice) {
            if (state.cards[id]?.type === "ice") iceIds.push(id);
          }
        }
        for (const iceId of iceIds) {
          options.push({
            id: `w2w-adv:${iceId}`,
            label: `Place 1 advancement on ${state.cards[iceId]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "place_adv_on_ice",
                cardId: iceId,
                remaining: action.remaining - 1,
                used: [...action.used, "adv"],
                mustPick: false,
              },
            },
          });
        }
      }
      if (!used.has("hq")) {
        options.push({
          id: "w2w-hq",
          label: `Add ${source.title} to HQ`,
          effect: {
            op: "do",
            action: { kind: "return_source_to_hq" },
          },
        });
      }
      if (!action.mustPick) {
        options.push({
          id: "w2w-done",
          label: "Done",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        });
      }
      if (options.length === 0) return { ok: true };
      // Exactly-1 mandatory with only one live option: auto-resolve if single
      // non-ice choice; ice still needs a pick among ice ids.
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — resolve ${action.mustPick ? "1" : `up to ${action.remaining}`} option(s).`,
      });
      return { ok: true };
    }

    case "allotted_clicks_next_turn": {
      if (action.side === "runner") {
        state.runnerAllottedClicksDeltaNextTurn =
          (state.runnerAllottedClicksDeltaNextTurn ?? 0) + action.delta;
        log(
          state,
          `Runner allotted clicks next turn ${action.delta >= 0 ? "+" : ""}${action.delta} → pending ${state.runnerAllottedClicksDeltaNextTurn} (CR ${CR.runnerAllottedClicks.number}).`,
        );
        return { ok: true };
      }
      if (action.side === "corp") {
        state.corpAllottedClicksDeltaNextTurn =
          (state.corpAllottedClicksDeltaNextTurn ?? 0) + action.delta;
        log(
          state,
          `Corp allotted clicks next turn ${action.delta >= 0 ? "+" : ""}${action.delta} → pending ${state.corpAllottedClicksDeltaNextTurn} (CR ${CR.corpAllottedClicks.number}).`,
        );
        return { ok: true };
      }
      return {
        ok: false,
        error: "allotted_clicks_next_turn requires corp or runner side.",
        cites: [CR.runnerAllottedClicks],
      };
    }

    case "take_different_action_paying_click_less": {
      beginExtraDifferentAction(state, sourceId);
      return { ok: true };
    }

    case "accelerated_diagnostics": {
      // "Look at the top 3 cards of R&D. If any of those cards are
      // operations, you may play them (paying their play cost), ignoring any
      // additional costs. Trash the rest of the unplayed cards you looked at."
      let looked: string[];
      if (!action.cardIds) {
        // Deck top is index 0 (commitDraw shifts).
        looked = state.corp.deck.splice(0, 3);
        // Only the Corp looks (CR 1.21.2).
        lookAtCards(state, looked, sourceId, "corp");
      } else {
        looked = action.cardIds.filter(
          (id) =>
            state.cards[id]?.zone === "corp:rd" &&
            !state.corp.deck.includes(id),
        );
        // Still being looked at while the card resolves (CR 1.21.6).
        for (const id of looked) state.cards[id]!.lookedBy = "corp";
      }
      if (action.playId && looked.includes(action.playId)) {
        const id = action.playId;
        const card = state.cards[id]!;
        log(
          state,
          `Accelerated Diagnostics — play ${card.title}, ignoring additional costs.`,
        );
        state.corp.hand.push(id);
        card.zone = "corp:hq";
        card.faceup = false;
        delete card.lookedBy;
        return applyPrimitive(ctx, {
          kind: "play_hq_operation_paying_costs",
          cardId: id,
        });
      }
      // The Corp plays the operations one at a time, choosing each and
      // whether to play any more (CR 8.6.3, CR 1.14.5).
      const playable = looked.filter((id) => {
        const card = state.cards[id]!;
        return (
          card.type === "operation" &&
          state.corp.credits >= (card.playCost ?? 0)
        );
      });
      if (playable.length === 0 || action.done) {
        // A card the Corp did not play was never seen by the Runner, so it
        // goes to Archives facedown (CR 4.4.6b).
        for (const id of looked) trashCard(state, id, { by: "corp" });
        if (looked.length > 0) {
          log(
            state,
            `Accelerated Diagnostics — trash ${looked.length} looked-at card(s).`,
          );
        }
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...playable.map((id) => {
            const rest = looked.filter((other) => other !== id);
            return {
              id: `play-looked:${id}`,
              label: `Play ${state.cards[id]!.title} (${state.cards[id]!.playCost ?? 0}¢)`,
              effect: fx.seq(
                fx.do({
                  kind: "accelerated_diagnostics",
                  cardIds: looked,
                  playId: id,
                }),
                fx.do({ kind: "accelerated_diagnostics", cardIds: rest }),
              ),
            };
          }),
          {
            id: "play-looked:none",
            label: "Play no more of them",
            effect: fx.do({
              kind: "accelerated_diagnostics",
              cardIds: looked,
              done: true,
            }),
          },
        ],
        logLine: `Accelerated Diagnostics — the Corp may play an operation it looked at.`,
      });
      return { ok: true };
    }

    case "wall_to_wall_turn_begin": {
      let otherRezzedAsset = false;
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          if (id === sourceId) continue;
          const c = state.cards[id];
          if (c?.type === "asset" && c.rezzed) {
            otherRezzedAsset = true;
            break;
          }
        }
        if (otherRezzedAsset) break;
      }
      return applyPrimitive(ctx, {
        kind: "turn_begin_continue",
        remaining: otherRezzedAsset ? 1 : 3,
        used: [],
        mustPick: otherRezzedAsset,
      });
    }
    case "trace_troll_encounter": {
      const r = autoResolveTrace(
        state,
        sourceId,
        2,
        fx.do({ kind: "trace_troll_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_troll_success": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "troll-lose-click",
            label: "Lose [click]",
            effect: fx.do({
              kind: "lose_clicks",
              side: "runner",
              amount: 1,
            }),
          },
          {
            id: "troll-etr",
            label: "End the run",
            effect: fx.do({ kind: "end_the_run" }),
          },
        ],
      });
      return { ok: true };
    }
    case "trace_virgo_subroutine": {
      // "If successful, give the Runner 1 tag. If your trace strength is 5
      // or greater, give the Runner 1 tag": the second part does not need a
      // successful trace (CR 10.8.5). Tags go through the tag procedure, so
      // the Runner can avoid them (CR 9.9.6a).
      const tag = fx.do({ kind: "give_tags", amount: 1 });
      const kick = fx.do({
        kind: "resolve_if_trace_strength_at_least",
        min: 5,
        then: tag,
      });
      const r = autoResolveTrace(state, sourceId, 2, fx.seq(tag, kick), kick);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_self_destruct_success": {
      dealDamage(state, "net", 3, sourceId);
      return { ok: true };
    }
    case "trace_strength_equal_source_strength": {
      const definingAbilityInactive =
        !source?.rezzed ||
        source.zone === "corp:archives" ||
        abilitiesSuppressed(state, sourceId);
      const strength = definingAbilityInactive
        ? 0
        : effectiveIceStrength(state, sourceId);
      if (definingAbilityInactive) {
        log(
          state,
          `${source?.title ?? sourceId} — X is 0 (CR ${CR.valueDefinedByX.number}).`,
        );
      }
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "trace",
          strength,
          onSuccess:
            action.onSuccess ??
            fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          ...(action.onFailure ? { onFailure: action.onFailure } : {}),
        },
      });
    }

    case "play_event_from_heap": {
      const events = state.runner.discardPile.filter(
        (id) => state.cards[id]?.type === "event",
      );
      if (events.length === 0) {
        log(state, `The Shadow Net — no events in heap.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: events.map((id) => ({
          id: `play:${id}`,
          label: `Play ${state.cards[id]!.title} (ignore costs)`,
          effect: fx.do({
            kind: "resolve_the_shadow_net_play",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "resolve_the_shadow_net_play": {
      const cardId = action.cardId;
      if (!cardId) return { ok: true };
      const card = state.cards[cardId];
      if (!card || card.type !== "event") return { ok: true };
      // Remove from heap and fire onPlay ignoring costs
      state.runner.discardPile = state.runner.discardPile.filter(
        (id) => id !== cardId,
      );
      enterLingeringPlayArea(state, cardId, "runner");
      fireOnPlay(state, cardId);
      // Events go to heap after play unless otherwise stated
      trashCard(state, cardId, { by: controllerOf(state, sourceId) });
      log(state, `The Shadow Net — play ${card.title} from heap.`);
      return { ok: true };
    }

    case "corp_additional_click_next_turn": {
      state.corpAllottedClicksDeltaNextTurn =
        (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
      log(
        state,
        `Nightdancer — Corp +1 click next turn (pending ${state.corpAllottedClicksDeltaNextTurn}).`,
      );
      return { ok: true };
    }
    case "trace_strength_equal_source_advancements": {
      const strength = source?.advancementCounters ?? 0;
      const onSuccess =
        (action as { onSuccess?: Effect }).onSuccess ??
        fx.gainCredits("corp", 0);
      const r = autoResolveTrace(state, sourceId, strength, onSuccess);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }

    case "cotc_white_hat": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "do-trace",
            label: "Resolve Trace[3]",
            effect: {
              op: "do",
              action: {
                kind: "trace",
                strength: 3,
                onSuccess: fx.do({
                  kind: "gain_credits",
                  side: "corp",
                  amount: 0,
                }),
                onFailure: fx.do({ kind: "reveal_white_hat" }),
              },
            },
          },
        ],
      });
      return { ok: true };
    }

    case "trace_white_hat": {
      return applyTurnAndActionKinds(ctx, { kind: "cotc_white_hat" });
    }

    case "trace_kuwinda": {
      const x = source?.powerCounters ?? 0;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "kuwinda-trace",
            label: `Trace[${x}]`,
            effect: {
              op: "do",
              action: {
                kind: "trace",
                strength: x,
                onSuccess: fx.seq(
                  fx.do({ kind: "core_damage", amount: 1 }),
                  fx.do({ kind: "trash_self" }),
                ),
                onFailure: fx.do({ kind: "add_power_counter", amount: 1 }),
              },
            },
          },
        ],
      });
      return { ok: true };
    }
    case "play_current_from_hq_or_archives": {
      const cands = [
        ...new Set([...state.corp.hand, ...state.corp.discardPile]),
      ].filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "operation" && (c.subtypes ?? []).includes("current")
        );
      });
      if (cands.length === 0) {
        log(state, `${source?.title ?? "Sol"} — no current to play.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => {
          const card = state.cards[id]!;
          const play: Effect[] = [
            fx.do({ kind: "play_current_card", cardId: id }),
          ];
          const playFx = playEffectFromCard(card);
          if (playFx) play.push(playFx);
          return {
            id: `play-current:${id}`,
            label: `Play ${card.title}`,
            effect: play.length === 1 ? play[0]! : fx.seq(...play),
          };
        }),
      });
      return { ok: true };
    }

    case "play_current_card": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const cost = card.playCost ?? 0;
      if (state.corp.credits < cost) {
        log(state, `Cannot afford ${card.title} (${cost}¢).`);
        return { ok: true };
      }
      state.corp.credits -= cost;
      removeCardFromCurrentZone(state, action.cardId);
      placeCurrentAfterPlay(state, action.cardId, "corp");
      log(state, `Play current ${card.title} for ${cost}¢.`);
      return { ok: true };
    }

    case "trace_bypass_or_tag_etr": {
      // Security Nexus: the Runner chose to use the ability (CR 9.1.6b,
      // 9.3.6g). The trace is a full attempt: the Corp spends, then the
      // Runner (CR 10.8.6c–d). The encounter's pending abilities wait for it.
      markAbilityUsed(state, sourceId, "security-nexus-trace");
      startTrace(
        state,
        sourceId,
        5,
        fx.seq(
          fx.do({ kind: "give_tags", amount: 1 }),
          fx.do({ kind: "end_the_run" }),
        ),
        fx.do({ kind: "bypass_encountered_ice" }),
      );
      return { ok: true };
    }
    case "schedule_additional_runner_turn": {
      state.pendingExtraRunnerTurns = (state.pendingExtraRunnerTurns ?? 0) + 1;
      log(state, `Encore — take an additional turn after this one.`);
      return { ok: true };
    }

    case "play_archives_transaction": {
      const txs = state.corp.discardPile.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "operation" && (c.subtypes ?? []).includes("transaction")
        );
      });
      if (txs.length === 0) {
        log(state, `Bryan Stinson — no transaction in Archives.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: txs.map((id) => ({
          id: `bryan-tx:${id}`,
          label: `Play ${state.cards[id]!.title} ignoring costs (RFG)`,
          effect: fx.do({
            kind: "play_archives_transaction_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "play_archives_transaction_resolve": {
      const cardId = action.cardId;
      const card = cardId ? state.cards[cardId] : undefined;
      if (!card || !state.corp.discardPile.includes(cardId!)) {
        log(state, `Bryan Stinson — transaction not in Archives.`);
        return { ok: true };
      }
      // Play ignoring costs: fire onPlay then RFG.
      removeCardFromCurrentZone(state, cardId!);
      fireOnPlay(state, cardId!);
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame) state.removedFromGame = [];
      state.removedFromGame.push(cardId!);
      log(
        state,
        `Bryan Stinson — play ${card.title} from Archives ignoring costs; RFG.`,
      );
      return { ok: true };
    }
    case "spend_click_additional_cost": {
      // A cost that cannot be paid in full is not paid (CR 1.16.1a).
      const player = action.side === "runner" ? state.runner : state.corp;
      const title = state.cards[ctx.sourceId]?.title ?? ctx.sourceId;
      if ((player.clicks ?? 0) < 1) {
        return {
          ok: false,
          error: `Cannot spend [click] for ${title}.`,
          cites: [CR.spendClicks],
        };
      }
      player.clicks -= 1;
      log(
        state,
        `${title} — spend 1 [click] (additional cost, CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    case "lose_tempus_clicks": {
      const lose = Math.min(2, state.runner.clicks);
      state.runner.clicks -= lose;
      log(
        state,
        `Tempus — Runner loses ${lose} click(s) → ${state.runner.clicks}.`,
      );
      return { ok: true };
    }

    case "trace_amani": {
      const x = lastAgendaAdvancementRequirement(state);
      log(state, `Amani Senai — Trace[${x}].`);
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "trace",
          strength: x,
          onSuccess: fx.do({ kind: "tdatd_amani_bounce" }),
        },
      });
    }
    case "lose_remaining_clicks": {
      const lost = state.runner.clicks;
      state.runner.clicks = 0;
      log(state, `Logic Bomb — lose ${lost} remaining click(s).`);
      return { ok: true };
    }
    case "play_ops_from_hq": {
      const max = action.max ?? 2;
      const ops = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `Subcontract — no operations in HQ.`);
        return { ok: true };
      }
      state.turn.ftmSubcontractRemaining = max;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...ops.map((id) => ({
            id: `subcontract-play:${id}`,
            label: `Play ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "play_op_resolve",
              cardId: id,
            }),
          })),
          {
            id: "subcontract-done",
            label: "Done playing operations",
            effect: fx.gainCredits("corp", 0),
          },
        ],
      });
      return { ok: true };
    }

    case "play_op_resolve":
      return { ok: true };
    case "trace_sagittarius_subroutine": {
      // "If successful, trash 1 program. If your trace strength is 5 or
      // greater, trash 1 program": the second part does not need a
      // successful trace (CR 10.8.5). Each trash waits for the one before.
      const trash = fx.do({ kind: "trash_program", pick: "choose" });
      const kick = fx.do({
        kind: "resolve_if_trace_strength_at_least",
        min: 5,
        then: trash,
      });
      const r = autoResolveTrace(state, sourceId, 2, fx.seq(trash, kick), kick);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "resolve_if_trace_strength_at_least": {
      if ((state.turn.lastResolvedTraceStrength ?? 0) < action.min) {
        return { ok: true };
      }
      log(
        state,
        `${state.cards[sourceId]?.title ?? sourceId} — trace strength is ${action.min} or greater (CR ${CR.traceConditionals.number}).`,
      );
      return evalEffect(ctx, action.then);
    }
    case "trace_subroutine": {
      const whenDetermined = fx.do({ kind: "trace_when_determined" });
      const r = autoResolveTrace(
        state,
        sourceId,
        2,
        fx.seq(fx.do({ kind: "trace_success" }), whenDetermined),
        whenDetermined,
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_success": {
      dealDamage(state, "net", 1, sourceId);
      return { ok: true };
    }
    case "trace_when_determined": {
      if ((state.turn.lastResolvedTraceStrength ?? 0) >= 5) {
        log(
          state,
          `${state.cards[sourceId]?.title ?? sourceId} — trace strength is 5 or greater (CR ${CR.traceConditionals.number}).`,
        );
        dealDamage(state, "net", 1, sourceId);
      }
      return { ok: true };
    }
    case "snatch_and_grab_on_play": {
      const r = autoResolveTrace(
        state,
        sourceId,
        3,
        fx.do({ kind: "trace_snatch_and_grab_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_snatch_and_grab_success": {
      const connections = state.runner.installed.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("connection"),
      );
      if (connections.length === 0) {
        log(state, `Snatch and Grab — no connection to trash.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: connections.map((id) => ({
          id: `snatch-pick:${id}`,
          label: `Trash ${state.cards[id]!.title} (Runner may take 1 tag to prevent)`,
          effect: fx.do({
            kind: "offer_prevent",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "psi_differ_redirect": {
      const current = state.run?.attackedServerId;
      const servers = Object.values(state.servers).filter(
        (s) => s.id !== current,
      );
      if (servers.length === 0 || !state.run) {
        log(state, `Mind Game — no other server.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: servers.map((s) => ({
          id: `mind:${s.id}`,
          label: `Move run to ${s.id}`,
          effect: fx.do({
            kind: "redirect_resolve",
            serverId: s.id,
          }),
        })),
      });
      return { ok: true };
    }
    case "play_run_event_from_stack": {
      const cands = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return c?.type === "event" && (c.subtypes ?? []).includes("run");
      });
      if (cands.length === 0) {
        log(state, `Planned Assault — no run events in stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `pa:${id}`,
          label: `Play ${state.cards[id]!.title} ignoring cost`,
          effect: fx.do({ kind: "play_heap_event_ignore_cost", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "play_heap_event_ignore_cost": {
      // Planned Assault leaf: play the chosen run event from stack, paying its
      // play cost (additional costs ignored), then shuffle (CR 1.2.1).
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const idx = state.runner.deck.indexOf(cardId);
      if (!card || idx < 0) return { ok: true };
      const cost = card.playCost ?? 0;
      if (state.runner.credits < cost) {
        log(state, `Cannot afford ${card.title} (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.deck.splice(idx, 1);
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [state.runner.deck[i], state.runner.deck[j]] = [
          state.runner.deck[j]!,
          state.runner.deck[i]!,
        ];
      }
      card.zone = "runner:play-area";
      card.faceup = true;
      log(
        state,
        `Planned Assault — play ${card.title} from stack for ${cost}¢; shuffle stack.`,
      );
      fireOnPlay(state, cardId);
      return { ok: true };
    }
    case "trace_prevent_bad_publicity": {
      // Printed: Trace[3]; if successful, prevent all of that bad publicity
      // (CR 1.2.1).
      const amount = state.turn.pendingBadPublicityTake ?? 1;
      const noop: Effect = {
        op: "do",
        action: { kind: "gain_credits", side: "corp", amount: 0 },
      };
      startTrace(
        state,
        sourceId,
        3,
        noop,
        fx.do({ kind: "suffer_bad_publicity", amount }),
      );
      log(
        state,
        `Broadcast Square — trace (base 3) instead of bad publicity; BP only if trace fails.`,
      );
      return { ok: true };
    }

    case "play_resolve": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.deck.includes(cardId)) {
        log(state, `Consulting Visit — operation no longer in R&D.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== cardId);
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      enterLingeringPlayArea(state, cardId, "corp");
      noteCorpOperationPlayed(state, cardId);
      log(state, `Consulting Visit — play ${card.title} from R&D.`);
      const playFx = playEffectFromCard(card);
      if (playFx) {
        openPendingChoose(state, {
          sourceId: cardId,
          chooser: "corp",
          options: [
            {
              id: "resolve-op",
              label: `Resolve ${card.title}`,
              effect: playFx,
            },
          ],
        });
      }
      return { ok: true };
    }
    case "trace_taurus_subroutine": {
      // "If successful, trash 1 piece of hardware. If your trace strength is
      // 5 or greater, trash 1 piece of hardware": the second part does not
      // need a successful trace (CR 10.8.5), and waits for the first.
      const trash = fx.do({ kind: "trash_hardware", pick: "choose" });
      const kick = fx.do({
        kind: "resolve_if_trace_strength_at_least",
        min: 5,
        then: trash,
      });
      const r = autoResolveTrace(state, sourceId, 2, fx.seq(trash, kick), kick);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    default:
      return null;
  }
}
