/**
 * Choose one card the player can already see and bind it into one effect
 * (CR 1.15.2, 1.15.4). Hidden zones stay out of this primitive (CR 1.21.2).
 */
import { log } from "../state/createGame.js";
import { isCentral } from "../state/access.js";
import type {
  CardInstance,
  GameState,
  RuleCite,
  ServerId,
} from "../state/types.js";
import { CR } from "../timing/labels.js";
import type { EffectCtx } from "./eval.js";
import type { Effect, Primitive } from "./ir.js";
import { openPendingChoose } from "../state/pendingChoice.js";

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
      case "installed":
        return [...state.runner.installed];
      case "heap":
        return state.runner.discardPile.filter((id) => state.cards[id]?.faceup);
      case "archives":
        return state.corp.discardPile.filter((id) => state.cards[id]?.faceup);
      case "corp_score":
        return [...state.corp.scoreArea];
      case "runner_score":
        return [...state.runner.scoreArea];
      case "remote_root":
        return Object.entries(state.servers)
          .filter(([serverId]) => !isCentral(serverId as ServerId))
          .flatMap(([, server]) => server.root);
    }
  })();
  return { ids: ids.filter((id) => state.cards[id]) };
}

function seenBy(card: CardInstance, chooser: "corp" | "runner"): boolean {
  return card.side === chooser || Boolean(card.rezzed || card.faceup);
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
  const subtypes = action.includeSubtypes?.map((st) => st.toLowerCase());
  const ids = zone.ids.filter((id) => {
    const card = state.cards[id]!;
    if (action.rezzedOnly && !card.rezzed) return false;
    if (!want && !subtypes?.length) return true;
    // A type or subtype filter matches only a card the chooser can see, so
    // the choice does not reveal a facedown card (CR 1.21.2).
    if (!seenBy(card, action.chooser)) return false;
    if (want && card.type.toLowerCase() !== want) return false;
    if (
      subtypes?.length &&
      !(card.subtypes ?? []).some((st) => subtypes.includes(st.toLowerCase()))
    ) {
      return false;
    }
    return true;
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
  openPendingChoose(state, {
    sourceId,
    chooser: action.chooser,
    options,
    logLine: `Choose 1 card (CR ${CR.announceTargets.number}).`,
  });
  return { ok: true };
}
