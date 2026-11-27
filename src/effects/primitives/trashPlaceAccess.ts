import { log } from "../../state/setupAndEnd/createGame.js";
import {
  legalRebirthIdentityIds,
  switchRunnerIdentity,
} from "../../state/setupAndEnd/additionalIdentities.js";
import { CR } from "../../timing/labels.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite } from "../../state/types.js";
import { recomputeRunnerLink } from "../../state/hostingAndTrash/trashHooks.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyMumbadTlmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "rebirth_switch_identity_same_faction": {
      const candidates = legalRebirthIdentityIds(state);
      const current = state.cards[state.runner.identityId];
      if (candidates.length === 0) {
        log(
          state,
          `Rebirth — no same-faction identity in the outside-game pile (CR ${CR.additionalIdentitiesPile.number}).`,
        );
        return { ok: true };
      }
      if (candidates.length === 1) {
        switchRunnerIdentity(state, candidates[0]!);
        recomputeRunnerLink(state);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((cardId) => ({
          id: `rebirth:${cardId}`,
          label: `Switch to ${state.cards[cardId]!.title}`,
          effect: fx.do({
            kind: "rebirth_switch_to_identity",
            cardId,
          }),
        })),
        logLine: `Rebirth — choose a ${current?.faction ?? "same-faction"} identity from outside the game (CR ${CR.additionalIdentity.number}).`,
      });
      return { ok: true };
    }
    case "rebirth_switch_to_identity": {
      const cardId = (action as { cardId: string }).cardId;
      if (!legalRebirthIdentityIds(state).includes(cardId)) {
        return {
          ok: false,
          error: `${cardId} is not a legal Rebirth identity.`,
          cites: [CR.additionalIdentity, CR.additionalIdentitiesPile],
        };
      }
      switchRunnerIdentity(state, cardId);
      recomputeRunnerLink(state);
      return { ok: true };
    }

    default:
      return null;
  }
}
