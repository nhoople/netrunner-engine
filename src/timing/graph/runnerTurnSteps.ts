/** The Runner's turn (CR 11.3): action phase and discard phase; part of STEPS in timing/graph.ts. */
import { beginRunnerTurnFlags } from "../../state/turnAndActions/turn.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import {
  runner,
  pendingTurnBeginIds,
  noteOpenTurnBeginWaiting,
  sweepDerezAtAnyTurnEnd,
} from "./stepHelpers.js";
import { refillRecurringCredits } from "../../state/keywordsAndCredits/runnerCredits.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import { onRunnerTurnBegan } from "../../state/cardFlags/cardDeclarations.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import {
  noteRunnerIdentityOnTurnBegin,
  noteRunnerRigTurnBegin,
  noteOnRunnerTurnBegin,
  noteRunnerScoreOnTurnBegin,
} from "../../state/turnAndActions/runnerTurnBeginHooks.js";
import { lingeringPlayAreaIds } from "../../state/zones.js";
import { noteRunnerActionPhaseEnd } from "../../state/turnAndActions/phaseEndHooks.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import { onRunnerTurnEnds } from "../../state/cardFlags/staticFlags.js";
import { computeRunnerMaxHandSize } from "../../state/continuous/handSize.js";
import { evalEffect } from "../../effects/eval.js";
import { noteOnRunnerTurnEnd } from "../../state/turnAndActions/runnerTurnEndHooks.js";
import { unhostCard } from "../../state/hostingAndTrash/host.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { CR } from "../labels.js";
import type { TimingStepDef } from "../graph.js";

export const RUNNER_TURN_STEP_DEFS: Record<string, TimingStepDef> = {
  // --- Runner turn (appendix 11.3) ---
  "runner.gainClicks": runner(
    "runner.gainClicks",
    "sec_appendix_timing_structure_runners_turn_1_a",
    "11.3_1_a",
    "The Runner gains allotted clicks.",
    "pass",
    "runner_action",
    "runner.startPaw",
    {
      onResolve: (s) => {
        beginRunnerTurnFlags(s);
        let allotted = 4;
        const clickSources = [
          ...s.runner.installed,
          s.runner.identityId,
          s.corp.identityId,
        ];
        for (const id of clickSources) {
          if (abilitiesSuppressed(s, id)) continue;
          allotted +=
            (s.cards[id]?.allottedClicksBonus ?? 0) +
            (s.cards[id]?.runnerAllottedClicksBonus ?? 0);
        }
        const pending = s.runnerAllottedClicksDeltaNextTurn ?? 0;
        if (pending !== 0) {
          allotted += pending;
          s.runnerAllottedClicksDeltaNextTurn = 0;
        }
        allotted = Math.max(0, allotted);
        s.runner.clicks = allotted;
        s.log.push(
          `Runner gains ${allotted} clicks (CR 1.11.2b / appendix 11.3_1_a). No draw phase (CR 5.3.3).`,
        );
      },
    },
  ),
  "runner.startPaw": runner(
    "runner.startPaw",
    "sec_appendix_timing_structure_runners_turn_1_b",
    "11.3_1_b",
    "Paid ability window: (P) (R).",
    "pass",
    "runner_action",
    "runner.recurring",
  ),
  "runner.recurring": runner(
    "runner.recurring",
    "sec_appendix_timing_structure_runners_turn_1_c",
    "11.3_1_c",
    "The Runner's recurring credits refill.",
    "auto",
    "runner_action",
    "runner.turnBegins",
    {
      onResolve: (s) => {
        refillRecurringCredits(s, "runner");
      },
    },
  ),
  "runner.turnBegins": runner(
    "runner.turnBegins",
    "sec_appendix_timing_structure_runners_turn_1_d",
    "11.3_1_d",
    "The Runner's turn begins.",
    "auto",
    "runner_action",
    "runner.actionPaw",
    {
      onResolve: (s) => {
        // The step comes back here once a turn-begin ability's choice is
        // answered. The turn began already: the next checkpoint marked one
        // instance per "when your turn begins" conditional (CR 9.6.6), so do
        // not note them again. Resolve any that are still pending, then move on.
        if (s.turn.runnerTurnBegan) {
          if (pendingTurnBeginIds(s).length > 0) {
            checkpointAfterInstruction(s, "runner.turnBegins");
            noteOpenTurnBeginWaiting(s);
          }
          return;
        }
        s.turn.runnerTurnBegan = true;
        onRunnerTurnBegan(s);
        s.log.push(`Runner turn begins (appendix 11.3_1_d).`);
        s.turn.leveragePreventRunnerDamage = false;
        s.turn.tlmDedicatedNeuralNetUsedThisTurn = false;
        // Security Testing: the Runner may choose a server. The choice lasts
        // only until this turn ends (CR 9.10.3b).
        // Patron: choose a server.
        for (const id of s.runner.installed) {
          const card = s.cards[id];
          if (card.securityTesting && !s.pendingChoice) {
            card.namedServerId = undefined;
            openPendingChoose(s, {
              sourceId: id,
              chooser: "runner",
              options: [
                {
                  id: "st-decline",
                  label: "Do not choose a server",
                  effect: {
                    op: "do",
                    action: { kind: "gain_credits", side: "runner", amount: 0 },
                  },
                },
                ...Object.values(s.servers).map((server) => ({
                  id: `st-server:${server.id}`,
                  label: `Choose ${server.id}`,
                  effect: {
                    op: "do" as const,
                    action: {
                      kind: "gain_credits" as const,
                      side: "runner" as const,
                      amount: 0,
                    },
                  },
                })),
              ],
              logLine: `${card.title} — you may choose a server (CR 9.10.3b).`,
            });
          }
          if (typeof card.patronChooseServerDrawInsteadOfBreach === "number") {
            // A server chosen on an earlier turn is gone: the choice lasts
            // until that turn ends (CR 9.10.3b), so declining leaves none.
            card.namedServerId = undefined;
            noteInlineConditional(s, {
              cardId: id,
              abilityKey: "patron-choose-server",
              controller: "runner",
              mandatory: true,
              effect: { op: "do", action: { kind: "choose_patron_server" } },
              logLine: `${card.title} becomes pending — turn begin (choose server).`,
            });
          }
        }
        // Runner turn-begin conditionals — note for 10.3.1a.
        noteRunnerIdentityOnTurnBegin(s, s.runner.identityId);
        for (const id of s.runner.installed) {
          noteRunnerRigTurnBegin(s, id);
        }
        // Out of the Ashes: heap may RFG self to make a run.
        for (const id of [...s.runner.discardPile]) {
          const card = s.cards[id];
          if (!card?.heapOnTurnBeginMayRfgSelfToMakeRun) continue;
          noteInlineConditional(s, {
            cardId: id,
            abilityKey: "heap-on-turn-begin-may-rfg-self-to-make-run",
            controller: "runner",
            mandatory: true,
            effect: {
              op: "choose",
              chooser: "runner",
              options: [
                {
                  id: "accept",
                  label: `Remove ${card.title} from the game to make a run`,
                  effect: {
                    op: "do",
                    action: { kind: "tlm_out_of_ashes_rfg_and_run" },
                  },
                },
                {
                  id: "decline",
                  label: "Decline",
                  effect: {
                    op: "do",
                    action: { kind: "gain_credits", side: "runner", amount: 0 },
                  },
                },
              ],
            },
            logLine: `${card.title} becomes pending — Runner turn begin (may RFG self to make a run).`,
            independentOfSource: true,
          });
        }
        for (const server of Object.values(s.servers)) {
          for (const id of server.root) {
            const card = s.cards[id];
            if (!card?.rezzed || !card.onRunnerTurnBegin) continue;
            noteOnRunnerTurnBegin(s, id);
          }
        }
        for (const id of s.corp.scoreArea) {
          noteOnRunnerTurnBegin(s, id);
        }
        // Door to Door-class: currents in corp lingering play-area.
        for (const cid of lingeringPlayAreaIds(s, "corp")) {
          noteOnRunnerTurnBegin(s, cid);
        }
        // Project Vacheron et al.: agendas in Runner score with onTurnBegin.
        for (const id of s.runner.scoreArea) {
          noteRunnerScoreOnTurnBegin(s, id);
        }
        if (
          (s.turn.runnerTurnBeginPending ?? []).length > 0 ||
          (s.turn.inlineConditionalPending ?? []).length > 0
        ) {
          checkpointAfterInstruction(s, "runner.turnBegins");
          noteOpenTurnBeginWaiting(s);
        }
      },
    },
  ),
  "runner.actionPaw": runner(
    "runner.actionPaw",
    "sec_appendix_timing_structure_runners_turn_1_e",
    "11.3_1_e",
    "Paid ability window: (P) (R).",
    "pass",
    "runner_action",
    "runner.checkClicks",
  ),
  "runner.checkClicks": runner(
    "runner.checkClicks",
    "sec_appendix_timing_structure_runners_turn_1_f",
    "11.3_1_f",
    "Does the Runner have unspent clicks?",
    "branch",
    "runner_action",
    (s) =>
      s.runner.clicks > 0 ? "runner.takeAction" : "runner.actionPhaseEnd",
  ),
  "runner.takeAction": runner(
    "runner.takeAction",
    "sec_appendix_timing_structure_runners_turn_1_f_ii",
    "11.3_1_f_ii",
    "If yes, the Runner takes an action.",
    "action",
    "runner_action",
    "runner.actionPaw",
    {
      allows: [
        "basic_gain_credit",
        "basic_draw",
        "basic_install",
        "basic_run",
        "basic_remove_tag",
        "play_event",
        "use_identity_ability",
      ],
    },
  ),
  "runner.actionPhaseEnd": runner(
    "runner.actionPhaseEnd",
    "sec_appendix_timing_structure_runners_turn_1_h",
    "11.3_1_h",
    "The Runner's action phase ends.",
    "pass",
    "runner_action",
    "runner.discard",
    {
      onResolve: (s) => {
        noteRunnerActionPhaseEnd(s);
        if ((s.turn.runnerActionPhaseEndPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "runner.actionPhaseEnd");
        }
      },
    },
  ),
  "runner.discard": runner(
    "runner.discard",
    "sec_appendix_timing_structure_runners_turn_2_a",
    "11.3_2_a",
    "The Runner discards cards.",
    "discard",
    "runner_discard",
    "runner.discardPaw",
    {
      allows: ["discard_to_hand_size"],
      onResolve: (s) => {
        // Chameleon: return to grip at discard phase.
        for (const id of [...s.runner.installed]) {
          const card = s.cards[id];
          if (!card.returnToGripAtDiscardPhase) continue;
          uninstallCard(s, id, "hand");
          s.log.push(`${card.title} — return to grip (discard phase).`);
        }
        // Kabonesa Wu: RFG tracked installs still installed at turn end.
        const kabonesaTracked = s.turn.dtwnKabonesaTrackedInstallIds ?? [];
        for (const id of kabonesaTracked) {
          if (!s.runner.installed.includes(id)) continue;
          const card = s.cards[id];
          uninstallCard(s, id, "removed-from-game");
          s.log.push(
            `Kabonesa Wu — remove ${card?.title ?? id} from the game.`,
          );
        }
        s.turn.dtwnKabonesaTrackedInstallIds = [];
      },
    },
  ),
  "runner.discardPaw": runner(
    "runner.discardPaw",
    "sec_appendix_timing_structure_runners_turn_2_b",
    "11.3_2_b",
    "Paid ability window: (P) (R).",
    "pass",
    "runner_discard",
    "runner.loseClicks",
  ),
  "runner.loseClicks": runner(
    "runner.loseClicks",
    "sec_appendix_timing_structure_runners_turn_2_c",
    "11.3_2_c",
    "The Runner loses unspent {click}.",
    "auto",
    "runner_discard",
    "runner.turnEnds",
    {
      onResolve: (s) => {
        s.runner.clicks = 0;
      },
    },
  ),
  "runner.turnEnds": runner(
    "runner.turnEnds",
    "sec_appendix_timing_structure_runners_turn_2_d",
    "11.3_2_d",
    "The Runner's turn ends.",
    "auto",
    "runner_discard",
    "runner.turnComplete",
    {
      onResolve: (s) => {
        onRunnerTurnEnds(s);
        // Safety First: "When your turn ends, draw 1 card if you do not have
        // cards in your grip equal to or greater than your maximum hand
        // size." A draw, through the draw procedure (CR 8.4.5).
        for (const id of [...s.runner.installed]) {
          if (abilitiesSuppressed(s, id)) continue;
          const card = s.cards[id];
          const n = card?.drawAtTurnEndIfGripBelowMaxHandSize ?? 0;
          if (n <= 0) continue;
          if (s.runner.hand.length >= computeRunnerMaxHandSize(s)) continue;
          s.log.push(`${card!.title} — draw ${n} (grip below max hand size).`);
          evalEffect(
            { state: s, sourceId: id },
            { op: "do", action: { kind: "draw", side: "runner", amount: n } },
          );
        }
        // A lingering effect that returns a program to the stack at the end of the turn
        // (Test Run). It no longer depends on the event that created it (CR 8.6.4).
        for (const id of [...s.runner.installed]) {
          const card = s.cards[id];
          if (!card?.bounceToStackAtTurnEnd) continue;
          card.bounceToStackAtTurnEnd = false;
          s.log.push(
            `${card.title} returns to the stack at the end of the turn.`,
          );
          // Nanuq goes to the removed-from-game zone instead (CR 9.1.8g).
          uninstallCard(s, id, "deck-top");
        }
        // onRunnerTurnEnd (identity, rig, heap) — note for 10.3.1a.
        noteOnRunnerTurnEnd(s, s.runner.identityId);
        for (const id of [...s.runner.installed]) {
          noteOnRunnerTurnEnd(s, id);
        }
        // Crowdfunding-class: heap cards with onRunnerTurnEnd.
        for (const id of [...s.runner.discardPile]) {
          noteOnRunnerTurnEnd(s, id);
        }
        if ((s.turn.runnerTurnEndPendingIds ?? []).length > 0) {
          checkpointAfterInstruction(s, "runner.turnEnds");
        }
        // Algernon-class: trash if click-gain was taken and no successful run.
        for (const id of [...s.runner.installed]) {
          const card = s.cards[id];
          if (!card?.trashAtTurnEndUnlessSuccessfulRun) continue;
          card.trashAtTurnEndUnlessSuccessfulRun = false;
          if (s.turn.successfulRunThisTurn) continue;
          noteInlineConditional(s, {
            cardId: id,
            abilityKey: "trash-at-turn-end-unless-successful-run",
            controller: "runner",
            mandatory: true,
            effect: { op: "do", action: { kind: "trash_self" } },
            logLine: `${card.title} becomes pending — turn end (trash unless successful run).`,
          });
        }
        // London Library: trash all programs hosted when Runner turn ends.
        for (const id of [...s.runner.installed]) {
          const host = s.cards[id];
          if (!host?.trashHostedProgramsOnTurnEnd) continue;
          for (const hid of [...(host.hostedCardIds ?? [])]) {
            const hosted = s.cards[hid];
            if (!hosted || hosted.type !== "program") continue;
            unhostCard(s, hosted.id);
            trashCard(s, hid);
            s.log.push(
              `${host.title} — trash hosted ${hosted.title} at turn end.`,
            );
          }
        }

        // Bug-Out Bag: if grip empty at turn end, draw per power then trash.
        for (const rid of [...s.runner.installed]) {
          const card = s.cards[rid];
          if (!card?.onTurnEndIfGripEmptyDrawPerPowerThenTrash) continue;
          if (s.runner.hand.length > 0) continue;
          noteInlineConditional(s, {
            cardId: rid,
            abilityKey: "bug-out-bag-draw-per-power-then-trash",
            controller: "runner",
            mandatory: true,
            effect: { op: "do", action: { kind: "draw_per_power_then_trash" } },
            logLine: `${card.title} becomes pending — turn end with empty grip (draw then trash).`,
          });
        }

        // Joshua B.-class: take 1 tag at turn end. The delayed ability
        // outlives the source card and expires once it resolves (CR 9.6.13c).
        const delayedTags = s.turn.delayedTurnEndTags;
        s.turn.delayedTurnEndTags = [];
        for (const pending of delayedTags) {
          s.log.push(
            `${pending.title}'s delayed ability resolves; take 1 tag (CR ${CR.delayedAbilityOnce.number}).`,
          );
          noteInlineConditional(s, {
            cardId: pending.sourceId,
            abilityKey: "delayed-turn-end-tag",
            controller: "runner",
            mandatory: true,
            effect: { op: "do", action: { kind: "give_tags", amount: 1 } },
            logLine: `${pending.title} becomes pending — delayed turn-end tag resolves.`,
            // CR 9.6.13c — delayed ability outlives the source card.
            independentOfSource: true,
          });
        }
        // Lightning Laboratory: delayed derez at end of the turn the ability was used
        // (runs are on the Runner turn → runner.turnEnds).
        const pending = s.turn.lightningPendingDerez;
        if (pending) {
          s.turn.lightningPendingDerez = null;
          const src =
            s.corp.scoreArea.find((id) => {
              const c = s.cards[id];
              return Boolean(
                c?.onCorpTurnEndDerezUpToIceProtectingLightningServer,
              );
            }) ?? s.corp.identityId;
          noteInlineConditional(s, {
            cardId: src,
            abilityKey: "lightning-lab-end-of-turn-derez",
            controller: "corp",
            mandatory: true,
            effect: {
              op: "do",
              action: {
                kind: "derez_up_to_ice_protecting_server",
                serverId: pending.serverId,
                maxIce: pending.maxIce,
              },
            },
            logLine: `${s.cards[src]?.title ?? "Lightning Laboratory"} becomes pending — turn end (derez ice).`,
          });
        }
        if ((s.turn.inlineConditionalPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "runner.turnEnds");
        }
        // Sensor Net Activation: derez bioroids rezzed via agenda counter.
        const sensorPending = [...(s.turn.sensorNetPendingDerezIds ?? [])];
        s.turn.sensorNetPendingDerezIds = [];
        for (const id of sensorPending) {
          const c = s.cards[id];
          if (!c?.rezzed) continue;
          c.rezzed = false;
          s.log.push(`Sensor Net Activation — derez ${c.title} at turn end.`);
        }
        sweepDerezAtAnyTurnEnd(s);
        // Mark, temporary subtypes, and this turn's strength last until the
        // next checkpoint (CR 9.10.1 / 10.3.1b / 10.11.4).
        s.turn.turnDurationsPassed = "runner";
      },
    },
  ),
  "runner.turnComplete": runner(
    "runner.turnComplete",
    "sec_appendix_timing_structure_runners_turn_2_e",
    "11.3_2_e",
    "The Runner's turn is complete, and the game moves to the Corp's turn.",
    "pass",
    "runner_discard",
    (s) => {
      if ((s.pendingExtraRunnerTurns ?? 0) > 0) {
        return "runner.gainClicks";
      }
      return "corp.gainClicks";
    },
    {
      onResolve: (s) => {
        if ((s.pendingExtraRunnerTurns ?? 0) > 0) {
          s.pendingExtraRunnerTurns -= 1;
          s.activeSide = "runner";
          s.log.push(
            `Encore — additional Runner turn begins (${s.pendingExtraRunnerTurns} remaining queued).`,
          );
          return;
        }
        s.turnNumber += 1;
        s.activeSide = "corp";
        if (s.config.stopAfterFirstCycle && !s.winner) {
          s.done = true;
          s.log.push(
            `Vertical slice complete — returning to Corp would be turn ${s.turnNumber}`,
          );
        } else {
          s.log.push(`Corp turn ${s.turnNumber} begins.`);
        }
      },
    },
  ),
};
