/**
 * Choose one card the player can already see and bind it into one effect
 * (CR 1.15.2, 1.15.4). Hidden zones stay out of this primitive (CR 1.21.2).
 */
import { log } from "../state/createGame.js";
import type { GameState, RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";
import type { EffectCtx } from "./eval.js";
import type { Effect, Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

const CHOSEN = "$chosen";

type ChooseZone = Extract<
  Primitive,
  { kind: "choose_card" }
>["zone"];

function bindChosen(value: unknown, cardId: string): unknown {
  if (value === CHOSEN) return cardId;
  if (Array.isArray(value)) return value.map((item) => bindChosen(item, cardId));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = bindChosen(child, cardId);
    }
    return out;
  }
  return value;
}

function visibleIds(
  state: GameState,
  chooser: "corp" | "runner",
  zone: ChooseZone,
): { ids: string[] } | { error: string } {
  if (zone === "hq" && chooser !== "corp") {
    return {
      error: "HQ is hidden from the Runner. Look or reveal before choosing (CR 1.21.2).",
    };
  }
  if (zone === "grip" && chooser !== "runner") {
    return {
      error: "The grip is hidden from the Corp. Look or reveal before choosing (CR 1.21.2).",
    };
  }
  const ids = (() => {
    switch (zone) {
      case "hq":
        return [...state.corp.hand];
      case "grip":
        return [...state.runner.hand];
      case "rig":
        return [...state.runner.rig];
      case "heap":
        return state.runner.discard.filter((id) => state.cards[id]?.faceup);
      case "archives":
        return state.corp.discard.filter((id) => state.cards[id]?.faceup);
      case "corp_score":
        return [...state.corp.score];
      case "runner_score":
        return [...state.runner.score];
    }
  })();
  return { ids: ids.filter((id) => state.cards[id]) };
}

export function applyChooseCard(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  if (action.kind !== "choose_card") return null;
  const { state, sourceId } = ctx;
  const zone = visibleIds(state, action.chooser, action.zone);
  if ("error" in zone) {
    return { ok: false, error: zone.error, cites: [CR.look, CR.announceTargets] };
  }
  const want = action.cardType?.toLowerCase();
  const ids = zone.ids.filter((id) => {
    if (!want) return true;
    return state.cards[id]!.type.toLowerCase() === want;
  });
  if (ids.length === 0) {
    log(
      state,
      `No valid target — the instruction does not act on a card (CR ${CR.targetsGone.number}).`,
    );
    return { ok: true };
  }
  const options: Array<{ id: string; label: string; effect: Effect }> = ids.map(
    (id) => ({
      id: `choose-card:${id}`,
      label: state.cards[id]!.title,
      effect: bindChosen(structuredClone(action.then), id) as Effect,
    }),
  );
  if (action.optional) {
    options.push({
      id: "choose-card-decline",
      label: "Decline",
      effect: {
        op: "do",
        action: { kind: "gain_credits", side: action.chooser, amount: 0 },
      },
    });
  }
  state.pendingChoice = {
    sourceId,
    chooser: action.chooser,
    options,
  };
  log(state, `Choose 1 card (CR ${CR.announceTargets.number}).`);
  return { ok: true };
}
