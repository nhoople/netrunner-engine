/**
 * Primitive kinds for scoring and forfeiting agendas. The kind registry
 * (`applyCoreKinds`) dispatches here.
 */
import {
  removeCardFromCurrentZone,
  checkWinConditions,
  canScoreAgenda,
  scoreAgenda,
  moveForfeitedAgendaOutOfGame,
} from "../../state/turnAndActions/scoring.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import { type Effect, fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  applyPrimitive,
  fireOnForfeit,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { revealCards } from "../../state/visibility/reveal.js";
import { whenScoredEffect } from "../../state/turnAndActions/whenScored.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import { rfgCard } from "../run/runKinds.js";
import { fireOnAgendaAddedToRunnerScore } from "../../state/hostingAndTrash/trashHooks.js";
import { unhostCard } from "../../state/hostingAndTrash/host.js";
import { printsCanBeAdvanced } from "../../state/counters/advanceable.js";
import { getCardDef } from "../../cards/load.js";

export function installedCorpCards(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

function canAdvance(state: EffectCtx["state"], cardId: string): boolean {
  const c = state.cards[cardId];
  if (!c) return false;
  if (c.type === "agenda") return true;
  if (printsCanBeAdvanced(c)) return true;
  const def = c.defId ? getCardDef(c.defId) : undefined;
  return def ? printsCanBeAdvanced({ ...def, rezzed: c.rezzed }) : false;
}

export function applyScoreAndForfeitKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "score_self_as_agenda": {
      const pts = action.agendaPoints ?? source.agendaPoints ?? 1;
      source.agendaPoints = pts;
      removeCardFromCurrentZone(state, sourceId);
      state.corp.scoreArea.push(sourceId);
      source.zone = "corp:score";
      source.faceup = true;
      source.rezzed = true;
      source.convertedInto = "agenda";
      state.turn.agendaPointsScoredThisTurn += pts;
      log(
        state,
        `Corp adds ${source.title} to the score area as a ${pts}-point agenda (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }

    case "score_agenda_card": {
      const card = state.cards[action.cardId];
      if (!card) {
        return {
          ok: false,
          error: "Unknown agenda to score.",
          cites: [CR.scoringAgenda],
        };
      }
      if (state.turn.cannotScoreAgendas) {
        log(
          state,
          `Cannot score agendas this turn — skip (CR ${CR.scoringAgenda.number}).`,
        );
        return { ok: true };
      }
      if (!canScoreAgenda(state, card)) {
        log(
          state,
          `${card.title} cannot be scored — skip (CR ${CR.scoringAgenda.number}).`,
        );
        return { ok: true };
      }
      scoreAgenda(state, action.cardId);
      state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
      return { ok: true };
    }

    case "score_profiteering_on": {
      const options = [0, 1, 2, 3].map((n) => {
        const effects: Effect[] = [];
        if (n > 0) {
          effects.push({
            op: "do",
            action: { kind: "give_bad_publicity", amount: n },
          });
        }
        effects.push({
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: n * 5 },
        });
        return {
          id: `profiteering-${n}`,
          label:
            n === 0
              ? "Take no bad publicity"
              : `Take ${n} bad publicity — gain ${n * 5}¢`,
          effect: { op: "seq" as const, effects },
        };
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — choose bad publicity for credits.`,
      });
      return { ok: true };
    }

    case "score_project_ares_on": {
      const adv = source.advancementCounters ?? 0;
      const n = Math.max(0, adv - (action.past ?? 4));
      state.turn.projectAresTrashRemaining = n;
      state.turn.projectAresTrashedCount = 0;
      if (n <= 0) {
        log(state, `Project Ares — no overadvance trash.`);
        return { ok: true };
      }
      return applyPrimitive(ctx, { kind: "trash_project_ares_next" });
    }

    case "score_facedown_agenda_from_archives_if_clean": {
      if (state.turn.corpCardsAddedToArchivesThisTurn > 0) {
        log(
          state,
          `Regenesis — Corp cards were added to Archives this turn; skip.`,
        );
        return { ok: true };
      }
      // Regenesis: "you may reveal 1 facedown agenda in Archives and add it
      // to your score area".
      // The Corp makes the choice of which one, or none (CR 1.15.2, 9.6.9).
      // The agenda is revealed to both players first (CR 1.21.3).
      const facedownIds = state.corp.discardPile.filter((id) => {
        const c = state.cards[id];
        return c?.type === "agenda" && !c.faceup;
      });
      if (facedownIds.length === 0) {
        log(state, `Regenesis — no facedown agenda in Archives.`);
        return { ok: true };
      }
      if (!action.cardId) {
        openPendingChoose(state, {
          sourceId,
          chooser: "corp",
          options: [
            ...facedownIds.map((id) => ({
              id: `regenesis:${id}`,
              label: `Reveal ${state.cards[id]!.title} and add it to your score area`,
              effect: fx.do({
                kind: "score_facedown_agenda_from_archives_if_clean",
                cardId: id,
              }),
            })),
            {
              id: "decline",
              label: "Decline",
              effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
            },
          ],
          logLine: `${source.title} — may reveal a facedown agenda in Archives.`,
        });
        return { ok: true };
      }
      const facedown = action.cardId;
      if (!facedownIds.includes(facedown)) {
        log(state, `Regenesis — that agenda is not facedown in Archives.`);
        return { ok: true };
      }
      revealCards(state, [facedown], sourceId);
      const card = state.cards[facedown];
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== facedown,
      );
      state.corp.scoreArea.push(facedown);
      card.zone = "corp:score";
      card.faceup = true;
      card.rezzed = true;
      state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
      log(
        state,
        `Regenesis — score facedown ${card.title} from Archives for ${card.agendaPoints ?? 0} points (CR ${CR.scoringAgenda.number}).`,
      );
      checkWinConditions(state);
      return { ok: true };
    }

    case "forfeit_runner_scored_agenda": {
      const cardId = action.cardId;
      if (!state.runner.scoreArea.includes(cardId)) {
        return {
          ok: false,
          error: "Agenda not in Runner score area.",
          cites: [CR.scoringAgenda],
        };
      }
      state.runner.scoreArea = state.runner.scoreArea.filter(
        (id) => id !== cardId,
      );
      const card = state.cards[cardId]!;
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.installed = state.runner.installed.filter(
        (id) => id !== cardId,
      );
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(cardId)) {
        state.removedFromGame.push(cardId);
      }
      log(state, `Forfeit ${card.title} (RFG).`);
      return { ok: true };
    }

    case "forfeit_scored_agenda": {
      const cardId = action.cardId;
      if (!state.corp.scoreArea.includes(cardId)) {
        return {
          ok: false,
          error: "Agenda not in Corp score area.",
          cites: [CR.scoringAgenda],
        };
      }
      if (state.cards[cardId]?.cannotForfeit) {
        return {
          ok: false,
          error: "This agenda cannot be forfeited.",
          cites: [CR.scoringAgenda],
        };
      }
      const card = state.cards[cardId]!;
      fireOnForfeit(state, cardId);
      moveForfeitedAgendaOutOfGame(state, cardId);
      log(
        state,
        `Forfeit ${card.title}: it is removed from the game (CR ${CR.forfeit.number}).`,
      );
      return { ok: true };
    }

    case "forfeit_self": {
      const cardId = sourceId;
      if (!state.corp.scoreArea.includes(cardId)) {
        return {
          ok: false,
          error: "Source agenda not in Corp score area.",
          cites: [CR.scoringAgenda],
        };
      }
      if (state.cards[cardId]?.cannotForfeit) {
        return {
          ok: false,
          error: "This agenda cannot be forfeited.",
          cites: [CR.scoringAgenda],
        };
      }
      const card = state.cards[cardId]!;
      fireOnForfeit(state, cardId);
      moveForfeitedAgendaOutOfGame(state, cardId);
      log(
        state,
        `Forfeit ${card.title}: it is removed from the game (CR ${CR.forfeit.number}).`,
      );
      return { ok: true };
    }

    case "may_forfeit_return_stolen": {
      const stolenId = state.turn.lastStolenAgendaId;
      if (!stolenId || !state.runner.scoreArea.includes(stolenId)) {
        log(state, `${source.title} — no stolen agenda to return.`);
        return { ok: true };
      }
      if (!state.corp.scoreArea.includes(sourceId)) {
        log(state, `${source.title} — not in Corp score area.`);
        return { ok: true };
      }
      if (source.cannotForfeit) {
        log(state, `${source.title} — cannot be forfeited.`);
        return { ok: true };
      }
      const stolen = state.cards[stolenId]!;
      const gain = action.gainCredits;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "forfeit-return",
            label: `Forfeit ${source.title}: gain ${gain}¢ and return ${stolen.title} to HQ`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: {
                    kind: "forfeit_scored_agenda",
                    cardId: sourceId,
                  },
                },
                {
                  op: "do",
                  action: {
                    kind: "gain_credits",
                    side: "corp",
                    amount: gain,
                  },
                },
                {
                  op: "do",
                  action: {
                    kind: "return_stolen_agenda_to_hq",
                    cardId: stolenId,
                  },
                },
              ],
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
        logLine: `${source.title} — may forfeit to gain ${gain}¢ and return ${stolen.title} to HQ.`,
      });
      return { ok: true };
    }
    case "advance_equal_forfeit_advancement_requirement": {
      const x = state.lastForfeitedAdvancementRequirement ?? 0;
      if (x <= 0) {
        log(
          state,
          `Success — forfeited agenda had no advancement requirement.`,
        );
        return { ok: true };
      }
      const candidates = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      if (candidates.length === 0) {
        log(state, `Success — no advanceable card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `adv:${id}`,
          label: `Advance ${state.cards[id]!.title} ${x} time(s)`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: x,
            advance: true,
          }),
        })),
      });
      return { ok: true };
    }

    case "resolve_when_scored_on_scored_agenda": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const id of state.corp.scoreArea) {
        const card = state.cards[id];
        if (!card) continue;
        if (
          card.onScoreIfRunnerTaggedPlaceAgendaCounter &&
          (state.runner.tags ?? 0) <= 0
        ) {
          log(
            state,
            `${card.title}'s when-scored ability cannot resolve; Runner is not tagged (CR ${CR.whenScoredAdditionalRequirement.number}).`,
          );
          continue;
        }
        if (whenScoredEffect(card)) {
          // The ability resolves as the agenda's own, so "it" is the agenda
          // (Market Research's counter), not 24/7 News Cycle (CR 9.6.14d).
          options.push({
            id: `247:${id}`,
            label: `Resolve when-scored on ${card.title}`,
            effect: fx.do({
              kind: "score_bifrost_fire_scored_agenda_on",
              cardId: id,
            }),
          });
        }
      }
      if (options.length === 0) {
        log(state, `24/7 News Cycle — no when-scored ability can resolve.`);
        return { ok: true };
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "gain_text_of_runner_scored_agenda": {
      const agendas = state.runner.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (agendas.length === 0) {
        log(state, `Media Blitz — no agenda in Runner score.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `mb:${id}`,
          label: `Copy text of ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "dad_media_blitz_copy", cardId: id }),
        })),
      });
      return { ok: true };
    }
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
    case "may_score_bifrost_trigger_scored_agenda_on": {
      const candidates = state.corp.scoreArea.filter((id) => {
        if (id === sourceId) return false;
        const c = state.cards[id];
        if (!c || c.type !== "agenda") return false;
        if (c.defId === "bifrost-array") return false;
        return Boolean(whenScoredEffect(c));
      });
      if (candidates.length === 0) {
        log(state, `Bifrost Array — no other scored agenda with when-scored.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "bifrost-decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
          ...candidates.map((id) => ({
            id: `bifrost-fire:${id}`,
            label: `Trigger when-scored of ${state.cards[id]!.title}`,
            // Resolve as the target agenda's onScore with that card as source.
            effect: {
              op: "seq" as const,
              effects: [
                fx.do({
                  kind: "score_bifrost_fire_scored_agenda_on",
                  cardId: id,
                }),
              ],
            },
          })),
        ],
      });
      return { ok: true };
    }
    case "score_bifrost_fire_scored_agenda_on": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      const whenScored = card ? whenScoredEffect(card) : undefined;
      if (!card || !whenScored || !state.corp.scoreArea.includes(cardId)) {
        log(state, `Resolve when-scored — target agenda not available.`);
        return { ok: true };
      }
      log(state, `Resolve the when-scored ability of ${card.title}.`);
      // Queue the agenda's onScore as the sole pending choice option so
      // resolution uses cardId as source (via a trampoline pendingChoice).
      openPendingChoose(state, {
        sourceId: cardId,
        chooser: "corp",
        options: [
          {
            id: "bifrost-resolve",
            label: `Resolve ${card.title} when-scored`,
            effect: structuredClone(whenScored),
          },
        ],
      });
      return { ok: true };
    }
    case "score_encrypted_portals_on": {
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const ice = state.cards[id];
          if (ice?.rezzed && (ice.subtypes ?? []).includes("code gate")) n += 1;
        }
      }
      if (n > 0) {
        state.corp.credits += n;
        log(state, `Encrypted Portals — gain ${n}¢ for rezzed code gates.`);
      }
      return { ok: true };
    }
    case "score_agenda_from_hq": {
      const cardId = action.cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.corp.hand.splice(idx, 1);
      state.corp.scoreArea.push(cardId);
      const card = state.cards[cardId]!;
      card.zone = "corp:score";
      card.faceup = true;
      log(state, `Plan B — score ${card.title} from HQ.`);
      return { ok: true };
    }
    case "may_corp_forfeit_liberated_chela_or_score": {
      const corpAgendas = state.corp.scoreArea.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (corpAgendas.length === 0) {
        return applyScoreAndForfeitKinds(ctx, {
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
        return applyScoreAndForfeitKinds(ctx, {
          kind: "score_self",
        });
      }
      if (agendas.length === 1) {
        return applyScoreAndForfeitKinds(ctx, {
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
    default:
      return null;
  }
}

export function applyScoreAndForfeitKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "add_hosted_agenda_to_runner_score": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted agenda.`);
        return { ok: true };
      }
      const agendaId = hosted[0]!;
      const agenda = state.cards[agendaId]!;
      unhostCard(state, agenda.id);
      removeCardFromCurrentZone(state, agendaId);
      state.runner.scoreArea.push(agendaId);
      agenda.zone = "runner:score";
      agenda.faceup = true;
      agenda.rezzed = true;
      log(
        state,
        `${source.title} — add hosted ${agenda.title} to Runner score.`,
      );
      fireOnAgendaAddedToRunnerScore(state);
      return { ok: true };
    }
    default:
      return null;
  }
}
