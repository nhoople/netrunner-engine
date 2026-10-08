/** The Spaces Between (tsb) Lunar pack primitives. */
import { log } from "../state/createGame.js";
import { autoResolveTrace } from "../state/trace.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { RuleCite } from "../state/types.js";
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
    case "foundry_search_copy_to_hq": {
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
        return { ok: true };
      }
      const pick = matches[0]!;
      state.corp.deck = state.corp.deck.filter((id) => id !== pick);
      state.cards[pick]!.faceup = true;
      state.corp.hand.push(pick);
      state.cards[pick]!.zone = "corp:hq";
      log(state, `The Foundry — reveal ${title} from R&D and add to HQ.`);
      return { ok: true };
    }
    case "encrypted_portals_on_score": {
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
      const rig = [...state.runner.rig];
      if (rig.length === 0) return { ok: true };
      for (let i = 0; i < tags && rig.length > 0; i++) {
        const id = rig.pop()!;
        moveRunnerCardToHeap(state, id);
        log(state, `Information Overload — trash ${state.cards[id]!.title}.`);
      }
      return { ok: true };
    }
    case "sealed_vault_store_from_pool": {
      const card = state.cards[sourceId];
      const pool = state.corp.credits;
      if (pool <= 0) return { ok: true };
      state.corp.credits = 0;
      card!.hostedCredits = (card!.hostedCredits ?? 0) + pool;
      log(state, `Sealed Vault — store ${pool}¢ → ${card!.hostedCredits}.`);
      return { ok: true };
    }
    case "take_to_pool": {
      const card = state.cards[sourceId];
      const hosted = card?.hostedCredits ?? 0;
      if (hosted <= 0) return { ok: true };
      state.corp.credits += hosted;
      card!.hostedCredits = 0;
      log(state, `Sealed Vault — take ${hosted}¢ to pool.`);
      return { ok: true };
    }
    case "will_o_wisp_trash_breaker_used": {
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
            effect: fx.do({ kind: "will_o_wisp_resolve" }),
          },
        ],
      };
      return { ok: true };
    }
    case "will_o_wisp_resolve": {
      const used = state.run?.breakersThatBroke ?? [];
      if (used.length === 0) {
        log(state, `Will-o'-the-Wisp — no breaker used.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, used[0]!);
      const up = state.cards[sourceId];
      if (up) {
        up.zone = "corp:archives";
        state.corp.discard.push(sourceId);
        log(state, `Will-o'-the-Wisp trashed; breaker trashed.`);
      }
      return { ok: true };
    }
    case "three_steps_ahead_payout": {
      const runs = state.turn.successfulRunServersThisTurn?.length ?? 0;
      const gain = runs * 2;
      if (gain > 0) {
        state.runner.credits += gain;
        log(state, `Three Steps Ahead — gain ${gain}¢ (${runs} successful runs).`);
      }
      return { ok: true };
    }
    case "llds_prevent_trash_hardware": {
      log(state, `LLDS Energy Regulator — prevent trash (stub choice).`);
      return { ok: true };
    }
    default:
      return null;
  }
}
