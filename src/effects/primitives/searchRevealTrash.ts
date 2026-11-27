import { log } from "../../state/setupAndEnd/createGame.js";
import { applyIdentityFace } from "../../state/setupAndEnd/identityFace.js";
import type { RuleCite } from "../../state/types.js";
import { evalEffect } from "../eval.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanValPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
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

    case "give_tag_remove_if_successful": {
      // Bandwidth: the tag goes through the tag procedure, so prevention
      // and avoidance apply to it (CR 9.9.6a). "If this run is successful,
      // the Runner removes 1 tag" is a separate instruction and does not
      // depend on the tag being taken.
      if (state.run) {
        state.run.bandwidthTagsToRemoveOnSuccess =
          (state.run.bandwidthTagsToRemoveOnSuccess ?? 0) + 1;
      }
      log(state, `Bandwidth — give Runner 1 tag (remove 1 if run successful).`);
      return evalEffect(ctx, fx.do({ kind: "give_tags", amount: 1 }));
    }

    default:
      return null;
  }
}
