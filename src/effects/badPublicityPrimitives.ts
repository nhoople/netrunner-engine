/**
 * Bad publicity on the Corp and hosted on a card.
 * Choices that spend bad publicity for another effect stay in eval.ts.
 */
import { log } from "../state/createGame.js";
import { fireFirstBadPublicityTake } from "../state/badPublicityHooks.js";
import { checkWinConditions } from "../state/scoring.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { abilityCreditTally } from "./creditTally.js";
import type { Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

export function applyBadPublicityPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "may_host_bad_publicity_then": {
      const amount = action.amount;
      const have = state.corp.badPublicity ?? 0;
      if (have < amount) {
        log(state, `${source.title} — may host BP (have ${have} < ${amount}).`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "host-bp",
            label: `Host ${amount} bad publicity; gain 3¢ and draw 1`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: { kind: "host_bad_publicity" as const, amount },
                },
                action.then,
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
      log(state, `${source.title} — may host ${amount} bad publicity.`);
      return { ok: true };
    }
    case "host_bad_publicity": {
      const take = Math.min(action.amount, state.corp.badPublicity ?? 0);
      if (take <= 0) return { ok: true };
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) - take;
      source.badPublicityCounters = (source.badPublicityCounters ?? 0) + take;
      log(
        state,
        `Host ${take} bad publicity on ${source.title} → hosted ${source.badPublicityCounters}; player BP ${state.corp.badPublicity}.`,
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
      fireFirstBadPublicityTake(state, take);
      checkWinConditions(state);
      return { ok: true };
    }
    case "give_bad_publicity": {
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + action.amount;
      log(
        state,
        `Corp takes ${action.amount} bad publicity → ${state.corp.badPublicity}.`,
      );
      fireFirstBadPublicityTake(state, action.amount);
      return { ok: true };
    }
    case "remove_bad_publicity": {
      let amount = action.amount;
      if (action.tally) {
        const tallied = abilityCreditTally(state, sourceId, action.tally);
        // A summed value of 0 or less does not happen (CR 9.12.2b).
        if (tallied.amount <= 0) return { ok: true };
        amount = tallied.amount;
      }
      const removed = Math.min(amount, state.corp.badPublicity ?? 0);
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) - removed;
      log(
        state,
        `Corp removes ${removed} bad publicity → ${state.corp.badPublicity}.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
