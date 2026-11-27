/** The run's encounter ice phase (CR 11.4 step 3, CR 6.9.3); part of STEPS in timing/graph.ts. */
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import { iceStrengthCannotBeLowered } from "../../cards/stubs.js";
import {
  markRemainingSubroutinesNotBrokenByRunner,
  markSubroutineNotBrokenByRunner,
} from "../../state/turnAndActions/break.js";
import {
  fireOnBypassTriggers,
  serverHostingCard,
  evalEffect,
} from "../../effects/eval.js";
import { noteEncounterEndIfRezzed } from "../../state/run/encounterEndHooks.js";
import { syncSubroutinesFromRecords } from "../../effects/abilityRecord.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { agendaPointsFor } from "../../state/turnAndActions/scoring.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../labels.js";
import { syncCorpHandSizeSubroutines } from "../../state/continuous/handSizeSubroutines.js";
import { syncNextSubtypeEtrSubs } from "../../state/counters/powerCounters.js";
import {
  noteEncounterRezzedAfterApproach,
  noteHostEncounter,
} from "../../state/run/hostEncounterHooks.js";
import {
  noteEncounterAnyIceOncePerTurn,
  noteCompileFirstEncounter,
} from "../../state/run/encounterAbilityHooks.js";
import { noteEncounterIce } from "../../state/cardFlags/cardDeclarations.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import {
  addIceStrengthBoostThisEncounter,
  addBreakerStrengthBoostThisEncounter,
  addLingeringEffect,
  LINGERING_KIND_GRANTED_SUBTYPES,
} from "../../state/continuous/lingeringEffects.js";
import {
  collectWinchesterHqSubs,
  collectBlockchainArchivesSubs,
  collectHostedConditionSubsBeforePrinted,
  collectAdvancementGainedSubs,
  collectBadPublicityGainedSubs,
  collectNextOpalSubs,
  collectTourGuideEtrSubs,
  iceHasWinchesterFamilyDecl,
  applyContinuousGainedSubs,
  firstDecl,
  collectBrainstormGripSubs,
} from "../../state/continuous/continuousSubs.js";
import { syncAllTourGuideSubs } from "../../effects/rez/rezKinds.js";
import { resolveIceSubtypes } from "../../state/continuous/continuousEffects.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  runnerHasWhenEncounteredInterrupt,
  chosenIceBypassOffered,
  securityNexusTraceOffered,
  resolvePendingOnEncounter,
} from "../../state/run/onEncounter.js";
import { noteFirstEncounterEachRun } from "../../state/run/firstEncounterPassHooks.js";
import {
  run,
  encounterEndsEarly,
  iceBypassBlockedByServerUpgrade,
  grantTldrSubroutineCopies,
  MARKER_ETR,
  syncWardenBeforeSubroutines,
  syncHostedSubBoost,
} from "./stepHelpers.js";
import { noteOutsidePoolSpendTriggers } from "../../state/keywordsAndCredits/outsidePoolSpend.js";
import {
  maybeOfferSubroutineOrder,
  takeNextSubroutineIndex,
} from "../subroutineOrder.js";
import { armNestedBreachIfPending } from "../../state/access/access.js";
import type { TimingStepDef } from "../graph.js";

export const ENCOUNTER_ICE_STEP_DEFS: Record<string, TimingStepDef> = {
  "run.encounter": run(
    "run.encounter",
    "sec_appendix_timing_structure_of_a_run_3_a",
    "11.4_3_a",
    "The Runner encounters ice.",
    "auto",
    (s) => {
      // An encounter ability ended the run: the encounter ends with it, no
      // window opens and no subroutine resolves (CR 6.1.4, 6.9.6).
      if (s.run?.endedTheRun) return "run.closePriorityWindows";
      const iceId = s.run?.encounter?.iceId;
      if (iceId && (s.run?.bypassedIceIds ?? []).includes(iceId)) {
        return "run.movement";
      }
      // No window is open yet, so the encounter ends at once (CR 8.5.10).
      if (s.run?.encounter && encounterEndsEarly(s)) return "run.movement";
      return "run.encounterPaw";
    },
    {
      onResolve: (s) => {
        const runState = s.run!;
        const iceId =
          runState.forceEncounterIceId ??
          s.servers[runState.attackedServerId].ice[runState.position!];
        if (runState.forceEncounterIceId) {
          runState.forceEncounterIceId = undefined;
        }
        const ice = s.cards[iceId];
        // Inazuma: jack-out ban lifts when this encounter begins.
        if (runState.clearCannotJackOutOnNextEncounterBegin) {
          runState.clearCannotJackOutOnNextEncounterBegin = false;
          runState.cannotJackOut = false;
          s.log.push(
            `Inazuma — jack out allowed again (next ice encounter began).`,
          );
        }
        const applyInazumaBreakLock = Boolean(
          runState.inazumaLockNextEncounter,
        );
        if (applyInazumaBreakLock) {
          runState.inazumaLockNextEncounter = false;
        }
        runState.iceEncounteredCount = (runState.iceEncounteredCount ?? 0) + 1;
        runState.lastEncounteredIceId = iceId;
        if (
          runState.mayJackOutOnFirstIceEncounter &&
          !runState.reconJackOutOffered &&
          runState.iceEncounteredCount === 1
        ) {
          runState.reconJackOutOffered = true;
          const reconSrc = runState.runSourceId ?? iceId;
          noteInlineConditional(s, {
            cardId: reconSrc,
            abilityKey: "recon-may-jack-out-on-first-ice",
            controller: "runner",
            mandatory: true,
            effect: { op: "do", action: { kind: "offer_jack_out" } },
            logLine: `${s.cards[reconSrc]?.title ?? "Recon"} becomes pending — first ice encounter (may jack out).`,
          });
        }
        // Nero Severn: once per turn when encountering a sentry, may jack out.
        {
          const idCard = s.cards[s.runner.identityId];
          const iceSubs = ice.subtypes ?? [];
          if (
            idCard?.mayJackOutOnEncounterSentryOncePerTurn &&
            !s.turn.dagNeroSentryJackOutUsedThisTurn &&
            iceSubs.includes("sentry")
          ) {
            s.turn.dagNeroSentryJackOutUsedThisTurn = true;
            noteInlineConditional(s, {
              cardId: idCard.id,
              abilityKey: "nero-may-jack-out-on-encounter-sentry",
              controller: "runner",
              mandatory: true,
              effect: { op: "do", action: { kind: "offer_jack_out" } },
              logLine: `${idCard.title} becomes pending — encounter sentry (may jack out).`,
            });
          }
        }
        // Paperclip: when encountering a barrier, may install self from heap.
        if ((ice.subtypes ?? []).includes("barrier")) {
          for (const heapId of [...s.runner.discardPile]) {
            const c = s.cards[heapId];
            if (!c?.mayInstallSelfFromHeapOnEncounterBarrier) continue;
            noteInlineConditional(s, {
              cardId: heapId,
              abilityKey: "paperclip-heap-install-on-encounter-barrier",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "choose",
                chooser: "runner",
                options: [
                  {
                    id: "install",
                    label: `Install ${c.title} from heap`,
                    effect: {
                      op: "do",
                      action: {
                        kind: "install_heap_card",
                        cardId: heapId,
                        discount: 0,
                      },
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
              },
              logLine: `${c.title} becomes pending — encounter (may install from heap).`,
              // Heap may-install fires from an inactive zone (CR 9.6.10 exception).
              independentOfSource: true,
            });
            break;
          }
        }
        // Black Orchestra: when encountering a code gate, may install self from heap.
        if ((ice.subtypes ?? []).includes("code gate")) {
          for (const heapId of [...s.runner.discardPile]) {
            const c = s.cards[heapId];
            if (!c?.mayInstallSelfFromHeapOnEncounterCodeGate) continue;
            noteInlineConditional(s, {
              cardId: heapId,
              abilityKey: "black-orchestra-heap-install-on-encounter-code-gate",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "choose",
                chooser: "runner",
                options: [
                  {
                    id: "install",
                    label: `Install ${c.title} from heap`,
                    effect: {
                      op: "do",
                      action: {
                        kind: "install_heap_card",
                        cardId: heapId,
                        discount: 0,
                      },
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
              },
              logLine: `${c.title} becomes pending — encounter (may install from heap).`,
              independentOfSource: true,
            });
            break;
          }
        }
        // MKUltra: when encountering a sentry, may install self from heap.
        if ((ice.subtypes ?? []).includes("sentry")) {
          for (const heapId of [...s.runner.discardPile]) {
            const c = s.cards[heapId];
            if (!c?.mayInstallSelfFromHeapOnEncounterSentry) continue;
            noteInlineConditional(s, {
              cardId: heapId,
              abilityKey: "mkultra-heap-install-on-encounter-sentry",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "choose",
                chooser: "runner",
                options: [
                  {
                    id: "install",
                    label: `Install ${c.title} from heap`,
                    effect: {
                      op: "do",
                      action: {
                        kind: "install_heap_card",
                        cardId: heapId,
                        discount: 0,
                      },
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
              },
              logLine: `${c.title} becomes pending — encounter (may install from heap).`,
              independentOfSource: true,
            });
            break;
          }
        }
        // Şifr: once/turn may −1 hand size to set encounter ice strength to 0.
        // Lotus Field-class cannot have strength lowered (UFAQ / CR 9.12.1a).
        if (!s.turn.sifrUsedThisTurn && !iceStrengthCannotBeLowered(s, iceId)) {
          for (const rid of s.runner.installed) {
            const c = s.cards[rid];
            if (!c?.sifrMayZeroEncounterIceStrengthOncePerTurn) continue;
            noteInlineConditional(s, {
              cardId: rid,
              abilityKey: "sifr-may-zero-encounter-ice-strength",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "choose",
                chooser: "runner",
                options: [
                  {
                    id: "sifr-accept",
                    label: `Şifr: −1 hand size; set ${ice.title} strength to 0`,
                    effect: {
                      op: "do",
                      action: { kind: "sifr_zero_encounter_ice_strength" },
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
              },
              logLine: `${c.title} becomes pending — encounter (may zero ice strength).`,
            });
            break;
          }
        }
        // Always Have a Backup Plan: bypass the last ice from the first run.
        if (
          runState.backupPlanBypassIceId &&
          runState.backupPlanBypassIceId === iceId
        ) {
          runState.backupPlanBypassIceId = undefined;
          runState.bypassFirstEncounter = true; // reuse bypass path below
        }
        if (
          (runState.bypassEncountersRemaining ?? 0) > 0 &&
          !iceBypassBlockedByServerUpgrade(s, iceId)
        ) {
          runState.bypassEncountersRemaining! -= 1;
          runState.bypassedIceIds = [...(runState.bypassedIceIds ?? []), iceId];
          s.log.push(
            `Bypass ice (${ice.title}); ${runState.bypassEncountersRemaining ?? 0} bypass(es) left.`,
          );
          runState.encounter = {
            iceId,
            broken: [],
          };
          markRemainingSubroutinesNotBrokenByRunner(
            runState.encounter,
            (ice.subroutines ?? []).length,
          );
          fireOnBypassTriggers(s, iceId);
          noteEncounterEndIfRezzed(s, iceId);
        }
        // Inside Job / S-Dobrado: bypass first encounter
        if (
          runState.bypassFirstEncounter &&
          !iceBypassBlockedByServerUpgrade(s, iceId)
        ) {
          runState.bypassFirstEncounter = false;
          runState.bypassedIceIds = [...(runState.bypassedIceIds ?? []), iceId];
          runState.encounter = null;
          s.log.push(`Bypass ${ice.title} (first encounter this run).`);
          // Skip encounter — jump to movement by clearing encounter and
          // relying on next-step; mark as if fully broken.
          runState.encounter = {
            iceId,
            broken: [],
          };
          markRemainingSubroutinesNotBrokenByRunner(
            runState.encounter,
            (ice.subroutines ?? []).length,
          );
          fireOnBypassTriggers(s, iceId);
          noteEncounterEndIfRezzed(s, iceId);
        }
        // Spear Phishing: bypass the innermost ice protecting the server.
        if (runState.bypassInnermostEncounter) {
          const protecting = s.servers[runState.attackedServerId]?.ice ?? [];
          const innermostId =
            protecting.length > 0
              ? protecting[protecting.length - 1]
              : undefined;
          if (innermostId && iceId === innermostId) {
            runState.bypassInnermostEncounter = false;
            if (!(runState.bypassedIceIds ?? []).includes(iceId)) {
              runState.bypassedIceIds = [
                ...(runState.bypassedIceIds ?? []),
                iceId,
              ];
              s.log.push(
                `Bypass ${ice.title} (innermost ice protecting ${runState.attackedServerId}).`,
              );
              runState.encounter = {
                iceId,
                broken: [],
              };
              markRemainingSubroutinesNotBrokenByRunner(
                runState.encounter,
                (ice.subroutines ?? []).length,
              );
              fireOnBypassTriggers(s, iceId);
              noteEncounterEndIfRezzed(s, iceId);
            }
          }
        }
        // Refresh printed subroutines from CR 9.3.7e records before encounter
        // dynamics (Hive / Stick and Poke / TLDR extras keep their positions).
        if ((ice.abilities ?? []).some((a) => a.class === "subroutine")) {
          syncSubroutinesFromRecords(ice);
        }
        const subs = ice.subroutines ?? [];
        runState.phase = "encounter";
        if (!runState.encounter) {
          if (ice.dynamicEtrSubroutineCountFromCorpAgendaPoints) {
            if (!ice.baseSubroutines) {
              ice.baseSubroutines = structuredClone(subs);
            }
            const printed = ice.baseSubroutines ?? subs;
            // Blanked continuous lose-subs keeps printed base (CR 9.12.1d).
            if (abilitiesSuppressed(s, iceId)) {
              ice.subroutines = structuredClone(printed);
            } else {
              const points = agendaPointsFor(s, "corp");
              const lose = Math.min(printed.length, points);
              ice.subroutines = printed.slice(0, printed.length - lose);
              if (lose > 0) {
                log(
                  s,
                  `${ice.title} loses ${lose} printed subroutine(s) from the last (CR ${CR.subroutinesLostFromLast.number}).`,
                );
              }
            }
          }
          if (ice.dynamicEtrSubroutineCountFromCorpHandSize) {
            syncCorpHandSizeSubroutines(s, iceId);
          }
          if (ice.dynamicEtrSubroutineCountFromRezzedIceSubtype) {
            syncNextSubtypeEtrSubs(s, iceId);
          }
          if (
            s.run?.iceRezzedDuringApproachId === iceId &&
            s.cards[s.runner.identityId]?.onEncounterRezzedAfterApproach
          ) {
            noteEncounterRezzedAfterApproach(s);
          }
          grantTldrSubroutineCopies(s, iceId);
          runState.encounter = {
            iceId,
            broken: (ice.subroutines ?? subs).map(() => false),
          };
          noteEncounterAnyIceOncePerTurn(s);
          if (s.run?.encounter?.iceId)
            noteEncounterIce(s, s.run.encounter.iceId);
          noteCompileFirstEncounter(s);
          if (
            (s.turn.encounterAbilityPending ?? []).length > 0 ||
            (s.turn.inlineConditionalPending ?? []).length > 0
          ) {
            checkpointAfterInstruction(s, "run.encounter");
          }
          if (runState.markerExtraEtrNextIce) {
            runState.markerExtraEtrNextIce = false;
            const etrEffect = {
              op: "do" as const,
              action: { kind: "end_the_run" as const },
            };
            ice.subroutines = [
              ...(ice.subroutines ?? []),
              {
                id: `${ice.defId}${MARKER_ETR}`,
                text: "End the run.",
                effect: structuredClone(etrEffect),
              },
            ];
            runState.encounter.broken.push(false);
            s.log.push(
              `${ice.title} gains "End the run." after its other subroutines (CR ${CR.subroutineOriginExternalAfter.number}).`,
            );
          }
        } else if (runState.encounter.iceId === iceId) {
          // encounter already set (bypass paths)
        }
        // Inazuma first sub: cannot break on this encounter's ice.
        if (applyInazumaBreakLock && ice && runState.encounter) {
          // On the encounter only, so it ends with it (CR 9.10.1).
          runState.encounter.forbidRunnerBreakThisEncounter = true;
          s.log.push(
            `Inazuma — Runner cannot break subroutines on ${ice.title} this encounter.`,
          );
        }
        // Diana's Hunt: may install a program from grip ignoring costs.
        if (
          runState.onEncounterMayInstallProgramFromGripIgnoringCosts &&
          s.runner.hand.some((id) => s.cards[id]?.type === "program")
        ) {
          const dianaSrc = runState.runSourceId ?? iceId;
          noteInlineConditional(s, {
            cardId: dianaSrc,
            abilityKey: "dianas-hunt-may-install-program-on-encounter",
            controller: "runner",
            mandatory: true,
            effect: {
              op: "do",
              action: {
                kind: "may_install_diana_program_from_grip_ignoring_costs",
              },
            },
            logLine: `${s.cards[dianaSrc]?.title ?? "Diana's Hunt"} becomes pending — encounter (may install program from grip).`,
          });
        }
        // Chum: apply pending next-ice strength bonus at encounter begin.
        if (runState.chumNextIce) {
          const chum = runState.chumNextIce;
          runState.chumNextIce = undefined;
          addIceStrengthBoostThisEncounter(s, {
            createdBy: iceId,
            iceId,
            amount: chum.strengthBonus,
          });
          runState.chumActiveEncounter = {
            iceId,
            netDamageIfNotFullyBroken: chum.netDamageIfNotFullyBroken,
            chumSourceId: chum.chumSourceId,
          };
          s.log.push(
            `Chum — ${ice.title} gets +${chum.strengthBonus} strength this encounter.`,
          );
        }
        // Continuous gained subs (M1 collectors) — one apply so families do not wipe each other.
        {
          const winchester = collectWinchesterHqSubs(s, iceId);
          const winchesterFresh =
            winchester.length > 0 &&
            !(runState as { winchesterHqSubsApplied?: boolean })
              .winchesterHqSubsApplied;
          const continuous = [
            ...winchester,
            ...collectBlockchainArchivesSubs(s, iceId),
            ...collectHostedConditionSubsBeforePrinted(s, iceId),
            ...collectAdvancementGainedSubs(s, iceId),
            ...collectBadPublicityGainedSubs(s, iceId),
            ...collectNextOpalSubs(s, iceId),
            ...collectTourGuideEtrSubs(s, iceId),
          ];
          const needsSync =
            continuous.length > 0 || iceHasWinchesterFamilyDecl(ice);
          if (needsSync) {
            const beforeLen = ice.subroutines?.length ?? 0;
            applyContinuousGainedSubs(s, iceId, continuous);
            runState.encounter = {
              iceId,
              broken: (ice.subroutines ?? []).map(() => false),
            };
            if (winchesterFresh) {
              (
                runState as { winchesterHqSubsApplied?: boolean }
              ).winchesterHqSubsApplied = true;
              s.log.push(
                `${ice.title} — gains ${winchester.length} subroutine(s) while protecting HQ.`,
              );
            }
            const archivesDecl = firstDecl(ice, "archives_faceup_per");
            const blockchain = archivesDecl
              ? continuous.filter(
                  (g) =>
                    g.subId.startsWith(`${archivesDecl.subroutine.id}-`) ||
                    g.subId === archivesDecl.subroutine.id,
                )
              : [];
            if (archivesDecl && (ice.subroutines?.length ?? 0) !== beforeLen) {
              s.log.push(
                `${ice.title} — sync Archives-faceup gained subroutines (${blockchain.length} before printed).`,
              );
            }
            const wetworkN = collectHostedConditionSubsBeforePrinted(
              s,
              iceId,
            ).length;
            if (wetworkN > 0) {
              s.log.push(
                `${ice.title} — gains ${wetworkN} hosted condition subroutine(s) before printed.`,
              );
            }
            const opal = collectNextOpalSubs(s, iceId);
            const opalDecl = firstDecl(ice, "per_rezzed_subtype");
            if (opal.length > 0 && opalDecl) {
              s.log.push(
                `${ice.title} — gains ${opal.length} subroutine(s) from rezzed ${opalDecl.subtype}.`,
              );
            }
          }
          if (firstDecl(ice, "etr_per_rezzed_asset")) {
            syncAllTourGuideSubs(s);
          }
        }
        // Mass-Driver: first N subs of this encounter do not resolve.
        if (
          typeof s.turn.massDriverSkipSubsNextEncounter === "number" &&
          s.turn.massDriverSkipSubsNextEncounter > 0 &&
          runState.encounter
        ) {
          const n = s.turn.massDriverSkipSubsNextEncounter;
          s.turn.massDriverSkipSubsNextEncounter = 0;
          const broken = runState.encounter.broken ?? [];
          runState.encounter.broken = broken;
          for (let i = 0; i < Math.min(n, broken.length); i++) {
            markSubroutineNotBrokenByRunner(runState.encounter, i);
          }
          // Mark as auto-skipped so they do not resolve.
          s.log.push(
            `Mass-Driver — first ${n} subroutine(s) of this encounter do not resolve.`,
          );
        }
        // Berserker: +1 strength per barrier subroutine for remainder of encounter.
        if (
          resolveIceSubtypes(s, iceId).some(
            (t) => t.toLowerCase() === "barrier",
          )
        ) {
          const subCount = ice.subroutines?.length ?? 0;
          for (const rid of s.runner.installed) {
            const br = s.cards[rid];
            const per = br?.strengthBonusPerSubroutineOnEncounteredBarrier;
            if (typeof per !== "number" || per <= 0 || subCount <= 0) continue;
            const boost = per * subCount;
            addBreakerStrengthBoostThisEncounter(s, {
              createdBy: rid,
              breakerId: rid,
              amount: boost,
            });
            s.log.push(
              `${br!.title} — +${boost} strength for this barrier encounter.`,
            );
          }
        }
        // Brainstorm: gains X "Do 1 core damage" subs = grip size for remainder of run.
        const gripDecl = firstDecl(ice, "grip_size_on_encounter");
        if (
          gripDecl &&
          !(runState as { tlmBrainstormApplied?: boolean }).tlmBrainstormApplied
        ) {
          const brainstorm = collectBrainstormGripSubs(s, iceId);
          const template = gripDecl.subroutine;
          const prior = (ice.subroutines ?? []).filter(
            (sub) => !sub.id.startsWith(`${template.id}-`),
          );
          if (!ice.baseSubroutines) {
            ice.baseSubroutines = structuredClone(prior);
          }
          ice.subroutines = [
            ...structuredClone(ice.baseSubroutines),
            ...brainstorm.map((g) => ({
              id: g.subId,
              text: g.text,
              effect: g.effect,
            })),
          ];
          const kept = runState.encounter?.broken ?? [];
          runState.encounter = {
            iceId,
            broken: [
              ...kept.slice(
                0,
                (ice.subroutines?.length ?? 0) - brainstorm.length,
              ),
              ...brainstorm.map(() => false),
            ],
          };
          (
            runState as { tlmBrainstormApplied?: boolean }
          ).tlmBrainstormApplied = true;
          s.log.push(
            `${ice.title} gains ${brainstorm.length} "Do 1 core damage." subroutine(s) after the others (CR ${CR.subroutineOriginExternalAfter.number}).`,
          );
        }
        syncWardenBeforeSubroutines(s, iceId);
        // Stick and Poke: first encounter each turn, ice gains a subroutine.
        if (
          !s.turn.stickAndPokeUsedThisTurn &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          !runState.encounter.stickAndPokeSynthetic
        ) {
          for (const rid of s.runner.installed) {
            if (abilitiesSuppressed(s, rid)) continue;
            const poke = s.cards[rid];
            const syn = poke?.firstEncounterGainsSubroutine;
            if (!syn) continue;
            s.turn.stickAndPokeUsedThisTurn = true;
            const synSub = {
              id: `${ice.defId}-stick-and-poke`,
              text: syn.text,
              effect: structuredClone(syn.effect),
            };
            // The gain lasts for this encounter only; drop a copy left
            // over from an earlier encounter before adding this one.
            ice.subroutines = [
              synSub,
              ...(ice.subroutines ?? []).filter((sub) => sub.id !== synSub.id),
            ];
            runState.encounter = {
              iceId,
              broken: ice.subroutines.map(() => false),
              stickAndPokeSynthetic: true,
            };
            s.log.push(
              `${poke.title} — ${ice.title} gains "${syn.text}" this encounter.`,
            );
            break;
          }
        }
        // Sensei: other ice gains ETR after printed for remainder of run.
        if (
          (runState.senseiEtrSourceIds?.length ?? 0) > 0 &&
          !runState.senseiEtrSourceIds!.includes(iceId) &&
          !runState.encounter.senseiEtrSynthetic
        ) {
          const synSub = {
            id: `${ice.defId}-sensei-etr`,
            text: "End the run.",
            effect: {
              op: "do" as const,
              action: { kind: "end_the_run" as const },
            },
          };
          // The gain lasts for the remainder of the run; drop a copy
          // left over from an earlier run before adding this one.
          ice.subroutines = [
            ...(ice.subroutines ?? []).filter((sub) => sub.id !== synSub.id),
            synSub,
          ];
          runState.encounter = {
            ...runState.encounter,
            iceId,
            broken: ice.subroutines.map(() => false),
            senseiEtrSynthetic: true,
          };
          s.log.push(
            `Sensei — ${ice.title} gains "End the run." after its other subroutines.`,
          );
        }
        // S-Dobrado Threat: may spend click to bypass second encounter.
        if (
          runState.bypassSecondEncounterForClick &&
          runState.iceEncounteredCount === 2 &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          s.runner.clicks >= 1 &&
          !s.pendingChoice
        ) {
          openPendingChoose(s, {
            sourceId: runState.runSourceId ?? iceId,
            chooser: "runner",
            options: [
              {
                id: "bypass-click",
                label: "Spend [click]: bypass this ice",
                effect: {
                  op: "seq",
                  effects: [
                    {
                      op: "do",
                      action: {
                        kind: "lose_clicks",
                        side: "runner",
                        amount: 1,
                      },
                    },
                    {
                      op: "do",
                      action: { kind: "bypass_current_ice" },
                    },
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
            logLine: `Threat — may spend [click] to bypass ${ice.title} (second encounter).`,
          });
        }
        // Alarm Clock: may spend N clicks to bypass first encounter.
        if (
          (runState.bypassFirstEncounterForClicks ?? 0) > 0 &&
          runState.iceEncounteredCount === 1 &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          s.runner.clicks >= (runState.bypassFirstEncounterForClicks ?? 0) &&
          !s.pendingChoice
        ) {
          const n = runState.bypassFirstEncounterForClicks!;
          openPendingChoose(s, {
            sourceId: runState.runSourceId ?? iceId,
            chooser: "runner",
            options: [
              {
                id: "bypass-clicks",
                label: `Spend ${n} [click]: bypass this ice`,
                effect: {
                  op: "seq",
                  effects: [
                    {
                      op: "do",
                      action: {
                        kind: "lose_clicks",
                        side: "runner",
                        amount: n,
                      },
                    },
                    {
                      op: "do",
                      action: { kind: "bypass_current_ice" },
                    },
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
            logLine: `Alarm Clock — may spend ${n} [click] to bypass ${ice.title} (first encounter).`,
          });
        }
        s.log.push(
          `Encounter ${ice.title} (appendix 11.4_3_a / CR 6.5.1) with ${(ice.subroutines ?? subs).length} subroutine(s).`,
        );
        // Gantulga: "the first encounter each turn with a piece of ice
        // protecting the chosen server". The server the ice protects counts,
        // not the attacked one, and only that one encounter is marked; a
        // later encounter with the same ice is not (CR 1.2.1).
        const encIceServer = serverHostingCard(s, iceId)?.id;
        if (!s.turn.gantulgaEncounterIceId) {
          for (const rid of s.runner.installed) {
            if (abilitiesSuppressed(s, rid)) continue;
            const g = s.cards[rid];
            if (
              !(g.firstEncounterSubsBecomeNetDamage ?? 0) ||
              !g.namedServerId
            ) {
              continue;
            }
            if (g.namedServerId !== encIceServer) continue;
            if ((runState.bypassedIceIds ?? []).includes(iceId)) continue;
            s.turn.gantulgaEncounterIceId = iceId;
            if (runState.encounter) runState.encounter.gantulgaReplaces = true;
            s.log.push(
              `${g.title} — first encounter with ice protecting ${g.namedServerId}; subs become net damage.`,
            );
            break;
          }
        }
        // Kit: first encounter each turn, ice gains code gate
        const runnerId = s.cards[s.runner.identityId];
        if (
          runnerId?.firstEncounterGainsCodeGate &&
          !abilitiesSuppressed(s, s.runner.identityId) &&
          !s.turn.firstEncounterUsedThisTurn
        ) {
          s.turn.firstEncounterUsedThisTurn = true;
          // "It gains code gate for the remainder of this run": a lingering
          // effect that ends with the run (CR 9.10.1).
          addLingeringEffect(s, {
            createdBy: s.runner.identityId,
            duration: { kind: "run" },
            kind: LINGERING_KIND_GRANTED_SUBTYPES,
            payload: { cardId: iceId, subtypes: ["code gate"] },
          });
          s.log.push(
            `${runnerId.title} — ${ice.title} gains code gate for the remainder of this run.`,
          );
        }
        syncHostedSubBoost(s, iceId);
        if (
          ice.onEncounter &&
          !abilitiesSuppressed(s, iceId) &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          !runState.skipOnEncounterOnce
        ) {
          // Defer while a bypass can end this encounter (CR 9.2.8f), or for
          // when_encountered_interrupt (AirbladeX). Otherwise fire now.
          runState.encounter!.onEncounterPending = true;
          if (
            !runnerHasWhenEncounteredInterrupt(s) &&
            !chosenIceBypassOffered(s, iceId) &&
            !securityNexusTraceOffered(s)
          ) {
            resolvePendingOnEncounter(s);
          }
        }
        // Baklan: first actual encounter each run — queue for 10.3.1a.
        if (!(runState.bypassedIceIds ?? []).includes(iceId)) {
          noteFirstEncounterEachRun(s);
        }
        // Chisel-class trojans + Eavesdrop-class conditions: onHostEncounter.
        if (
          !s.pendingChoice &&
          !(runState.bypassedIceIds ?? []).includes(iceId)
        ) {
          noteHostEncounter(s, iceId);
        }
        if (runState.skipOnEncounterOnce) {
          runState.skipOnEncounterOnce = false;
        }
        // ZATO City Grid: protecting ice gains may-trash-to-resolve-chosen-sub.
        if (
          !s.pendingChoice &&
          !(runState.bypassedIceIds ?? []).includes(iceId) &&
          (ice.subroutines ?? []).length > 0
        ) {
          const sid = runState.attackedServerId;
          const root = s.servers[sid]?.root ?? [];
          for (const rid of root) {
            const up = s.cards[rid];
            if (
              !up?.rezzed ||
              !up.iceGainsTrashToResolveChosenSubOnEncounter ||
              abilitiesSuppressed(s, rid)
            ) {
              continue;
            }
            const options: Array<{
              id: string;
              label: string;
              effect: import("../../effects/ir.js").Effect;
            }> = (ice.subroutines ?? []).map((sub, i) => ({
              id: `zato:${i}`,
              label: `Trash ${ice.title} to resolve "${sub.text}"`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "trash_encounter_ice_resolve_subroutine" as const,
                  subIndex: i,
                },
              },
            }));
            options.push({
              id: "decline",
              label: "Decline",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "corp", amount: 0 },
              },
            });
            openPendingChoose(s, {
              sourceId: rid,
              chooser: "corp",
              options,
              logLine: `${up.title} — may trash ${ice.title} to resolve a subroutine.`,
            });
            break;
          }
        }
        // Femme Fatale: may pay 1¢ per sub to bypass chosen ice.
        if (!(runState.bypassedIceIds ?? []).includes(iceId)) {
          // Rigged Results: first encounter of chosen ice → auto-bypass.
          if (
            s.turn.ftmRiggedResultsBypassIceId === iceId &&
            !(runState.bypassedIceIds ?? []).includes(iceId)
          ) {
            s.turn.ftmRiggedResultsBypassIceId = undefined;
            openPendingChoose(s, {
              sourceId: iceId,
              chooser: "runner",
              options: [
                {
                  id: "rr-bypass",
                  label: `Bypass ${ice.title} (Rigged Results)`,
                  effect: {
                    op: "do",
                    action: { kind: "bypass_current_ice" },
                  },
                },
              ],
              logLine: `Rigged Results — bypass ${ice.title}.`,
            });
          } else
            for (const rid of s.runner.installed) {
              const femme = s.cards[rid];
              if (femme.chosenIceId !== iceId) continue;
              const n = (ice.subroutines ?? []).length;
              const cost = n;
              if (s.runner.credits >= cost) {
                openPendingChoose(s, {
                  sourceId: rid,
                  chooser: "runner",
                  options: [
                    {
                      id: "bypass",
                      label: `Bypass ${ice.title} for ${cost}¢`,
                      effect: {
                        op: "seq",
                        effects: [
                          {
                            op: "do",
                            action: {
                              kind: "lose_credits",
                              side: "runner",
                              amount: cost,
                            },
                          },
                          {
                            op: "do",
                            action: { kind: "bypass_current_ice" },
                          },
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
                  logLine: `${femme.title} — may pay ${cost}¢ to bypass ${ice.title}.`,
                });
              }
              break;
            }
        }
        if (
          !s.pendingChoice &&
          securityNexusTraceOffered(s) &&
          s.run?.encounter
        ) {
          for (const rid of s.runner.installed) {
            const nexus = s.cards[rid];
            if (
              !nexus?.paidAbilities?.some(
                (ability) => ability.id === "security-nexus-trace",
              )
            ) {
              continue;
            }
            openPendingChoose(s, {
              sourceId: rid,
              chooser: "runner",
              options: [
                {
                  id: "nexus-trace",
                  label: "Trace 5 — success gives a tag and ends the run",
                  effect: {
                    op: "do",
                    action: { kind: "trace_bypass_or_tag_etr" },
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
              logLine: `${nexus.title} — may trace at the start of this encounter (CR ${CR.encounterBegins.number}).`,
            });
            break;
          }
        }
        checkpointAfterInstruction(s, "run.encounter");
      },
    },
  ),
  "run.encounterPaw": run(
    "run.encounterPaw",
    "sec_appendix_timing_structure_of_a_run_3_b",
    "11.4_3_b",
    "Paid ability window: (P) and subroutines can be broken.",
    "pass",
    "run.checkSubs",
    {
      allows: [
        "break_subroutine",
        "break_bioroid_subroutine",
        "use_paid_ability",
        "pass_window",
      ],
      onResolve: (s) => {
        noteOutsidePoolSpendTriggers(s);
        if ((s.turn.outsidePoolSpendPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "run.encounterPaw");
        }
      },
    },
  ),
  "run.checkSubs": run(
    "run.checkSubs",
    "sec_appendix_timing_structure_of_a_run_3_c",
    "11.4_3_c",
    "Are there unbroken subroutines to resolve?",
    "branch",
    (s) => {
      // The run ended during the encounter: no more subroutines resolve
      // (CR 6.1.4).
      if (s.run?.endedTheRun) return "run.closePriorityWindows";
      // The paid ability window has been completed (CR 8.5.10).
      if (encounterEndsEarly(s)) return "run.movement";
      const enc = s.run!.encounter!;
      if (s.cards[enc.iceId]?.dynamicEtrSubroutineCountFromCorpHandSize) {
        syncCorpHandSizeSubroutines(s, enc.iceId);
      }
      const hasUnbroken = enc.broken.some((b) => !b);
      return hasUnbroken ? "run.resolveSub" : "run.movement";
    },
  ),
  "run.resolveSub": run(
    "run.resolveSub",
    "sec_appendix_timing_structure_of_a_run_3_c_i",
    "11.4_3_c_i",
    "If yes, the Corp resolves the next one.",
    "auto",
    (s) => {
      // Shiro-class: nested mid-encounter breach armed during this sub.
      if (s.run?.nestedBreachFromEncounter && s.run.phase === "breach") {
        return "breach.begin";
      }
      return s.run!.endedTheRun ? "run.closePriorityWindows" : "run.checkSubs";
    },
    {
      onResolve: (s) => {
        const runState = s.run!;
        const enc = runState.encounter;
        if (!enc) return;
        const ice = s.cards[enc.iceId];
        if (!ice) return;
        if (maybeOfferSubroutineOrder(s)) return;
        const subs = ice.subroutines ?? [];
        const idx = takeNextSubroutineIndex(s);
        if (idx < 0) return;
        const sub = subs[idx];
        // Tracker: prevent the first subroutine that would resolve this run.
        if (runState.quTrackerPreventFirstSubroutine) {
          runState.quTrackerPreventFirstSubroutine = false;
          markSubroutineNotBrokenByRunner(enc, idx);
          s.log.push(
            `Tracker — prevent subroutine "${sub.text}" from resolving.`,
          );
          return;
        }
        // Mark resolved (fired) so it does not fire again; the Runner did not
        // break it (`encounterFullyBrokenByRunner`).
        markSubroutineNotBrokenByRunner(enc, idx);
        enc.subroutinesResolved = (enc.subroutinesResolved ?? 0) + 1;
        // Gantulga replacement: first named-server encounter → Do N net damage.
        let replaced = false;
        if (
          enc.gantulgaReplaces &&
          s.turn.gantulgaEncounterIceId === enc.iceId
        ) {
          for (const rid of s.runner.installed) {
            if (abilitiesSuppressed(s, rid)) continue;
            const g = s.cards[rid];
            const n = g.firstEncounterSubsBecomeNetDamage ?? 0;
            if (n <= 0 || !g.namedServerId) continue;
            s.log.push(
              `Resolve subroutine "${sub.text}" as "Do ${n} net damage." from ${ice.title} (CR ${CR.replaceSubroutineResolution.number}).`,
            );
            const r = evalEffect(
              { state: s, sourceId: ice.id },
              {
                op: "do",
                action: { kind: "net_damage", amount: n },
              },
            );
            if (!r.ok) {
              s.log.push(`Gantulga net damage failed: ${r.error}`);
            }
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          if (!ice.zone.endsWith(":ice")) {
            s.log.push(
              `${ice.title}'s subroutines are active (CR ${CR.encounterNotInstalled.number}).`,
            );
          }
          s.log.push(
            `Resolve subroutine "${sub.text}" (appendix 11.4_3_c_i / CR 6.5.5).`,
          );
          const threatLvl = ice.threatCannotSpendCreditsDuringSubs;
          let blockedSpend = false;
          if (threatLvl !== undefined) {
            const pts = Math.max(
              agendaPointsFor(s, "corp"),
              agendaPointsFor(s, "runner"),
            );
            if (pts >= threatLvl) {
              runState.runnerCannotSpendCredits = true;
              blockedSpend = true;
              s.log.push(
                `${ice.title} — Threat ${threatLvl}: Runner cannot spend credits while this subroutine resolves.`,
              );
            }
          }
          const r = evalEffect({ state: s, sourceId: ice.id }, sub.effect);
          if (!r.ok) {
            s.log.push(`Subroutine effect failed: ${r.error}`);
          }
          // The subroutine is still resolving during its damage interrupt, so
          // the Runner still cannot spend credits there (CR 9.1.2b).
          if (blockedSpend && !s.pendingChoice && !s.pendingDamage) {
            runState.runnerCannotSpendCredits = false;
          }
          // Shiro-class: Corp could not pay → arm nested breach; next() diverts.
          armNestedBreachIfPending(s);
        }
        // Raindrops Cut Stone: +power on run source whenever a sub resolves
        // (including ETR — counter is placed before run.ends).
        const n = runState.addPowerCounterOnSubroutineResolve ?? 0;
        const srcId = runState.runSourceId;
        if (n > 0 && srcId && s.cards[srcId]) {
          const src = s.cards[srcId]!;
          src.powerCounters = (src.powerCounters ?? 0) + n;
          s.log.push(
            `Place ${n} power counter(s) on ${src.title} → ${src.powerCounters}.`,
          );
        }
        runState.subroutineResolvedThisRun = true;
      },
    },
  ),
};
