import { log } from "../../state/setupAndEnd/createGame.js";
import { applyIdentityFace } from "../../state/setupAndEnd/identityFace.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { Primitive } from "../ir.js";

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

    default:
      return null;
  }
}
