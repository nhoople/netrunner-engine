import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarTsbPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "score_encrypted_portals_on": {
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const ice = state.cards[id];
          if (ice?.rezzed && (ice.subtypes ?? []).includes("code gate")) n += 1;
        }
      }
      if (n > 0) {
        state.corp.credits += n;
        log(state, `Encrypted Portals — gain ${n}¢ for rezzed code gates.`);
      }
      return { ok: true };
    }
    case "sealed_vault_store_from_pool": {
      // Printed: move *any number* of credits from the pool to this asset.
      const pool = state.corp.credits;
      if (pool <= 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: Array.from({ length: pool }, (_, i) => i + 1).map((n) => ({
          id: `sealed-store:${n}`,
          label: `Store ${n}¢ on Sealed Vault`,
          effect: fx.do({ kind: "move_credits_to_sealed_vault", amount: n }),
        })),
      });
      return { ok: true };
    }
    case "move_credits_to_sealed_vault": {
      const card = state.cards[sourceId];
      const n = Math.min(action.amount ?? 0, state.corp.credits);
      if (!card || n <= 0) return { ok: true };
      state.corp.credits -= n;
      card.hostedCredits = (card.hostedCredits ?? 0) + n;
      log(state, `Sealed Vault — store ${n}¢ → ${card.hostedCredits}.`);
      return { ok: true };
    }
    case "take_to_pool": {
      // Printed: take *any number* of credits from this asset.
      const card = state.cards[sourceId];
      const hosted = card?.hostedCredits ?? 0;
      if (!card || hosted <= 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: Array.from({ length: hosted }, (_, i) => i + 1).map((n) => ({
          id: `sealed-take:${n}`,
          label: `Take ${n}¢ from Sealed Vault`,
          effect: fx.do({ kind: "move_credits_from_sealed_vault", amount: n }),
        })),
      });
      return { ok: true };
    }
    case "move_credits_from_sealed_vault": {
      const card = state.cards[sourceId];
      const n = Math.min(action.amount ?? 0, card?.hostedCredits ?? 0);
      if (!card || n <= 0) return { ok: true };
      card.hostedCredits = (card.hostedCredits ?? 0) - n;
      state.corp.credits += n;
      log(
        state,
        `Sealed Vault — take ${n}¢ to pool (${card.hostedCredits} hosted).`,
      );
      return { ok: true };
    }
    case "three_steps_ahead_payout": {
      // Per successful run, not per distinct server (printed text).
      const runs = state.turn.successfulRunCountThisTurn ?? 0;
      const gain = runs * 2;
      if (gain > 0) {
        state.runner.credits += gain;
        log(
          state,
          `Three Steps Ahead — gain ${gain}¢ (${runs} successful runs).`,
        );
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
