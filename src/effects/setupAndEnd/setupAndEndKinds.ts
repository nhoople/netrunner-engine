/**
 * Primitive kinds for identity changes and winning the game. The kind registry
 * (`applyCoreKinds`) dispatches here.
 */
import { log } from "../../state/setupAndEnd/createGame.js";
import { applyIdentityFace } from "../../state/setupAndEnd/identityFace.js";
import { recomputeRunnerLink } from "../../state/hostingAndTrash/trashHooks.js";
import { fireOnFlipToBackIfRunMatchesFace } from "../../state/triggers/miscConditionalHooks.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { checkWinConditions } from "../../state/turnAndActions/scoring.js";
import {
  legalRebirthIdentityIds,
  switchRunnerIdentity,
} from "../../state/setupAndEnd/additionalIdentities.js";
import { CR } from "../../timing/labels.js";
import { fx, type Primitive } from "../ir.js";
import type { EffectCtx, EvalResult } from "../eval.js";

export function applySetupAndEndKinds(
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
    case "jinteki_biotech_flip": {
      if (!source) {
        return {
          ok: false,
          error: "Jinteki Biotech flip — no source.",
          cites: [],
        };
      }
      const faceId = source.chosenIdentityFaceId;
      const faces = source.identityFaceOptions ?? [];
      const face = faces.find((f) => f.id === faceId) ?? faces[0];
      if (!face) {
        log(state, `Jinteki Biotech — no face chosen.`);
        return { ok: true };
      }
      source.identityFlipped = !source.identityFlipped;
      // The newly faceup face is the active one (CR 3.1.1a).
      applyIdentityFace(source);
      log(state, `Jinteki Biotech flips (${face.label}).`);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "jinteki-flip-resolve",
            label: face.label,
            effect: face.onFlip,
          },
        ],
      });
      return { ok: true };
    }

    case "choose_jinteki_biotech_face": {
      if (!source) {
        return {
          ok: false,
          error: "Jinteki Biotech choose — no source.",
          cites: [],
        };
      }
      const faceId = (action as { faceId: string }).faceId;
      source.chosenIdentityFaceId = faceId;
      const face = (source.identityFaceOptions ?? []).find(
        (f) => f.id === faceId,
      );
      log(state, `Jinteki Biotech — choose face ${face?.label ?? faceId}.`);
      return { ok: true };
    }
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
