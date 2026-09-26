/** Richer cost model + recurring credit refill (CR 1.10 / 1.16). */

import { log } from "./createGame.js";
import type { CardInstance, CostSpec, GameState, PaidAbility, Side } from "./types.js";
import { CR } from "../timing/labels.js";
import { withCostCheckpoint } from "../legality/checkpoints.js";

export function abilityCost(ability: PaidAbility): CostSpec {
  if (ability.cost) return ability.cost;
  return {
    clicks: ability.clickCost,
    credits: ability.creditCost,
  };
}

export function canPayCost(
  state: GameState,
  side: Side,
  cost: CostSpec,
  source?: CardInstance,
): boolean {
  const p = side === "corp" ? state.corp : state.runner;
  if ((cost.clicks ?? 0) > p.clicks) return false;
  const creditNeed = cost.credits ?? 0;
  const eventPool =
    side === "runner" && state.run ? (state.run.eventCredits ?? 0) : 0;
  if (creditNeed > p.credits + eventPool) return false;
  if ((cost.recurringCredits ?? 0) > 0) {
    if (!source || (source.recurringCredits ?? 0) < (cost.recurringCredits ?? 0)) {
      return false;
    }
  }
  if ((cost.virusCounters ?? 0) > 0) {
    if (!source || (source.virusCounters ?? 0) < (cost.virusCounters ?? 0)) {
      return false;
    }
  }
  if ((cost.trashFromHq ?? 0) > 0) {
    if (state.corp.hand.length < (cost.trashFromHq ?? 0)) return false;
  }
  if ((cost.trashFromGrip ?? 0) > 0) {
    if (state.runner.hand.length < (cost.trashFromGrip ?? 0)) return false;
  }
  return true;
}

export function payCost(
  state: GameState,
  side: Side,
  cost: CostSpec,
  openedBy: string,
  source?: CardInstance,
): void {
  const p = side === "corp" ? state.corp : state.runner;
  withCostCheckpoint(state, openedBy, () => {
    p.clicks -= cost.clicks ?? 0;
    let creditsLeft = cost.credits ?? 0;
    if (side === "runner" && state.run && (state.run.eventCredits ?? 0) > 0) {
      const fromEvent = Math.min(creditsLeft, state.run.eventCredits ?? 0);
      state.run.eventCredits = (state.run.eventCredits ?? 0) - fromEvent;
      creditsLeft -= fromEvent;
      if (fromEvent > 0) {
        log(
          state,
          `Spend ${fromEvent}¢ from run event credits (Overclock pool).`,
        );
      }
    }
    p.credits -= creditsLeft;
    if (source && (cost.recurringCredits ?? 0) > 0) {
      source.recurringCredits =
        (source.recurringCredits ?? 0) - (cost.recurringCredits ?? 0);
    }
    if (source && (cost.virusCounters ?? 0) > 0) {
      source.virusCounters =
        (source.virusCounters ?? 0) - (cost.virusCounters ?? 0);
    }
    if ((cost.trashFromHq ?? 0) > 0) {
      for (let i = 0; i < (cost.trashFromHq ?? 0); i++) {
        const id = state.corp.hand.pop();
        if (!id) break;
        state.corp.discard.push(id);
        const c = state.cards[id];
        c.zone = "corp:archives";
        c.faceup = true;
        log(state, `Trash ${c.title} from HQ as cost.`);
      }
    }
    if ((cost.trashFromGrip ?? 0) > 0) {
      for (let i = 0; i < (cost.trashFromGrip ?? 0); i++) {
        const id = state.runner.hand.pop();
        if (!id) break;
        state.runner.discard.push(id);
        const c = state.cards[id];
        c.zone = "runner:heap";
        c.faceup = true;
        log(state, `Trash ${c.title} from grip as cost.`);
      }
    }
    if (cost.trashSelf && source) {
      log(
        state,
        `Pay trash-self cost on ${source.title} (CR ${CR.costCheckpoint.number}).`,
      );
    }
  });
}

/** Refill recurring credit pools on installed/rezzed cards for a side. */
export function refillRecurringCredits(state: GameState, side: Side): void {
  const ids =
    side === "corp"
      ? Object.values(state.cards)
          .filter((c) => c.side === "corp" && c.rezzed && (c.recurringCreditsMax ?? 0) > 0)
          .map((c) => c.id)
      : state.runner.rig.filter(
          (id) => (state.cards[id].recurringCreditsMax ?? 0) > 0,
        );

  for (const id of ids) {
    const card = state.cards[id];
    const max = card.recurringCreditsMax ?? 0;
    card.recurringCredits = max;
  }
  if (ids.length > 0) {
    log(
      state,
      `${side} recurring credits refill on ${ids.length} card(s) (CR ${CR.recurringCredits.number}).`,
    );
  }
}
