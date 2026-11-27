/** The run's approach ice phase (CR 11.4 step 2, CR 6.9.2); part of STEPS in timing/graph.ts. */
import { noteApproachIce } from "../../state/cardFlags/cardDeclarations.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { noteOnApproachIce } from "../../state/run/approachIceHooks.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import { wasAbilityUsedThisRun } from "../../state/turnAndActions/turn.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { run, SNITCH_EXPOSE } from "./stepHelpers.js";
import { CR } from "../labels.js";
import type { TimingStepDef } from "../graph.js";

export const APPROACH_ICE_STEP_DEFS: Record<string, TimingStepDef> = {
  "run.approachIce": run(
    "run.approachIce",
    "sec_appendix_timing_structure_of_a_run_2_a",
    "11.4_2_a",
    "The Runner approaches ice.",
    "auto",
    "run.approachPaw",
    {
      onResolve: (s) => {
        const runState = s.run!;
        const iceId =
          runState.forceEncounterIceId ??
          s.servers[runState.attackedServerId].ice[runState.position!];
        const ice = s.cards[iceId];
        runState.phase = "approach_ice";
        runState.approachedIceUninstalled = false;
        s.log.push(
          `Approach ice ${ice.title} at position ${runState.position} (appendix 11.4_2_a / CR 6.4.1).`,
        );
        noteApproachIce(s, iceId);
        const server = s.servers[runState.attackedServerId];
        // Midori / Mitra Aman-class: rezzed root onApproachIce — note for 10.3.1a.
        // Note even when a later Snitch choice may open; the checkpoint marks,
        // and the reaction window waits on any open choice (CR 10.3.2).
        for (const id of server.root) {
          const card = s.cards[id];
          if (!card?.rezzed || !card.onApproachIce) continue;
          if (abilitiesSuppressed(s, id)) continue;
          // Midori's "once per run": the ability is used only when its
          // optional part is carried out (CR 9.6.9d); declining keeps it.
          // The kind that carries it out records the use.
          if (card.onApproachIceOncePerRun) {
            const fired = s.run?.approachIceTriggersFiredIds ?? [];
            if (fired.includes(id)) continue;
          }
          noteOnApproachIce(s, id);
        }
        checkpointAfterInstruction(s, "run.approachIce");
        // Snitch: once per run, approaching unrezzed ice → may expose then jack out.
        if (!s.pendingChoice && ice && !ice.rezzed) {
          for (const id of s.runner.installed) {
            const snitch = s.cards[id];
            if (
              !snitch?.mayExposeApproachedUnrezzedIceOncePerRunThenMayJackOut
            ) {
              continue;
            }
            // Each copy's "once per run" is used only when its optional part
            // is carried out (CR 9.6.9d, 9.1.6b); declining keeps it.
            if (wasAbilityUsedThisRun(s, id, SNITCH_EXPOSE)) continue;
            openPendingChoose(s, {
              sourceId: id,
              chooser: "runner",
              options: [
                {
                  id: "snitch-expose",
                  // The ice is not exposed yet: its title stays hidden from
                  // the Runner until it is (CR 10.2.2a, 1.21.4).
                  label: `Expose the approached ice, then may jack out`,
                  effect: {
                    op: "seq",
                    effects: [
                      {
                        op: "do",
                        action: {
                          kind: "mark_ability_used_this_run",
                          abilityId: SNITCH_EXPOSE,
                        },
                      },
                      {
                        op: "do",
                        action: {
                          kind: "expose",
                          pick: "choose",
                          cardId: iceId,
                        },
                      },
                      { op: "do", action: { kind: "offer_jack_out" } },
                    ],
                  },
                },
                {
                  id: "decline",
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
              logLine: `${snitch.title} — may expose the approached ice, then may jack out.`,
            });
            break;
          }
        }
      },
    },
  ),
  "run.approachPaw": run(
    "run.approachPaw",
    "sec_appendix_timing_structure_of_a_run_2_b",
    "11.4_2_b",
    "Paid ability window: (P) (R) and ice can be rezzed.",
    "pass",
    "run.iceRezzed",
    { allows: ["rez_ice", "rez_asset", "use_paid_ability", "pass_window"] },
  ),
  "run.iceRezzed": run(
    "run.iceRezzed",
    "sec_appendix_timing_structure_of_a_run_2_c",
    "11.4_2_c",
    "Is the approached ice rezzed?",
    "branch",
    (s) => {
      const runState = s.run!;
      // The approached ice was uninstalled: the window that was open has
      // been completed, the approach ends, and the Runner passes the
      // position it had occupied (CR 8.5.10, 6.2.7a).
      if (runState.approachedIceUninstalled) {
        runState.approachedIceUninstalled = false;
        s.log.push(
          `The approached ice was uninstalled — the approach ends and the Runner passes its position (CR ${CR.uninstallIceDuringRun.number}, ${CR.approachedIceLeaves.number}).`,
        );
        if (runState.forceEncounterIceId) {
          runState.forceEncounterIceId = undefined;
          return "run.movement";
        }
        runState.phase = "movement";
        return "run.passIcePaw";
      }
      const iceId =
        runState.forceEncounterIceId ??
        s.servers[runState.attackedServerId].ice[runState.position!];
      if (s.cards[iceId].rezzed) {
        return "run.encounter";
      }
      s.log.push(`Ice unrezzed — skip encounter (appendix 11.4_2_c_ii).`);
      return "run.movement";
    },
  ),
};
