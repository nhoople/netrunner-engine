/** Blood and Water (baw) Red Sand pack primitives — v1.132.0. */
import { printsCanBeAdvanced } from "../../state/counters/advanceable.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { getCardDef } from "../../cards/load.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { fx, type Primitive } from "../ir.js";

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

export function applyRedsandBawPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
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

    default:
      return null;
  }
}
