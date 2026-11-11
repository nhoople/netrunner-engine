/**
 * Cards a cost has its payer pick.
 *
 * CR 1.16.1: a cost can be any card a player must spend. When more than one
 * set of cards would pay it, the payer says which. The action waits as a
 * pending cost until the picks are in, and nothing is paid before then.
 */
import { abilitiesSuppressed } from "../state/abilities.js";
import { costCardNeed, type CostCardNeed } from "../state/costs.js";
import { log } from "../state/createGame.js";
import { agendaPointsFor } from "../state/scoring.js";
import { runnerAbilityCarrierIds } from "../state/fenris.js";
import type { Effect } from "../effects/ir.js";
import type { Action, GameState, RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { paidAbilityCostAndPayer } from "./paidAbility.js";
import { derezCostTargets } from "./rez.js";

const NO_EFFECT = {
  op: "do" as const,
  action: { kind: "gain_credits" as const, side: "corp" as const, amount: 0 },
};

/** Which additional HQ cost a basic trash of this resource carries, if any. */
export function basicTrashResourceHqCost(
  state: GameState,
  targetId: string,
): { label: string } | null {
  const target = state.cards[targetId];
  if (!target) return null;
  const threat = Math.max(
    agendaPointsFor(state, "corp"),
    agendaPointsFor(state, "runner"),
  );
  const threatCost = target.threatBasicTrashAdditionalCostTrashHq;
  if (typeof threatCost === "number" && threat >= threatCost) {
    return { label: `Threat ${threatCost}` };
  }
  const connection = runnerAbilityCarrierIds(state).some((cid) => {
    if (abilitiesSuppressed(state, cid)) return false;
    return (
      Boolean(state.cards[cid]?.connectionBasicTrashAdditionalCostTrashHq) &&
      (target.subtypes ?? []).includes("connection")
    );
  });
  return connection ? { label: "Sebastião" } : null;
}

/** The Runner card whose ability trashes an accessed card for grip cards. */
export function accessTrashFromGripSource(state: GameState) {
  if (!state.run) return undefined;
  const ids: string[] = [...state.runner.installed];
  if (state.run.runSourceId) ids.push(state.run.runSourceId);
  return ids
    .map((id) => state.cards[id])
    .find((c) => {
      if (!c || abilitiesSuppressed(state, c.id)) return false;
      const spec = c.accessTrashFromGrip;
      if (!spec) return false;
      if (spec.oncePerTurn && state.turn.carnivoreAccessTrashUsed) return false;
      return state.runner.hand.length >= spec.gripCards;
    });
}

/** How many grip cards an additional cost to play trashes (Moshing). */
function gripCardsTrashedToPlay(effect: Effect | undefined): number {
  if (!effect) return 0;
  if (effect.op === "do") {
    return effect.action.kind === "trash_n_from_grip" ? effect.action.amount ?? 0 : 0;
  }
  if (effect.op === "seq") {
    return effect.effects.reduce((sum, e) => sum + gripCardsTrashedToPlay(e), 0);
  }
  return 0;
}

/** The cards this action's cost has its payer pick, if any. */
export function costCardNeedForAction(
  state: GameState,
  action: Action,
): CostCardNeed | null {
  switch (action.type) {
    case "use_paid_ability": {
      const found = paidAbilityCostAndPayer(state, action.cardId, action.abilityId);
      if (!found) return null;
      return costCardNeed(state, found.payer, found.cost, found.card);
    }
    case "play_event": {
      const card = state.cards[action.cardId];
      const count = gripCardsTrashedToPlay(card?.playAdditionalCost);
      if (!card || count <= 0 || !state.runner.hand.includes(action.cardId)) {
        return null;
      }
      return {
        payer: "runner",
        candidates: state.runner.hand.filter((id) => id !== action.cardId),
        count,
        what: "trash from the grip as an additional cost",
        hidden: true,
        sourceId: action.cardId,
      };
    }
    case "rez_ice":
    case "rez_asset": {
      const card = state.cards[action.cardId];
      if (!card || card.rezzed) return null;
      const forfeits =
        Boolean(card.rezAdditionalCostForfeitAgenda) ||
        (action.type === "rez_ice" &&
          state.turn.rezIceForfeitDiscountCardId === action.cardId &&
          (card.rezCostCreditDiscountOnForfeitAgenda ?? 0) > 0);
      if (forfeits) {
        return {
          payer: "corp",
          candidates: state.corp.scoreArea.filter(
            (id) => !state.cards[id]?.cannotForfeit,
          ),
          count: 1,
          what: "forfeit as an additional cost",
          hidden: false,
          sourceId: action.cardId,
        };
      }
      if (action.type === "rez_ice" && card.rezAdditionalCostDerezSubtype) {
        return {
          payer: "corp",
          candidates: derezCostTargets(state, action.cardId),
          count: 1,
          what: "derez as an additional cost",
          hidden: false,
          sourceId: action.cardId,
        };
      }
      return null;
    }
    case "basic_trash_resource": {
      if (!basicTrashResourceHqCost(state, action.cardId)) return null;
      return {
        payer: "corp",
        candidates: [...state.corp.hand],
        count: 1,
        what: "trash from HQ as an additional cost",
        hidden: true,
        sourceId: action.cardId,
      };
    }
    case "access_trash_from_grip": {
      const source = accessTrashFromGripSource(state);
      if (!source) return null;
      return {
        payer: "runner",
        candidates: [...state.runner.hand],
        count: source.accessTrashFromGrip!.gripCards,
        what: "trash from the grip as a cost",
        hidden: true,
        sourceId: source.id,
      };
    }
    default:
      return null;
  }
}

/**
 * True when the payer has a decision to make: more candidates than the cost
 * takes, and the candidates are not all copies of one card in a hand.
 */
export function costHasChoice(state: GameState, need: CostCardNeed): boolean {
  if (need.candidates.length <= need.count) return false;
  if (!need.hidden) return true;
  const first = state.cards[need.candidates[0]!]?.defId;
  return need.candidates.some((id) => state.cards[id]?.defId !== first);
}

/** Check picks a host sent with the action. */
export function validateCostCards(
  need: CostCardNeed | null,
  ids: readonly string[],
): { ok: true } | { ok: false; error: string; cites: RuleCite[] } {
  if (!need) {
    return { ok: false, error: "This cost takes no chosen cards.", cites: [CR.cost] };
  }
  const want = Math.min(need.count, need.candidates.length);
  if (new Set(ids).size !== ids.length || ids.length !== want) {
    return {
      ok: false,
      error: `Choose exactly ${want} card(s) to ${need.what}.`,
      cites: [CR.cost],
    };
  }
  if (ids.some((id) => !need.candidates.includes(id))) {
    return {
      ok: false,
      error: `That card cannot be chosen to ${need.what}.`,
      cites: [CR.cost],
    };
  }
  return { ok: true };
}

function offer(state: GameState): void {
  const pending = state.pendingCost!;
  const left = pending.candidates.filter((id) => !pending.picked.includes(id));
  const options = left.map((id) => ({
    id: `cost-card:${id}`,
    label: state.cards[id]?.title ?? id,
    effect: NO_EFFECT,
  }));
  if (pending.anyNumber) {
    options.push({
      id: "cost-card-done",
      label: pending.picked.length === 0 ? "None" : "Done",
      effect: NO_EFFECT,
    });
  }
  state.pendingChoice = {
    sourceId: pending.sourceId,
    chooser: pending.payer,
    options,
    prompt: pending.anyNumber
      ? `Choose a card to ${pending.what}, or stop (${pending.picked.length} chosen).`
      : `Choose a card to ${pending.what} (${pending.picked.length + 1} of ${pending.count}).`,
    ...(pending.hidden ? { hiddenFromOpponent: true } : {}),
  };
}

/**
 * Hold a Corp install and ask which cards already in the destination are
 * trashed first (CR 8.5.6a, 8.5.6b).
 */
export function openInstallTrashChoice(
  state: GameState,
  action: Action,
  candidates: readonly string[],
): void {
  state.pendingCost = {
    action: structuredClone(action),
    payer: "corp",
    candidates: [...candidates],
    count: candidates.length,
    picked: [],
    what: "trash before installing",
    hidden: false,
    sourceId: (action as { cardId: string }).cardId,
    anyNumber: true,
    into: "trashFirstIds",
  };
  log(
    state,
    `The Corp may trash cards in the destination before installing (CR ${CR.installTrashLikeCards.number}, ${CR.installTrashIce.number}).`,
  );
  offer(state);
}

/** Hold the action and ask its payer for the cards. */
export function openCostChoice(
  state: GameState,
  need: CostCardNeed,
  action: Action,
): void {
  state.pendingCost = {
    action: structuredClone(action),
    payer: need.payer,
    candidates: [...need.candidates],
    count: need.count,
    picked: [],
    what: need.what,
    hidden: need.hidden,
    sourceId: need.sourceId,
  };
  const who = need.payer === "corp" ? "The Corp" : "The Runner";
  log(
    state,
    `${who} chooses ${need.count} card(s) to ${need.what} (CR ${CR.cost.number}).`,
  );
  offer(state);
}

/**
 * Take one pick. Returns the held action with its picks once they are all
 * in, or null while more are needed.
 */
export function takeCostPick(
  state: GameState,
  optionId: string,
): { ok: true; action: Action | null } | { ok: false; error: string; cites: RuleCite[] } {
  const pending = state.pendingCost;
  if (!pending) return { ok: false, error: "No cost is waiting for cards.", cites: [CR.cost] };
  const stop = Boolean(pending.anyNumber) && optionId === "cost-card-done";
  if (!stop) {
    const id = optionId.startsWith("cost-card:") ? optionId.slice("cost-card:".length) : "";
    if (!pending.candidates.includes(id) || pending.picked.includes(id)) {
      return { ok: false, error: `Choose a card to ${pending.what}.`, cites: [CR.cost] };
    }
    pending.picked.push(id);
    if (pending.picked.length < pending.count) {
      offer(state);
      return { ok: true, action: null };
    }
  }
  state.pendingChoice = null;
  state.pendingCost = undefined;
  return {
    ok: true,
    action: {
      ...pending.action,
      [pending.into ?? "costCardIds"]: [...pending.picked],
    } as Action,
  };
}
