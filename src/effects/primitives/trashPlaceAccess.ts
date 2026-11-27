import { log } from "../../state/setupAndEnd/createGame.js";
import {
  legalRebirthIdentityIds,
  switchRunnerIdentity,
} from "../../state/setupAndEnd/additionalIdentities.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import {
  fireOnAgendaAddedToRunnerScore,
  recomputeRunnerLink,
} from "../../state/hostingAndTrash/trashHooks.js";
import { enterLingeringPlayArea } from "../../state/zones.js";
import { noteCorpOperationPlayed } from "../../state/triggers/cardLifecycleHooks.js";
import { CR } from "../../timing/labels.js";
import { playEffectFromCard } from "../abilityRecord.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import type { RuleCite } from "../../state/types.js";
import { rfgCard } from "../run/runKinds.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyMumbadTlmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "may_corp_forfeit_liberated_chela_or_score": {
      const corpAgendas = state.corp.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (corpAgendas.length === 0) {
        return applyMumbadTlmPrimitive(ctx, {
          kind: "score_self",
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "forfeit-rfg",
            label: "Forfeit an agenda to remove Liberated Chela from the game",
            effect: fx.do({ kind: "corp_forfeit_rfg" }),
          },
          {
            id: "decline",
            label: "Decline — Runner scores Liberated Chela as 2 AP agenda",
            effect: fx.do({ kind: "score_self" }),
          },
        ],
      });
      return { ok: true };
    }

    case "corp_forfeit_rfg": {
      const agendas = state.corp.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (agendas.length === 0) {
        return applyMumbadTlmPrimitive(ctx, {
          kind: "score_self",
        });
      }
      if (agendas.length === 1) {
        return applyMumbadTlmPrimitive(ctx, {
          kind: "forfeit_resolve",
          agendaId: agendas[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.map((agendaId) => ({
          id: `forfeit:${agendaId}`,
          label: `Forfeit ${state.cards[agendaId]!.title}`,
          effect: fx.do({
            kind: "forfeit_resolve",
            agendaId,
          }),
        })),
      });
      return { ok: true };
    }

    case "forfeit_resolve": {
      const agendaId = action.agendaId;
      const agenda = state.cards[agendaId];
      if (!agenda || !state.corp.scoreArea.includes(agendaId)) {
        log(state, `Liberated Chela — agenda no longer in Corp score area.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, agendaId);
      state.corp.discardPile.push(agendaId);
      agenda.zone = "corp:archives";
      agenda.faceup = true;
      rfgCard(ctx, sourceId);
      log(
        state,
        `Liberated Chela — Corp forfeits ${agenda.title}; remove Liberated Chela from the game.`,
      );
      return { ok: true };
    }

    case "score_self": {
      if (!source) return { ok: true };
      const pts = 2;
      source.agendaPoints = pts;
      removeCardFromCurrentZone(state, sourceId);
      state.runner.scoreArea.push(sourceId);
      source.zone = "runner:score";
      source.faceup = true;
      source.rezzed = true;
      log(
        state,
        `Liberated Chela — add to Runner score area as a ${pts}-point agenda.`,
      );
      fireOnAgendaAddedToRunnerScore(state);
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

    case "play_resolve": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.deck.includes(cardId)) {
        log(state, `Consulting Visit — operation no longer in R&D.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((x) => x !== cardId);
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      enterLingeringPlayArea(state, cardId, "corp");
      noteCorpOperationPlayed(state, cardId);
      log(state, `Consulting Visit — play ${card.title} from R&D.`);
      const playFx = playEffectFromCard(card);
      if (playFx) {
        openPendingChoose(state, {
          sourceId: cardId,
          chooser: "corp",
          options: [
            {
              id: "resolve-op",
              label: `Resolve ${card.title}`,
              effect: playFx,
            },
          ],
        });
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
