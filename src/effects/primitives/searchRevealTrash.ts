/** The Valley (val) SanSan pack primitives. */
import { revealCards } from "../../state/visibility/reveal.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import { applyIdentityFace } from "../../state/setupAndEnd/identityFace.js";
import type { RuleCite } from "../../state/types.js";
import { chooseCards } from "../triggers/chooseCards.js";
import { evalEffect } from "../eval.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random, shuffleInPlace } from "../../state/rng.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { enterSetAside } from "../../state/zones.js";
import { corpCanInstallByAbility } from "../install/corpAbilityInstall.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanValPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "search_stack_copies_to_heap": {
      const lastInstallId = state.turn.installedThisTurn.at(-1);
      const installed = lastInstallId ? state.cards[lastInstallId] : null;
      if (!installed?.defId) {
        log(state, `Paige Piper — no install this turn to search for.`);
        return { ok: true };
      }
      const defId = installed.defId;
      const copies = state.runner.deck.filter(
        (id) => state.cards[id]?.defId === defId,
      );
      if (copies.length === 0) {
        log(state, `Paige Piper — no copies of ${installed.title} in stack.`);
        // Still shuffle.
        // Fisher-Yates via existing shuffle if available — simple reverse+sort ok for test.
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(random(state) * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        return { ok: true };
      }
      // "any number of copies": the Runner says how many (CR 1.15.2).
      if (!action.cardIds) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: copies,
            count: copies.length,
            upTo: true,
            purpose: "resume",
            label: "add to the heap from the stack",
            resume: { kind: "search_stack_copies_to_heap" },
          }),
        );
      }
      const taken = action.cardIds.filter((id) => copies.includes(id));
      for (const id of taken) {
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        trashCard(state, id);
      }
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      log(
        state,
        `Paige Piper — add ${taken.length} copy/copies of ${installed.title} to heap; shuffle stack.`,
      );
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

    case "shuffle_jinteki_biotech_archives_into_rd": {
      const arch = [...state.corp.discardPile];
      state.corp.discardPile = [];
      for (const id of arch) {
        const c = state.cards[id];
        if (!c) continue;
        c.zone = "corp:rd";
        c.faceup = false;
        state.corp.deck.push(id);
      }
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      log(
        state,
        `Jinteki Biotech (Agriculture) — shuffle ${arch.length} Archives card(s) into R&D.`,
      );
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

    case "search_rd_asset_install": {
      // Tech Startup: search R&D for an asset, reveal it, and install it.
      // Shuffle R&D. A search with a criterion may find nothing
      // (CR 8.7.2e), so the Corp can stop without a card.
      // Only an asset the Corp can install may be found (CR 8.7.2b). Copies
      // of one card answer the same, so each title is tried once.
      const installableByDef = new Map<string, boolean>();
      const assets = state.corp.deck.filter((id) => {
        const card = state.cards[id];
        if (card?.type !== "asset") return false;
        const key = card.defId ?? id;
        let ok = installableByDef.get(key);
        if (ok === undefined) {
          ok = corpCanInstallByAbility(state, id);
          installableByDef.set(key, ok);
        }
        return ok;
      });
      if (!action.cardIds && assets.length > 0) {
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "corp",
            candidates: assets,
            count: 1,
            upTo: true,
            purpose: "resume",
            label: "reveal and install",
            resume: { kind: "search_rd_asset_install" },
          }),
        );
      }
      const pick = (action.cardIds ?? []).find((id) => assets.includes(id));
      // The found card is set aside facedown while the deck is shuffled
      // (CR 8.7.2, 4.8.4); the shuffle comes before the card is acted on
      // (CR 8.7.3).
      if (pick) {
        removeCardFromCurrentZone(state, pick);
        enterSetAside(state, [pick], { side: "corp", faceup: false });
      }
      shuffleInPlace(state, state.corp.deck);
      const title = source?.title ?? "Tech Startup";
      if (!pick) {
        log(
          state,
          `${title} — no asset found; shuffle R&D (CR ${CR.failToFind.number}, ${CR.shuffleDeckAfterSearch.number}).`,
        );
        return { ok: true };
      }
      log(
        state,
        `${title} — find an asset; shuffle R&D (CR ${CR.shuffleDeckAfterSearch.number}).`,
      );
      // Found cards are revealed when the ability resumes (CR 8.7.2c), to
      // both players (CR 1.21.3).
      revealCards(state, [pick], sourceId);
      // The Corp picks the destination through the normal install
      // process (CR 8.5.16b).
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "install_corp_card", cardId: pick },
      });
    }

    default:
      return null;
  }
}
