/** First Contact (fc) Lunar pack primitives. */
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { hostCard } from "../../state/hostingAndTrash/host.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function runnerPrograms(state: EffectCtx["state"]): string[] {
  return state.runner.installed.filter(
    (id) => state.cards[id]?.type === "program",
  );
}

export function applyLunarFcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "rfg_runner_heap": {
      const heap = [...state.runner.discardPile];
      for (const id of heap) {
        state.cards[id]!.zone = "removed-from-game";
        state.cards[id]!.faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(id)) state.removedFromGame.push(id);
      }
      state.runner.discardPile = [];
      log(
        state,
        `Chronos Project — remove ${heap.length} heap card(s) from the game.`,
      );
      return { ok: true };
    }
    case "pay_shattered_remains": {
      const n = (action as { hardwareCount: number }).hardwareCount;
      if (state.corp.credits < 1) {
        return {
          ok: false,
          error: "Cannot pay 1¢ for Shattered Remains.",
          cites: [],
        };
      }
      state.corp.credits -= 1;
      const hw = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "hardware",
      );
      for (let i = 0; i < n && hw.length > 0; i++) {
        const id = hw.shift()!;
        trashCard(state, id);
        log(state, `Shattered Remains — trash ${state.cards[id]!.title}.`);
      }
      return { ok: true };
    }
    case "trash_one_installed_runner_program": {
      const progs = runnerPrograms(state);
      if (progs.length === 0) {
        log(state, `Trash program — none installed.`);
        return { ok: true };
      }
      if (progs.length === 1) {
        trashCard(state, progs[0]!);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: progs.map((id) => ({
          id: `trash-prog:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "supplier_host_from_grip": {
      const host = state.cards[sourceId];
      if (!host?.supplierHost) return { ok: true };
      const candidates = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "resource" || t === "hardware";
      });
      if (candidates.length === 0) {
        log(state, `The Supplier — nothing to host from grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `host:${id}`,
          label: `Host ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "resolve_supplier_host", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "resolve_supplier_host": {
      const cardId = (action as { cardId: string }).cardId;
      const host = state.cards[sourceId];
      const card = state.cards[cardId];
      if (!host || !card) return { ok: true };
      state.runner.hand = state.runner.hand.filter((x) => x !== cardId);
      hostCard(state, card.id, sourceId, { installed: true });
      log(state, `The Supplier — host ${card.title}.`);
      return { ok: true };
    }
    default:
      return null;
  }
}
