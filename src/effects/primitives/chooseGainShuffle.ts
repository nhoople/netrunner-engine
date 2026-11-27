/** Blood and Water (baw) Red Sand pack primitives — v1.132.0. */
import { printsCanBeAdvanced } from "../../state/counters/advanceable.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { getCardDef } from "../../cards/load.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function installedCorpCards(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

function canAdvance(state: EffectCtx["state"], cardId: string): boolean {
  const c = state.cards[cardId];
  if (!c) return false;
  if (c.type === "agenda") return true;
  if (printsCanBeAdvanced(c)) return true;
  const def = c.defId ? getCardDef(c.defId) : undefined;
  return def ? printsCanBeAdvanced({ ...def, rezzed: c.rezzed }) : false;
}

function iceProtectingHqCount(state: EffectCtx["state"]): number {
  return state.servers.hq?.ice.length ?? 0;
}

export function syncMauiRecurringCredits(state: EffectCtx["state"]): void {
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.recurringCreditsMaxEqualsIceProtectingHq) continue;
    // Blanked Maui keeps a 0 pool (CR 9.12.1d).
    if (abilitiesSuppressed(state, id)) {
      card.recurringCreditsMax = 0;
      card.recurringCredits = 0;
      continue;
    }
    const max = iceProtectingHqCount(state);
    card.recurringCreditsMax = max;
    card.recurringCredits = max;
  }
}

export function applyRedsandBawPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "jarogniew_load_power_equal_tags_plus_3": {
      const source = state.cards[sourceId];
      if (!source) return { ok: true };
      const n = (state.runner.tags ?? 0) + 3;
      source.powerCounters = n;
      log(state, `${source.title} — load ${n} power (tags+3).`);
      return { ok: true };
    }

    case "may_gain_7_or_7_meat_if_tagged": {
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "gain7",
          label: "Gain 7¢",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 7 }),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      if ((state.runner.tags ?? 0) >= 2) {
        options.unshift({
          id: "meat7",
          label: "Do 7 meat damage (instead of gaining 7¢)",
          effect: fx.do({ kind: "meat_damage", amount: 7 }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "advance_equal_forfeit_advancement_requirement": {
      const x = state.lastForfeitedAdvancementRequirement ?? 0;
      if (x <= 0) {
        log(
          state,
          `Success — forfeited agenda had no advancement requirement.`,
        );
        return { ok: true };
      }
      const candidates = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      if (candidates.length === 0) {
        log(state, `Success — no advanceable card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `adv:${id}`,
          label: `Advance ${state.cards[id]!.title} ${x} time(s)`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: x,
            advance: true,
          }),
        })),
      });
      return { ok: true };
    }

    case "choose_x_and_load_power": {
      const source = state.cards[sourceId];
      if (!source) return { ok: true };
      const max = state.runner.credits;
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 0; x <= max; x++) {
        options.push({
          id: `x:${x}`,
          label: `Pay ${x}¢: place ${x} power`,
          effect: fx.do({ kind: "bug_out_bag_load_power", amount: x }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "bug_out_bag_load_power": {
      const source = state.cards[sourceId];
      const amount = Math.max(0, action.amount ?? 0);
      if (!source) return { ok: true };
      if (state.runner.credits < amount) {
        return {
          ok: false,
          error: "Not enough credits for Bug-Out Bag X.",
          cites: [],
        };
      }
      subtractRunnerCreditPool(state, amount);
      source.powerCounters = amount;
      log(
        state,
        `Bug-Out Bag — pay ${amount}¢, load ${amount} power → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
