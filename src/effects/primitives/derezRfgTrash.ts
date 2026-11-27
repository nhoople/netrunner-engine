import { log } from "../../state/setupAndEnd/createGame.js";
import { evalEffect } from "../eval.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite, ServerId } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyRedsandFmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "o2_shortage_runner_may_trash_random_grip_or_corp_gains_clicks": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "o2-trash",
            label: "Trash 1 card from grip at random",
            effect: fx.do({ kind: "trash_shortage_random_grip" }),
          },
          {
            id: "o2-decline",
            label: "Decline (Corp gains [click][click])",
            effect: fx.do({ kind: "o2_shortage_corp_gains_clicks" }),
          },
        ],
      });
      return { ok: true };
    }

    case "o2_shortage_corp_gains_clicks": {
      state.corp.clicks = (state.corp.clicks ?? 0) + 2;
      log(
        state,
        `O₂ Shortage — Corp gains [click][click] → ${state.corp.clicks}.`,
      );
      return { ok: true };
    }

    case "rearrange_ice_protecting_all_servers": {
      // Mandatory Seed Replacement: "rearrange any number of ice protecting
      // all servers". Arranging is repositioning among the current
      // positions, by swaps, so each server keeps its number of ice
      // (CR 8.3.1, 8.3.2).
      return evalEffect(
        ctx,
        fx.do({
          kind: "rearrange_ice",
          chooser: "corp",
          serverIds: Object.keys(state.servers) as ServerId[],
        }),
      );
    }

    case "choose_n_grip_to_stack_top": {
      const n = action.count ?? 2;
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `${source?.title ?? "Data Loop"} — grip empty.`);
        return { ok: true };
      }
      const take = Math.min(n, grip.length);
      // Sequential choose: pick cards one-by-one onto stack top.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `dl:${id}`,
          label: `Add ${state.cards[id]?.title ?? id} to top of stack`,
          effect: fx.do({
            kind: "choose_n_grip_to_stack_top_continue",
            selected: [id],
            remaining: take - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "choose_n_grip_to_stack_top_continue": {
      const selected = action.selected ?? [];
      const remaining = action.remaining ?? 0;
      // Apply already-selected moves lazily at the end.
      if (remaining <= 0 || state.runner.hand.length === 0) {
        for (const id of selected) {
          if (!state.runner.hand.includes(id)) continue;
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          state.runner.deck.unshift(id);
          const c = state.cards[id];
          if (c) c.zone = "runner:stack";
        }
        log(
          state,
          `${source?.title ?? "Data Loop"} — add ${selected.length} card(s) from grip to top of stack.`,
        );
        return { ok: true };
      }
      const grip = state.runner.hand.filter((id) => !selected.includes(id));
      if (grip.length === 0) {
        for (const id of selected) {
          if (!state.runner.hand.includes(id)) continue;
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          state.runner.deck.unshift(id);
          const c = state.cards[id];
          if (c) c.zone = "runner:stack";
        }
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `dl:${id}`,
          label: `Add ${state.cards[id]?.title ?? id} to top of stack`,
          effect: fx.do({
            kind: "choose_n_grip_to_stack_top_continue",
            selected: [...selected, id],
            remaining: remaining - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "choose_type": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: (["resource", "hardware", "program"] as const).map((t) => ({
          id: `br:${t}`,
          label: `Choose ${t}`,
          effect: fx.do({ kind: "resolve_biased_reporting", cardType: t }),
        })),
      });
      return { ok: true };
    }

    case "resolve_biased_reporting": {
      const t = action.cardType;
      const installed = state.runner.installed.filter(
        (id) => state.cards[id]?.type === t,
      );
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "br:trash-none",
            label: "Trash none",
            effect: fx.do({
              kind: "corp_gain",
              cardType: t,
              trashed: [],
            }),
          },
          ...installed.map((id) => ({
            id: `br:trash:${id}`,
            label: `Trash ${state.cards[id]?.title ?? id} (and continue)`,
            effect: fx.do({
              kind: "runner_trash_continue",
              cardType: t,
              trashed: [id],
              remaining: installed.filter((x) => x !== id),
            }),
          })),
        ],
      });
      return { ok: true };
    }

    case "corp_gain": {
      const t = action.cardType;
      const remaining = state.runner.installed.filter(
        (id) => state.cards[id]?.type === t,
      ).length;
      const gainAmt = remaining * 2;
      state.corp.credits += gainAmt;
      log(
        state,
        `Biased Reporting — Corp gains ${gainAmt}¢ (${remaining} ${t}(s) remain) → ${state.corp.credits}¢.`,
      );
      return { ok: true };
    }

    case "open_forum_hq_to_rd_top": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) return { ok: true };
      state.corp.hand = state.corp.hand.filter((x) => x !== id);
      state.corp.deck.unshift(id);
      const c = state.cards[id];
      if (c) {
        c.zone = "corp:rd";
        c.faceup = false;
      }
      log(state, `Open Forum — add ${c?.title ?? id} to top of R&D.`);
      return { ok: true };
    }

    default:
      return null;
  }
}
