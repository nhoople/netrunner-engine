/** The run ends phase (CR 11.4 step 6, CR 6.9.6, 6.8); part of STEPS in timing/graph.ts. */
import {
  run,
  pawStepKeysForRunEnds,
  reactionStepKeysForRunEnds,
  noteChumEncounterEndedByRunEnd,
  noteEncounterEndIfBrokeEarly,
  resolveDeferredPersistentAmaze,
  clearEncounterOutsidePlayMark,
  clearTldrSubroutineCopies,
  offerDelayedRunEndOrder,
  MARKER_ETR,
} from "./stepHelpers.js";
import { noteUnsuccessfulRunServerAbilities } from "../../state/run/unsuccessfulRunServerHooks.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { noteFirstUnsuccessfulRun } from "../../state/run/unsuccessfulRunHooks.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import { currentMark } from "../../state/keywordsAndCredits/keywords.js";
import { noteFirstSuccessfulRunOnRdEnds } from "../../state/run/approachIceHooks.js";
import { evalEffect } from "../../effects/eval.js";
import { removeCardFromGame } from "../../state/uninstallAndPosition/uninstall.js";
import {
  noteSuccessfulRunEndOncePerTurn,
  noteSuccessfulRunEnd,
} from "../../state/run/successfulRunEndHooks.js";
import {
  cancelPendingIfSourceInactive,
  pendingAbilitiesWithStatus,
  openReactionWindow,
  markPendingAbilityResolving,
  completePendingAbility,
  closeReactionWindow,
  pruneSettledPendingAbilities,
  createPendingAbilityInstance,
} from "../../state/triggers/pendingAbilities.js";
import { CR } from "../labels.js";
import { firstDecl } from "../../state/continuous/continuousSubs.js";
import { activeCreditLockEvent } from "../../state/keywordsAndCredits/runnerCredits.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { TimingStepDef } from "../graph.js";

export const RUN_ENDS_STEP_DEFS: Record<string, TimingStepDef> = {
  // --- Run Ends Phase (appendix 11.4_6 / §6.8) ---
  "run.closePriorityWindows": run(
    "run.closePriorityWindows",
    "sec_appendix_timing_structure_of_a_run_6_a",
    "11.4_6_a",
    "Close or resolve priority windows from before end the run.",
    "auto",
    (s) =>
      s.priorityStack.some(
        (pw) =>
          !pawStepKeysForRunEnds.has(pw.stepKey) &&
          !reactionStepKeysForRunEnds.has(pw.stepKey),
      )
        ? "run.completeOtherPriorityWindows"
        : "run.emptyBpFund",
    {
      onResolve: (s) => {
        // Chum: the run ended during the boosted encounter, so the encounter
        // ended too and Chum's delayed conditional ability is met. It
        // resolves in the Run Ends Phase, while run effects such as The
        // Noble Path's still apply (CR 6.1.4, 6.8.5.ex1, 9.6.13c).
        noteChumEncounterEndedByRunEnd(s);
        noteEncounterEndIfBrokeEarly(s, "the run ended");
        // CR 6.8.2 / appendix 11.4_6_a — drain open windows by class:
        // a) PAWs close (no further paid abilities / rez);
        // b) phase-begin reaction windows close;
        // c) other open windows complete interactively without new structures
        //    (Formicary-class — see run.completeOtherPriorityWindows).
        let closedPaw = 0;
        let closedReaction = 0;
        const keptOther: typeof s.priorityStack = [];
        // Drain innermost-first; keep non-PAW/non-reaction for interactive 6.8.2c.
        while (s.priorityStack.length > 0) {
          const pw = s.priorityStack.pop()!;
          if (pawStepKeysForRunEnds.has(pw.stepKey)) {
            closedPaw += 1;
            s.log.push(
              `Close paid ability window @ ${pw.stepKey} (CR 6.8.2a / appendix 11.4_6_a).`,
            );
          } else if (reactionStepKeysForRunEnds.has(pw.stepKey)) {
            closedReaction += 1;
            s.log.push(
              `Close phase-begin reaction window @ ${pw.stepKey} (CR 6.8.2b / appendix 11.4_6_a).`,
            );
          } else {
            keptOther.unshift(pw);
          }
        }
        for (const pw of keptOther) s.priorityStack.push(pw);
        if (keptOther.length > 0) {
          s.run!.forbidNewTimingStructures = true;
          s.log.push(
            `Open priority window(s) remain for completion without new structures (CR 6.8.2c / appendix 11.4_6_a).`,
          );
        } else if (closedPaw + closedReaction === 0) {
          s.log.push(
            `Run Ends — no open priority windows (CR 6.8.2 / appendix 11.4_6_a).`,
          );
        }
      },
    },
  ),
  "run.completeOtherPriorityWindows": run(
    "run.completeOtherPriorityWindows",
    "sec_appendix_timing_structure_of_a_run_6_a",
    "11.4_6_a",
    "Complete other open priority windows without new timing structures.",
    "pass",
    "run.emptyBpFund",
    {
      allows: ["use_paid_ability", "pass_window"],
      onResolve: (s) => {
        if (s.run) s.run.forbidNewTimingStructures = true;
        s.log.push(
          `Complete other priority windows without new structures (CR 6.8.2c / appendix 11.4_6_a).`,
        );
      },
    },
  ),
  "run.emptyBpFund": run(
    "run.emptyBpFund",
    "sec_appendix_timing_structure_of_a_run_6_b",
    "11.4_6_b",
    "The Runner empties their bad publicity fund.",
    "auto",
    "run.declareUnsuccessful",
    {
      onResolve: (s) => {
        if (s.badPublicityFund > 0) {
          s.log.push(
            `Return ${s.badPublicityFund}¢ from bad publicity fund to the bank (CR 10.6.3b / 6.8.3 / appendix 11.4_6_b).`,
          );
        }
        s.badPublicityFund = 0;
      },
    },
  ),
  "run.declareUnsuccessful": run(
    "run.declareUnsuccessful",
    "sec_appendix_timing_structure_of_a_run_6_c",
    "11.4_6_c",
    "If applicable, the run is declared unsuccessful.",
    "auto",
    "run.ends",
    {
      onResolve: (s) => {
        const runState = s.run;
        if (!runState) return;
        if (runState.successful === true) {
          // Already declared successful — do not declare unsuccessful.
          return;
        }
        if (runState.successful === null) {
          // Reached Success Phase without being declared successful
          // (Crisium/Flagship) — not unsuccessful (CR 6.8.4a).
          s.log.push(
            `Run Ends — not declared unsuccessful (CR 6.8.4a / appendix 11.4_6_c).`,
          );
          return;
        }
        // successful === false (ETR / jack-out / etc.)
        if (!s.servers[runState.attackedServerId]) {
          // Server ceased to exist — unsuccessful exception (CR 6.8.4b).
          return;
        }
        s.log.push(`Run declared unsuccessful (CR 6.8.4 / appendix 11.4_6_c).`);
        noteUnsuccessfulRunServerAbilities(s);
        // First unsuccessful run this turn (John Masanori-class). Trash-self
        // remains mid-hook; onFirstUnsuccessfulRunThisTurn marks at 10.3.1a.
        const firstUnsuccessful = !s.turn.unsuccessfulRunThisTurn;
        s.turn.unsuccessfulRunThisTurn = true;
        if (firstUnsuccessful) {
          for (const id of [...s.runner.installed]) {
            if (abilitiesSuppressed(s, id)) continue;
            const c = s.cards[id];
            if (c?.trashSelfOnUnsuccessfulRunThisTurn) {
              trashCard(s, id);
              s.log.push(`${c.title} — trashed (unsuccessful run).`);
            }
          }
          noteFirstUnsuccessfulRun(s);
        }
        if (
          firstUnsuccessful ||
          (s.turn.unsuccessfulRunServerPendingIds ?? []).length > 0
        ) {
          checkpointAfterInstruction(s, "run.declareUnsuccessful");
        }
      },
    },
  ),
  "run.ends": run(
    "run.ends",
    "sec_appendix_timing_structure_of_a_run_6_d",
    "11.4_6_d",
    "The run is complete.",
    "auto",
    (s) => (s.run?.isPostRunBreach ? "breach.begin" : "runner.actionPaw"),
    {
      onResolve: (s) => {
        // The step comes back here once a run-end ability's choice is
        // answered (Always Have a Backup Plan). The run is already over
        // (CR 6.9.6d), so there is nothing left to resolve; move on.
        if (!s.run) return;
        resolveDeferredPersistentAmaze(s);
        const runState = s.run;
        // A run can end during a forced encounter (CR 9.1.8h).
        clearEncounterOutsidePlayMark(s, runState.encounter?.iceId, true);
        clearEncounterOutsidePlayMark(s, runState.forceEncounterIceId, true);
        if (runState.resumeAfterDelayedOrder) {
          runState.resumeAfterDelayedOrder = false;
        } else {
          clearTldrSubroutineCopies(s);
          // Window: Corp may rez the ice derezzed at run begin (before cleanup).
          if (
            runState.mayRezEventDerezzedIceOnRunEndIgnoreCosts &&
            runState.eventDerezzedIceId
          ) {
            const iceId = runState.eventDerezzedIceId;
            runState.mayRezEventDerezzedIceOnRunEndIgnoreCosts = false;
            runState.endedTheRun = true;
            const src = runState.runSourceId ?? iceId;
            noteInlineConditional(s, {
              cardId: src,
              abilityKey: "window-may-rez-event-derezzed-ice-on-run-end",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "may_rez_event_derezzed_ice_ignore_costs" },
              },
              logLine: `${s.cards[src]?.title ?? "Window of Opportunity"} becomes pending — run end (may rez derezzed ice).`,
            });
            checkpointAfterInstruction(s, "run.ends");
            if (s.pendingChoice) return;
          }
          // Boomerang-class: delayed conditional — may shuffle title from heap
          // into stack when the run ends successfully (CR 9.10 lingering).
          if (
            runState.successful === true &&
            (runState.mayShuffleTitlesFromHeapOnSuccessfulRunEnd?.length ?? 0) >
              0
          ) {
            const titles = [
              ...(runState.mayShuffleTitlesFromHeapOnSuccessfulRunEnd ?? []),
            ];
            runState.mayShuffleTitlesFromHeapOnSuccessfulRunEnd = [];
            for (const title of titles) {
              const src =
                s.runner.discardPile.find(
                  (id) => s.cards[id]?.title === title,
                ) ?? s.runner.identityId;
              noteInlineConditional(s, {
                cardId: src,
                abilityKey: "may-shuffle-title-from-heap-on-successful-run-end",
                controller: "runner",
                mandatory: true,
                effect: {
                  op: "do",
                  action: {
                    kind: "may_shuffle_title_from_heap_into_stack",
                    title,
                  },
                },
                logLine: `${s.cards[src]?.title ?? title} becomes pending — successful run end (may shuffle from heap).`,
                // Heap may outlives the source (CR 9.6.13c / 9.10 lingering).
                independentOfSource: true,
              });
            }
            if ((s.turn.inlineConditionalPending ?? []).length > 0) {
              checkpointAfterInstruction(s, "run.ends");
            }
            if (s.pendingChoice) return;
          }
          if (runState.successful === true) {
            s.log.push(`Run complete — successful (appendix 11.4_6_d).`);
          } else if (runState.successful === false) {
            s.log.push(`Run complete — unsuccessful (appendix 11.4_6_d).`);
          } else {
            s.log.push(
              `Run complete — neither successful nor unsuccessful (CR 6.8.4a; appendix 11.4_6_d).`,
            );
          }
          if (offerDelayedRunEndOrder(s)) return;
        }
        // Mayfly: trash if it broke a sub this run
        for (const breakerId of runState.breakersThatBroke ?? []) {
          const br = s.cards[breakerId];
          if (!br?.trashAfterBreakingThisRun) continue;
          if (!s.runner.installed.includes(breakerId)) continue;
          // Its own ability trashes it (CR 1.14.5).
          trashCard(s, breakerId, { by: "runner" });
          s.log.push(`${br.title} trashed — broke a subroutine this run.`);
        }
        // Hafrún / Unsmiling: clear run-scoped break restrictions
        for (const card of Object.values(s.cards)) {
          if (card.cannotBreakSubsThisRun) {
            delete card.cannotBreakSubsThisRun;
          }
          if (card.maxPrintedSubsBreakablePerEncounter !== undefined) {
            delete card.maxPrintedSubsBreakablePerEncounter;
          }
        }
        // Info Bounty: "The first time each turn a run on your mark ends,
        // gain 2 if you breached that server during that run." The first
        // mark run to end uses it, breached or not; the breach is checked
        // when it resolves (CR 9.6.5, 1.2.1).
        const markSid = runState.attackedServerId;
        if (
          !s.turn.infoBountyMarkRunEndUsed &&
          currentMark(s) &&
          markSid === currentMark(s)
        ) {
          for (const rid of s.runner.installed) {
            const card = s.cards[rid];
            const n = card?.gainCreditsOnFirstMarkRunEndIfBreached ?? 0;
            if (n <= 0) continue;
            s.turn.infoBountyMarkRunEndUsed = true;
            if (!runState.breached) {
              s.log.push(
                `${card!.title} — the first mark run ended without a breach; no gain this turn.`,
              );
              break;
            }
            s.runner.credits += n;
            s.log.push(
              `${card!.title} — gain ${n}¢ (mark run ended after breach).`,
            );
            break;
          }
        }
        const sid = runState.attackedServerId;
        // Obelus: first successful HQ/R&D run end → draw 1 per access.
        if (
          (sid === "hq" || sid === "rd") &&
          runState.successful &&
          !s.turn.esObelusRunEndUsed
        ) {
          for (const rid of s.runner.installed) {
            const card = s.cards[rid];
            if (!card?.drawPerAccessOnFirstSuccessfulHqOrRdRunEndEachTurn)
              continue;
            const n = runState.accessedCardIds.length;
            if (n > 0) {
              s.turn.esObelusRunEndUsed = true;
              for (let i = 0; i < n; i++) {
                if (s.runner.deck.length === 0) break;
                const top = s.runner.deck.shift()!;
                s.runner.hand.push(top);
                const drawn = s.cards[top];
                if (drawn) {
                  drawn.zone = "runner:grip";
                  if (
                    card.revealDrawnCards ||
                    s.runner.installed.some((x) => s.cards[x]?.revealDrawnCards)
                  ) {
                    s.log.push(`Reveal drawn card: ${drawn.title}.`);
                  }
                }
              }
              s.log.push(`Obelus — draw ${n} (${n} access(es) on ${sid}).`);
            }
            break;
          }
        }
        // Psych Mike: first successful R&D run end each turn — note for 10.3.1a.
        // Checkpoint here while run.accessedCardIds still exist (effect reads them).
        if (sid === "rd" && runState.successful) {
          noteFirstSuccessfulRunOnRdEnds(s);
          if (s.turn.firstSuccessfulRdRunEndMetPending) {
            checkpointAfterInstruction(s, "run.ends");
          }
        }
        // Amelia Earhart: HQ/R&D run end, if accessed ≥ min, place power.
        if (sid === "hq" || sid === "rd") {
          const accessed = runState.accessedCardIds.length;
          for (const rid of s.runner.installed) {
            const card = s.cards[rid];
            const spec = card?.powerOnHqRdRunEndIfAccessedGte;
            if (!spec || accessed < spec.min) continue;
            card!.powerCounters = (card!.powerCounters ?? 0) + spec.amount;
            s.log.push(
              `${card!.title} — place ${spec.amount} power (accessed ${accessed} ≥ ${spec.min}) → ${card!.powerCounters}.`,
            );
          }
        }
        // The Turning Wheel: HQ/R&D run end, if stole no agendas, place 1 power.
        if (sid === "hq" || sid === "rd") {
          const stole = (runState.agendasStolenThisRun ?? 0) > 0;
          if (!stole) {
            for (const rid of s.runner.installed) {
              const card = s.cards[rid];
              if (!card?.placePowerOnHqOrRdRunEndIfNoAgendaStolen) continue;
              card.powerCounters = (card.powerCounters ?? 0) + 1;
              s.log.push(
                `${card.title} — place 1 power (no agenda stolen on ${sid.toUpperCase()}) → ${card.powerCounters}.`,
              );
            }
          }
        }
        // Raindrops-class: run-source onRunEnd (draw per power + gain, etc.)
        const runSrc = runState.runSourceId;
        const onRunEndFx = runState.onRunEndEffect;
        if (runSrc && onRunEndFx) {
          const r = evalEffect({ state: s, sourceId: runSrc }, onRunEndFx);
          if (!r.ok) {
            s.log.push(`Run-source onRunEnd failed: ${r.error}`);
          }
        }
        // Rip Deal: RFG self when the run ends.
        if (runSrc) {
          const runSrcCard = s.cards[runSrc];
          if (runSrcCard?.rfgSelfOnRunEnd) {
            removeCardFromGame(s, runSrc);
            s.log.push(
              `${runSrcCard.title} — remove from the game (run ended).`,
            );
          }
        }
        // Diana's Hunt: trash programs installed ignoring costs this run.
        if (runState.trashProgramsInstalledThisWayOnRunEnd) {
          for (const pid of [...(runState.dianaInstalledProgramIds ?? [])]) {
            const prog = s.cards[pid];
            if (!prog || prog.zone !== "runner:installed") continue;
            trashCard(s, pid, { by: "runner" });
            s.log.push(
              `Diana's Hunt — trash ${prog.title} (installed this run ignoring costs).`,
            );
          }
        }
        // Doppelgänger: once per turn when a successful run ends — note for 10.3.1a.
        // Note even if a choice is open; checkpoint marks, reaction waits (CR 10.3.2).
        // The turn's use is recorded only when the Runner starts the run
        // (queue_start_run): declining does not use it (CR 9.6.9d, 9.3.6g).
        if (runState.successful === true) {
          for (const rid of s.runner.installed) {
            if (s.turn.onSuccessfulRunEndFiredIds.includes(rid)) continue;
            noteSuccessfulRunEndOncePerTurn(s, rid);
          }
          if ((s.turn.successfulRunEndOncePendingIds ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.ends");
          }
        }
        {
          // Drop pending instances whose source went inactive (CR 9.6.10);
          // Chum's is independent of its source (CR 9.6.13).
          cancelPendingIfSourceInactive(s);
          const chumPending = pendingAbilitiesWithStatus(s, "pending").filter(
            (p) => p.payload?.kind === "chum_net_damage",
          );
          if (chumPending.length > 0) {
            const frame = openReactionWindow(
              s,
              chumPending.map((p) => p.id),
              null,
            );
            for (const inst of chumPending) {
              if (inst.status !== "pending") continue;
              markPendingAbilityResolving(s, inst.id);
              const amount =
                inst.payload?.kind === "chum_net_damage"
                  ? inst.payload.amount
                  : 0;
              const r = evalEffect(
                {
                  state: s,
                  sourceId:
                    inst.sourceId ||
                    runState.lastEncounteredIceId ||
                    s.corp.identityId,
                },
                { op: "do", action: { kind: "net_damage", amount } },
              );
              if (!r.ok) s.log.push(`Chum net damage failed: ${r.error}`);
              completePendingAbility(s, inst.id, "done");
              if (s.done || s.pendingChoice || s.pendingDamage) break;
            }
            closeReactionWindow(s, frame.id);
            pruneSettledPendingAbilities(s);
          }
        }
        if (runState.preventAllDamageThisRun) {
          runState.preventAllDamageThisRun = false;
          s.log.push(
            `Prevent-all-damage expires as the run completes (CR ${CR.runEndsCondition.number}).`,
          );
        }
        // Dedicated Response Team: successful run ends — note for 10.3.1a.
        if (runState.successful === true) {
          for (const server of Object.values(s.servers)) {
            for (const id of [...server.root, ...server.ice]) {
              noteSuccessfulRunEnd(s, id);
            }
          }
          if ((s.turn.successfulRunEndPendingIds ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.ends");
          }
        }
        // Arissana: trash identity-installed program if not subtype.
        const arissanaId = runState.identityInstalledProgramId;
        const unlessSubtype =
          runState.identityInstalledProgramTrashUnlessSubtype;
        if (arissanaId && unlessSubtype !== undefined) {
          const prog = s.cards[arissanaId];
          if (
            prog &&
            s.runner.installed.includes(arissanaId) &&
            !(prog.subtypes ?? []).includes(unlessSubtype)
          ) {
            trashCard(s, arissanaId, { by: "runner" });
            s.log.push(
              `${prog.title} trashed at run end — not a ${unlessSubtype}.`,
            );
          }
        }
        // Howler: at run end, trash Howler and derez the ice it installed.
        if (runState.howlerId) {
          const installedId = runState.howlerInstalledIceId;
          const howler = s.cards[runState.howlerId];
          if (installedId) {
            const installedIce = s.cards[installedId];
            const stillInstalled = Object.values(s.servers).some((server) =>
              server.ice.includes(installedId),
            );
            if (installedIce && stillInstalled) {
              installedIce.rezzed = false;
              installedIce.faceup = false;
              s.log.push(
                `${installedIce.title} derezzed at run end (Howler; CR 10.2).`,
              );
            }
          }
          if (howler) {
            const installed = Object.values(s.servers).some((server) =>
              server.ice.includes(runState.howlerId!),
            );
            if (installed) {
              // Its own ability trashes it (CR 1.14.5).
              trashCard(s, runState.howlerId, { by: "corp" });
              s.log.push(`${howler.title} trashed at run end (CR 10.2).`);
            }
          }
        }
        // Awakening Center: trash (not just derez) each hosted ice rezzed
        // and force-encountered via its trigger this run.
        for (const iceId of runState.awakeningCenterHostedIceIds ?? []) {
          const ice = s.cards[iceId];
          if (!ice) continue;
          // Awakening Center's ability: the Corp trashes the hosted ice
          // (CR 1.14.5).
          trashCard(s, iceId, { by: "corp" });
          s.log.push(`${ice.title} trashed at run end (Awakening Center).`);
        }
        const postBreach = runState.breachWhenRunEnds;
        // Restore Thunderbolt-granted subroutines before clearing run boosts.
        for (const iceId of runState.thunderboltGrantedIceIds ?? []) {
          const ice = s.cards[iceId];
          if (!ice?.baseSubroutines) continue;
          ice.subroutines = structuredClone(ice.baseSubroutines);
        }
        // Restore Peeping Tom run-scoped gained subroutines.
        for (const iceId of runState.peepingTomIceIds ?? []) {
          const ice = s.cards[iceId];
          if (!ice) continue;
          ice.subroutines = ice.baseSubroutines
            ? structuredClone(ice.baseSubroutines)
            : [];
        }
        // Marker: the gained "End the run." lasts for the remainder of that
        // run only (CR 9.10.1).
        for (const card of Object.values(s.cards)) {
          if (!card.subroutines?.some((sub) => sub.id.endsWith(MARKER_ETR))) {
            continue;
          }
          card.subroutines = card.subroutines.filter(
            (sub) => !sub.id.endsWith(MARKER_ETR),
          );
          if (card.baseSubroutines) {
            card.baseSubroutines = card.baseSubroutines.filter(
              (sub) => !sub.id.endsWith(MARKER_ETR),
            );
          }
        }
        // Brainstorm-class: encounter-gained subroutines last only for
        // the remainder of the run; strip them so the next run starts
        // from the printed list.
        for (const card of Object.values(s.cards)) {
          const template = firstDecl(
            card,
            "grip_size_on_encounter",
          )?.subroutine;
          if (!template || !card.subroutines) continue;
          card.subroutines = card.subroutines.filter(
            (sub) => !sub.id.startsWith(`${template.id}-`),
          );
        }
        // The next checkpoint expires run-duration lingerings (CR 10.3.1b).
        s.turn.runDurationPassed = true;
        // Aircheck: its credits are hosted on the event, which stays active
        // until its run-end ability resolves. What is left of them goes
        // back onto it for the follow-up run (CR 8.6.5, 1.2.1).
        const lockEvent = activeCreditLockEvent(s);
        if (lockEvent && (runState.eventCredits ?? 0) > 0) {
          lockEvent.hostedCredits =
            (lockEvent.hostedCredits ?? 0) + (runState.eventCredits ?? 0);
          runState.eventCredits = 0;
        }
        if (postBreach) {
          s.log.push(`Post-run breach of ${postBreach} begins (CR 7.3.1).`);
          // Standalone breach shell — not a successful run on that server.
          s.run = {
            attackedServerId: postBreach,
            phase: "breach",
            position: null,
            successful: null,
            accessedCardIds: [],
            accessCandidates: [],
            randomAccessLimit: null,
            encounter: null,
            endedTheRun: false,
            cannotJackOut: false,
            accessingCardId: null,
            isPostRunBreach: true,
          };
        } else {
          s.run = null;
        }
        // AMAZE meets its trigger when the run ends, in the reaction window
        // outside that run (CR 10.3.6).
        if (
          (runState.agendasStolenThisRun ?? 0) > 0 &&
          (runState.persistentTagsIfAgendaStolen ?? 0) > 0
        ) {
          const sid = runState.attackedServerId;
          // Server may already have ceased at a prior 10.3.1a in this step
          // (empty remote; CR 10.3.1h) — AMAZE still persists (CR 9.12.5).
          const sourceId =
            runState.persistentAmazeSourceId ??
            (sid
              ? s.servers[sid]?.root.find((id) => {
                  const card = s.cards[id];
                  return (
                    card?.rezzed && (card.tagsIfAgendaStolenThisRun ?? 0) > 0
                  );
                })
              : undefined);
          if (sourceId) {
            const tags = runState.persistentTagsIfAgendaStolen!;
            const stillThere = Boolean(
              sid &&
              s.servers[sid]?.root.includes(sourceId) &&
              s.cards[sourceId]?.rezzed,
            );
            if (!stillThere) {
              log(
                s,
                `${s.cards[sourceId]?.title ?? sourceId} persists for this run end (CR ${CR.persistentAbility.number}).`,
              );
            }
            // Persistent abilities never become inactive (CR 9.12.5b).
            const inst = createPendingAbilityInstance(s, {
              abilityKey: "amaze:tags-if-agenda-stolen",
              sourceId,
              controller: "corp",
              mandatory: true,
              independentOfSource: true,
              payload: { kind: "amaze_give_tags", amount: tags },
            });
            if (s.pendingChoice) {
              // Leave the instance pending until the open choice closes (CR 9.12.5d).
              log(
                s,
                `${s.cards[sourceId]?.title ?? sourceId} remains pending (CR ${CR.persistentAbility.number}).`,
              );
            } else {
              const frame = openReactionWindow(s, [inst.id], null);
              markPendingAbilityResolving(s, inst.id);
              evalEffect(
                { state: s, sourceId },
                {
                  op: "do",
                  action: { kind: "give_tags", amount: tags },
                },
              );
              completePendingAbility(s, inst.id, "done");
              closeReactionWindow(s, frame.id);
              pruneSettledPendingAbilities(s);
            }
          }
        }
        // The run has ended. Zahya's ability meets its condition in the
        // reaction window outside the run. A run event is still resolving
        // until its play abilities finish (CR 9.1.2b).
        if ((sid === "hq" || sid === "rd") && !s.turn.zahyaRunEndUsed) {
          const idCard = s.cards[s.runner.identityId];
          const n = runState.accessedCardIds.length;
          if (idCard?.creditsPerAccessOnCentralRunEnd && n > 0) {
            const eventId = s.playedRunEventId;
            const event = eventId ? s.cards[eventId] : undefined;
            const stillResolving =
              event?.blankIdentitiesWhileResolving === true &&
              event.zone === "runner:play-area";
            if (stillResolving && event) {
              log(
                s,
                `${event.title} is resolving (CR ${CR.isResolving.number}).`,
              );
            } else if (!abilitiesSuppressed(s, idCard.id)) {
              s.turn.pendingZahyaRunEnd = { credits: n, serverId: sid };
              openPendingChoose(s, {
                sourceId: idCard.id,
                chooser: "runner",
                options: [
                  {
                    id: "zahya-gain",
                    label: `Gain ${n}¢`,
                    effect: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "runner",
                        amount: 0,
                      },
                    },
                  },
                  {
                    id: "zahya-decline",
                    label: "Decline",
                    effect: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "runner",
                        amount: 0,
                      },
                    },
                  },
                ],
                logLine: `${idCard.title} — may gain ${n}¢ (${n} access(es) on ${sid}).`,
              });
            }
          }
        }
      },
    },
  ),
};
