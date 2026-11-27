/** Breaching a server (CR 11.5) and accessing a card within it (CR 11.6); part of STEPS in timing/graph.ts. */
import {
  beginBreachAccess,
  refreshRdDeckCandidate,
  accessLimitEndsBreach,
} from "../../state/access/access.js";
import { breach, endAccessVisibility } from "./stepHelpers.js";
import {
  onAccessed,
  onAccessFinishedWithoutStealOrTrash,
} from "../../state/cardFlags/cardDeclarations.js";
import {
  noteAccessedCardAbilities,
  noteFinishAccessRdOncePerTurn,
} from "../../state/access/accessAbilityHooks.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import { getCardDef } from "../../cards/load.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import {
  setAttackedServer,
  setRunnerPosition,
} from "../../state/uninstallAndPosition/runPosition.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../labels.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { breachCreditGain } from "../../state/cardFlags/staticFlags.js";
import type { TimingStepDef } from "../graph.js";

export const BREACH_STEP_DEFS: Record<string, TimingStepDef> = {
  // --- Breach (appendix 11.5) ---
  "breach.begin": breach(
    "breach.begin",
    "sec_appendix_timing_structure_of_breaching_a_server_1",
    "11.5_1",
    "The breach begins.",
    "auto",
    "breach.choose",
    {
      onResolve: (s) => {
        beginBreachAccess(s);
      },
    },
  ),
  "breach.choose": breach(
    "breach.choose",
    "sec_appendix_timing_structure_of_breaching_a_server_4",
    "11.5_4",
    "Are there candidate cards remaining to access?",
    "branch",
    (s) => {
      refreshRdDeckCandidate(s);
      const cands = s.run!.accessCandidates;
      if (cands.length === 0 || accessLimitEndsBreach(s)) {
        s.log.push(
          cands.length === 0
            ? "No access candidates — empty server breach completes."
            : "Access remaining is 0 — breach completes.",
        );
        return "breach.complete";
      }
      return "breach.awaitAccess";
    },
  ),
  "breach.awaitAccess": breach(
    "breach.awaitAccess",
    "sec_appendix_timing_structure_of_breaching_a_server_4_a",
    "11.5_4_a",
    "If yes, the Runner chooses a candidate.",
    "access",
    "breach.access",
    { allows: ["access_card", "finish_breach"] },
  ),
  // Nested access-a-card structure (appendix 11.6 / §7.2) — walked while
  // resolving one chosen candidate from breach.awaitAccess.
  "access.cardAccessed": breach(
    "access.cardAccessed",
    "sec_appendix_timing_structure_of_accessing_a_card_1",
    "11.6_1",
    "The card is accessed.",
    "auto",
    "access.midAccess",
    {
      onResolve: (s) => {
        const accessedId = s.run?.accessingCardId;
        if (accessedId) onAccessed(s, accessedId);
        const accessed = accessedId ? s.cards[accessedId] : undefined;
        if (accessed && (accessed.onAccessGiveTags ?? 0) > 0) {
          const n = accessed.onAccessGiveTags!;
          s.runner.tags += n;
          s.turn.tagsGivenThisTurn += n;
          s.log.push(
            `${accessed.title} — Runner takes ${n} tag(s) on access → ${s.runner.tags}.`,
          );
        }
        noteAccessedCardAbilities(s);
        if ((s.turn.accessAbilityPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "access.cardAccessed");
        }
      },
    },
  ),
  "access.midAccess": breach(
    "access.midAccess",
    "sec_appendix_timing_structure_of_accessing_a_card_2",
    "11.6_2",
    "The Runner may trash the card or use another mid-access ability.",
    "access",
    "access.stealAgenda",
    {
      allows: [
        "trash_accessed",
        "access_rfg_paying_trash_cost",
        "finish_access",
        "access_trash_from_grip",
        "access_trash_with_virus",
        "access_trash_free",
        "access_trash_paying_printed_cost_from_stealth",
        "access_trash_self_non_agenda_draw",
        "access_host_non_agenda_faceup",
      ],
    },
  ),
  "access.stealAgenda": breach(
    "access.stealAgenda",
    "sec_appendix_timing_structure_of_accessing_a_card_3",
    "11.6_3",
    "If the card is an agenda, the Runner steals it.",
    "access",
    "access.complete",
    {
      allows: [
        "steal_agenda",
        "finish_access",
        "access_host_agenda_on_film_critic",
      ],
    },
  ),
  "access.complete": breach(
    "access.complete",
    "sec_appendix_timing_structure_of_accessing_a_card_4",
    "11.6_4",
    "Access is complete.",
    "auto",
    "breach.access",
    {
      onResolve: (s) => {
        endAccessVisibility(s, s.run?.accessingCardId);
        noteFinishAccessRdOncePerTurn(s);
        if ((s.turn.accessAbilityPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "access.complete");
        }
        const accessedId = s.run?.accessingCardId;
        if (accessedId) {
          const accessed = s.cards[accessedId];
          const inArchives =
            accessed?.zone === "corp:archives" ||
            s.corp.discardPile.includes(accessedId);
          const hasTrashCost =
            typeof accessed?.trashCost === "number" ||
            (accessed?.defId != null &&
              getCardDef(accessed.defId)?.trashCost != null);
          if (accessed && hasTrashCost && !inArchives) {
            for (const rid of [...s.runner.installed]) {
              const info = s.cards[rid];
              if (!info?.aeneasInformantRevealGainOnAccessWithoutTrash)
                continue;
              noteInlineConditional(s, {
                cardId: rid,
                abilityKey: "aeneas-may-reveal-gain-on-access-without-trash",
                controller: "runner",
                mandatory: true,
                effect: {
                  op: "do",
                  action: {
                    kind: "may_reveal_aeneas_gain_one",
                    cardId: accessedId,
                  },
                },
                logLine: `${info.title} becomes pending — access without trash (may reveal and gain).`,
              });
            }
            if ((s.turn.inlineConditionalPending ?? []).length > 0) {
              checkpointAfterInstruction(s, "access.complete");
            }
          }
        }
        if (s.run) s.run.accessingCardId = null;
        s.log.push(`Access complete (CR 7.2.4 / appendix 11.6_4).`);
      },
    },
  ),
  "breach.access": breach(
    "breach.access",
    "sec_appendix_timing_structure_of_breaching_a_server_5",
    "11.5_5",
    "The Runner accesses the chosen card.",
    "auto",
    "breach.choose",
  ),
  "breach.complete": breach(
    "breach.complete",
    "sec_appendix_timing_structure_of_breaching_a_server_7",
    "11.5_7",
    "Breaching the server is complete.",
    "auto",
    (s) => {
      // Divide and Conquer-class: queue further breaches after this one.
      const queued = s.run?.queuedBreachesAfterCurrent;
      if (queued && queued.length > 0) {
        const next = queued.shift()!;
        const run = s.run!;
        setAttackedServer(run, next.server);
        run.cannotAccessRoot = next.cannotAccessRoot ?? false;
        run.accessCandidates = [];
        run.randomAccessLimit = null;
        run.accessingCardId = null;
        run.accessedCardIds = [];
        run.breachStoleOrTrashed = false;
        run.phase = "breach";
        run.breached = false;
        run.wakeImplantPending = false;
        run.wakeImplantResolved = false;
        run.mercuryBreachPending = false;
        run.mediumBreachPending = false;
        run.cupellationBreachPending = false;
        run.cupellationBreachResolved = false;
        run.onBreachRdPending = false;
        run.onBreachRdResolved = false;
        run.prettyMaryBreachResolved = false;
        run.mercuryBreachOffered = false;
        run.twinningBreachResolved = false;
        run.heliamphoraHostInsteadUsedThisBreach = false;
        s.log.push(
          `Queued breach of ${next.server} begins${
            next.cannotAccessRoot ? " (cannot access root)" : ""
          }.`,
        );
        return "breach.begin";
      }
      // Shiro-class: resume suspended ice encounter after nested breach.
      if (s.run?.nestedBreachFromEncounter && s.run.resumeEncounterIceId) {
        const run = s.run;
        const parentId = run.resumeEncounterIceId as string;
        const parent = s.cards[parentId];
        const suspended = run.suspendedEncounter;
        run.nestedBreachFromEncounter = false;
        run.cannotAccessRoot = false;
        if (run.attackedServerIdBeforeNestedBreach) {
          setAttackedServer(run, run.attackedServerIdBeforeNestedBreach);
          run.attackedServerIdBeforeNestedBreach = undefined;
        }
        run.resumeEncounterIceId = undefined;
        run.suspendedEncounter = undefined;
        const stillRezzed =
          parent?.type === "ice" &&
          parent.rezzed &&
          Object.values(s.servers).some((srv) => srv.ice.includes(parentId));
        if (stillRezzed && parent) {
          const host = Object.values(s.servers).find((srv) =>
            srv.ice.includes(parentId),
          );
          if (host && host.id === run.attackedServerId) {
            setRunnerPosition(run, host.ice.indexOf(parentId));
          }
          if (suspended?.iceId === parentId) {
            run.encounter = suspended;
          } else {
            const subs = parent.subroutines ?? [];
            run.encounter = {
              iceId: parentId,
              broken: subs.map(() => false),
            };
          }
          run.skipOnEncounterOnce = true;
          run.phase = "encounter";
          s.log.push(
            `Resume encounter with ${parent.title} after nested breach.`,
          );
          return "run.encounterPaw";
        }
        s.log.push(
          `Cannot resume encounter — ${parent?.title ?? parentId} no longer rezzed.`,
        );
        return "run.passIcePaw";
      }
      // Clear post-run breach shell here (after onResolve) so next() still
      // sees isPostRunBreach — otherwise we'd incorrectly re-enter run.ends.
      if (s.run?.isPostRunBreach) {
        s.run = null;
        return "runner.actionPaw";
      }
      return "run.closePriorityWindows";
    },
    {
      onResolve: (s) => {
        const kitsuneId = s.run?.kitsuneIceToTrashAtBreachEnd;
        if (s.run && kitsuneId) {
          s.run.kitsuneIceToTrashAtBreachEnd = undefined;
          const ice = s.cards[kitsuneId];
          if (
            ice &&
            ice.zone.startsWith("server:") &&
            ice.zone.endsWith(":ice")
          ) {
            log(
              s,
              `${ice.title} is trashed — its own name means this ice (CR ${CR.selfReference.number}).`,
            );
            trashCard(s, kitsuneId, { by: "corp" });
          }
        }
        s.log.push(`Breach complete (appendix 11.5_7).`);
        const lastAccessed = s.run?.accessedCardIds?.at(-1);
        if (lastAccessed && !s.run?.breachStoleOrTrashed) {
          onAccessFinishedWithoutStealOrTrash(s, lastAccessed);
        }
        breachCreditGain(s);
        // Aumakua: finish breach with no steal/trash → place virus.
        if (s.run && !s.run.breachStoleOrTrashed) {
          for (const rid of s.runner.installed) {
            const card = s.cards[rid];
            if (!card?.placeVirusCounterOnFinishBreachIfNoStealOrTrash)
              continue;
            card.virusCounters = (card.virusCounters ?? 0) + 1;
            s.log.push(
              `${card.title} — place 1 virus (finish breach, no steal/trash) → ${card.virusCounters}.`,
            );
          }
        }
        if (
          s.run &&
          !s.run.isPostRunBreach &&
          !s.run.nestedBreachFromEncounter &&
          !s.run.queuedBreachesAfterCurrent?.length
        ) {
          s.run.phase = "ends";
        }
      },
    },
  ),
};
