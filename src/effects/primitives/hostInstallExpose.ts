import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { Primitive } from "../ir.js";
import { hostCard } from "../../state/hostingAndTrash/host.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanUwPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;

  switch (action.kind) {
    case "host_top_n_of_stack_facedown": {
      const n = action.amount;
      for (let i = 0; i < n; i++) {
        const top = state.runner.deck[0];
        if (!top) {
          log(state, `${source.title} — stack empty while hosting.`);
          break;
        }
        state.runner.deck.shift();
        const card = state.cards[top]!;
        hostCard(state, card.id, sourceId, { installed: true });
        card.faceup = false;
        card.zone = `hosted:${sourceId}`;
        log(state, `${source.title} hosts a card facedown from stack.`);
      }
      return { ok: true };
    }

    case "resolve_subroutine_on_rezzed_ice_protecting_this_server": {
      let serverIce: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverIce = [...server.ice];
          break;
        }
      }
      const picks: Array<{ iceId: string; subIndex: number }> = [];
      for (const id of serverIce) {
        const ice = state.cards[id];
        if (!ice?.rezzed) continue;
        const subs = ice.subroutines ?? [];
        for (let i = 0; i < subs.length; i++) {
          picks.push({ iceId: id, subIndex: i });
        }
      }
      if (picks.length === 0) {
        log(state, `${source.title} — no rezzed protecting ice with subs.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: picks.map((p) => {
          const ice = state.cards[p.iceId]!;
          const sub = ice.subroutines![p.subIndex]!;
          return {
            id: `batty:${p.iceId}:${p.subIndex}`,
            label: `Resolve "${sub.text}" on ${ice.title}`,
            effect: sub.effect,
          };
        }),
        logLine: `${source.title} — resolve 1 subroutine on protecting ice.`,
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
