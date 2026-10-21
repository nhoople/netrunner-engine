/** The Spaces Between (tsb) Lunar pack primitives. */
import { log } from "../state/createGame.js";
import { autoResolveTrace } from "../state/trace.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarTsbPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "search_foundry_copy_to_hq": {
      if (state.turn.rdLookedCards.length > 0) {
        for (const id of [...state.turn.rdLookedCards]) {
          const card = state.cards[id];
          if (!card) continue;
          card.zone = "corp:rd";
          card.faceup = false;
          state.corp.deck.push(id);
        }
        state.turn.rdLookedCards = [];
        log(
          state,
          `Looked cards return to R&D and can no longer be acted on (CR ${CR.objectMoveLocation.number}).`,
        );
      }
      if ((state.turn.iceRezzedThisTurn ?? 0) !== 1) return { ok: true };
      const lastId = state.turn.rezzedThisTurnIds?.at(-1);
      if (!lastId) return { ok: true };
      const title = state.cards[lastId]?.title;
      if (!title) return { ok: true };
      const matches = state.corp.deck.filter(
        (id) => state.cards[id]?.title === title,
      );
      if (matches.length === 0) {
        log(state, `The Foundry — no copy of ${title} in R&D.`);
      } else {
        const pick = matches[0]!;
        state.corp.deck = state.corp.deck.filter((id) => id !== pick);
        state.cards[pick]!.faceup = true;
        state.corp.hand.push(pick);
        state.cards[pick]!.zone = "corp:hq";
        log(state, `The Foundry — reveal ${title} from R&D and add to HQ.`);
      }
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      return { ok: true };
    }
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
    case "name_card": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: Object.values(state.cards)
          .filter((c) => c.type !== "identity" && c.defId)
          .slice(0, 8)
          .map((c) => ({
            id: `tm:${c.defId!}`,
            label: `Name ${c.title}`,
            effect: fx.do({
              kind: "set_name",
              defId: c.defId!,
            }),
          })),
      };
      return { ok: true };
    }
    case "set_name": {
      const defId = (action as { defId: string }).defId;
      state.turn.targetedMarketingNamedDefId = defId;
      log(state, `Targeted Marketing — named ${defId}.`);
      return { ok: true };
    }
    case "information_overload_encounter": {
      const r = autoResolveTrace(
        state,
        sourceId,
        1,
        fx.do({ kind: "give_tags", amount: 1 }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trash_per_tag": {
      const tags = state.runner.tags;
      if (tags <= 0) {
        log(state, `Information Overload — Runner has no tags.`);
        return { ok: true };
      }
      const installed = [...state.runner.installed];
      if (installed.length === 0) return { ok: true };
      for (let i = 0; i < tags && installed.length > 0; i++) {
        const id = installed.pop()!;
        moveRunnerCardToHeap(state, id);
        log(state, `Information Overload — trash ${state.cards[id]!.title}.`);
      }
      return { ok: true };
    }
    case "sealed_vault_store_from_pool": {
      // Printed: move *any number* of credits from the pool to this asset.
      const pool = state.corp.credits;
      if (pool <= 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: Array.from({ length: pool }, (_, i) => i + 1).map((n) => ({
          id: `sealed-store:${n}`,
          label: `Store ${n}¢ on Sealed Vault`,
          effect: fx.do({ kind: "move_credits_to_sealed_vault", amount: n }),
        })),
      };
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
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: Array.from({ length: hosted }, (_, i) => i + 1).map((n) => ({
          id: `sealed-take:${n}`,
          label: `Take ${n}¢ from Sealed Vault`,
          effect: fx.do({ kind: "move_credits_from_sealed_vault", amount: n }),
        })),
      };
      return { ok: true };
    }
    case "move_credits_from_sealed_vault": {
      const card = state.cards[sourceId];
      const n = Math.min(action.amount ?? 0, card?.hostedCredits ?? 0);
      if (!card || n <= 0) return { ok: true };
      card.hostedCredits = (card.hostedCredits ?? 0) - n;
      state.corp.credits += n;
      log(state, `Sealed Vault — take ${n}¢ to pool (${card.hostedCredits} hosted).`);
      return { ok: true };
    }
    case "trash_will_o_wisp_breaker_used": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Do not trash Will-o'-the-Wisp",
            effect: fx.gainCredits("corp", 0),
          },
          {
            id: "trash",
            label: "Trash Will-o'-the-Wisp and trash a breaker used this run",
            effect: fx.do({ kind: "resolve_will_o_wisp" }),
          },
        ],
      };
      return { ok: true };
    }
    case "resolve_will_o_wisp": {
      const used = state.run?.breakersThatBroke ?? [];
      if (used.length === 0) {
        log(state, `Will-o'-the-Wisp — no breaker used.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, used[0]!);
      const up = state.cards[sourceId];
      if (up) {
        up.zone = "corp:archives";
        state.corp.discardPile.push(sourceId);
        log(state, `Will-o'-the-Wisp trashed; breaker trashed.`);
      }
      return { ok: true };
    }
    case "three_steps_ahead_payout": {
      // Per successful run, not per distinct server (printed text).
      const runs = state.turn.successfulRunCountThisTurn ?? 0;
      const gain = runs * 2;
      if (gain > 0) {
        state.runner.credits += gain;
        log(state, `Three Steps Ahead — gain ${gain}¢ (${runs} successful runs).`);
      }
      return { ok: true };
    }
    case "prevent_llds_trash_hardware": {
      log(state, `LLDS Energy Regulator — prevent trash (stub choice).`);
      return { ok: true };
    }
    default:
      return null;
  }
}
