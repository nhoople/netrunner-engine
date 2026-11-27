/** applyAccessAction: the access and breach actions (CR 7.2, 7.5, 11.5, 11.6) that applyResolved in actions/apply.ts hands over. */
import type { GameState, Action, ApplyResult } from "../state/types.js";
import { actionAllowedHere, enterStep, autoWalk } from "../timing/machine.js";
import { CR } from "../timing/labels.js";
import { openPendingChoose } from "../state/triggers/pendingChoice.js";
import { remoteRootAccessTax } from "../state/cardFlags/staticFlags.js";
import {
  heliamphoraHostInsteadAvailable,
  findHeliamphora,
  completeAccessAndContinue,
  advanceFromMidAccess,
  stealOrTrashBlocked,
  stealForbiddenThisAccess,
  completeStealAgenda,
  stealNetOrMeatPrevented,
  stealAdditionalCreditsForAgenda,
  stealAdditionalCosts,
  payStealAdditionalCosts,
  basicTrashRefusal,
  carnivoreAvailable,
  printedRezOrPlayCost,
  findCupellationHost,
  hostCorpCardFaceupOn,
  enterStealAgendaOrComplete,
} from "./access.js";
import {
  spendAccessLimitOnChoice,
  accessLimitEndsBreach,
} from "../state/access/access.js";
import { applyRunAccessRestrictions } from "../state/access/accessFilter.js";
import { fireOnAccessFaceupInstalledAgenda } from "../state/triggers/miscConditionalHooks.js";
import { log } from "../state/setupAndEnd/createGame.js";
import { noteInlineConditional } from "../state/triggers/inlineConditionalHooks.js";
import { abilitiesSuppressed } from "../state/continuous/abilities.js";
import { checkpointAfterInstruction } from "../legality/checkpoints.js";
import { fireOnAccess } from "../state/triggers/cardLifecycleHooks.js";
import { removeCardFromGame } from "../state/uninstallAndPosition/uninstall.js";
import { fireTdatdOnAgendaAccessedOrScored } from "../effects/access/accessKinds.js";
import { setRunnerPosition } from "../state/uninstallAndPosition/runPosition.js";
import { advanceRunUntilStop, finishRunReturnToAction } from "./run.js";
import { noteRunnerClickDuringRun } from "../state/turnAndActions/clickHooks.js";
import {
  subtractRunnerCreditPool,
  runnerCreditsFor,
  spendRunnerCreditsFor,
} from "../state/keywordsAndCredits/runnerCredits.js";
import { canPayCost, payCost } from "../state/keywordsAndCredits/costs.js";
import { evalEffect } from "../effects/eval.js";
import { runnerTrashCostForCard } from "../cards/stubs.js";
import { trashCard } from "../state/hostingAndTrash/trash.js";
import { noteAccessTrash } from "../state/hostingAndTrash/trashHooks.js";
import { drawOne } from "./phase.js";
import {
  wasAbilityUsed,
  programBannedThisRun,
  markAbilityUsed,
} from "../state/turnAndActions/turn.js";
import { stealDecision } from "../legality/candidatePending.js";
import { fail, ok } from "./apply.js";

/** The access and breach actions applyResolved hands over, moved here unchanged: accessing a card, stealing or trashing it, the access-step choices, and finishing an access or a breach. */
export function applyAccessAction(
  next: GameState,
  action: Extract<
    Action,
    {
      type:
        | "access_card"
        | "steal_agenda"
        | "trash_accessed"
        | "access_rfg_paying_trash_cost"
        | "access_trash_from_grip"
        | "access_trash_with_virus"
        | "access_trash_free"
        | "access_trash_paying_printed_cost_from_stealth"
        | "access_trash_self_non_agenda_draw"
        | "access_host_non_agenda_faceup"
        | "access_host_agenda_on_film_critic"
        | "finish_access"
        | "finish_breach";
    }
  >,
): ApplyResult {
  switch (action.type) {
    case "access_card": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) return fail("No breach access window.", gate.cites);
      if (!next.run) return fail("No breach in progress.", [CR.breach]);
      const idx = next.run.accessCandidates.indexOf(action.cardId);
      if (idx < 0) {
        return fail("Card is not an access candidate.", [CR.remoteCandidates]);
      }
      const preview = next.cards[action.cardId];
      if (
        next.run.attackedServerId === "archives" &&
        next.run.immolationScriptAccessReplace &&
        preview?.type === "ice" &&
        next.run.pendingImmolationAccessCardId !== action.cardId
      ) {
        const copy = Object.values(next.servers).some((server) =>
          server.ice.some((id) => {
            const ice = next.cards[id];
            return Boolean(
              ice?.rezzed &&
              ice.title === preview.title &&
              id !== action.cardId,
            );
          }),
        );
        if (copy) {
          next.run.pendingImmolationAccessCardId = action.cardId;
          openPendingChoose(next, {
            sourceId: next.runner.identityId,
            chooser: "runner",
            options: [
              {
                id: `immolation-replace:${action.cardId}`,
                label: `Trash a rezzed copy of ${preview.title} instead`,
                effect: {
                  op: "do",
                  action: { kind: "gain_credits", side: "runner", amount: 0 },
                },
              },
              {
                id: `immolation-access:${action.cardId}`,
                label: "Access it",
                effect: {
                  op: "do",
                  action: { kind: "gain_credits", side: "runner", amount: 0 },
                },
              },
            ],
            logLine: `Immolation Script — may trash a rezzed copy of ${preview.title} instead of accessing it (CR ${CR.candidatesAlreadyAccessed.number}).`,
          });
          return ok(next);
        }
      }
      if (
        next.run.attackedServerId === "archives" &&
        preview?.zone === "corp:archives" &&
        next.run.archivesInterfaceSkippedCardId !== action.cardId &&
        !next.turn.archivesInterfaceUsedThisBreach
      ) {
        const faceId = next.runner.installed.find(
          (id) => next.cards[id]?.archivesAccessMayRfgInstead,
        );
        if (faceId) {
          openPendingChoose(next, {
            sourceId: faceId,
            chooser: "runner",
            options: [
              {
                id: `archives-rfg:${action.cardId}`,
                label: `Remove ${preview.title} from the game`,
                effect: {
                  op: "do",
                  action: { kind: "gain_credits", side: "runner", amount: 0 },
                },
              },
              {
                id: `archives-access:${action.cardId}`,
                label: "Access it",
                effect: {
                  op: "do",
                  action: { kind: "gain_credits", side: "runner", amount: 0 },
                },
              },
            ],
            logLine: `${next.cards[faceId]!.title} — may remove ${preview.title} from the game instead of accessing it.`,
          });
          return ok(next);
        }
      }
      const tax = preview ? remoteRootAccessTax(next, preview) : 0;
      if (tax > 0 && next.run.accessTaxPaidFor !== action.cardId) {
        const options = [
          ...(next.runner.credits >= tax
            ? [
                {
                  id: `access-tax-pay:${action.cardId}`,
                  label: `Pay ${tax}¢`,
                  effect: {
                    op: "do" as const,
                    action: {
                      kind: "gain_credits" as const,
                      side: "runner" as const,
                      amount: 0,
                    },
                  },
                },
              ]
            : []),
          {
            id: `access-tax-decline:${action.cardId}`,
            label: "Decline to pay",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ];
        openPendingChoose(next, {
          sourceId: next.corp.identityId,
          chooser: "runner",
          options,
          logLine: `${next.cards[next.corp.identityId]?.title ?? "Corp"} — pay ${tax}¢ to access ${preview?.title ?? action.cardId}, or it ceases to be a candidate (CR ${CR.candidatesAlreadyAccessed.number}).`,
        });
        return ok(next);
      }
      // Heliamphora: [interrupt] before Archives access resolves.
      if (
        next.run.attackedServerId === "archives" &&
        heliamphoraHostInsteadAvailable(next) &&
        !next.run.pendingHeliamphoraAccessCardId
      ) {
        const heliId = findHeliamphora(next)!;
        const title = next.cards[action.cardId]?.title ?? action.cardId;
        next.run.pendingHeliamphoraAccessCardId = action.cardId;
        openPendingChoose(next, {
          sourceId: heliId,
          chooser: "runner",
          options: [
            {
              id: `heliamphora-host:${action.cardId}`,
              label: `Host ${title} faceup on Heliamphora instead`,
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
            {
              id: `heliamphora-access:${action.cardId}`,
              label: "Access normally",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
          ],
          logLine: `${next.cards[heliId]!.title} — may host ${title} instead of accessing.`,
        });
        return ok(next);
      }
      next.run.pendingHeliamphoraAccessCardId = undefined;
      next.run.accessCandidates.splice(idx, 1);
      next.run.accessedCardIds.push(action.cardId);
      next.run.accessingCardId = action.cardId;
      // A new access: The Future Perfect's lock was for the previous one.
      next.run.stealForbiddenAccessCardId = undefined;
      next.turn.accessedACardThisTurn = true;
      spendAccessLimitOnChoice(next, action.cardId);
      // Flagship: re-apply other-than-self access cap after each access.
      applyRunAccessRestrictions(next);
      const card = next.cards[action.cardId];
      const faceupInstalledAgenda =
        card.type === "agenda" &&
        card.faceup &&
        (card.zone ?? "").includes(":root");
      // Accessing lets the Runner, and the Corp outside R&D, look at the
      // card; it does not turn the card faceup (CR 7.1.2, 4.6.3). The seat
      // view opens it to the Runner for the rest of the breach (CR 7.3.1a,
      // `runnerSeesAccessedCard`). A card in HQ or R&D keeps the flag while
      // it is accessed and loses it when the access ends
      // (`endAccessVisibility`, CR 1.21.1a).
      if (card.zone === "corp:hq" || card.zone === "corp:rd") {
        card.faceup = true;
      }
      if (faceupInstalledAgenda) {
        const idCard = next.cards[next.corp.identityId];
        if (idCard?.onAccessFaceupInstalledAgenda) {
          fireOnAccessFaceupInstalledAgenda(next, next.corp.identityId);
        }
      }
      if (
        card.mustRevealWhenAccessedFromRd &&
        next.run.attackedServerId === "rd"
      ) {
        log(
          next,
          `Revealed ${card.title} while accessing from R&D (CR ${CR.ambushText.number}).`,
        );
      }
      // RNG Key: reveal next access this run; match named number → gain/draw.
      if (next.run.dtwnRngKeyPendingReveal) {
        next.run.dtwnRngKeyPendingReveal = false;
        log(next, `RNG Key — reveal accessed ${card.title}.`);
        const named = next.run.dtwnRngKeyNamedNumber;
        const sourceId = next.run.dtwnRngKeySourceId;
        const rez = card.rezCost;
        const play = card.playCost;
        const adv = card.advancementRequirement;
        const match =
          typeof named === "number" &&
          (rez === named || play === named || adv === named);
        if (match && sourceId) {
          noteInlineConditional(next, {
            cardId: sourceId,
            abilityKey: "rng-key-reward-on-access-match",
            controller: "runner",
            mandatory: true,
            effect: { op: "do", action: { kind: "dtwn_rng_key_reward" } },
            logLine: `${next.cards[sourceId]?.title ?? "RNG Key"} becomes pending — access match (reward).`,
          });
        }
      }
      // Franchise City: agendas accessed from R&D must be revealed.
      if (card.type === "agenda" && next.run.attackedServerId === "rd") {
        for (const server of Object.values(next.servers)) {
          for (const id of server.root) {
            if (abilitiesSuppressed(next, id)) continue;
            const up = next.cards[id];
            if (up?.rezzed && up.mustRevealAgendasAccessedFromRd) {
              log(
                next,
                `${up.title} — reveal accessed agenda ${card.title} from R&D.`,
              );
            }
          }
        }
      }
      // Power to the People: first agenda access this turn → gain credits.
      if (
        card.type === "agenda" &&
        typeof next.turn.uotFirstAgendaAccessCredits === "number"
      ) {
        const gain = next.turn.uotFirstAgendaAccessCredits;
        next.turn.uotFirstAgendaAccessCredits = undefined;
        next.runner.credits += gain;
        log(
          next,
          `Power to the People — gain ${gain}¢ on first agenda access → ${next.runner.credits}¢.`,
        );
      }
      // Franchise City: when Runner accesses an agenda, add this to Corp score.
      if (card.type === "agenda") {
        for (const server of Object.values(next.servers)) {
          for (const id of [...server.root]) {
            if (abilitiesSuppressed(next, id)) continue;
            const asset = next.cards[id];
            if (!asset?.rezzed || !asset.addSelfToCorpScoreOnAgendaAccess) {
              continue;
            }
            const pts = asset.addSelfToCorpScoreOnAgendaAccess.agendaPoints;
            noteInlineConditional(next, {
              cardId: id,
              abilityKey: "add-self-to-corp-score-on-agenda-access",
              controller: "corp",
              mandatory: true,
              effect: {
                op: "do",
                action: {
                  kind: "add_to_corp_score_as_agenda",
                  agendaPoints: pts,
                },
              },
              logLine: `${asset.title} becomes pending — agenda accessed (add self to Corp score).`,
            });
          }
        }
      }
      if ((next.turn.inlineConditionalPending ?? []).length > 0) {
        checkpointAfterInstruction(next, "access.cardAccessed");
      }
      log(
        next,
        `Accessed ${card.title} (CR ${CR.cardAccessed.number} / appendix ${CR.accessAppendix1.number}).`,
      );
      if (card.onAccess) {
        // Ambush exemption: Snare!/Behold! do not fire from Archives.
        if (
          next.run.attackedServerId === "archives" &&
          card.skipOnAccessFromArchives
        ) {
          log(next, `${card.title} onAccess skipped — accessed from Archives.`);
        } else if (card.onAccessRequiresRezzed && !card.rezzed) {
          log(next, `${card.title} onAccess skipped — requires rezzed.`);
        } else if (
          card.onAccessRequiresInstalled &&
          !card.zone.endsWith(":root")
        ) {
          log(next, `${card.title} onAccess skipped — requires installed.`);
        } else if (abilitiesSuppressed(next, action.cardId)) {
          log(next, `${card.title} onAccess skipped — abilities blanked.`);
        } else {
          fireOnAccess(next, action.cardId);
        }
      }
      // Watch the World Burn: RFG accessed card by lasting title or first non-agenda.
      {
        const lasting = next.rfgPrintedTitlesOnAccess ?? [];
        const lastingHit = lasting.includes(card.title);
        const firstNonAgenda =
          Boolean(next.run.rfgFirstNonAgendaAccess) &&
          !next.run.rfgFirstNonAgendaAccessUsed &&
          card.type !== "agenda";
        if (lastingHit || firstNonAgenda) {
          if (firstNonAgenda) next.run.rfgFirstNonAgendaAccessUsed = true;
          if (next.run.lastingRfgCopiesOnAccess && !lastingHit) {
            if (!next.rfgPrintedTitlesOnAccess) {
              next.rfgPrintedTitlesOnAccess = [];
            }
            if (!next.rfgPrintedTitlesOnAccess.includes(card.title)) {
              next.rfgPrintedTitlesOnAccess.push(card.title);
            }
          }
          removeCardFromGame(next, action.cardId);
          next.run.accessingCardId = null;
          next.run.breachStoleOrTrashed = true;
          log(
            next,
            `Watch the World Burn — remove ${card.title} from the game.`,
          );
          if (
            next.pendingChoice ||
            next.pendingDamage ||
            next.pendingTrashProgram
          ) {
            return ok(next);
          }
          return completeAccessAndContinue(next);
        }
      }
      if (card.type === "agenda") {
        next.turn.lastScoredOrStolenAgendaId = action.cardId;
        fireTdatdOnAgendaAccessedOrScored(next);
      }
      // Ganked!-class: onAccess may schedule a forced encounter immediately
      // (single rezzed ice, no pendingChoice). Divert before mid-access resume.
      if (
        next.run?.reencounterIceId &&
        next.run.resumeAccessAfterReencounter &&
        !next.pendingChoice
      ) {
        const iceId = next.run.reencounterIceId;
        const server = next.servers[next.run.attackedServerId];
        const pos = server?.ice.indexOf(iceId) ?? -1;
        if (pos >= 0) {
          setRunnerPosition(next.run, pos);
          next.run.reencounterIceId = undefined;
          enterStep(next, "run.approachIce");
          autoWalk(next);
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        if (next.cards[iceId]?.type === "ice") {
          next.run.forceEncounterIceId = iceId;
          next.run.reencounterIceId = undefined;
          enterStep(next, "run.approachIce");
          autoWalk(next);
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        next.run.reencounterIceId = undefined;
        next.run.resumeAccessAfterReencounter = false;
      }
      // Nested access-a-card appendix 11.6_1 → 11.6_2 (…); park on pending.
      enterStep(next, "access.cardAccessed");
      if (
        next.pendingChoice ||
        next.pendingDamage ||
        next.pendingTrashProgram
      ) {
        return ok(next);
      }
      autoWalk(next);
      return advanceFromMidAccess(next);
    }

    case "steal_agenda": {
      if (next.run) next.run.breachStoleOrTrashed = true;
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that agenda.", [CR.stealingAgenda]);
      }
      if (next.timingKey !== "access.stealAgenda") {
        return fail("Steal only after mid-access (CR 7.2.3).", [
          CR.accessAgenda,
          CR.midAccessAgenda,
        ]);
      }
      if (stealOrTrashBlocked(next, action.cardId)) {
        return fail("Cannot steal Corp cards this run.", [CR.stealingAgenda]);
      }
      if (stealForbiddenThisAccess(next, action.cardId)) {
        return fail("Cannot steal this agenda during this access.", [
          CR.stealingAgenda,
        ]);
      }
      const agenda = next.cards[action.cardId];
      const whistleblowerIgnore =
        Boolean(next.run.whistleblowerNamedTitle) &&
        agenda?.title === next.run.whistleblowerNamedTitle;
      if (whistleblowerIgnore) {
        log(next, `Whistleblower — steal ${agenda.title} ignoring all costs.`);
        next.run.whistleblowerNamedTitle = undefined;
        return completeStealAgenda(next, action);
      }
      if (
        stealNetOrMeatPrevented(next, action.cardId, next.run.attackedServerId)
      ) {
        return fail(
          `Cannot suffer the damage to steal ${agenda?.title ?? action.cardId}.`,
          [CR.stealingAgenda, CR.costInterruptStaticMandatory],
        );
      }
      const stealClicks = agenda?.stealAdditionalClicks ?? 0;
      if (stealClicks > 0) {
        if (next.runner.clicks < stealClicks) {
          return fail(
            `Must spend ${stealClicks} [click] to steal ${agenda.title}.`,
            [CR.stealingAgenda, CR.spendClicks],
          );
        }
        next.runner.clicks -= stealClicks;
        noteRunnerClickDuringRun(next);
        log(
          next,
          `Runner spends ${stealClicks} [click] to steal ${agenda.title} → ${next.runner.clicks} (CR ${CR.spendClicks.number}).`,
        );
      }
      const stealCredits = stealAdditionalCreditsForAgenda(
        next,
        action.cardId,
        next.run.attackedServerId,
      );
      if (stealCredits > 0) {
        if (next.runner.credits < stealCredits) {
          return fail(`Must pay ${stealCredits}¢ to steal ${agenda.title}.`, [
            CR.stealingAgenda,
          ]);
        }
        subtractRunnerCreditPool(next, stealCredits);
        log(
          next,
          `Runner pays ${stealCredits}¢ additional cost to steal ${agenda.title} → ${next.runner.credits}¢.`,
        );
      }
      const stealServerId = next.run.attackedServerId;
      if (next.pendingStealAgendaId === action.cardId) {
        next.pendingStealAgendaId = null;
      } else if (
        stealAdditionalCosts(next, stealServerId, action.cardId).length > 0
      ) {
        next.pendingStealAgendaId = action.cardId;
        const paid = payStealAdditionalCosts(
          next,
          action.cardId,
          stealServerId,
        );
        if (!paid.ok) {
          next.pendingStealAgendaId = null;
          return paid;
        }
        if (next.pendingChoice) {
          return ok(next);
        }
        next.pendingStealAgendaId = null;
      }
      return completeStealAgenda(next, action);
    }

    case "trash_accessed": {
      if (next.run) next.run.breachStoleOrTrashed = true;
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      // The same check the access candidates list from (CR 7.1.5a–b).
      const refusal = basicTrashRefusal(next, action.cardId);
      if (refusal) return fail(refusal.reason, refusal.cites);
      const card = next.cards[action.cardId];
      if (card.trashAdditionalCost) {
        if (next.pendingTrashAccessedCardId === action.cardId) {
          next.pendingTrashAccessedCardId = null;
        } else {
          next.pendingTrashAccessedCardId = action.cardId;
          const r = evalEffect(
            { state: next, sourceId: action.cardId },
            card.trashAdditionalCost,
          );
          if (!r.ok) {
            next.pendingTrashAccessedCardId = null;
            return fail(r.error, r.cites);
          }
          if (next.pendingChoice) return ok(next);
          next.pendingTrashAccessedCardId = null;
        }
      }
      const cost = runnerTrashCostForCard(next, action.cardId);
      const purpose =
        card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
      if (runnerCreditsFor(next, purpose) < cost) {
        return fail("Insufficient credits to trash.", [CR.trashing]);
      }
      spendRunnerCreditsFor(next, cost, purpose);
      // The trash procedure runs Marilyn Campaign's and Director Haas's
      // replacements, faces the card up (the Runner is accessing it,
      // CR 4.4.6b) and fires the trash triggers (CR 7.1.5, 1.19.1).
      trashCard(next, action.cardId, { by: "runner", cause: "access" });
      log(
        next,
        `Runner trashes accessed ${card.title} for ${cost}¢ (CR ${CR.trashing.number}).`,
      );
      next.run.accessingCardId = null;
      noteAccessTrash(next, cost);
      // René: first access-trash each turn → gain ¢ + draw
      const idCard = next.cards[next.runner.identityId];
      const gain = idCard?.onAccessTrashGain;
      if (gain && !(gain.oncePerTurn && next.turn.reneAccessTrashUsed)) {
        next.runner.credits += gain.credits;
        let drew = 0;
        for (let i = 0; i < gain.draw; i++) {
          if (drawOne(next, "runner")) drew += 1;
        }
        next.turn.reneAccessTrashUsed = true;
        log(
          next,
          `René “Loup” Arcemont — gain ${gain.credits}¢ and draw ${drew}.`,
        );
      }
      return completeAccessAndContinue(next);
    }

    case "access_rfg_paying_trash_cost": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.turn.siSalsetteSlumsUsedThisTurn) {
        return fail("Salsette Slums already used this turn.", [CR.trashing]);
      }
      const slums = next.cards[action.slumsId];
      if (
        !slums?.accessPayTrashCostRemoveFromGameOncePerTurn ||
        abilitiesSuppressed(next, action.slumsId)
      ) {
        return fail("Salsette Slums not available.", [CR.trashing]);
      }
      if (!next.runner.installed.includes(action.slumsId)) {
        return fail("Salsette Slums not installed.", [CR.trashing]);
      }
      const card = next.cards[action.cardId];
      const cost = runnerTrashCostForCard(next, action.cardId);
      const purpose =
        card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
      if (runnerCreditsFor(next, purpose) < cost) {
        return fail("Insufficient credits to RFG.", [CR.trashing]);
      }
      spendRunnerCreditsFor(next, cost, purpose);
      // An installed card is uninstalled as it is removed (CR 8.5.1b, 4.9.2).
      removeCardFromGame(next, action.cardId);
      next.run.accessingCardId = null;
      next.turn.siSalsetteSlumsUsedThisTurn = true;
      noteAccessTrash(next, cost);
      log(
        next,
        `Salsette Slums — pay ${cost}¢: remove ${card.title} from the game.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_from_grip": {
      if (!next.run?.accessingCardId) {
        return fail("Not mid-access.", [CR.trashing]);
      }
      if (stealOrTrashBlocked(next, next.run.accessingCardId)) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const sid = next.run.attackedServerId;
      if (sid !== "hq" && sid !== "rd") {
        return fail("Carnivore only on HQ/R&D access.", [CR.trashing]);
      }
      if (!carnivoreAvailable(next)) {
        return fail("Carnivore not available.", [CR.trashing]);
      }
      const carnIds: string[] = [...next.runner.installed];
      if (next.run.runSourceId) carnIds.push(next.run.runSourceId);
      const carn = carnIds
        .map((id) => next.cards[id])
        .find((c) => {
          if (!c || abilitiesSuppressed(next, c.id)) return false;
          const spec = c.accessTrashFromGrip;
          if (!spec) return false;
          if (spec.oncePerTurn && next.turn.carnivoreAccessTrashUsed)
            return false;
          return next.runner.hand.length >= spec.gripCards;
        });
      if (!carn) {
        return fail("Not enough cards in grip.", [CR.trashing]);
      }
      const n = carn.accessTrashFromGrip!.gripCards;
      const named = (next.costCardIds ?? []).filter((id) =>
        next.runner.hand.includes(id),
      );
      const others = next.runner.hand.filter((id) => !named.includes(id));
      const gripCost = [
        ...named,
        ...others.slice(others.length - Math.max(0, n - named.length)),
      ].slice(0, n);
      for (const gid of gripCost) {
        trashCard(next, gid, { by: "runner", cause: "cost" });
      }
      const accessedId = next.run.accessingCardId;
      const card = next.cards[accessedId];
      // The Runner trashes the card they are accessing (CR 7.1.5, 1.19.1).
      trashCard(next, accessedId, { by: "runner", cause: "access" });
      next.run.accessingCardId = null;
      if (carn.accessTrashFromGrip!.oncePerTurn) {
        next.turn.carnivoreAccessTrashUsed = true;
      }
      noteAccessTrash(next, card.trashCost ?? 0);
      log(
        next,
        `Carnivore — trash ${n} from grip to trash accessed ${card.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_with_virus": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (stealOrTrashBlocked(next, next.run.accessingCardId)) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const imp = next.runner.installed
        .map((id) => next.cards[id])
        .find(
          (c) =>
            !abilitiesSuppressed(next, c.id) &&
            c.accessTrashWithVirus &&
            (c.virusCounters ?? 0) >= 1 &&
            !wasAbilityUsed(next, c.id, "imp-access-trash") &&
            !programBannedThisRun(next, c.id),
        );
      if (!imp) {
        return fail("No Imp virus trash available.", [CR.trashing]);
      }
      imp.virusCounters = (imp.virusCounters ?? 0) - 1;
      markAbilityUsed(next, imp.id, "imp-access-trash");
      const accessedId = action.cardId;
      const card = next.cards[accessedId];
      // The Runner trashes the card they are accessing (CR 7.1.5, 1.19.1).
      trashCard(next, accessedId, { by: "runner", cause: "access" });
      next.run.accessingCardId = null;
      noteAccessTrash(next, card.trashCost ?? 0);
      log(next, `Imp — spend virus counter to trash accessed ${card.title}.`);
      return completeAccessAndContinue(next);
    }

    case "access_trash_free": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (stealOrTrashBlocked(next, next.run.accessingCardId)) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      if (!next.run.accessTrashFree) {
        return fail("No free access trash available this run.", [CR.trashing]);
      }
      const accessedId = action.cardId;
      const card = next.cards[accessedId];
      // The Runner trashes the card they are accessing (CR 7.1.5, 1.19.1).
      trashCard(next, accessedId, { by: "runner", cause: "access" });
      next.run.accessingCardId = null;
      noteAccessTrash(next, 0);
      log(next, `Demolition Run — trash accessed ${card.title} for 0¢.`);
      return completeAccessAndContinue(next);
    }

    case "access_trash_paying_printed_cost_from_stealth": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (stealOrTrashBlocked(next, next.run.accessingCardId)) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const lamp = next.cards[action.lampadesId];
      if (
        !lamp?.accessTrashPayingPrintedCostFromStealth ||
        abilitiesSuppressed(next, action.lampadesId) ||
        !next.runner.installed.includes(action.lampadesId) ||
        (lamp.powerCounters ?? 0) < 1
      ) {
        return fail("Lampades trash not available.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      const printed = accessed ? printedRezOrPlayCost(accessed) : null;
      if (printed === null) {
        return fail("That card has no printed rez or play cost.", [
          CR.trashing,
        ]);
      }
      const stealthCost = {
        credits: printed,
        creditsFromStealthOnly: true as const,
      };
      if (!canPayCost(next, "runner", stealthCost, lamp)) {
        return fail("Insufficient stealth credits for printed cost.", [
          CR.trashing,
        ]);
      }
      lamp.powerCounters = (lamp.powerCounters ?? 0) - 1;
      payCost(next, "runner", stealthCost, "lampades-access-trash", lamp);
      const accessedId = action.cardId;
      // The Runner trashes the card they are accessing (CR 7.1.5, 1.19.1).
      trashCard(next, accessedId, { by: "runner", cause: "access" });
      next.run.accessingCardId = null;
      noteAccessTrash(next, accessed.trashCost ?? 0);
      log(
        next,
        `${lamp.title} — spend power + ${printed}¢ from stealth to trash accessed ${accessed.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_self_non_agenda_draw": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (stealOrTrashBlocked(next, next.run.accessingCardId)) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      if (!accessed || accessed.type === "agenda" || accessed.side !== "corp") {
        return fail("Can only trash a non-agenda Corp card.", [CR.trashing]);
      }
      const gourmand = next.cards[action.gourmandId];
      if (
        !gourmand?.accessTrashSelfNonAgendaThenDraw ||
        abilitiesSuppressed(next, action.gourmandId) ||
        !next.runner.installed.includes(action.gourmandId)
      ) {
        return fail("Gourmand trash not available.", [CR.trashing]);
      }
      trashCard(next, action.gourmandId, { by: "runner", cause: "cost" });
      const accessedId = action.cardId;
      // The Runner trashes the card they are accessing (CR 7.1.5, 1.19.1).
      trashCard(next, accessedId, { by: "runner", cause: "access" });
      next.run.accessingCardId = null;
      noteAccessTrash(next, accessed.trashCost ?? 0);
      const drew = drawOne(next, "runner") ? 1 : 0;
      log(
        next,
        `${gourmand.title} — trash self to trash accessed ${accessed.title}; draw ${drew}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_host_non_agenda_faceup": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      if (!accessed || accessed.type === "agenda" || accessed.side !== "corp") {
        return fail("Can only host a non-agenda Corp card.", [CR.trashing]);
      }
      const hostId = findCupellationHost(next);
      if (!hostId) {
        return fail("Cupellation host not available.", [CR.trashing]);
      }
      const host = next.cards[hostId]!;
      const cost = host.accessHostNonAgendaFaceup!.creditCost;
      if (next.runner.credits < cost) {
        return fail("Insufficient credits to host.", [CR.trashing]);
      }
      subtractRunnerCreditPool(next, cost);
      hostCorpCardFaceupOn(next, hostId, action.cardId);
      next.run.accessingCardId = null;
      log(
        next,
        `${host.title} — pay ${cost}¢ to host accessed ${accessed.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_host_agenda_on_film_critic": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      if (!accessed || accessed.type !== "agenda") {
        return fail("Can only host an agenda.", [CR.trashing]);
      }
      const host = next.cards[action.hostId];
      if (
        !host?.mayHostAccessedAgenda ||
        !next.runner.installed.includes(action.hostId) ||
        abilitiesSuppressed(next, action.hostId)
      ) {
        return fail("Film Critic host not available.", [CR.trashing]);
      }
      const cap = host.hostAgendaCapacity ?? 1;
      const hostedAgendas = (host.hostedCardIds ?? []).filter(
        (hid) => next.cards[hid]?.type === "agenda",
      ).length;
      if (hostedAgendas >= cap) {
        return fail("Film Critic already hosts an agenda.", [CR.trashing]);
      }
      hostCorpCardFaceupOn(next, action.hostId, action.cardId);
      next.run.accessingCardId = null;
      log(next, `${host.title} — host accessed agenda ${accessed.title}.`);
      return completeAccessAndContinue(next);
    }

    case "finish_access": {
      if (!next.run?.accessingCardId) {
        return fail("Not mid-access.", [CR.breach, CR.midAccessAbility]);
      }
      // Pass mid-access (11.6_2) → agenda steal step (11.6_3) or complete.
      if (next.timingKey === "access.stealAgenda") {
        // The Runner must steal an accessed agenda they are able to steal;
        // only an additional cost lets them decline (CR 7.1.6, 7.1.6a).
        const id = next.run.accessingCardId;
        if (next.cards[id]?.type === "agenda") {
          const steal = stealDecision(next, id);
          if (steal.stealLegal && !steal.additionalCost) {
            return fail("The Runner must steal the accessed agenda.", [
              CR.midAccessAgenda,
            ]);
          }
        }
        return completeAccessAndContinue(next);
      }
      return enterStealAgendaOrComplete(next);
    }

    case "finish_breach": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) return fail("No breach access window.", gate.cites);
      if (!next.run) return fail("No breach in progress.", [CR.breach]);
      if (next.run.accessingCardId) {
        return fail("Finish current access first.", [CR.breach]);
      }
      if (
        next.run.accessCandidates.length > 0 &&
        !accessLimitEndsBreach(next)
      ) {
        return fail("Candidates remain.", [CR.remoteCandidates]);
      }
      enterStep(next, "breach.complete");
      autoWalk(next);
      const cont = advanceRunUntilStop(next);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
  }
}
