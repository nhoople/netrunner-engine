/** The run's initiation phase (CR 11.4 step 1, CR 6.9.1); part of STEPS in timing/graph.ts. */
import { run } from "./stepHelpers.js";
import { noteOnRunBegin } from "../../state/run/runBeginEffectHooks.js";
import { activeLockdownIds } from "../../state/continuous/lockdowns.js";
import {
  noteFirstRdRunBegin,
  noteFirstRunBegin,
  noteFirstArchivesRunBegin,
  noteDaredevilFirstRun,
} from "../../state/run/runBeginHooks.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  setAttackedServer,
  setRunnerPosition,
} from "../../state/uninstallAndPosition/runPosition.js";
import { stealthHostedCreditsAvailable } from "../../state/keywordsAndCredits/runnerCredits.js";
import { canPayCost } from "../../state/keywordsAndCredits/costs.js";
import type { TimingStepDef } from "../graph.js";

export const RUN_INITIATION_STEP_DEFS: Record<string, TimingStepDef> = {
  // --- Run (appendix 11.4) — walked automatically in v0 for empty / unrezzed ice ---
  "run.announce": run(
    "run.announce",
    "sec_appendix_timing_structure_of_a_run_1_a",
    "11.4_1_a",
    "The Runner announces the attacked server.",
    "auto",
    "run.fillBpFund",
  ),
  "run.fillBpFund": run(
    "run.fillBpFund",
    "sec_appendix_timing_structure_of_a_run_1_b",
    "11.4_1_b",
    "The Runner fills their bad publicity fund.",
    "auto",
    "run.begin",
    {
      onResolve: (s) => {
        const n = s.corp.badPublicity ?? 0;
        s.badPublicityFund = n;
        if (n > 0) {
          s.log.push(
            `Fill bad publicity fund with ${n}¢ (CR 10.6.3a / appendix 11.4_1_b).`,
          );
        }
      },
    },
  ),
  "run.begin": run(
    "run.begin",
    "sec_appendix_timing_structure_of_a_run_1_c",
    "11.4_1_c",
    "The run begins.",
    "auto",
    "run.initiatePaw",
    {
      onResolve: (s) => {
        // onRunBegin (rig + lockdowns) — note for 10.3.1a with first-* below.
        for (const id of s.runner.installed) {
          noteOnRunBegin(s, id);
        }
        // Active lockdowns in corp:play-area (SYNC Rerouting).
        for (const id of activeLockdownIds(s)) {
          noteOnRunBegin(s, id);
        }
        // First-* run begin this turn — queue for 10.3.1a (phase 3).
        if (s.run?.attackedServerId === "rd") {
          noteFirstRdRunBegin(s);
        }
        noteFirstRunBegin(s);
        if (s.run?.attackedServerId === "archives") {
          noteFirstArchivesRunBegin(s);
        }
        // Daredevil: first run on server with ≥N ice — queue for 10.3.1a.
        noteDaredevilFirstRun(s);
        checkpointAfterInstruction(s, "run.begin");
        // Window of Opportunity: derez 1 protecting ice when run begins.
        if (s.run?.derezProtectingIceOnRunBegin) {
          s.run.derezProtectingIceOnRunBegin = false;
          const src = s.run.runSourceId;
          if (src) {
            noteInlineConditional(s, {
              cardId: src,
              abilityKey: "window-derez-protecting-ice-on-run-begin",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "may_derez_protecting_attacked_ice" },
              },
              logLine: `${s.cards[src]?.title ?? "Window of Opportunity"} becomes pending — run begin (may derez protecting ice).`,
            });
            checkpointAfterInstruction(s, "run.begin");
          }
        }
        // Lightning Laboratory: may spend agenda counter to rez up to N ice.
        if (!s.pendingChoice) {
          for (const id of s.corp.scoreArea) {
            const card = s.cards[id];
            const hook =
              card?.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked;
            if (!hook || (card.agendaCounters ?? 0) < 1) continue;
            openPendingChoose(s, {
              sourceId: id,
              chooser: "corp",
              options: [
                {
                  id: "decline-lightning",
                  label: "Decline",
                  effect: {
                    op: "do",
                    action: { kind: "gain_credits", side: "corp", amount: 0 },
                  },
                },
                {
                  id: "lightning-spend",
                  label: `Remove 1 agenda counter: rez up to ${hook.maxIce} ice ignoring costs`,
                  effect: {
                    op: "do",
                    action: {
                      kind: "spend_lightning_counter_rez_up_to_protecting_attacked",
                      maxIce: hook.maxIce,
                    },
                  },
                },
              ],
              logLine: `${card.title} — may remove 1 agenda counter to rez up to ${hook.maxIce} ice.`,
            });
            break;
          }
        }
      },
    },
  ),
  "run.initiatePaw": run(
    "run.initiatePaw",
    "sec_appendix_timing_structure_of_a_run_1_e",
    "11.4_1_e",
    "Paid ability window: (P) (R).",
    "pass",
    "run.checkIce",
    { allows: ["use_paid_ability", "rez_asset", "pass_window"] },
  ),
  "run.checkIce": run(
    "run.checkIce",
    "sec_appendix_timing_structure_of_a_run_1_f",
    "11.4_1_f",
    "Does the Runner have a position corresponding to a piece of ice?",
    "branch",
    (s) => {
      const runState = s.run!;
      let server = s.servers[runState.attackedServerId];
      const pastIce =
        runState.position === null || runState.position >= server.ice.length;
      if (
        pastIce &&
        runState.redirectApproachArchivesToHq &&
        runState.attackedServerId === "archives" &&
        !runState.archivesApproachRedirectUsed
      ) {
        runState.archivesApproachRedirectUsed = true;
        // "Instead change the attacked server to HQ and approach HQ": the
        // Runner approaches the server, not its ice, so has no position
        // (CR 1.2.1, 6.2.5c).
        setAttackedServer(runState, "hq");
        setRunnerPosition(runState, null);
        server = s.servers.hq;
        s.log.push(
          "Maintenance Access — change attacked server to HQ and approach HQ.",
        );
      }
      // No ice at the Runner's position: go to the Movement Phase
      // (CR 6.9.1f). Nothing is passed at 6.9.4a, so it resumes at the
      // 6.9.4b paid ability window.
      // An emptied position the Runner is still in holds no ice either
      // (CR 6.2.4, 6.2.7e).
      if (
        runState.position !== null &&
        !runState.positionVacated &&
        runState.position < server.ice.length
      ) {
        return "run.approachIce";
      }
      runState.phase = "movement";
      return "run.passIcePaw";
    },
    {
      onResolve: (s) => {
        const runState = s.run!;
        if (s.pendingChoice) return;
        const server = s.servers[runState.attackedServerId];
        const pastIce =
          runState.position === null || runState.position >= server.ice.length;
        const cost =
          runState.mayRedirectApproachArchivesToHqOrRdPayingStealthCredits;
        if (
          !pastIce ||
          runState.attackedServerId !== "archives" ||
          cost == null ||
          runState.archivesApproachRedirectUsed
        ) {
          return;
        }
        runState.archivesApproachRedirectUsed = true;
        const canPay =
          stealthHostedCreditsAvailable(s) >= cost &&
          canPayCost(s, "runner", {
            credits: cost,
            creditsFromStealthOnly: true,
          });
        const options: Array<{
          id: string;
          label: string;
          effect: import("../../effects/ir.js").Effect;
        }> = [];
        if (canPay) {
          for (const sid of ["hq", "rd"] as const) {
            options.push({
              id: `baker-redirect:${sid}`,
              label: `Pay ${cost}¢ from stealth: approach ${sid.toUpperCase()}`,
              effect: {
                op: "seq",
                effects: [
                  {
                    op: "do",
                    action: { kind: "spend_stealth_credits", amount: cost },
                  },
                  {
                    op: "do",
                    action: {
                      kind: "redirect_approach_to_server",
                      serverId: sid,
                    },
                  },
                ],
              },
            });
          }
        }
        options.push({
          id: "decline",
          label: "Decline — approach Archives",
          effect: {
            op: "do",
            action: {
              kind: "gain_credits",
              side: "runner",
              amount: 0,
            },
          },
        });
        openPendingChoose(s, {
          sourceId: runState.runSourceId ?? s.runner.identityId,
          chooser: "runner",
          options,
          logLine: `Baker — may pay ${cost}¢ from stealth to approach HQ or R&D.`,
        });
      },
    },
  ),
};
