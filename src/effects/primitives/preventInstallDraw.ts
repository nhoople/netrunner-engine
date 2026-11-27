import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanBbPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "score_another_installed_copy_of_self": {
      const defId = source.defId;
      const installed = Object.values(state.cards).filter(
        (c) =>
          c &&
          c.defId === defId &&
          c.id !== sourceId &&
          c.type === "agenda" &&
          !state.corp.scoreArea.includes(c.id) &&
          (c.zone?.startsWith("server:") ?? false),
      );
      const ids = installed.map((c) => c!.id);
      if (ids.length === 0) {
        log(state, `Research Grant — no other installed copy.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ids.map((id) => ({
          id: `rg-score:${id}`,
          label: `Score ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "score_installed_agenda_ignore_requirement" as const,
              cardId: id,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "score_installed_agenda_ignore_requirement": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "agenda") {
        return {
          ok: false,
          error: "Not an installed agenda.",
          cites: [],
        };
      }
      // Scoring an installed agenda uninstalls it: the cards hosted on it
      // are trashed at the next checkpoint (CR 8.5.1b, 10.3.1g).
      if (!uninstallCard(state, cardId, "score-area", { scoreSide: "corp" })) {
        return { ok: false, error: "Not an installed agenda.", cites: [] };
      }
      card.rezzed = true;
      log(
        state,
        `Research Grant — score ${card.title} (ignore advancement requirement).`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
