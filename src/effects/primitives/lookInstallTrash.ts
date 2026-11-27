import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import type { RuleCite } from "../../state/types.js";
import { grantAbilityCredits, type EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpointInPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "shuffle_one_grip_into_stack": {
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `Blockade Runner — grip empty; nothing to shuffle.`);
        return { ok: true };
      }
      if (grip.length === 1) {
        const cardId = grip[0]!;
        state.runner.hand = [];
        const insertAt = Math.floor(
          random(state) * (state.runner.deck.length + 1),
        );
        state.runner.deck.splice(insertAt, 0, cardId);
        state.cards[cardId]!.zone = "runner:stack";
        log(state, `Shuffle ${state.cards[cardId]!.title} into stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `shuffle-grip:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into stack`,
          effect: fx.do({
            kind: "shuffle_grip_card_into_stack",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "add_n_hq_to_top_rd": {
      const amount = Math.max(0, action.amount ?? 3);
      const remaining = Math.min(amount, state.corp.hand.length);
      if (remaining <= 0) {
        log(state, `Hasty Relocation — HQ empty; nothing to add.`);
        return { ok: true };
      }
      return applyFlashpointInPrimitive(ctx, {
        kind: "add_n_hq_to_top_rd_continue",
        remaining,
      });
    }

    case "add_n_hq_to_top_rd_continue": {
      const remaining = action.remaining ?? 0;
      if (remaining <= 0 || state.corp.hand.length === 0) {
        return { ok: true };
      }
      // Only one card left in HQ: nothing to choose. Otherwise the Corp
      // picks each card, the last one included (CR 1.15.2).
      if (state.corp.hand.length === 1) {
        const id = state.corp.hand[0]!;
        removeCardFromCurrentZone(state, id);
        state.corp.deck.unshift(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
        log(state, `${state.cards[id]!.title} moved from HQ to top of R&D.`);
        if (remaining > 1) {
          return applyFlashpointInPrimitive(ctx, {
            kind: "add_n_hq_to_top_rd_continue",
            remaining: remaining - 1,
          });
        }
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `hq-top:${id}`,
          label: `Top R&D: ${state.cards[id]!.title}`,
          effect: {
            op: "seq" as const,
            effects: [
              fx.do({ kind: "hq_card_to_top_rd", cardId: id }),
              fx.do({
                kind: "add_n_hq_to_top_rd_continue",
                remaining: remaining - 1,
              }),
            ],
          },
        })),
      });
      return { ok: true };
    }

    case "gain_credits_if_runner_has_installed_subtype": {
      const subtype = (action.subtype ?? "ai").toLowerCase();
      const amount = action.amount ?? 2;
      const side = action.side ?? "corp";
      const has = state.runner.installed.some((id) =>
        (state.cards[id]?.subtypes ?? [])
          .map((s) => s.toLowerCase())
          .includes(subtype),
      );
      if (!has) {
        log(
          state,
          `${source?.title ?? "Bulwark"} — no installed ${subtype} program.`,
        );
        return { ok: true };
      }
      return grantAbilityCredits(ctx, side, amount);
    }

    default:
      return null;
  }
}
