/** Council of the Crest (cotc) Kitara pack primitives — v1.138.0. */
import {
  markSubroutineBroken,
  subroutineBreakBlock,
} from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyKitaraCotcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "resolve_marathon": {
      state.runner.clicks += 1;
      const serverId = state.run?.attackedServerId;
      if (serverId) {
        if (!state.turn.cotcForbiddenServerIds) {
          state.turn.cotcForbiddenServerIds = [];
        }
        if (!state.turn.cotcForbiddenServerIds.includes(serverId)) {
          state.turn.cotcForbiddenServerIds.push(serverId);
        }
      }
      // Return Marathon from heap to grip.
      const eventId = state.run?.runSourceId ?? sourceId;
      const card = state.cards[eventId];
      if (card) {
        state.runner.discardPile = state.runner.discardPile.filter(
          (id) => id !== eventId,
        );
        if (!state.runner.hand.includes(eventId)) {
          state.runner.hand.push(eventId);
        }
        card.zone = "runner:grip";
        card.faceup = true;
        log(
          state,
          `Marathon — gain [click], add to grip; cannot run ${serverId ?? "server"} again this turn.`,
        );
      } else {
        log(state, `Marathon — gain [click]; forbid server.`);
      }
      return { ok: true };
    }

    case "break_last_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source?.title ?? "Gbahali"} — no encounter.`);
        return { ok: true };
      }
      // Printed: "Break the last subroutine" — the last one in order. If
      // it is already broken, there is nothing to break; do not fall back
      // to an earlier subroutine.
      const ice = state.cards[enc.iceId];
      const idx = (ice?.subroutines?.length ?? enc.broken.length) - 1;
      if (idx < 0 || enc.broken[idx]) {
        log(
          state,
          `${source?.title ?? "Gbahali"} — last subroutine already broken.`,
        );
        return { ok: true };
      }
      const blocked = subroutineBreakBlock(state, sourceId, idx);
      if (blocked) {
        log(state, `${source?.title ?? "Gbahali"} — ${blocked.error}`);
        return { ok: true };
      }
      markSubroutineBroken(state, sourceId, idx);
      log(
        state,
        `${source?.title ?? "Gbahali"} — break last subroutine (index ${idx}).`,
      );
      return { ok: true };
    }

    case "cotc_white_hat": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "do-trace",
            label: "Resolve Trace[3]",
            effect: {
              op: "do",
              action: {
                kind: "trace",
                strength: 3,
                onSuccess: fx.do({
                  kind: "gain_credits",
                  side: "corp",
                  amount: 0,
                }),
                onFailure: fx.do({ kind: "reveal_white_hat" }),
              },
            },
          },
        ],
      });
      return { ok: true };
    }

    case "trace_white_hat": {
      return applyKitaraCotcPrimitive(ctx, { kind: "cotc_white_hat" });
    }

    case "trace_kuwinda": {
      const x = source?.powerCounters ?? 0;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "kuwinda-trace",
            label: `Trace[${x}]`,
            effect: {
              op: "do",
              action: {
                kind: "trace",
                strength: x,
                onSuccess: fx.seq(
                  fx.do({ kind: "core_damage", amount: 1 }),
                  fx.do({ kind: "trash_self" }),
                ),
                onFailure: fx.do({ kind: "add_power_counter", amount: 1 }),
              },
            },
          },
        ],
      });
      return { ok: true };
    }

    case "cotc_azmari_name_card_type": {
      const types = ["event", "hardware", "program", "resource"];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `azmari:${t}`,
          label: `Name ${t}`,
          effect: fx.do({ kind: "cotc_azmari_set_named_type", cardType: t }),
        })),
      });
      return { ok: true };
    }

    case "cotc_azmari_set_named_type": {
      const cardType = (action as { cardType: string }).cardType;
      // Printed text pays on "the type you last named this way" — the name
      // persists across turns until renamed, so it lives on the identity
      // instance, not turn bookkeeping (which resets each turn).
      if (source) source.azmariNamedType = cardType;
      state.turn.cotcAzmariNamedTypeFired = false;
      log(state, `${source?.title ?? "Azmari EdTech"} — name ${cardType}.`);
      return { ok: true };
    }

    case "gain_personalized_portal": {
      const grip = state.runner.hand.length;
      const n = Math.floor(grip / 2);
      state.corp.credits += n;
      log(
        state,
        `${source?.title ?? "Personalized Portal"} — gain ${n}¢ (${grip} in grip).`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
