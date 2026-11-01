/**
 * Primitive kinds whose procedure is gain.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type { Primitive } from "../ir.js";
import { log } from "../../state/createGame.js";
import { addBreakerStrengthBoostThisTurn } from "../../state/lingeringEffects.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { grantAbilityCredits } from "../eval.js";
import { breakerStrength } from "../iceStrength.js";

export function applyGainKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "gain_credits_per_distinct_faceup_archive_type": {
      const types = new Set<string>();
      for (const id of state.corp.discardPile) {
        const c = state.cards[id];
        if (c?.faceup) types.add(c.type);
      }
      let gained = types.size;
      if (types.has("agenda")) gained += 2;
      return grantAbilityCredits(ctx, "corp", gained);
    }

case "gain_strength_this_turn": {
      const boostId = action.targetCardId ?? sourceId;
      const boostCard = state.cards[boostId] ?? source;
      addBreakerStrengthBoostThisTurn(state, {
        createdBy: sourceId,
        breakerId: boostId,
        amount: action.amount,
      });
      log(
        state,
        `${boostCard.title} +${action.amount} strength this turn → ${breakerStrength(state, boostId)}.`,
      );
      return { ok: true };
    }

case "gain_lycian_subtype": {
      const subtype = action.subtype;
      if (!(source.subtypes ?? []).includes(subtype)) {
        source.subtypes = [...(source.subtypes ?? []), subtype];
      }
      if (!source.lycianGainedSubtypes) source.lycianGainedSubtypes = [];
      if (!source.lycianGainedSubtypes.includes(subtype)) {
        source.lycianGainedSubtypes.push(subtype);
      }
      log(state, `${source.title} gains ${subtype} while rezzed.`);
      const remaining = action.remaining ?? [];
      if (remaining.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "lycian-done",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...remaining.map((s) => ({
            id: `lycian:${s}`,
            label: `Gain ${s}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_lycian_subtype" as const,
                subtype: s,
                remaining: remaining.filter((x) => x !== s),
              },
            },
          })),
        ],
      });
      return { ok: true };
    }

case "may_gain_click_then_tag_at_turn_end": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "gain-click",
            label: "Gain [click] (take 1 tag at turn end)",
            effect: {
              op: "do",
              action: { kind: "gain_joshua_click_tag_at_turn_end" },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
        ],
logLine: `${source.title} — may gain [click] (tag at turn end if you do).`,
});
      return { ok: true };
    }

case "gain_joshua_click_tag_at_turn_end": {
      state.runner.clicks += 1;
      state.turn.delayedTurnEndTags.push({
        sourceId,
        title: source.title,
      });
      log(
        state,
        `${source.title} — gain [click] → ${state.runner.clicks} (take 1 tag at turn end).`,
      );
      return { ok: true };
    }

case "gain_credits_from_ice_advancements": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `gain_credits_from_ice_advancements — invalid ice.`);
        return { ok: true };
      }
      const n = ice.advancementCounters ?? 0;
      return grantAbilityCredits(ctx, "corp", n);
    }

case "gain_one_subtype_until_derez": {
      const subtype = action.subtype;
      if (!(source.subtypes ?? []).includes(subtype)) {
        source.subtypes = [...(source.subtypes ?? []), subtype];
      }
      if (!source.lycianGainedSubtypes) source.lycianGainedSubtypes = [];
      if (!source.lycianGainedSubtypes.includes(subtype)) {
        source.lycianGainedSubtypes.push(subtype);
      }
      log(state, `${source.title} gains ${subtype} until derezzed.`);
      return { ok: true };
    }

case "gain_credits_equal_to_rd_accesses_this_run": {
      const n = state.run?.accessedCardIds?.length ?? 0;
      if (n <= 0) {
        log(state, `${source.title} — no R&D accesses this run.`);
        return { ok: true };
      }
      return grantAbilityCredits(ctx, "runner", n);
    }
    default:
      return null;
  }
}
