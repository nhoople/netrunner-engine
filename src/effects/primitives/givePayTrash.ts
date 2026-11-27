/** Crimson Dust (cd) Red Sand pack primitives — v1.134.0. */
import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function trashTopOfRd(
  state: EffectCtx["state"],
  n: number,
  label: string,
): void {
  for (let i = 0; i < n; i++) {
    const top = state.corp.deck[0];
    if (!top) break;
    const c = state.cards[top];
    // "Force the Corp to trash": the Corp carries it out (CR 1.14.5).
    // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
    trashCard(state, top, { by: "corp" });
    log(state, `${label} — trash ${c?.title ?? top} from R&D.`);
  }
}

export function applyRedsandCdPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "give_bad_publicity_unless_corp_pays": {
      const amount = action.amount ?? 1;
      const credits = action.credits ?? 5;
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (state.corp.credits >= credits) {
        options.push({
          id: "pay",
          label: `Pay ${credits}¢ to prevent`,
          effect: fx.do({
            kind: "corp_pay_credits_to_prevent",
            amount: credits,
          }),
        });
      }
      options.push({
        id: "take-bp",
        label: `Take ${amount} bad publicity`,
        effect: fx.do({ kind: "give_bad_publicity", amount }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source?.title ?? "Mining Accident"} — Corp may pay ${credits}¢ or take ${amount} bad publicity.`,
      });
      return { ok: true };
    }

    case "corp_pay_credits_to_prevent": {
      const n = Math.min(action.amount ?? 0, state.corp.credits);
      state.corp.credits -= n;
      log(state, `Corp pays ${n}¢ → ${state.corp.credits}¢.`);
      return { ok: true };
    }

    case "trash_top_rd_equal_damage_suffered_this_turn": {
      const x = state.turn.damageSufferedThisTurn ?? 0;
      trashTopOfRd(state, x, source?.title ?? "Salvaged Vanadis Armory");
      state.turn.vanadisNextPawArmed = false;
      return { ok: true };
    }

    case "give_tags_equal_to_runner_tags_min_1": {
      const n = Math.max(1, state.runner.tags ?? 0);
      state.runner.tags = (state.runner.tags ?? 0) + n;
      state.turn.tagsGivenThisTurn = (state.turn.tagsGivenThisTurn ?? 0) + n;
      log(
        state,
        `${source?.title ?? "Threat Level Alpha"} — give ${n} tag(s) → ${state.runner.tags}.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
