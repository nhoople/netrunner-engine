import type { EffectCtx, EvalResult } from "../eval.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { applyIdentityFace } from "../../state/setupAndEnd/identityFace.js";
import { fireOnFlipToBackIfRunMatchesFace } from "../../state/triggers/miscConditionalHooks.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { recomputeRunnerLink } from "../../state/hostingAndTrash/trashHooks.js";
import type { Primitive } from "../ir.js";
import { checkWinConditions } from "../../state/turnAndActions/scoring.js";

export function applyOtherKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "flip_identity": {
      if (source.type !== "identity") {
        log(state, `flip_identity — source is not an identity.`);
        return { ok: true };
      }
      const becomingFlipped = !source.identityFlipped;
      source.identityFlipped = becomingFlipped;
      // The newly faceup face is the active one (CR 3.1.1a).
      applyIdentityFace(source);
      if (source.side === "runner") recomputeRunnerLink(state);
      log(
        state,
        `${source.title} flips to ${source.identityFlipped ? "back" : "front"} side` +
          (source.meliesChosenBackFace && becomingFlipped
            ? ` (${source.meliesChosenBackFace})`
            : "") +
          `.`,
      );
      if (becomingFlipped) {
        const face = source.meliesChosenBackFace;
        const attacked = state.run?.attackedServerId;
        if (
          source.identityFlippedHooks?.onFlipToBackIfRunMatchesFace &&
          face &&
          attacked === face
        ) {
          fireOnFlipToBackIfRunMatchesFace(state, sourceId);
          if (state.pendingChoice) return { ok: true };
        }
      }
      return { ok: true };
    }

    case "melies_secretly_set_face": {
      if (source.type !== "identity") {
        log(state, `melies_secretly_set_face — source is not an identity.`);
        return { ok: true };
      }
      // Always re-set on front; if already flipped, still allow choose for next cycle.
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: (
          [
            ["hq", "HQ"],
            ["rd", "R&D"],
            ["archives", "Archives"],
          ] as const
        ).map(([id, label]) => ({
          id: `melies-face:${id}`,
          label: `Secretly set Méliès U face: ${label}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "melies_set_face" as const,
              face: id,
            },
          },
        })),
        logLine: `${source.title} — secretly set identity face.`,
      });
      return { ok: true };
    }

    case "melies_set_face": {
      if (source.type !== "identity") {
        log(state, `melies_set_face — source is not an identity.`);
        return { ok: true };
      }
      source.meliesChosenBackFace = action.face;
      // Secret set always leaves Only the Brightest faceup.
      source.identityFlipped = false;
      applyIdentityFace(source);
      log(
        state,
        `${source.title} secretly sets face to ${action.face} (front faceup).`,
      );
      return { ok: true };
    }

    case "check_assassination_win": {
      const n = state.runner.scoreArea.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("assassination"),
      ).length;
      if (n >= action.amount) {
        state.winner = "runner";
        state.winReason = "runner_alternate";
        state.done = true;
        log(
          state,
          `Runner wins — ${n} assassination agendas (need ${action.amount}).`,
        );
      } else {
        log(
          state,
          `Assassination win check — ${n}/${action.amount} assassination agendas.`,
        );
      }
      checkWinConditions(state);
      return { ok: true };
    }
    default:
      return null;
  }
}
