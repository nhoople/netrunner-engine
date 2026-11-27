/** The run's success phase (CR 11.4 step 5, CR 6.9.5); part of STEPS in timing/graph.ts. */
import {
  openBreachReplacementChoice,
  hasCompetingBreachReplacement,
  accountSiphonReplacesBreach,
} from "../breachReplacementOrder.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { setAttackedServer } from "../../state/uninstallAndPosition/runPosition.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { noteSuccessfulRunServerAbilities } from "../../state/run/successfulRunServerHooks.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import { onSuccessfulRunEnded } from "../../state/cardFlags/cardDeclarations.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";
import { fireCorpIdentityFlippedSuccessfulHqOrRdRun } from "../../state/setupAndEnd/identityFlipHooks.js";
import { evalEffect } from "../../effects/eval.js";
import { runnerAbilityCarrierIds } from "../../state/setupAndEnd/additionalIdentities.js";
import { noteOnSuccessfulRun } from "../../state/run/successfulRunHooks.js";
import { noteSuccessfulRunOnRd } from "../../state/run/successfulRunOnRdHooks.js";
import {
  stealthHostedCreditsAvailable,
  runnerAvailableCredits,
} from "../../state/keywordsAndCredits/costs.js";
import type { Effect } from "../../effects/ir.js";
import { activeLockdownIds } from "../../state/continuous/lockdowns.js";
import {
  activeCorpCurrentIds,
  activeRunnerCurrentIds,
} from "../../state/continuous/currents.js";
import { noteSuccessfulRunOtherServer } from "../../state/run/otherServerSuccessHooks.js";
import { serversMatchingSpec } from "../../state/run/runStart.js";
import { CR } from "../labels.js";
import { currentMark } from "../../state/keywordsAndCredits/keywords.js";
import {
  noteFirstSuccessfulMarkRun,
  noteFirstSuccessfulHqRun,
  noteFirstSuccessfulHqOrRdRun,
  noteFirstSuccessfulCentralRun,
} from "../../state/run/firstSuccessfulRunHooks.js";
import { noteValSuccessfulRunTrigger } from "../../effects/triggers/firstTimeEachTurnTriggers.js";
import { run, isHostedOnIce } from "./stepHelpers.js";
import type { TimingStepDef } from "../graph.js";

export const SUCCESS_STEP_DEFS: Record<string, TimingStepDef> = {
  "run.success": run(
    "run.success",
    "sec_appendix_timing_structure_of_a_run_5_a",
    "11.4_5_a",
    "The run is declared successful.",
    "auto",
    (s) => {
      // Breach only after a declared successful run. Blocked success
      // (Crisium/Flagship) leaves successful === null — still skip breach
      // without declaring the run unsuccessful (CR 6.8.4a).
      // Remote cease at the post-success checkpoint ends the run (CR 4.6.8e /
      // 10.3.1h) before breach.
      if (s.run?.endedTheRun) return "run.closePriorityWindows";
      if (s.run?.successful !== true) return "run.closePriorityWindows";
      if (s.run?.skipBreach) return "run.closePriorityWindows";
      return "run.breachLink";
    },
    {
      onResolve: (s) => {
        // The run is declared successful once (CR 6.9.5a), so its
        // successful-run abilities meet their trigger once (CR 9.6.4b). A psi
        // game or trace an ability started here (Adrian Seis) brings the
        // walk back to this step when it finishes: move on.
        if (!s.run) return;
        if (s.run.successPhaseResolved) {
          // The breach replacement the Runner chooses between (Security
          // Testing and Account Siphon) waits for any choice open then.
          if (s.run.deferBreachReplacement && !s.pendingChoice) {
            openBreachReplacementChoice(s);
          }
          return;
        }
        s.run.successPhaseResolved = true;
        // Track first successful HQ before the flag is set (PAN-Weave-class).
        let firstSuccessfulHq = false;
        // Track first successful central before HQ/RD/Archives flags (Zenit-class).
        let firstSuccessfulCentral = false;
        // Sneakdoor: redirect attacked server before declaring success.
        if (s.run?.redirectSuccessChooseHqOrRd && !s.pendingChoice) {
          s.run.redirectSuccessChooseHqOrRd = false;
          openPendingChoose(s, {
            sourceId: s.run.runSourceId ?? s.runner.identityId,
            chooser: "runner",
            options: [
              {
                id: "hq",
                label: "Change attacked server to HQ",
                effect: {
                  op: "do",
                  action: { kind: "redirect_omar_success", serverId: "hq" },
                },
              },
              {
                id: "rd",
                label: "Change attacked server to R&D",
                effect: {
                  op: "do",
                  action: { kind: "redirect_omar_success", serverId: "rd" },
                },
              },
            ],
            logLine: `Omar Keung — choose HQ or R&D for successful run.`,
          });
        }
        if (s.run?.redirectSuccessTo) {
          const dest = s.run.redirectSuccessTo;
          s.log.push(
            `Redirect successful run from ${s.run.attackedServerId} to ${dest}.`,
          );
          setAttackedServer(s.run, dest);
          s.run.redirectSuccessTo = undefined;
        }
        // Crisium Grid / Flagship: runs against this server cannot be declared
        // successful. Leave successful as null — reaching Success Phase means
        // the run is also not declared unsuccessful (CR 6.8.4a).
        const server = s.servers[s.run!.attackedServerId];
        const cannotDeclareSuccessful =
          Boolean(s.run!.cannotDeclareSuccessful) ||
          server.root.some((id) => {
            const c = s.cards[id];
            return (
              c.rezzed &&
              c.runsCannotBeSuccessful &&
              !abilitiesSuppressed(s, id)
            );
          });
        if (cannotDeclareSuccessful) {
          s.run!.successful = null;
          s.log.push(
            `Run reached Success Phase but cannot be declared successful (CR 6.8.4a).`,
          );
        } else {
          s.run!.successful = true;
          s.turn.successfulRunThisTurn = true;
          noteSuccessfulRunServerAbilities(s);
          if ((s.turn.successfulRunServerPending ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.success");
          }
          onSuccessfulRunEnded(s);
          s.turn.successfulRunCountThisTurn =
            (s.turn.successfulRunCountThisTurn ?? 0) + 1;
          // Embolus: remove 1 power counter from any rezzed Corp card with the flag.
          for (const card of Object.values(s.cards)) {
            if (
              !card?.rezzed ||
              card.side !== "corp" ||
              !card.removePowerCounterOnAnySuccessfulRun
            ) {
              continue;
            }
            if ((card.powerCounters ?? 0) <= 0) continue;
            card.powerCounters = (card.powerCounters ?? 0) - 1;
            s.log.push(
              `${card.title} — remove 1 power counter (successful run) → ${card.powerCounters}.`,
            );
          }
          // Checkpoint: the delayed meat damage of a successful trace
          // resolves now (CR 9.6.13c).
          for (const delayed of s.run!.delayedMeatDamageOnSuccess ?? []) {
            noteInlineConditional(s, {
              cardId: delayed.sourceId,
              abilityKey: "delayed-meat-on-successful-run",
              controller: "corp",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "meat_damage", amount: delayed.amount },
              },
              logLine: `${s.cards[delayed.sourceId]?.title ?? delayed.sourceId}'s delayed ability becomes pending — the run is successful.`,
              independentOfSource: true,
            });
          }
          s.run!.delayedMeatDamageOnSuccess = [];
          // Bandwidth: remove tags granted this run if successful.
          {
            const n = s.run!.bandwidthTagsToRemoveOnSuccess ?? 0;
            if (n > 0) {
              const removed = Math.min(n, s.runner.tags);
              s.runner.tags -= removed;
              s.run!.bandwidthTagsToRemoveOnSuccess = 0;
              if (removed > 0) {
                s.log.push(
                  `Bandwidth — remove ${removed} tag(s) (run successful) → ${s.runner.tags}.`,
                );
              }
            }
          }
          {
            const sid = s.run!.attackedServerId;
            if (!s.turn.successfulRunServersThisTurn.includes(sid)) {
              s.turn.successfulRunServersThisTurn.push(sid);
            }
            const isCentral =
              sid === "hq" || sid === "rd" || sid === "archives";
            if (
              isCentral &&
              !s.turn.successfulHqRunThisTurn &&
              !s.turn.successfulRdRunThisTurn &&
              !s.turn.successfulArchivesRunThisTurn
            ) {
              firstSuccessfulCentral = true;
            }
          }
          if (s.run!.attackedServerId === "hq") {
            firstSuccessfulHq = !s.turn.successfulHqRunThisTurn;
            s.turn.successfulHqRunThisTurn = true;
            for (const server of Object.values(s.servers)) {
              for (const id of server.root) {
                const up = s.cards[id];
                if (up?.trashSelfOnCorpSuccessfulHqRun && up.rezzed) {
                  noteInlineConditional(s, {
                    cardId: id,
                    abilityKey: "trash-self-on-corp-successful-hq-run",
                    controller: "corp",
                    mandatory: true,
                    effect: { op: "do", action: { kind: "trash_self" } },
                    logLine: `${up.title} becomes pending — Corp successful HQ run (trash self).`,
                  });
                }
              }
            }
          }
          if (s.run!.attackedServerId === "rd") {
            s.turn.successfulRdRunThisTurn = true;
          }
          if (
            s.run!.successful &&
            (s.run!.attackedServerId === "hq" ||
              s.run!.attackedServerId === "rd")
          ) {
            fireCorpIdentityFlippedSuccessfulHqOrRdRun(
              s,
              s.run!.attackedServerId,
            );
          }
          if (s.run!.successful) {
            const corpId = s.cards[s.corp.identityId];
            if (
              corpId?.flipIdentityOnSuccessfulCentralRun &&
              !corpId.identityFlipped &&
              (s.run!.attackedServerId === "hq" ||
                s.run!.attackedServerId === "rd" ||
                s.run!.attackedServerId === "archives")
            ) {
              noteInlineConditional(s, {
                cardId: s.corp.identityId,
                abilityKey: "flip-identity-on-successful-central-run",
                controller: "corp",
                mandatory: true,
                effect: { op: "do", action: { kind: "flip_identity" } },
                logLine: `${corpId.title} becomes pending — successful central run (flip identity).`,
              });
            }
          }
          if (s.run!.attackedServerId === "archives") {
            s.turn.successfulArchivesRunThisTurn = true;
          }
          s.turn.lastRunPassedUnrezzedIceIds = [
            ...(s.turn.currentRunPassedUnrezzedIceIds ?? []),
          ];
          s.log.push(`Run successful (CR 6.7.2).`);
        }
        // Security Testing: first successful run on named server → 2¢ instead of breach.
        // Patron: first successful run on named server → draw N instead of breach.
        if (s.run!.successful) {
          for (const id of s.runner.installed) {
            const card = s.cards[id];
            if (
              card.securityTesting &&
              card.namedServerId === s.run!.attackedServerId
            ) {
              if (hasCompetingBreachReplacement(s)) {
                s.run!.deferBreachReplacement = true;
                break;
              }
              s.runner.credits += 2;
              s.run!.skipBreach = true;
              card.namedServerId = undefined;
              s.log.push(
                `${card.title} — gain 2¢ instead of breaching ${s.run!.attackedServerId}.`,
              );
              break;
            }
            const drawN = card.patronChooseServerDrawInsteadOfBreach;
            if (
              typeof drawN === "number" &&
              card.namedServerId === s.run!.attackedServerId
            ) {
              s.run!.skipBreach = true;
              card.namedServerId = undefined;
              s.log.push(
                `${card.title} — draw ${drawN} instead of breaching ${s.run!.attackedServerId}.`,
              );
              // The draw procedure, so draw limits and triggers apply
              // (CR 8.4.2).
              const drew = evalEffect(
                { state: s, sourceId: id },
                {
                  op: "do",
                  action: { kind: "draw", side: "runner", amount: drawN },
                },
              );
              if (!drew.ok) s.log.push(`${card.title} — ${drew.error}`);
              break;
            }
          }
        }
        // Retrieval Run: skip breach, may install program from heap.
        if (s.run!.successful && s.run!.attackedServerId === "archives") {
          for (const id of s.runner.hand) {
            const card = s.cards[id];
            if (!card?.onGripArchivesSuccessInstallSelfIgnoringCosts) continue;
            s.runner.hand = s.runner.hand.filter((x) => x !== id);
            s.runner.installed.push(id);
            card.zone = "runner:installed";
            card.faceup = true;
            s.run!.skipBreach = true;
            s.log.push(
              `${card.title} — install from grip instead of breaching Archives.`,
            );
            break;
          }
        }
        if (s.run!.successful && s.run!.attackedServerId === "hq") {
          for (const id of s.runner.hand) {
            const card = s.cards[id];
            if (!card?.onGripHqSuccessInstallSelfIgnoringCosts) continue;
            s.runner.hand = s.runner.hand.filter((x) => x !== id);
            s.runner.installed.push(id);
            card.zone = "runner:installed";
            card.faceup = true;
            s.run!.skipBreach = true;
            s.log.push(
              `${card.title} — install from grip instead of breaching HQ.`,
            );
            break;
          }
        }
        if (s.run!.successful && s.run!.attackedServerId === "rd") {
          for (const id of s.runner.hand) {
            const card = s.cards[id];
            if (!card?.onGripRdSuccessInstallSelfIgnoringCosts) continue;
            s.runner.hand = s.runner.hand.filter((x) => x !== id);
            s.runner.installed.push(id);
            card.zone = "runner:installed";
            card.faceup = true;
            s.run!.skipBreach = true;
            s.log.push(
              `${card.title} — install from grip instead of breaching R&D.`,
            );
            break;
          }
        }
        // Steve Cambridge: first successful HQ each turn (identity + Fenris carriers).
        if (
          s.run!.successful &&
          s.run!.attackedServerId === "hq" &&
          !s.turn.steveCambridgeUsedThisTurn
        ) {
          for (const carrierId of runnerAbilityCarrierIds(s)) {
            if (abilitiesSuppressed(s, carrierId)) continue;
            const idCard = s.cards[carrierId];
            if (idCard?.steveCambridge && s.runner.discardPile.length >= 2) {
              s.turn.steveCambridgeUsedThisTurn = true;
              const a = s.runner.discardPile[0]!;
              const b = s.runner.discardPile[1]!;
              s.runner.discardPile = s.runner.discardPile.filter(
                (id) => id !== a && id !== b,
              );
              if (!s.removedFromGame) s.removedFromGame = [];
              s.removedFromGame.push(a);
              s.cards[a].zone = "removed-from-game";
              s.runner.hand.push(b);
              s.cards[b].zone = "runner:grip";
              s.log.push(
                `${idCard.title} — RFG ${s.cards[a].title}; ${s.cards[b].title} to grip.`,
              );
              break;
            }
          }
        }
        // onSuccessfulRun — note for 10.3.1a when actually successful.
        if (s.run!.successful) {
          const queueSuccessfulRun = (cardId: string): void => {
            const card = s.cards[cardId];
            if (!card?.onSuccessfulRun) return;
            if (
              card.onSuccessfulRunOncePerTurn &&
              s.turn.onSuccessfulRunFiredIds.includes(cardId)
            ) {
              return;
            }
            const before = (s.turn.successfulRunPendingIds ?? []).length;
            noteOnSuccessfulRun(s, cardId);
            if (
              card.onSuccessfulRunOncePerTurn &&
              (s.turn.successfulRunPendingIds ?? []).length > before
            ) {
              s.turn.onSuccessfulRunFiredIds.push(cardId);
            }
          };

          // Runner identity (Nyusha-class mark success triggers).
          queueSuccessfulRun(s.runner.identityId);

          for (const id of s.runner.installed) {
            // A Runner card hosted on ice (Stowaway) means "this server":
            // the host-server loop below queues it only for runs on the
            // server its ice protects (CR 4.6.6k).
            if (isHostedOnIce(s, id)) continue;
            queueSuccessfulRun(id);
          }
          if ((s.turn.successfulRunPendingIds ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.success");
          }
          for (const id of s.runner.installed) {
            const card = s.cards[id];
            if (!card?.caissaAdvanceOnSuccessfulRun || !card.hostId) continue;
            noteInlineConditional(s, {
              cardId: id,
              abilityKey: "caissa-advance-on-successful-run",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "advance_caissa_host_inward_or_install" },
              },
              logLine: `${card.title} becomes pending — successful run (Caïssa advance).`,
            });
          }
          // Chakana: successful run on R&D — note for 10.3.1a.
          if (s.run!.attackedServerId === "rd") {
            for (const id of s.runner.installed) {
              noteSuccessfulRunOnRd(s, id);
            }
            if ((s.turn.successfulRunOnRdPendingIds ?? []).length > 0) {
              checkpointAfterInstruction(s, "run.success");
            }
          }
          // Mu Safecracker-class: may pay for bonus access on successful HQ/R&D.
          for (const id of s.runner.installed) {
            const card = s.cards[id];
            if (!card) continue;
            const attackedSid = s.run!.attackedServerId;
            const spec =
              attackedSid === "hq"
                ? card.onSuccessfulHqRunMayPayForBonusAccess
                : attackedSid === "rd"
                  ? card.onSuccessfulRdRunMayPayForBonusAccess
                  : undefined;
            if (!spec || spec.credits <= 0 || spec.bonusAccess <= 0) continue;
            const stealthOnly = Boolean(
              card.paidAbilitiesUseStealthCreditsOnly,
            );
            const canPay = stealthOnly
              ? stealthHostedCreditsAvailable(s) >= spec.credits
              : runnerAvailableCredits(s) >= spec.credits;
            const options: Array<{
              id: string;
              label: string;
              effect: Effect;
            }> = [
              {
                id: "decline",
                label: "Decline",
                effect: {
                  op: "do",
                  action: { kind: "gain_credits", side: "runner", amount: 0 },
                },
              },
            ];
            if (canPay) {
              options.unshift({
                id: "pay-bonus-access",
                label: `Pay ${spec.credits}¢${stealthOnly ? " (stealth)" : ""} for +${spec.bonusAccess} access`,
                effect: {
                  op: "seq",
                  effects: [
                    stealthOnly
                      ? {
                          op: "do",
                          action: {
                            kind: "spend_stealth_credits",
                            amount: spec.credits,
                          },
                        }
                      : {
                          op: "do",
                          action: {
                            kind: "lose_credits",
                            side: "runner",
                            amount: spec.credits,
                          },
                        },
                    {
                      op: "do",
                      action: {
                        kind: "bonus_access",
                        amount: spec.bonusAccess,
                      },
                    },
                  ],
                },
              });
            }
            noteInlineConditional(s, {
              cardId: id,
              abilityKey: "may-pay-for-bonus-access-on-successful-central",
              controller: "runner",
              mandatory: true,
              effect: { op: "choose", chooser: "runner", options },
              logLine: `${card.title} becomes pending — successful ${attackedSid} run (may pay for bonus access).`,
            });
          }
          // Hosted Runner cards on ice protecting the attacked server (Stowaway).
          for (const iceId of server.ice) {
            for (const [cardId, card] of Object.entries(s.cards)) {
              if (
                card.hostId === iceId &&
                card.side === "runner" &&
                card.onSuccessfulRun
              ) {
                queueSuccessfulRun(cardId);
              }
            }
          }
          for (const id of [...server.root, ...server.ice]) {
            const card = s.cards[id];
            if (!card?.rezzed || !card.onSuccessfulRun) continue;
            queueSuccessfulRun(id);
          }
          // Active lockdowns in corp:play-area (Argus / Hyoubu).
          for (const id of activeLockdownIds(s)) {
            queueSuccessfulRun(id);
          }
          for (const id of activeCorpCurrentIds(s)) {
            queueSuccessfulRun(id);
          }
          for (const id of activeRunnerCurrentIds(s)) {
            queueSuccessfulRun(id);
          }
          if ((s.turn.successfulRunPendingIds ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.success");
          }
          // Puppet Master: may place 1 advancement on a card that can be advanced.
          for (const id of s.corp.scoreArea) {
            const card = s.cards[id];
            if (!card?.onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced)
              continue;
            if (abilitiesSuppressed(s, id)) continue;
            noteInlineConditional(s, {
              cardId: id,
              abilityKey: "puppet-master-place-advancement-on-successful-run",
              controller: "corp",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "tlm_puppet_master_place_advancement" },
              },
              logLine: `${card.title} becomes pending — successful run (may place advancement).`,
            });
          }
          // Dedicated Neural Net: first successful HQ each turn → psi; Corp chooses access.
          if (
            s.run!.attackedServerId === "hq" &&
            !s.turn.tlmDedicatedNeuralNetUsedThisTurn
          ) {
            for (const id of s.corp.scoreArea) {
              const card = s.cards[id];
              if (!card?.firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess)
                continue;
              if (abilitiesSuppressed(s, id)) continue;
              s.turn.tlmDedicatedNeuralNetUsedThisTurn = true;
              s.run!.tlmCorpChoosesHqAccess = true;
              noteInlineConditional(s, {
                cardId: id,
                abilityKey: "dedicated-neural-net-psi-on-first-successful-hq",
                controller: "corp",
                mandatory: true,
                effect: {
                  op: "do",
                  action: {
                    kind: "play_psi_game",
                    maxBid: 2,
                    ifBidsDiffer: {
                      op: "do",
                      action: {
                        kind: "gain_credits",
                        side: "corp",
                        amount: 0,
                      },
                    },
                  },
                },
                logLine: `${card.title} becomes pending — first successful HQ (psi; Corp may choose access).`,
              });
              break;
            }
          }
          // Sacrifice Zone: faceup agendas on other servers — note for 10.3.1a.
          const attacked = s.run!.attackedServerId;
          for (const [sid, srv] of Object.entries(s.servers)) {
            if (sid === attacked) continue;
            for (const id of srv.root) {
              if (s.turn.otherServerSuccessAbilityUsedIds.includes(id))
                continue;
              const before = (s.turn.otherServerSuccessPendingIds ?? []).length;
              noteSuccessfulRunOtherServer(s, id);
              if ((s.turn.otherServerSuccessPendingIds ?? []).length > before) {
                s.turn.otherServerSuccessAbilityUsedIds.push(id);
              }
            }
          }
          if ((s.turn.otherServerSuccessPendingIds ?? []).length > 0) {
            checkpointAfterInstruction(s, "run.success");
          }
          const src = s.run!.runSourceId;
          const fxRun = s.run!.onSuccessfulRunEffect;
          const tied = s.run!.successTiedToServers;
          const stillAllowed =
            !tied ||
            !src ||
            serversMatchingSpec(s, { servers: tied }).includes(
              s.run!.attackedServerId,
            );
          if (src && fxRun && !stillAllowed) {
            s.log.push(
              `If successful does not trigger — ${s.run!.attackedServerId} is not a server this run could have chosen (CR ${CR.ifSuccessfulTiedToServer.number}).`,
            );
          } else if (
            src &&
            fxRun &&
            !(s.run!.deferBreachReplacement && accountSiphonReplacesBreach(s))
          ) {
            const r = evalEffect({ state: s, sourceId: src }, fxRun);
            if (!r.ok) {
              s.log.push(`Run-source onSuccessfulRun failed: ${r.error}`);
            }
          }

          // Chrome City: Analog Dreamers — may instead of breaching R&D.
          if (
            s.turn.ccAnalogDreamersRun &&
            s.run!.attackedServerId === "rd" &&
            src
          ) {
            s.turn.ccAnalogDreamersRun = false;
            noteInlineConditional(s, {
              cardId: src,
              abilityKey: "analog-dreamers-may-instead-of-breach",
              controller: "runner",
              mandatory: true,
              effect: {
                op: "do",
                action: { kind: "may_breach_instead_analog_dreamers" },
              },
              logLine: `${s.cards[src]?.title ?? "Analog Dreamers"} becomes pending — successful R&D run (may instead of breach).`,
            });
          }

          // Top Hat: may access 1 of top N instead of breaching R&D.
          if (s.run!.successful && s.run!.attackedServerId === "rd") {
            for (const rid of s.runner.installed) {
              const hat = s.cards[rid];
              const n = hat?.mayInsteadOfBreachRdAccessOneOfTopN;
              if (!n) continue;
              noteInlineConditional(s, {
                cardId: rid,
                abilityKey: "top-hat-may-instead-of-breach",
                controller: "runner",
                mandatory: true,
                effect: {
                  op: "do",
                  action: { kind: "top_hat_may_instead_of_breach", n },
                },
                logLine: `${hat.title} becomes pending — successful R&D run (may instead of breach).`,
              });
              break;
            }
          }

          // First successful run on the mark this turn (Virtuoso-class).
          const mark = currentMark(s);
          if (
            mark !== null &&
            s.run!.attackedServerId === mark &&
            !s.turn.successfulMarkRunThisTurn
          ) {
            s.turn.successfulMarkRunThisTurn = true;
            noteFirstSuccessfulMarkRun(s);
          }

          // First successful HQ run this turn (PAN-Weave-class).
          if (firstSuccessfulHq) {
            noteFirstSuccessfulHqRun(s);
          }

          // First successful HQ or R&D run this turn (RNG Key-class).
          if (
            (s.run?.attackedServerId === "hq" ||
              s.run?.attackedServerId === "rd") &&
            !s.turn.dtwnFirstSuccessfulHqOrRdFired
          ) {
            s.turn.dtwnFirstSuccessfulHqOrRdFired = true;
            noteFirstSuccessfulHqOrRdRun(s);
          }

          // First successful central run this turn (Zenit-class).
          if (firstSuccessfulCentral) {
            noteFirstSuccessfulCentralRun(s);
          }

          // First/second successful run this turn (Pravdivost / John / DreamNet /
          // Enhanced Vision genetics via Gene Conditioning Shoppe) plus
          // HQ / HQ-or-R&D / central / mark first-* above. Queue for 10.3.1a;
          // checkpoint after this instruction marks pending (phase 3) and may
          // cease an empty remote before breach (CR 10.3.1h).
          noteValSuccessfulRunTrigger(s);
          checkpointAfterInstruction(s, "run.success");
          if (s.run!.deferBreachReplacement && !s.pendingChoice) {
            openBreachReplacementChoice(s);
          }
        } else {
          // Crisium still fires server onSuccessfulRun? No — run wasn't successful.
          // Hokusai requires successful run — correctly skipped.
        }
      },
    },
  ),
  "run.breachLink": run(
    "run.breachLink",
    "sec_appendix_timing_structure_of_a_run_5_b",
    "11.4_5_b",
    "The Runner breaches the attacked server.",
    "auto",
    "breach.begin",
  ),
};
