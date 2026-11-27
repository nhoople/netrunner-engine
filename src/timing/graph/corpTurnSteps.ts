/** The Corp's turn (CR 11.2): draw phase, action phase, discard phase; part of STEPS in timing/graph.ts. */
import { beginCorpTurnFlags } from "../../state/turnAndActions/turn.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import {
  corp,
  pendingTurnBeginIds,
  sweepDerezAtAnyTurnEnd,
} from "./stepHelpers.js";
import { refillRecurringCredits } from "../../state/keywordsAndCredits/costs.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import {
  noteCorpTenninTurnBegin,
  noteCorpOnTurnBegin,
  noteCorpOnTurnBeginIfRunnerTagged,
  noteOnCorpTurnBeginIfRunnerUntagged,
  noteOnCorpTurnBegin,
} from "../../state/turnAndActions/corpTurnBeginHooks.js";
import { recomputeRunnerMaxHandSize } from "../../state/continuous/handSize.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { trashActiveLockdownsAtCorpTurnBegin } from "../../state/continuous/lockdowns.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import { noteCorpActionPhaseEnd } from "../../state/turnAndActions/phaseEndHooks.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import {
  noteOnScoreTurnEnd,
  noteOnCorpTurnEnd,
} from "../../state/turnAndActions/corpTurnEndHooks.js";
import type { TimingStepDef } from "../graph.js";

export const CORP_TURN_STEP_DEFS: Record<string, TimingStepDef> = {
  // --- Corp turn (appendix 11.2) ---
  "corp.gainClicks": corp(
    "corp.gainClicks",
    "sec_appendix_timing_structure_corps_turn_1_a",
    "11.2_1_a",
    "The Corp gains allotted clicks.",
    "pass",
    "corp_draw",
    "corp.drawPaw",
    {
      onResolve: (s) => {
        beginCorpTurnFlags(s);
        let allotted = 3;
        for (const card of Object.values(s.cards)) {
          if (!card.rezzed) continue;
          if (card.side !== "corp") continue;
          if (abilitiesSuppressed(s, card.id)) continue;
          allotted += card.allottedClicksBonus ?? 0;
        }
        // Akshara Sareen: Corp +N while Runner connection installed.
        for (const id of s.runner.installed) {
          if (abilitiesSuppressed(s, id)) continue;
          allotted += s.cards[id]?.corpAllottedClicksBonusWhileInstalled ?? 0;
        }
        const pending = s.corpAllottedClicksDeltaNextTurn ?? 0;
        if (pending !== 0) {
          allotted += pending;
          s.corpAllottedClicksDeltaNextTurn = 0;
        }
        allotted = Math.max(0, allotted);
        s.corp.clicks = allotted;
        s.log.push(
          `Corp gains ${allotted} clicks (CR 1.11.2a / appendix 11.2_1_a).`,
        );
      },
    },
  ),
  "corp.drawPaw": corp(
    "corp.drawPaw",
    "sec_appendix_timing_structure_corps_turn_1_b",
    "11.2_1_b",
    "Paid ability window: (P) (R) (S).",
    "pass",
    "corp_draw",
    "corp.recurring",
  ),
  "corp.recurring": corp(
    "corp.recurring",
    "sec_appendix_timing_structure_corps_turn_1_c",
    "11.2_1_c",
    "The Corp's recurring credits refill.",
    "auto",
    "corp_draw",
    "corp.turnBegins",
    {
      onResolve: (s) => {
        refillRecurringCredits(s, "corp");
      },
    },
  ),
  "corp.turnBegins": corp(
    "corp.turnBegins",
    "sec_appendix_timing_structure_corps_turn_1_d",
    "11.2_1_d",
    "The Corp's turn begins.",
    "auto",
    "corp_draw",
    "corp.mandatoryDraw",
    {
      onResolve: (s) => {
        // The step comes back here once a turn-begin ability's choice is
        // answered. The turn began already: its "when your turn begins"
        // conditionals were marked once (CR 9.6.6), so do not note them
        // again. Resolve any still pending, then move on.
        if (s.turn.corpTurnBegan) {
          if (pendingTurnBeginIds(s).length > 0) {
            checkpointAfterInstruction(s, "corp.turnBegins");
          }
          return;
        }
        s.turn.corpTurnBegan = true;
        s.log.push(`Corp turn begins (appendix 11.2_1_d).`);
        noteCorpTenninTurnBegin(s);
        if (s.corpCannotAdvanceCardsNextTurn) {
          s.turn.cannotAdvanceCards = true;
          s.corpCannotAdvanceCardsNextTurn = false;
          s.log.push(
            `The Price of Freedom — Corp cannot advance cards this turn.`,
          );
        }
        if (s.bfCannotScoreUntilNextCorpTurn?.length) {
          s.bfCannotScoreUntilNextCorpTurn = [];
          s.log.push(`PAD Factory — cannot-score until next turn clears.`);
        }
        // Valley Grid, Gyri Labyrinth: the hand-size penalty ends when the
        // Corp's turn begins.
        if ((s.runner.handSizePenaltyUntilCorpTurn ?? 0) > 0) {
          s.runner.handSizePenaltyUntilCorpTurn = 0;
          recomputeRunnerMaxHandSize(s);
          s.log.push(`Runner max hand size penalty clears (Corp turn begins).`);
        }
        // Jinteki Biotech: choose face before first Corp turn if unset.
        {
          const idCard = s.cards[s.corp.identityId];
          if (
            idCard?.chooseIdentityFaceBeforeFirstTurn &&
            !idCard.chosenIdentityFaceId &&
            (idCard.identityFaceOptions?.length ?? 0) > 0
          ) {
            openPendingChoose(s, {
              sourceId: idCard.id,
              chooser: "corp",
              options: idCard.identityFaceOptions!.map((face) => ({
                id: `jb-face:${face.id}`,
                label: face.label,
                effect: {
                  op: "do" as const,
                  action: {
                    kind: "choose_jinteki_biotech_face" as const,
                    faceId: face.id,
                  },
                },
              })),
            });
          }
        }
        // Lockdowns: trash at turn begin before pending conditionals (CR 3.5.1c).
        trashActiveLockdownsAtCorpTurnBegin(s);
        // Subliminal Messaging: "When your turn begins, if this card is in
        // Archives and the Runner did not initiate any runs during their last
        // turn, you may reveal this card and add it to HQ." Each copy is an
        // optional conditional ability among the turn-begin ones (CR 9.6.9,
        // 10.3.1a).
        if (!s.turn.runnerMadeRunLastTurn) {
          for (const id of s.corp.discardPile) {
            const card = s.cards[id];
            if (!card?.subliminalMessaging) continue;
            noteInlineConditional(s, {
              cardId: id,
              abilityKey: "subliminal-messaging-return",
              controller: "corp",
              mandatory: true,
              // It can only meet its condition in Archives, so it is active
              // there (CR 9.1.8b).
              independentOfSource: true,
              effect: {
                op: "choose",
                chooser: "corp",
                options: [
                  {
                    id: "add",
                    label: `Reveal ${card.title} and add it to HQ`,
                    effect: {
                      op: "do",
                      action: {
                        kind: "move_archives_to_hq",
                        cardId: id,
                        reveal: true,
                      },
                    },
                  },
                  {
                    id: "decline",
                    // A copy discarded from HQ is facedown in Archives
                    // (CR 5.5.2a); a label that describes the card would
                    // tell the Runner which facedown card it is (CR 10.2.2a).
                    label: "Decline",
                    effect: {
                      op: "do",
                      action: { kind: "gain_credits", side: "corp", amount: 0 },
                    },
                  },
                ],
              },
              logLine: `${card.title} becomes pending — Corp turn begin (in Archives).`,
            });
          }
        }
        // Corp turn-begin conditionals — note for 10.3.1a.
        for (const card of Object.values(s.cards)) {
          if (card.side !== "corp" || !card.rezzed || !card.onTurnBegin)
            continue;
          noteCorpOnTurnBegin(
            s,
            card.id,
            `${card.title} becomes pending — Corp turn begin.`,
          );
        }
        for (const id of s.corp.scoreArea) {
          const card = s.cards[id];
          if (!card?.onTurnBegin) continue;
          noteCorpOnTurnBegin(
            s,
            id,
            `${card.title} becomes pending — Corp turn begin.`,
          );
        }
        // SSL Endorsement-class: agendas in Runner score whose onTurnBegin
        // remains active on the Corp's turn.
        for (const id of s.runner.scoreArea) {
          const card = s.cards[id];
          if (
            !card?.onTurnBegin ||
            !card.onTurnBeginFromRunnerScoreOnCorpTurn
          ) {
            continue;
          }
          noteCorpOnTurnBegin(
            s,
            id,
            `${card.title} becomes pending — Corp turn begin (from Runner score).`,
          );
        }
        for (const id of s.corp.scoreArea) {
          noteCorpOnTurnBeginIfRunnerTagged(s, id);
        }
        for (const id of s.runner.installed) {
          noteOnCorpTurnBeginIfRunnerUntagged(s, id);
        }
        for (const id of s.runner.installed) {
          noteOnCorpTurnBegin(s, id);
        }
        if ((s.turn.corpTurnBeginPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "corp.turnBegins");
        }
      },
    },
  ),
  "corp.mandatoryDraw": corp(
    "corp.mandatoryDraw",
    "sec_appendix_timing_structure_corps_turn_1_e",
    "11.2_1_e",
    "The Corp draws 1 card.",
    "pass",
    "corp_draw",
    "corp.actionPaw",
  ),
  "corp.actionPaw": corp(
    "corp.actionPaw",
    "sec_appendix_timing_structure_corps_turn_2_a",
    "11.2_2_a",
    "Paid ability window: (P) (R) (S).",
    "pass",
    "corp_action",
    "corp.checkClicks",
  ),
  "corp.checkClicks": corp(
    "corp.checkClicks",
    "sec_appendix_timing_structure_corps_turn_2_b",
    "11.2_2_b",
    "Does the Corp have unspent clicks?",
    "branch",
    "corp_action",
    (s) => (s.corp.clicks > 0 ? "corp.takeAction" : "corp.actionPhaseEnd"),
  ),
  "corp.takeAction": corp(
    "corp.takeAction",
    "sec_appendix_timing_structure_corps_turn_2_b_ii",
    "11.2_2_b_ii",
    "If yes, the Corp takes an action.",
    "action",
    "corp_action",
    "corp.actionPaw",
    {
      allows: [
        "basic_gain_credit",
        "basic_draw",
        "basic_install",
        "play_operation",
        "advance",
        "basic_trash_resource",
        "basic_purge_virus",
      ],
    },
  ),
  "corp.actionPhaseEnd": corp(
    "corp.actionPhaseEnd",
    "sec_appendix_timing_structure_corps_turn_2_d",
    "11.2_2_d",
    "The Corp's action phase ends.",
    "pass",
    "corp_action",
    "corp.discard",
    {
      onResolve: (s) => {
        noteCorpActionPhaseEnd(s);
        if ((s.turn.corpActionPhaseEndPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "corp.actionPhaseEnd");
        }
      },
    },
  ),
  "corp.discard": corp(
    "corp.discard",
    "sec_appendix_timing_structure_corps_turn_3_a",
    "11.2_3_a",
    "The Corp discards cards.",
    "discard",
    "corp_discard",
    "corp.discardPaw",
    { allows: ["discard_to_hand_size"] },
  ),
  "corp.discardPaw": corp(
    "corp.discardPaw",
    "sec_appendix_timing_structure_corps_turn_3_b",
    "11.2_3_b",
    "Paid ability window: (P) (R).",
    "pass",
    "corp_discard",
    "corp.loseClicks",
  ),
  "corp.loseClicks": corp(
    "corp.loseClicks",
    "sec_appendix_timing_structure_corps_turn_3_c",
    "11.2_3_c",
    "The Corp loses unspent {click}.",
    "auto",
    "corp_discard",
    "corp.turnEnds",
    {
      onResolve: (s) => {
        s.corp.clicks = 0;
      },
    },
  ),
  "corp.turnEnds": corp(
    "corp.turnEnds",
    "sec_appendix_timing_structure_corps_turn_3_d",
    "11.2_3_d",
    "The Corp's turn ends.",
    "auto",
    "corp_discard",
    "corp.turnComplete",
    {
      onResolve: (s) => {
        // When the Corp turn ends, gain credits if Archives has a facedown card.
        const idCard = s.cards[s.corp.identityId];
        const facedownGain =
          idCard?.gainCreditOnCorpTurnEndIfArchivesHasFacedown ?? 0;
        if (
          idCard &&
          facedownGain > 0 &&
          !abilitiesSuppressed(s, idCard.id) &&
          s.corp.discardPile.some((id) => !s.cards[id].faceup)
        ) {
          s.corp.credits += facedownGain;
          log(
            s,
            `${idCard.title} — gain ${facedownGain}¢ (facedown Archives).`,
          );
        }
        // Klevetnik, the mark, and temporary subtypes expire at the next
        // checkpoint (CR 9.10.1 / 10.3.1b / 10.11.4).
        s.turn.turnDurationsPassed = "corp";
        // onScoreTurnEnd / onCorpTurnEnd — note for 10.3.1a.
        for (const id of s.corp.scoreArea) {
          noteOnScoreTurnEnd(s, id);
        }
        for (const card of Object.values(s.cards)) {
          if (!card.onCorpTurnEnd || !card.rezzed) continue;
          if (!card.zone.endsWith(":root")) continue;
          noteOnCorpTurnEnd(s, card.id);
        }
        // Scored agendas (Jumon): onCorpTurnEnd while in Corp score area.
        for (const id of s.corp.scoreArea) {
          noteOnCorpTurnEnd(s, id);
        }
        if (
          (s.turn.corpTurnEndPendingIds ?? []).length > 0 ||
          (s.turn.scoreTurnEndPendingIds ?? []).length > 0
        ) {
          checkpointAfterInstruction(s, "corp.turnEnds");
        }
        // Sensor Net Activation: derez bioroids rezzed via agenda counter.
        const sensorPendingCorp = [...(s.turn.sensorNetPendingDerezIds ?? [])];
        s.turn.sensorNetPendingDerezIds = [];
        for (const id of sensorPendingCorp) {
          const c = s.cards[id];
          if (!c?.rezzed) continue;
          c.rezzed = false;
          s.log.push(`Sensor Net Activation — derez ${c.title} at turn end.`);
        }
        sweepDerezAtAnyTurnEnd(s);
      },
    },
  ),
  "corp.turnComplete": corp(
    "corp.turnComplete",
    "sec_appendix_timing_structure_corps_turn_3_e",
    "11.2_3_e",
    "The Corp's turn is complete, and the game moves to the Runner's turn.",
    "pass",
    "corp_discard",
    "runner.gainClicks",
    {
      onResolve: (s) => {
        s.activeSide = "runner";
        s.log.push("Runner turn begins.");
      },
    },
  ),
};
