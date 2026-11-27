/** The run's movement phase, through approaching the server (CR 11.4 step 4, CR 6.9.4); part of STEPS in timing/graph.ts. */
import {
  setRunnerPosition,
  moveRunnerInward,
} from "../../state/uninstallAndPosition/runPosition.js";
import { CR } from "../labels.js";
import {
  printedSubroutineBrokenByRunner,
  encounterFullyBrokenByRunner,
  subroutinesBrokenByRunnerCount,
} from "../../state/turnAndActions/break.js";
import {
  noteFirstPassIce,
  noteSisyphusFirstPass,
} from "../../state/run/firstEncounterPassHooks.js";
import {
  notePassUnrezzedIce,
  notePassRezzedIce,
  noteIceOnPass,
  notePassHost,
  notePassRezzedIceProtectingServer,
} from "../../state/run/passIceHooks.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import {
  noteEncounterEndIfRezzedThisTurn,
  noteEncounterEndIfRezzed,
  noteEncounterEndIfNotFullyBroken,
  noteEncounterEndIfPrintedSubroutineBroken,
} from "../../state/run/encounterEndHooks.js";
import { noteRunnerClickLose } from "../../state/turnAndActions/clickHooks.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import {
  run,
  noteEncounterEndIfBrokeEarly,
  meetPassAllIceConditions,
  clearEncounterOutsidePlayMark,
  removeTldrSubroutineCopies,
  anyUnrezzedIceInstalled,
} from "./stepHelpers.js";
import { approachServerAbility } from "../../state/keywordsAndCredits/costs.js";
import { noteApproachServer } from "../../state/run/approachServerHooks.js";
import type { TimingStepDef } from "../graph.js";

export const MOVEMENT_STEP_DEFS: Record<string, TimingStepDef> = {
  "run.movement": run(
    "run.movement",
    "sec_appendix_timing_structure_of_a_run_4_a",
    "11.4_4_a",
    "If the run got here from (2) or (3), the Runner passes ice.",
    "auto",
    (s) => {
      // Decline Sisyphus offer without paying.
      if (s.run?.pendingReencounterIceId && !s.run.reencounterIceId) {
        s.run.pendingReencounterIceId = undefined;
      }
      const iceId = s.run?.reencounterIceId;
      if (iceId && s.run) {
        const server = s.servers[s.run.attackedServerId];
        const pos = server.ice.indexOf(iceId);
        if (pos >= 0) {
          setRunnerPosition(s.run, pos);
          s.run.reencounterIceId = undefined;
          s.log.push(
            `Sisyphus — Runner encounters ${s.cards[iceId]?.title ?? iceId} again.`,
          );
          return "run.approachIce";
        }
        // Konjin / cross-server forced encounter via forceEncounterIceId.
        if (s.run.forceEncounterIceId === iceId || s.run.resumeEncounterIceId) {
          s.run.reencounterIceId = undefined;
          s.log.push(
            `Forced encounter — Runner encounters ${s.cards[iceId]?.title ?? iceId}.`,
          );
          return "run.approachIce";
        }
        s.run.reencounterIceId = undefined;
      }
      // Awakening Center-class: hosted-ice forced encounter ends — there is
      // no parent ice encounter to resume (the "parent" is an upgrade).
      // Fall through to normal run continuation (jack-out then re-approach).
      if (s.run?.resumeEncounterIceId) {
        const parentIdCheck = s.run.resumeEncounterIceId;
        const parentCheck = s.cards[parentIdCheck];
        if (parentCheck && parentCheck.type !== "ice") {
          s.run.resumeEncounterIceId = undefined;
          s.run.suspendedEncounter = undefined;
          s.log.push(
            `Forced encounter with hosted ice ends — resume run (${parentCheck.title}).`,
          );
        }
      }
      // Konjin-class: resume parent ice encounter after nested encounter ends.
      if (s.run?.resumeEncounterIceId) {
        const parentId = s.run.resumeEncounterIceId;
        const parent = s.cards[parentId];
        const stillRezzed =
          parent?.type === "ice" &&
          parent.rezzed &&
          Object.values(s.servers).some((srv) => srv.ice.includes(parentId));
        s.run.resumeEncounterIceId = undefined;
        if (stillRezzed) {
          const host = Object.values(s.servers).find((srv) =>
            srv.ice.includes(parentId),
          );
          if (host && host.id === s.run.attackedServerId) {
            setRunnerPosition(s.run, host.ice.indexOf(parentId));
          }
          if (s.run.suspendedEncounter?.iceId === parentId) {
            s.run.encounter = s.run.suspendedEncounter;
          } else {
            const subs = parent.subroutines ?? [];
            s.run.encounter = {
              iceId: parentId,
              broken: subs.map(() => false),
            };
          }
          s.run.suspendedEncounter = undefined;
          s.run.skipOnEncounterOnce = true;
          s.log.push(
            `Resume encounter with ${parent.title} after nested encounter.`,
          );
          return "run.encounterPaw";
        }
        s.run.suspendedEncounter = undefined;
        s.log.push(
          `Cannot resume encounter — ${parent?.title ?? parentId} no longer rezzed.`,
        );
      }
      // Ganked!-class: after forced mid-access encounter, resume access.
      if (s.run?.resumeAccessAfterReencounter && s.run.accessingCardId) {
        s.run.resumeAccessAfterReencounter = false;
        s.log.push(`Resume access after forced encounter (Ganked!-class).`);
        return "access.midAccess";
      }
      return "run.passIcePaw";
    },
    {
      onResolve: (s) => {
        const runState = s.run!;
        // A forced encounter with ice hosted on a root card began in this
        // step, after the pass. The step is not started again: the game
        // returns to where the encounter was caused (CR 6.5.9a).
        const forcedFrom = runState.resumeEncounterIceId
          ? s.cards[runState.resumeEncounterIceId]
          : undefined;
        const afterForcedEncounter = Boolean(
          forcedFrom && forcedFrom.type !== "ice",
        );
        if (afterForcedEncounter) {
          s.log.push(
            `Back in the Movement Phase after the forced encounter (CR ${CR.forcedEncounter.number}).`,
          );
        }
        const pos = runState.position;
        if (pos !== null && !afterForcedEncounter && runState.positionVacated) {
          noteEncounterEndIfBrokeEarly(s, "the ice was uninstalled");
          // The Runner passes the position; there is no ice in it to pass
          // (CR 8.5.10). No position is more inward when no ice is.
          runState.passReplacedByEncounterEnd = false;
          runState.passedAllIce =
            pos >= s.servers[runState.attackedServerId].ice.length;
          s.log.push(
            `The Runner passes a position with no ice (CR ${CR.uninstallIceDuringRun.number}, ${CR.destroyPosition.number}).`,
          );
        }
        if (
          pos !== null &&
          !afterForcedEncounter &&
          !runState.positionVacated
        ) {
          const iceId = s.servers[runState.attackedServerId].ice[pos];
          if (iceId) {
            const iceAtPosition = s.cards[iceId];
            // Mirāju replaces passing this ice with a move (CR 6.1.3e) when
            // the Runner broke its printed subroutine; a resolved subroutine
            // is not broken (CR 6.5.7a).
            const passReplaced =
              Boolean(iceAtPosition?.onEncounterEndIfPrintedSubroutineBroken) &&
              Boolean(iceAtPosition?.rezzed) &&
              runState.encounter?.iceId === iceId &&
              printedSubroutineBrokenByRunner(
                iceAtPosition!,
                runState.encounter,
              );
            runState.passReplacedByEncounterEnd = passReplaced;
            if (passReplaced) {
              s.log.push(
                `${iceAtPosition?.title ?? "Ice"} is not passed — the encounter-end replacement moved the Runner (CR ${CR.runPhaseAfter.number}).`,
              );
            }
            if (!passReplaced) {
              // Count every pass (rezzed, unrezzed, or bypassed → movement).
              runState.passedIceIds = [...(runState.passedIceIds ?? []), iceId];
              // CR 6.9.4a: no position more inward than the ice just passed.
              runState.passedAllIce =
                pos === s.servers[runState.attackedServerId].ice.length - 1;
            }
            // The Gauntlet: track fully broken ice protecting HQ this run.
            if (
              runState.attackedServerId === "hq" &&
              encounterFullyBrokenByRunner(runState.encounter)
            ) {
              runState.inFullyBrokenHqProtectingIceIds = [
                ...(runState.inFullyBrokenHqProtectingIceIds ?? []),
                iceId,
              ];
            }
            // Khan: first pass ice each turn — queue for 10.3.1a.
            noteFirstPassIce(s);
            const ice = s.cards[iceId];
            if (!ice.rezzed) {
              s.turn.currentRunPassedUnrezzedIceIds = [
                ...(s.turn.currentRunPassedUnrezzedIceIds ?? []),
                iceId,
              ];
              runState.lastPassedUnrezzedIceId = iceId;
              notePassUnrezzedIce(s);
            } else if (ice.rezzed && !passReplaced) {
              runState.lastPassedRezzedIceId = iceId;
              notePassRezzedIce(s);
              // Mass-Driver: fully break → next encounter first N subs do not resolve.
              if (runState.encounter?.fullyBrokenByRunner) {
                for (const rid of [...s.runner.installed]) {
                  const br = s.cards[rid];
                  const n = br?.fullyBreakNextEncounterFirstNSubsDoNotResolve;
                  if (typeof n === "number" && n > 0) {
                    s.turn.massDriverSkipSubsNextEncounter = n;
                    s.log.push(
                      `${br!.title} — first ${n} sub(s) of next encounter this run do not resolve.`,
                    );
                  }
                }
              }
              // Inversificator: first time each turn after fully breaking, may swap.
              if (
                !runState.passReplacedByEncounterEnd &&
                !s.turn.inversificatorSwapUsedThisTurn &&
                !s.pendingChoice &&
                runState.encounter?.fullyBrokenByRunner &&
                runState.encounter.iceId === iceId
              ) {
                for (const rid of [...s.runner.installed]) {
                  const br = s.cards[rid];
                  if (!br?.inversificatorSwapIceAfterFullyBrokeOncePerTurn) {
                    continue;
                  }
                  if (abilitiesSuppressed(s, rid)) continue;
                  s.turn.inversificatorSwapUsedThisTurn = true;
                  noteInlineConditional(s, {
                    cardId: rid,
                    abilityKey: "inversificator-may-swap-passed-ice",
                    controller: "runner",
                    mandatory: true,
                    effect: {
                      op: "do",
                      action: {
                        kind: "may_swap_passed_ice",
                        iceId,
                      },
                    },
                    logLine: `${br.title} becomes pending — fully broke ice (may swap).`,
                  });
                  break;
                }
              }
            }
            if ((ice.subtypes ?? []).includes("bioroid") && ice.rezzed) {
              // HB Architects: first pass of rezzed bioroid each turn.
              const idCard = s.cards[s.corp.identityId];
              if (
                idCard?.rezBioroidDiscountOnFirstPass &&
                !s.turn.bioroidPassedThisTurn
              ) {
                s.turn.bioroidPassedThisTurn = true;
                s.turn.pendingBioroidRezDiscount =
                  idCard.rezBioroidDiscountOnFirstPass;
                s.log.push(
                  `${idCard.title} — may rez a bioroid paying ${idCard.rezBioroidDiscountOnFirstPass}¢ less.`,
                );
              }
            }
            // Phoneutria-class onPass / Pichação onPassHost — queue for 10.3.1a.
            if (
              ice.rezzed &&
              !(runState.bypassedIceIds ?? []).includes(iceId)
            ) {
              if (ice.onPass && !abilitiesSuppressed(s, iceId)) {
                noteIceOnPass(s, iceId);
              }
              notePassHost(s, iceId);
            }
            // Cloud Eater: encounter end if rezzed this turn — queue for 10.3.1a.
            if (
              ice.onEncounterEndIfRezzedThisTurn &&
              (s.turn.rezzedThisTurnIds ?? []).includes(iceId) &&
              !(runState.bypassedIceIds ?? []).includes(iceId)
            ) {
              noteEncounterEndIfRezzedThisTurn(s, iceId);
            }
            // Knowledge Seeker: whenever an encounter with this ice ends.
            noteEncounterEndIfRezzed(s, iceId);
            // Anansi: encounter ends without full break → net damage.
            if (
              ice.onEncounterEndIfNotFullyBroken &&
              ice.rezzed &&
              !runState.encounter?.fullyBrokenByRunner
            ) {
              noteEncounterEndIfNotFullyBroken(s, iceId);
            }
            // Mirāju: if the Runner broke its printed subroutine, redirect to
            // Archives (CR 6.5.7a: a resolved subroutine is not broken).
            if (
              ice.onEncounterEndIfPrintedSubroutineBroken &&
              ice.rezzed &&
              runState.encounter &&
              printedSubroutineBrokenByRunner(ice, runState.encounter)
            ) {
              noteEncounterEndIfPrintedSubroutineBroken(s, iceId);
            }
            // Weyland Builder of Nations: first advanced-ice encounter end → 1 meat.
            if (
              !s.turn.bmFirstAdvancedIceEncounterEndMeatUsed &&
              (ice.advancementCounters ?? 0) > 0
            ) {
              const idCard = s.cards[s.corp.identityId];
              if (idCard?.firstAdvancedIceEncounterEndMeatDamageEachTurn) {
                s.turn.bmFirstAdvancedIceEncounterEndMeatUsed = true;
                noteInlineConditional(s, {
                  cardId: idCard.id,
                  abilityKey: "first-advanced-ice-encounter-end-meat",
                  controller: "corp",
                  mandatory: true,
                  effect: {
                    op: "do",
                    action: { kind: "meat_damage", amount: 1 },
                  },
                  logLine: `${idCard.title} becomes pending — first advanced ice encounter ends (meat damage).`,
                });
              }
            }
            // Chum: if that boosted encounter ended without fully breaking → net.
            if (
              runState.chumActiveEncounter &&
              runState.chumActiveEncounter.iceId === iceId
            ) {
              const chumEnc = runState.chumActiveEncounter;
              runState.chumActiveEncounter = undefined;
              const fully = encounterFullyBrokenByRunner(runState.encounter);
              if (!fully && chumEnc.netDamageIfNotFullyBroken > 0) {
                // A delayed conditional ability met as this encounter ends;
                // it resolves in the reaction window after the encounter and
                // then expires (CR 9.6.13c), whether or not Chum is still
                // active (CR 9.10.1).
                const amount = chumEnc.netDamageIfNotFullyBroken;
                noteInlineConditional(s, {
                  cardId: chumEnc.chumSourceId,
                  abilityKey: "chum-net-damage-on-encounter-end",
                  controller: "corp",
                  mandatory: true,
                  independentOfSource: true,
                  effect: { op: "do", action: { kind: "net_damage", amount } },
                  logLine: `Chum becomes pending — the encounter ended without the Runner fully breaking the ice (${amount} net damage; CR ${CR.delayedAbilityOnce.number}).`,
                });
              }
            }
            // Chief Slee: place power per unbroken sub when any encounter ends.
            // A subroutine that resolved is unbroken (CR 6.5.7a).
            {
              const unbroken =
                (runState.encounter?.broken.length ?? 0) -
                subroutinesBrokenByRunnerCount(runState.encounter);
              if (unbroken > 0) {
                for (const server of Object.values(s.servers)) {
                  for (const rid of server.root) {
                    const asset = s.cards[rid];
                    if (
                      !asset?.rezzed ||
                      !asset.placePowerPerUnbrokenSubOnAnyEncounterEnd
                    ) {
                      continue;
                    }
                    asset.powerCounters = (asset.powerCounters ?? 0) + unbroken;
                    s.log.push(
                      `${asset.title} — place ${unbroken} power (unbroken subs on ${ice.title}) → ${asset.powerCounters}.`,
                    );
                  }
                }
              }
            }
            // Mason Bellamy: broke ≥1 sub → Runner loses [click]. A subroutine
            // that resolved was not broken (CR 6.5.7a).
            const brokeAny =
              subroutinesBrokenByRunnerCount(runState.encounter) > 0;
            if (brokeAny) {
              const server = s.servers[runState.attackedServerId];
              for (const rid of server?.root ?? []) {
                const up = s.cards[rid];
                if (
                  !up?.rezzed ||
                  !up.loseClickOnProtectingIceEncounterEndIfBroke
                ) {
                  continue;
                }
                if (s.runner.clicks > 0) {
                  s.runner.clicks -= 1;
                  s.turn.runnerClicksSpentThisTurn += 1;
                  noteRunnerClickLose(s);
                }
                s.log.push(
                  `${up.title} — Runner loses [click] (broke a subroutine on ${ice.title}).`,
                );
              }
            }
            // Crypsis: if this breaker broke a sub, remove 1 virus or trash.
            // Tycoon: Corp gains credits if this breaker broke a sub.
            // Brahman: add installed non-virus program to stack top.
            const brokeBreakers =
              runState.encounter?.breakersThatBrokeThisEncounter ?? [];
            for (const bid of brokeBreakers) {
              const br = s.cards[bid];
              if (!br) continue;
              if (
                typeof br.corpGainsCreditsOnEncounterEndIfBroke === "number"
              ) {
                const n = br.corpGainsCreditsOnEncounterEndIfBroke;
                s.corp.credits += n;
                s.log.push(
                  `${br.title} — Corp gains ${n}¢ (broke a subroutine).`,
                );
              }
              if (
                br.addInstalledNonVirusProgramToStackTopOnEncounterEndIfBroke
              ) {
                noteInlineConditional(s, {
                  cardId: bid,
                  abilityKey:
                    "brahman-add-nonvirus-to-stack-top-on-encounter-end",
                  controller: "runner",
                  mandatory: true,
                  effect: {
                    op: "do",
                    action: { kind: "add_nonvirus_program_to_stack_top" },
                  },
                  logLine: `${br.title} becomes pending — encounter end after break (add non-virus to stack).`,
                });
              }
              // Faerie: "Whenever an encounter ends, if you used this program
              // to break a subroutine during that encounter, trash this
              // program." A conditional ability met as the encounter ends
              // (CR 9.6.4), not when the run ends.
              if (
                br.onEncounterEndIfBroke &&
                s.runner.installed.includes(bid) &&
                !abilitiesSuppressed(s, bid)
              ) {
                noteInlineConditional(s, {
                  cardId: bid,
                  abilityKey: "encounter-end-if-broke",
                  controller: "runner",
                  mandatory: true,
                  effect: br.onEncounterEndIfBroke,
                  logLine: `${br.title} becomes pending — it broke a subroutine during this encounter.`,
                });
              }
              if (!br.removeVirusOrTrashOnEncounterEndIfBroke) continue;
              if ((br.virusCounters ?? 0) >= 1) {
                br.virusCounters = (br.virusCounters ?? 0) - 1;
                s.log.push(
                  `${br.title} — remove 1 virus counter (broke a subroutine).`,
                );
              } else {
                // Its own ability trashes it (CR 1.14.5).
                trashCard(s, bid, { by: "runner" });
                s.log.push(
                  `${br.title} — trash (broke a subroutine; no virus counters).`,
                );
              }
            }
            // The Runner broke every subroutine; resolved ones do not count
            // (CR 6.5.7a).
            const allBroken = encounterFullyBrokenByRunner(runState.encounter);
            if (allBroken) {
              // Fractal Threat Matrix: trash top N of stack.
              const server = s.servers[runState.attackedServerId];
              if (server) {
                for (const rid of server.root) {
                  const up = s.cards[rid];
                  const n = up?.rezzed
                    ? up.trashTopOfStackWhenAllSubsBrokenOnProtectingIce
                    : undefined;
                  if (!n) continue;
                  for (let i = 0; i < n; i++) {
                    const top = s.runner.deck[0];
                    if (!top) break;
                    const tc = s.cards[top];
                    // The upgrade's ability: the Corp trashes it (CR 1.14.5).
                    trashCard(s, top, { by: "corp" });
                    s.log.push(
                      `${up!.title} — trash top of stack (${tc?.title ?? top}).`,
                    );
                  }
                }
              }
              for (const hid of ice.hostedCardIds ?? []) {
                const cond = s.cards[hid];
                if (!cond?.trashHostIfAllSubsBrokenThisEncounter) continue;
                // The hosted condition's ability: the Corp trashes the ice
                // (CR 1.14.5). The condition stays hosted and the next
                // checkpoint trashes it (CR 1.13.13, 10.3.1g).
                trashCard(s, iceId, { by: "corp" });
                s.log.push(
                  `${cond.title} — trash host ${ice.title} (all subroutines broken).`,
                );
                break;
              }
            }
            // Stick and Poke: remove synthetic subroutine after encounter.
            if (runState.encounter?.stickAndPokeSynthetic) {
              const synId = `${ice.defId}-stick-and-poke`;
              ice.subroutines = (ice.subroutines ?? []).filter(
                (sub) => sub.id !== synId,
              );
              runState.encounter.stickAndPokeSynthetic = false;
            }
            // Sensei: remove synthetic ETR after encounter.
            if (runState.encounter?.senseiEtrSynthetic) {
              const synId = `${ice.defId}-sensei-etr`;
              ice.subroutines = (ice.subroutines ?? []).filter(
                (sub) => sub.id !== synId,
              );
              runState.encounter.senseiEtrSynthetic = false;
            }
            // Sipa: "The first time each turn you pass the outermost piece
            // of ice protecting a server after fully breaking it, you may
            // swap it with another installed piece of ice." A conditional
            // ability: pending at the next checkpoint whatever else is
            // open (CR 9.3.7c), and "it" is the passed ice (CR 1.2.1).
            if (
              runState.position === 0 &&
              runState.encounter?.fullyBrokenByRunner &&
              !s.turn.sipaSwapUsedThisTurn
            ) {
              for (const rid of s.runner.installed) {
                const sipa = s.cards[rid];
                if (
                  !sipa?.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn
                ) {
                  continue;
                }
                if (abilitiesSuppressed(s, rid)) continue;
                s.turn.sipaSwapUsedThisTurn = true;
                noteInlineConditional(s, {
                  cardId: rid,
                  abilityKey: "sipa-may-swap-outermost-ice-on-pass",
                  controller: "runner",
                  mandatory: true,
                  effect: {
                    op: "do",
                    action: {
                      kind: "may_swap_ice_with_other_installed",
                      iceId,
                    },
                  },
                  logLine: `${sipa.title} becomes pending — pass outermost after full break (may swap).`,
                });
                break;
              }
            }
            // Mumbad City Grid: may swap passed ice with another protecting same server.
            if (!s.pendingChoice) {
              const server = s.servers[runState.attackedServerId];
              if (
                server &&
                server.ice.includes(iceId) &&
                server.ice.length > 1
              ) {
                for (const rid of server.root) {
                  const grid = s.cards[rid];
                  if (
                    !grid?.rezzed ||
                    !grid.onPassIceProtectingThisServerMaySwap
                  ) {
                    continue;
                  }
                  const others = server.ice.filter((id) => id !== iceId);
                  openPendingChoose(s, {
                    sourceId: rid,
                    chooser: "corp",
                    options: [
                      ...others.map((oid) => ({
                        id: `mumbad-swap:${oid}`,
                        label: `Swap with ${s.cards[oid]!.title}`,
                        effect: {
                          op: "do" as const,
                          action: {
                            kind: "swap_mumbad_passed_ice" as const,
                            iceId,
                            otherIceId: oid,
                          },
                        },
                      })),
                      {
                        id: "decline",
                        label: "Decline",
                        effect: {
                          op: "do" as const,
                          action: {
                            kind: "gain_credits" as const,
                            side: "corp" as const,
                            amount: 0,
                          },
                        },
                      },
                    ],
                    logLine: `${grid.title} — may swap ${ice.title} with another ice on this server.`,
                  });
                  break;
                }
              }
            }
            // Sisyphus: first pass of rezzed code gate or sentry — 10.3.1a.
            noteSisyphusFirstPass(s, iceId);
            // Code Replicator / The Twins: pass rezzed ice protecting this server.
            if (ice.rezzed && !runState.passReplacedByEncounterEnd) {
              s.turn.cotcLastPassedIceId = iceId;
              notePassRezzedIceProtectingServer(s, runState.attackedServerId);
            }
            // No position more inward than the ice just passed (CR 6.9.4a).
            if (!passReplaced && runState.passedAllIce) {
              meetPassAllIceConditions(s);
            }
          }
        }
        s.run!.phase = "movement";
        // Checkpoint while encounter facts still hold (Persephone reads
        // subroutinesResolved / ice subtypes from run.encounter — CR 10.3.1a).
        checkpointAfterInstruction(s, "run.movement");
        clearEncounterOutsidePlayMark(s, runState.encounter?.iceId);
        removeTldrSubroutineCopies(s);
        // Banner / VSA encounter-scoped flags clear with encounter teardown.
        s.run!.encounter = null;
        s.run!.usedAbilitiesThisEncounter = [];
        s.run!.runnerCannotSpendCredits = false;
        s.log.push(`Pass ice / move inward (appendix 11.4_4).`);
      },
    },
  ),
  "run.passIcePaw": run(
    "run.passIcePaw",
    "sec_appendix_timing_structure_of_a_run_4_b",
    "11.4_4_b",
    "Paid ability window: (P).",
    "pass",
    "run.jackOutWindow",
    { allows: ["use_paid_ability", "pass_window"] },
  ),
  "run.jackOutWindow": run(
    "run.jackOutWindow",
    "sec_appendix_timing_structure_of_a_run_4_c",
    "11.4_4_c",
    "The Runner may jack out.",
    "pass",
    "run.moveInward",
    { allows: ["jack_out", "continue_run", "pass_window"] },
  ),
  "run.moveInward": run(
    "run.moveInward",
    "sec_appendix_timing_structure_of_a_run_4_d",
    "11.4_4_d",
    "The Runner moves 1 position inward, if possible.",
    "auto",
    "run.afterMovePaw",
    {
      onResolve: (s) => {
        moveRunnerInward(s);
      },
    },
  ),
  "run.afterMovePaw": run(
    "run.afterMovePaw",
    "sec_appendix_timing_structure_of_a_run_4_e",
    "11.4_4_e",
    "Paid ability window: (P) (R).",
    "pass",
    "run.afterMove",
    { allows: ["use_paid_ability", "rez_asset", "pass_window"] },
  ),
  "run.afterMove": run(
    "run.afterMove",
    "sec_appendix_timing_structure_of_a_run_4_f",
    "11.4_4_f",
    "Did the Runner move to a new position?",
    "branch",
    (s) =>
      s.run!.position !== null ? "run.approachIce" : "run.approachServer",
  ),
  "run.approachServer": run(
    "run.approachServer",
    "sec_appendix_timing_structure_of_a_run_4_g",
    "11.4_4_g",
    "The Runner approaches the server.",
    "auto",
    (s) => {
      if (s.run?.endedTheRun) {
        return "run.closePriorityWindows";
      }
      if (s.pendingChoice) {
        return "run.approachServerPaw";
      }
      // Letheia-class: redirected back to outermost ice during approach.
      if (s.run!.position !== null) {
        return "run.approachIce";
      }
      const sid = s.run!.attackedServerId;
      const server = s.servers[sid];
      // CR 6.9.4g is not a paid ability window. The run stops here only for
      // an ability that is used when the Runner approaches the server.
      for (const id of server.root) {
        const card = s.cards[id];
        if (
          !abilitiesSuppressed(s, id) &&
          card.rezzed &&
          (card.paidAbilities ?? []).some(approachServerAbility)
        ) {
          return "run.approachServerPaw";
        }
      }
      // Formicary-class: an unrezzed ice on any server may respond when the
      // Runner approaches a server. Which facedown ice can do so is hidden
      // (CR 10.2.2a), and the current step is open to both seats, so the
      // run stops whenever any unrezzed ice is installed, an open fact
      // (CR 10.2.3a). Reading the facedown card here would tell the Runner
      // it is Formicary-class (CR 10.2.2b). Only the Corp holds priority at
      // this step, and only approach-server abilities may be used there.
      if (anyUnrezzedIceInstalled(s)) {
        return "run.approachServerPaw";
      }
      return "run.success";
    },
    {
      onResolve: (s) => {
        if (s.run!.endedTheRun || !s.servers[s.run!.attackedServerId]) {
          s.log.push(`Approach server (appendix 11.4_4_g).`);
          return;
        }
        s.run!.phase = "success";
        s.log.push(`Approach server (appendix 11.4_4_g).`);
        // Open Manegarm / Cayambe tax as a pending Runner choice if applicable.
        const sid = s.run!.attackedServerId;
        const server = s.servers[sid];
        for (const id of server.root) {
          const card = s.cards[id];
          if (!card.rezzed) continue;
          if (abilitiesSuppressed(s, id)) continue;
          if (card.approachServerEtrUnlessCreditsPerAdvancedIce !== undefined) {
            const per = card.approachServerEtrUnlessCreditsPerAdvancedIce;
            const advanced = server.ice.filter(
              (iceId) => (s.cards[iceId]?.advancementCounters ?? 0) > 0,
            ).length;
            const cost = per * advanced;
            if (cost > 0) {
              const options: Array<{
                id: string;
                label: string;
                effect: import("../../effects/ir/effect.js").Effect;
              }> = [];
              if (s.runner.credits >= cost) {
                options.push({
                  id: "pay-credits",
                  label: `Spend ${cost}¢`,
                  effect: {
                    op: "do",
                    action: {
                      kind: "lose_credits",
                      side: "runner",
                      amount: cost,
                    },
                  },
                });
              }
              options.push({
                id: "etr",
                label: "End the run",
                effect: { op: "do", action: { kind: "end_the_run" } },
              });
              openPendingChoose(s, {
                sourceId: id,
                chooser: "runner",
                options,
                logLine: `${card.title} — approach tax: pay ${cost}¢ (${per}¢ × ${advanced} advanced ice) or ETR.`,
              });
              break;
            }
          }
          if (!card.approachServerTax) continue;
          const tax = card.approachServerTax;
          const options: Array<{
            id: string;
            label: string;
            effect: import("../../effects/ir/effect.js").Effect;
          }> = [];
          if (s.runner.clicks >= tax.clicks) {
            options.push({
              id: "pay-clicks",
              label: `Spend ${tax.clicks} [click]`,
              effect: {
                op: "do",
                action: {
                  kind: "lose_clicks",
                  side: "runner",
                  amount: tax.clicks,
                },
              },
            });
          }
          if (s.runner.credits >= tax.credits) {
            options.push({
              id: "pay-credits",
              label: `Spend ${tax.credits}¢`,
              effect: {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: tax.credits,
                },
              },
            });
          }
          options.push({
            id: "etr",
            label: "End the run",
            effect: { op: "do", action: { kind: "end_the_run" } },
          });
          openPendingChoose(s, {
            sourceId: id,
            chooser: "runner",
            options,
            logLine: `${card.title} — approach tax: pay ${tax.clicks} clicks or ${tax.credits}¢ or ETR.`,
          });
          break;
        }
        // Nanisivik Grid-class: rezzed root onApproachServer — queue for 10.3.1a.
        // Note even when a tax already opened pendingChoice; the checkpoint
        // marks, and the reaction window waits on the open choice (CR 10.3.2).
        for (const id of server.root) {
          const card = s.cards[id];
          if (!card.rezzed || !card.onApproachServer) continue;
          if (abilitiesSuppressed(s, id)) continue;
          if (
            card.onApproachServerOncePerTurn &&
            s.turn.mtiApproachFiredThisTurn
          ) {
            continue;
          }
          if (card.onApproachServerOncePerRun) {
            const fired = s.run?.approachServerTriggersFiredIds ?? [];
            if (fired.includes(id)) continue;
          }
          noteApproachServer(s, id);
          if (card.onApproachServerOncePerTurn) {
            s.turn.mtiApproachFiredThisTurn = true;
          }
          if (card.onApproachServerOncePerRun && s.run) {
            s.run.approachServerTriggersFiredIds = [
              ...(s.run.approachServerTriggersFiredIds ?? []),
              id,
            ];
          }
        }
        checkpointAfterInstruction(s, "run.approachServer");
      },
    },
  ),
  "run.approachServerPaw": run(
    "run.approachServerPaw",
    "sec_appendix_timing_structure_of_a_run_4_g",
    "11.4_4_g",
    "Abilities used when the Runner approaches the server.",
    "pass",
    (s) => (s.run?.endedTheRun ? "run.closePriorityWindows" : "run.success"),
    { allows: ["use_paid_ability", "pass_window"] },
  ),
};
