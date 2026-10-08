/** Up and Over (uao) Lunar pack primitives. */
import { log } from "../state/createGame.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import { canPayCost, payCost } from "../state/costs.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarUaoPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "labyrinthine_prevent_jack_out": {
      if (!state.run) return { ok: true };
      state.run.cannotJackOut = true;
      log(state, `Labyrinthine Servers — Runner cannot jack out this run.`);
      return { ok: true };
    }
    case "universal_connectivity_fee_sub": {
      if (state.runner.tags > 0) {
        state.runner.credits = 0;
        log(state, `UCF — tagged Runner loses all credits; trash ice.`);
        if (source?.type === "ice") {
          removeCardFromIce(state, sourceId);
          state.corp.discard.push(sourceId);
          state.cards[sourceId]!.zone = "corp:archives";
        }
      } else if (state.runner.credits > 0) {
        state.runner.credits -= 1;
        log(state, `UCF — Runner loses 1¢.`);
      }
      return { ok: true };
    }
    case "spend_click_additional_cost": {
      if ((state.corp.clicks ?? 0) < 1) {
        return { ok: false, error: "Cannot spend click for Reuse.", cites: [] };
      }
      state.corp.clicks -= 1;
      log(state, `Reuse — spend 1 click (additional cost).`);
      return { ok: true };
    }
    case "trash_hq_tick": {
      state.turn.reuseTrashedFromHq = (state.turn.reuseTrashedFromHq ?? 0) + 1;
      return { ok: true };
    }
    case "trash_hq_gain_credits": {
      state.turn.reuseTrashedFromHq = 0;
      return applyTrashAnyHqThenGainPerCard(ctx, 2, "trash_hq_gain_credits_finalize");
    }
    case "trash_hq_gain_credits_finalize": {
      const n = state.turn.reuseTrashedFromHq ?? 0;
      state.corp.credits += n * 2;
      log(state, `Reuse — gain ${n * 2}¢ for ${n} trashed HQ card(s).`);
      state.turn.reuseTrashedFromHq = undefined;
      return { ok: true };
    }
    case "may_add_archives_card_to_rd_bottom_only": {
      const archives = [...state.corp.discard];
      if (archives.length === 0) {
        log(state, `Hades Fragment — Archives empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-hades",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
          ...archives.map((id) => ({
            id: `hades-bottom:${id}`,
            label: `Add ${state.cards[id]!.title} to bottom of R&D`,
            effect: fx.do({
              kind: "add_archives_card_to_rd",
              cardId: id,
              position: "bottom",
            }),
          })),
        ],
      };
      return { ok: true };
    }
    case "reveal_top_four": {
      const revealed: string[] = [];
      for (let i = 0; i < 4 && state.runner.deck.length > 0; i++) {
        const id = state.runner.deck.pop()!;
        revealed.push(id);
        state.cards[id]!.faceup = true;
      }
      let gained = 0;
      const toGrip: string[] = [];
      for (const id of revealed) {
        if (state.cards[id]?.type === "program") {
          moveRunnerCardToHeap(state, id);
          gained += 1;
        } else {
          toGrip.push(id);
        }
      }
      state.runner.hand.push(...toGrip);
      for (const id of toGrip) state.cards[id]!.zone = "runner:grip";
      state.runner.credits += gained;
      log(
        state,
        `Inject — trash ${gained} program(s), gain ${gained}¢, ${toGrip.length} to grip.`,
      );
      return { ok: true };
    }
    case "corp_lose_two_if_can": {
      if (state.corp.credits >= 2) {
        state.corp.credits -= 2;
        log(state, `Fester — Corp loses 2¢.`);
      }
      return { ok: true };
    }
    case "trash_hardware_additional_cost": {
      const hw = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "hardware",
      );
      if (hw.length === 0) {
        return { ok: false, error: "No hardware to trash for Trade-In.", cites: [] };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: hw.map((id) => ({
          id: `trade-in-hw:${id}`,
          label: `Trash ${state.cards[id]!.title} (additional cost)`,
          effect: fx.do({ kind: "trade_in_record_hw", cardId: id }),
        })),
      };
      return { ok: true };
    }
    case "trade_in_record_hw": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "hardware") return { ok: true };
      const half = Math.floor((card.installCost ?? 0) / 2);
      moveRunnerCardToHeap(state, cardId);
      state.turn.tradeInCredits = half;
      log(state, `Trade-In — trashed ${card.title} for ${half}¢ (recorded).`);
      return { ok: true };
    }
    case "trade_in_resolve": {
      const half = state.turn.tradeInCredits ?? 0;
      state.runner.credits += half;
      state.turn.tradeInCredits = undefined;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline-search-hw",
            label: "Do not search",
            effect: fx.gainCredits("runner", 0),
          },
          ...state.runner.deck
            .filter((id) => state.cards[id]?.type === "hardware")
            .map((id) => ({
              id: `trade-search:${id}`,
              label: `Add ${state.cards[id]!.title} to grip`,
              effect: fx.do({ kind: "add_hw_to_grip", cardId: id }),
            })),
        ],
      };
      log(state, `Trade-In — gain ${half}¢; search hardware.`);
      return { ok: true };
    }
    case "add_hw_to_grip": {
      const cardId = (action as { cardId: string }).cardId;
      state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
      state.runner.hand.push(cardId);
      state.cards[cardId]!.zone = "runner:grip";
      state.cards[cardId]!.faceup = true;
      state.runner.deck.sort(() => Math.random() - 0.5);
      log(state, `Trade-In — add ${state.cards[cardId]!.title} to grip; shuffle stack.`);
      return { ok: true };
    }
    case "place_x_counters": {
      const max = Math.min(10, state.runner.credits);
      const amounts = Array.from({ length: max + 1 }, (_, i) => i);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: amounts.map((x) => ({
          id: `angel-x:${x}`,
          label: `Place ${x} power counter(s) (pay ${x}¢)`,
          effect: fx.do({ kind: "place_x_resolve", amount: x }),
        })),
      };
      return { ok: true };
    }
    case "place_x_resolve": {
      const amount = (action as { amount: number }).amount;
      if (!canPayCost(state, "runner", { credits: amount })) {
        return { ok: false, error: "Cannot pay for Angel Arena counters.", cites: [] };
      }
      payCost(state, "runner", { credits: amount }, "angel-arena", source);
      source!.powerCounters = (source!.powerCounters ?? 0) + amount;
      log(state, `Angel Arena — place ${amount} power counter(s).`);
      return { ok: true };
    }
    case "reveal_top_may_bottom": {
      if (state.runner.deck.length === 0) {
        log(state, `Angel Arena — stack empty.`);
        return { ok: true };
      }
      const top = state.runner.deck[state.runner.deck.length - 1]!;
      state.cards[top]!.faceup = true;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "angel-keep",
            label: `Keep ${state.cards[top]!.title} on top`,
            effect: fx.gainCredits("runner", 0),
          },
          {
            id: "angel-bottom",
            label: `Add ${state.cards[top]!.title} to bottom of stack`,
            effect: fx.do({ kind: "bottom_top", cardId: top }),
          },
        ],
      };
      return { ok: true };
    }
    case "bottom_top": {
      const cardId = (action as { cardId: string }).cardId;
      state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
      state.runner.deck.unshift(cardId);
      log(state, `Angel Arena — ${state.cards[cardId]!.title} to bottom of stack.`);
      return { ok: true };
    }
    default:
      return null;
  }
}

function removeCardFromIce(state: EffectCtx["state"], iceId: string): void {
  for (const server of Object.values(state.servers)) {
    const idx = server.ice.indexOf(iceId);
    if (idx >= 0) {
      server.ice.splice(idx, 1);
      break;
    }
  }
}

function applyTrashAnyHqThenGainPerCard(
  ctx: EffectCtx,
  _per: number,
  finalizeKind: string,
): PrimResult {
  const { state, sourceId } = ctx;
  const hq = [...state.corp.hand];
  if (hq.length === 0) {
    const fin = applyLunarUaoPrimitive(ctx, {
      kind: finalizeKind,
    } as Primitive);
    return fin ?? { ok: true };
  }
  state.pendingChoice = {
    sourceId,
    chooser: "corp",
    options: [
      ...hq.map((id) => ({
        id: `reuse-trash:${id}`,
        label: `Trash ${state.cards[id]!.title}`,
        effect: {
          op: "seq" as const,
          effects: [
            fx.do({ kind: "trash_hq_card", cardId: id }),
            fx.do({ kind: "trash_hq_tick" }),
            fx.do({ kind: "trash_hq_gain_credits" }),
          ],
        },
      })),
      {
        id: "reuse-done",
        label: "Done trashing",
        effect: {
          op: "do",
          action: { kind: finalizeKind as "trash_hq_gain_credits_finalize" },
        },
      },
    ],
  };
  return { ok: true };
}
