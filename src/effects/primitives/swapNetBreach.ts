import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { shuffleInPlace } from "../../state/rng.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanCcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "shuffle_into_rd": {
      if (state.run) state.run.skipBreach = true;
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) {
        return {
          ok: false,
          error: "Analog Dreamers — card missing.",
          cites: [],
        };
      }
      for (const server of Object.values(state.servers)) {
        if (server.root.includes(cardId)) {
          server.root = server.root.filter((id) => id !== cardId);
        }
      }
      state.corp.deck.push(cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      card.rezzed = false;
      shuffleInPlace(state, state.corp.deck);
      log(state, `Analog Dreamers — shuffle ${card.title} into R&D.`);
      return { ok: true };
    }

    case "trash_rezzed_copy": {
      const defId = action.defId;
      const rezzed = Object.values(state.cards).filter(
        (c) =>
          c &&
          c.defId === defId &&
          c.type === "ice" &&
          c.rezzed &&
          (c.zone?.includes(":ice") ||
            Object.values(state.servers).some((s) => s.ice.includes(c.id))),
      );
      const ids = rezzed.map((c) => c!.id);
      if (ids.length === 0) {
        log(state, `Immolation Script — no rezzed copy of ${defId}.`);
        return { ok: true };
      }
      if (ids.length === 1) {
        state.turn.ccImmolationScriptUsedThisRun = true;
        return evalEffect(ctx, {
          op: "do",
          action: { kind: "trash_corp_card", cardId: ids[0]! },
        });
      }
      state.turn.ccImmolationScriptUsedThisRun = true;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: ids.map((id) => ({
          id: `imm:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "trash_corp_card" as const, cardId: id },
          },
        })),
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
