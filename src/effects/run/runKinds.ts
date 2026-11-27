/**
 * Primitive kinds for starting runs, encounters, bypass and jacking out. The
 * kind registry (`applyCoreKinds`) dispatches here.
 */
import { effectiveRunnerTags } from "../../state/keywordsAndCredits/tags.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  evalEffect,
  applyPrimitive,
  startExclusiveChoicesPerPassedIce,
  type EffectCtx,
  type EvalResult,
} from "../eval.js";
import { currentMark } from "../../state/keywordsAndCredits/keywords.js";
import type { ServerId } from "../../state/types/servers.js";
import type { GameState } from "../../state/types/game.js";
import { fx } from "../ir/fx.js";
import { type Effect } from "../ir/effect.js";
import { type Primitive } from "../ir/primitive.js";
import { trashCard, controllerOf } from "../../state/hostingAndTrash/trash.js";
import { applyEncounterPrimitive } from "./encounterPrimitives.js";
import { openCardName } from "../../state/visibility/seatVisibility.js";
import { autoResolveTrace } from "../../state/turnAndActions/trace.js";
import { revealCards } from "../../state/visibility/reveal.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/runnerCredits.js";
import { addCompileInstalledToBottom } from "../install/runnerInstallFromOtherZonesKinds.js";
import { removeCardFromGame } from "../../state/uninstallAndPosition/uninstall.js";

function resolveIndependentSourceTrash(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.trashAfterBreakingThisRun) return;
  const origin = state.run?.delayedRunEndSourceZone?.[cardId];
  if (
    (origin !== undefined && card.zone !== origin) ||
    !state.runner.installed.includes(cardId)
  ) {
    log(
      state,
      `${card.title}'s ability does nothing — its source changed zones (CR ${CR.abilityIndependent.number}).`,
    );
    return;
  }
  // Its own ability trashes it, so the Runner does (CR 1.14.5).
  trashCard(state, cardId, { by: "runner" });
  log(state, `${card.title} trashed — broke a subroutine this run.`);
}

/** The Runner chose which run-end delayed ability resolves first (CR 9.1.4). */
export function resolveDelayedRunEndOrder(
  state: GameState,
  optionId: string,
): void {
  const run = state.run;
  if (!run) return;
  run.delayedRunEndOrderResolved = true;
  const trashIds = (run.breakersThatBroke ?? []).filter(
    (id) => state.cards[id]?.trashAfterBreakingThisRun,
  );
  if (optionId === "delayed-run-end:compile-first") {
    addCompileInstalledToBottom(state);
    for (const id of trashIds) resolveIndependentSourceTrash(state, id);
  } else {
    for (const id of trashIds) resolveIndependentSourceTrash(state, id);
    addCompileInstalledToBottom(state);
  }
  run.resumeAfterDelayedOrder = true;
}

function sharedTypeMax(types: string[]): number {
  if (types.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of types) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let max = 0;
  for (const n of counts.values()) {
    if (n > max) max = n;
  }
  return max;
}

export function rfgCard(ctx: EffectCtx, cardId: string): void {
  const { state } = ctx;
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromGame(state, cardId);
}

export function applyRunKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "etr_subroutines_per_runner_tags_on_encounter": {
      const ice = state.cards[sourceId];
      const run = state.run;
      if (!ice || !run?.encounter || run.encounter.iceId !== sourceId) {
        return { ok: true };
      }
      const n = Math.max(0, effectiveRunnerTags(state));
      if (n === 0) {
        log(state, `${ice.title} — 0 tags, no extra ETR subroutines.`);
        return { ok: true };
      }
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const etrEffect = {
        op: "do" as const,
        action: { kind: "end_the_run" as const },
      };
      const printed = structuredClone(ice.baseSubroutines);
      const etrSubs = Array.from({ length: n }, (_, i) => ({
        id: `${ice.defId}-etr-tags-${i}`,
        text: "End the run.",
        effect: structuredClone(etrEffect),
      }));
      ice.subroutines = [...printed, ...etrSubs];
      for (let i = 0; i < n; i++) {
        run.encounter.broken.push(false);
      }
      log(
        state,
        `${ice.title} — gain ${n} ETR subroutine(s) after printed (${state.runner.tags} tag(s)).`,
      );
      return { ok: true };
    }

    case "offer_jack_out": {
      if (state.run?.successful === true) {
        log(
          state,
          `Jack out has no effect — the run is already successful (CR ${CR.noPositionAfterApproach.number}).`,
        );
        return { ok: true };
      }
      if (state.run && !state.run.cannotJackOut) {
        if (
          openPendingChoose(state, {
            sourceId,
            chooser: "runner",
            options: [
              {
                id: "jack_out",
                label: "Jack out",
                effect: { op: "do", action: { kind: "end_the_run" } },
              },
              {
                id: "continue",
                label: "Continue the run",
                effect: {
                  op: "do",
                  action: { kind: "gain_credits", side: "runner", amount: 0 },
                },
              },
            ],
          })
        ) {
          state.run.pendingJackOutOffer = true;
          // end_the_run via jack out should mark unsuccessful — handle in choose
          log(state, `Runner may jack out (Karunā).`);
        }
      }
      return { ok: true };
    }

    case "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice": {
      if (!state.run) {
        log(state, `${source.title} — no run for Backup Plan.`);
        return { ok: true };
      }
      const serverId = state.run.attackedServerId;
      const lastIce = state.run.lastEncounteredIceId;
      if (
        !openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "decline-backup",
              label: "Decline",
              effect: {
                op: "do" as const,
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
            {
              id: "backup-rerun",
              label: `Run ${serverId} again (ignore additional costs; bypass last ice)`,
              effect: {
                op: "do" as const,
                action: { kind: "backup_plan_rerun" as const },
              },
            },
          ],
        })
      )
        return { ok: true };
      // Stash bypass target on the source for the rerun leaf.
      source.chosenIceId = lastIce;
      source.chosenServerId = serverId;
      log(
        state,
        `${source.title} — may rerun ${serverId} ignoring additional costs.`,
      );
      return { ok: true };
    }

    case "backup_plan_rerun": {
      const serverId = source.chosenServerId;
      if (!serverId || !state.servers[serverId]) {
        log(state, `${source.title} — Backup Plan rerun: no server.`);
        return { ok: true };
      }
      // Immediate fail-closed leaf: create a new run with the bypass/ignore flags.
      if (state.run) {
        log(
          state,
          `${source.title} — cannot start Backup Plan rerun while a run is active.`,
        );
        return { ok: true };
      }
      // The run is over: start the new run once this choice resolves,
      // through the same path as other follow-up runs (startRun).
      state.pendingStartRun = {
        sourceId,
        serverId,
        backupPlanIgnoreAdditionalCosts: true,
        backupPlanBypassIceId: source.chosenIceId,
      };
      log(
        state,
        `${source.title} — rerun ${serverId} (ignore additional costs` +
          (source.chosenIceId
            ? `; bypass ${state.cards[source.chosenIceId]?.title ?? source.chosenIceId}`
            : "") +
          `).`,
      );
      return { ok: true };
    }

    case "may_flip_archives_ice_resolve_subroutine": {
      const facedownIce = state.corp.discardPile.filter((id) => {
        const c = state.cards[id];
        return c.type === "ice" && !c.faceup;
      });
      if (facedownIce.length === 0) {
        log(state, `${source.title} — no facedown ice in Archives.`);
        return { ok: true };
      }
      const options: Array<{
        id: string;
        label: string;
        effect: import("../ir/effect.js").Effect;
      }> = [];
      for (const iceId of facedownIce) {
        const ice = state.cards[iceId]!;
        const subs = ice.subroutines ?? [];
        for (let i = 0; i < subs.length; i++) {
          const sub = subs[i]!;
          options.push({
            id: `flip:${iceId}:${i}`,
            label: `Turn ${ice.title} faceup, resolve "${sub.text}"`,
            effect: {
              op: "do",
              action: {
                kind: "flip_archives_ice_resolve_subroutine",
                iceId,
                subIndex: i,
              },
            },
          });
        }
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — may turn 1 facedown Archives ice faceup and resolve a subroutine.`,
      });
      return { ok: true };
    }

    case "flip_archives_ice_resolve_subroutine": {
      const ice = state.cards[action.iceId];
      if (
        !ice ||
        ice.type !== "ice" ||
        !state.corp.discardPile.includes(action.iceId)
      ) {
        log(state, `Flip Archives ice — invalid target.`);
        return { ok: true };
      }
      ice.faceup = true;
      const sub = ice.subroutines?.[action.subIndex];
      if (!sub) {
        log(
          state,
          `Flip ${ice.title} faceup — no subroutine ${action.subIndex}.`,
        );
        return { ok: true };
      }
      log(
        state,
        `Turn ${ice.title} faceup in Archives; resolve "${sub.text}".`,
      );
      return evalEffect({ state, sourceId: action.iceId }, sub.effect);
    }

    case "ryo_phoenix_on_successful_run": {
      if (!state.run?.subroutineResolvedThisRun) {
        return { ok: true };
      }
      if (state.turn.ryoPhoenixFiredThisTurn) {
        return { ok: true };
      }
      state.turn.ryoPhoenixFiredThisTurn = true;
      state.runner.credits += 1;
      log(state, `${source.title} — gain 1¢ (successful run after sub).`);
      // "The Corp trashes 1 card from HQ": the Corp chooses (CR 1.15.2).
      return applyPrimitive(ctx, {
        kind: "trash_hq",
        pick: "choose",
        amount: 1,
      });
    }

    case "start_run_on_mark": {
      const mark = currentMark(state);
      if (mark === null) {
        log(
          state,
          `Start run on mark — no mark designated (CR ${CR.mark.number}).`,
        );
        return { ok: true };
      }
      state.pendingStartRunOnMark = { sourceId };
      log(
        state,
        `Pending run on mark ${mark} (from ${source.title}; CR ${CR.mark.number}).`,
      );
      return { ok: true };
    }

    case "may_start_run": {
      const servers: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (action.servers === "remote" && server.kind !== "remote") continue;
        if (action.servers === "central" && server.kind !== "central") continue;
        if (action.servers === "hq" && sid !== "hq") continue;
        if (action.servers === "rd" && sid !== "rd") continue;
        if (action.servers === "archives" && sid !== "archives") continue;
        if (action.servers === "hq_rd" && sid !== "hq" && sid !== "rd") {
          continue;
        }
        servers.push(sid);
      }
      if (servers.length === 0) {
        log(state, `may_start_run — no matching servers.`);
        return { ok: true };
      }
      const bypassClicks = action.bypassFirstEncounterForClicks;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...servers.map((sid) => ({
            id: `run:${sid}`,
            label: `Run ${sid}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "queue_start_run" as const,
                serverId: sid,
                ...(bypassClicks !== undefined
                  ? { bypassFirstEncounterForClicks: bypassClicks }
                  : {}),
                ...(action.preventAllTagsThisRun
                  ? { preventAllTagsThisRun: true }
                  : {}),
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
                side: "runner" as const,
                amount: 0,
              },
            },
          },
        ],
        logLine: `${source.title} — may start a run (${action.servers}).`,
      });
      return { ok: true };
    }

    case "queue_start_run": {
      // Doppelgänger's once per turn is used when the Runner runs, not when
      // the ability becomes pending (CR 9.6.9d, 9.3.6g).
      if (
        source.onSuccessfulRunEndOncePerTurn &&
        !state.turn.onSuccessfulRunEndFiredIds.includes(sourceId)
      ) {
        state.turn.onSuccessfulRunEndFiredIds.push(sourceId);
      }
      state.pendingStartRun = {
        sourceId,
        serverId:
          action.serverId as import("../../state/types/servers.js").ServerId,
        ...(action.bypassFirstEncounterForClicks !== undefined
          ? {
              bypassFirstEncounterForClicks:
                action.bypassFirstEncounterForClicks,
            }
          : {}),
        ...(action.preventAllTagsThisRun
          ? { preventAllTagsThisRun: true }
          : {}),
      };
      log(state, `Pending run on ${action.serverId} (from ${source.title}).`);
      return { ok: true };
    }

    case "exclusive_choices_per_passed_ice": {
      return startExclusiveChoicesPerPassedIce(state, sourceId, action.options);
    }
    case "charlatan_run_any_server": {
      state.pendingStartRun = {
        sourceId,
        serverId: "hq",
        // Charlatan: first approached rezzed ice may pay strength to bypass.
      };
      state.turn.charlatanArmed = true;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: (["hq", "rd", "archives"] as ServerId[])
          .concat(
            Object.keys(state.servers).filter(
              (s) => s !== "hq" && s !== "rd" && s !== "archives",
            ) as ServerId[],
          )
          .map((sid) => ({
            id: `run:${sid}`,
            label: `Run ${sid}`,
            effect: fx.do({ kind: "charlatan_start_run", serverId: sid }),
          })),
      });
      return { ok: true };
    }

    case "charlatan_start_run": {
      const serverId = action.serverId as ServerId;
      state.pendingStartRun = { sourceId, serverId };
      state.turn.charlatanArmed = true;
      state.pendingChoice = null;
      log(state, `Charlatan — run ${serverId}.`);
      return { ok: true };
    }

    case "jack_out": {
      state.corp.credits += 5;
      if (source)
        trashCard(state, sourceId, { by: controllerOf(state, sourceId) });
      if (state.run) {
        state.run.endedTheRun = true;
        state.run.successful = false;
      }
      log(state, `Black Level Clearance — Runner jacks out; Corp gains 5¢.`);
      return evalEffect(ctx, fx.draw("corp", 1));
    }

    case "armored_servers_activate_this_run": {
      if (state.run) {
        state.run.armoredServersTrashGripAdditionalCost = true;
      }
      log(
        state,
        `Armored Servers — trash 1 grip as additional cost to jack out or break a subroutine this run.`,
      );
      return { ok: true };
    }
    case "mad_dash_on_run_end": {
      const stole = (state.run?.agendasStolenThisRun ?? 0) > 0;
      if (stole) {
        return evalEffect(
          ctx,
          fx.do({ kind: "add_to_runner_score_as_agenda", agendaPoints: 1 }),
        );
      }
      return evalEffect(ctx, fx.do({ kind: "meat_damage", amount: 1 }));
    }

    case "twins_apply_reencounter": {
      const trashId = (action as { trashId: string }).trashId;
      const iceId = (action as { iceId: string }).iceId;
      // Trash HQ copy to Archives (reveal implied).
      const card = state.cards[trashId];
      if (card) {
        // "Reveal and trash": revealed, so faceup (CR 1.21.6, 4.4.6b).
        trashCard(state, trashId, { by: "corp", faceup: true });
        log(state, `The Twins — trash ${card.title} from HQ.`);
      }
      if (state.run) {
        state.run.reencounterIceId = iceId;
        log(
          state,
          `The Twins — force re-encounter of ${state.cards[iceId]?.title} (CR ${CR.forcedEncounterDuringRun.number}).`,
        );
      }
      return { ok: true };
    }
    case "choose_patron_server": {
      const servers = Object.keys(state.servers);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...servers.map((serverId) => ({
            id: `patron:${serverId}`,
            label: `Name ${serverId}`,
            effect: fx.do({
              kind: "patron_set_named_server",
              serverId,
            }),
          })),
          {
            id: "patron:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "patron_set_named_server": {
      if (!source) return { ok: true };
      source.namedServerId =
        action.serverId as import("../../state/types/servers.js").ServerId;
      log(state, `Patron — name ${action.serverId}.`);
      return { ok: true };
    }
    case "resolve_marathon": {
      state.runner.clicks += 1;
      const serverId = state.run?.attackedServerId;
      if (serverId) {
        if (!state.turn.cotcForbiddenServerIds) {
          state.turn.cotcForbiddenServerIds = [];
        }
        if (!state.turn.cotcForbiddenServerIds.includes(serverId)) {
          state.turn.cotcForbiddenServerIds.push(serverId);
        }
      }
      // Return Marathon from heap to grip.
      const eventId = state.run?.runSourceId ?? sourceId;
      const card = state.cards[eventId];
      if (card) {
        state.runner.discardPile = state.runner.discardPile.filter(
          (id) => id !== eventId,
        );
        if (!state.runner.hand.includes(eventId)) {
          state.runner.hand.push(eventId);
        }
        card.zone = "runner:grip";
        card.faceup = true;
        log(
          state,
          `Marathon — gain [click], add to grip; cannot run ${serverId ?? "server"} again this turn.`,
        );
      } else {
        log(state, `Marathon — gain [click]; forbid server.`);
      }
      return { ok: true };
    }

    case "bypass_encountered_ice": {
      // Security Nexus: bypass aborts the encounter (CR 6.5.8a). Nothing to
      // bypass if the encounter already ended during the trace.
      if (!state.run?.encounter) return { ok: true };
      return (
        applyEncounterPrimitive(ctx, { kind: "bypass_current_ice" }) ?? {
          ok: true,
        }
      );
    }

    case "jak_sinclair_run_without_programs": {
      state.turn.dadCannotUseProgramsThisRun = true;
      // Flag only — run is initiated via standard action UI after choice;
      // arm a marker that first run this window forbids programs.
      log(state, `Jak Sinclair — next run cannot use programs.`);
      return { ok: true };
    }
    case "bypass_current_encounter": {
      if (!state.run?.encounter) {
        log(state, `Logic Bomb — not encountering ice.`);
        return { ok: true };
      }
      const iceTitle = state.cards[state.run.encounter.iceId]?.title;
      state.run.encounter = null;
      state.run.bypassCurrentEncounter = true;
      log(state, `Logic Bomb — bypass ${iceTitle}.`);
      return { ok: true };
    }

    case "rigged_results_corp_guessed_right": {
      log(state, `Rigged Results — Corp guessed correctly; no run.`);
      return { ok: true };
    }

    case "rigged_results_corp_guessed_wrong": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) iceIds.push(id);
      }
      if (iceIds.length === 0) {
        log(state, `Rigged Results — no ice to choose.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: iceIds.map((id) => {
          const serverId =
            (Object.entries(state.servers).find(([, s]) =>
              s.ice.includes(id),
            )?.[0] as ServerId | undefined) ?? "hq";
          return {
            id: `rr-ice:${id}`,
            label: `Run past ${openCardName(state, id, "runner")}`,
            effect: fx.do({
              kind: "bypass_rigged_results_run_ice",
              iceId: id,
              serverId,
            }),
          };
        }),
      });
      return { ok: true };
    }

    case "bypass_rigged_results_run_ice": {
      state.turn.ftmRiggedResultsBypassIceId = action.iceId;
      state.pendingRunEventStart = {
        sourceId,
        serverId: action.serverId as ServerId,
      };
      log(
        state,
        `Rigged Results — run ${action.serverId}; first encounter of chosen ice bypasses.`,
      );
      return { ok: true };
    }
    case "information_overload_encounter": {
      const r = autoResolveTrace(
        state,
        sourceId,
        1,
        fx.do({ kind: "give_tags", amount: 1 }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "mo_slot_machine_encounter": {
      if (state.runner.deck.length > 0) {
        const top = state.runner.deck.shift()!;
        state.runner.deck.push(top);
        log(
          state,
          `Slot Machine — put top of stack (${state.cards[top]?.title ?? top}) on bottom.`,
        );
      }
      const revealN = Math.min(3, state.runner.deck.length);
      const revealed = state.runner.deck.slice(0, revealN);
      const types = revealed.map((id) => state.cards[id]?.type ?? "unknown");
      const max = sharedTypeMax(types);
      if (state.run) {
        state.run.encounterSlotMachineSharedTypeMax = max;
      }
      const titles = revealed
        .map((id) => state.cards[id]?.title ?? id)
        .join(", ");
      revealCards(state, revealed, sourceId);
      log(
        state,
        `Slot Machine — reveal top ${revealN}: ${titles || "(empty)"} (shared-type max=${max}).`,
      );
      return { ok: true };
    }
    case "choose_severnius_grip_cards": {
      const remaining = action.remaining ?? 0;
      const trashed = action.trashed ?? 0;
      const cardIds = (action.cardIds ?? []).filter((id) =>
        state.runner.hand.includes(id),
      );
      if (remaining <= 0) {
        const bonus = Math.floor(trashed / 2);
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: (["hq", "rd"] as const).map((sid) => ({
            id: `run:${sid}`,
            label: `Run ${sid.toUpperCase()} (+${bonus} access)`,
            effect: fx.do({
              kind: "severnius_start_run",
              serverId: sid,
              bonusAccess: bonus,
            }),
          })),
        });
        return { ok: true };
      }
      if (cardIds.length === 0) {
        log(state, `Severnius — grip empty mid-trash.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cardIds.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "trash_severnius_one_grip", cardId: id }),
              fx.do({
                kind: "choose_severnius_grip_cards",
                remaining: remaining - 1,
                trashed: trashed + 1,
                cardIds: cardIds.filter((x) => x !== id),
              }),
            ],
          },
        })),
      });
      return { ok: true };
    }

    case "severnius_start_run": {
      const serverId = action.serverId as ServerId;
      const bonusAccess = action.bonusAccess ?? 0;
      state.pendingStartRun = {
        sourceId,
        serverId,
        bonusAccess,
      };
      log(
        state,
        `Severnius — pending run on ${serverId} (+${bonusAccess} access).`,
      );
      return { ok: true };
    }

    case "counter_surveillance_run": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: (Object.keys(state.servers) as ServerId[]).map((sid) => ({
          id: `run:${sid}`,
          label: `Run ${sid}`,
          effect: fx.do({
            kind: "counter_surveillance_start_run",
            serverId: sid,
          }),
        })),
      });
      return { ok: true };
    }

    case "counter_surveillance_start_run": {
      const serverId = action.serverId as ServerId;
      state.pendingStartRun = {
        sourceId,
        serverId,
        skipBreach: true,
        onSuccessfulRunEffect: fx.do({
          kind: "counter_surveillance_on_success",
        }),
      };
      log(state, `Counter Surveillance — pending run on ${serverId}.`);
      return { ok: true };
    }

    case "counter_surveillance_on_success": {
      const tags = effectiveRunnerTags(state);
      if (tags <= 0) {
        log(state, `Counter Surveillance — no tags; cannot pay; no access.`);
        return { ok: true };
      }
      if (state.runner.credits < tags) {
        log(
          state,
          `Counter Surveillance — cannot pay ${tags}¢ (have ${state.runner.credits}); no access.`,
        );
        return { ok: true };
      }
      subtractRunnerCreditPool(state, tags);
      log(state, `Counter Surveillance — pay ${tags}¢ (tags).`);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= tags; n++) {
        options.push({
          id: `access:${n}`,
          label: n === 0 ? "Access 0 cards" : `Access ${n} card(s)`,
          effect: fx.do({
            kind: "access_n",
            amount: n,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "mobius_on_run_end": {
      if (!state.run?.successful) {
        if (state.turn.mobiusSecondRun) {
          state.turn.mobiusSecondRun = false;
        }
        return { ok: true };
      }
      if (state.turn.mobiusSecondRun) {
        state.turn.mobiusSecondRun = false;
        state.runner.credits += 4;
        log(state, `Möbius — second run successful; gain 4¢.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "run-rd",
            label: "Run R&D again",
            effect: fx.do({ kind: "mobius_queue_second_rd_run" }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "mobius_queue_second_rd_run": {
      state.turn.mobiusSecondRun = true;
      state.pendingStartRun = {
        sourceId,
        serverId: "rd",
        onRunEndEffect: fx.do({ kind: "mobius_on_run_end" }),
      };
      log(state, `Möbius — pending second R&D run.`);
      return { ok: true };
    }

    case "choose_breaker_run": {
      const bonus = action.strengthBonus ?? 2;
      const breakers = state.runner.installed.filter((id) => {
        const card = state.cards[id];
        return (
          card?.type === "program" &&
          ((card.subtypes ?? []).includes("icebreaker") ||
            Boolean(card.breaker))
        );
      });
      if (breakers.length === 0) {
        log(state, `Injection Attack — no installed icebreaker.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: breakers.map((id) => ({
          id: `inj:${id}`,
          label: `Choose ${state.cards[id]!.title} (+${bonus} strength)`,
          effect: fx.do({
            kind: "injection_attack_run_with_breaker",
            breakerId: id,
            strengthBonus: bonus,
          }),
        })),
      });
      return { ok: true };
    }

    case "injection_attack_run_with_breaker": {
      const breakerId = action.breakerId;
      const bonus = action.strengthBonus ?? 2;
      // Stash for the ensuing run; applied when the run begins.
      state.turn.injectionAttackBreakerBonus = {
        breakerId,
        amount: bonus,
      };
      log(
        state,
        `Injection Attack — ${state.cards[breakerId]?.title ?? breakerId} will get +${bonus} strength this run.`,
      );
      return evalEffect(ctx, fx.do({ kind: "may_start_run", servers: "any" }));
    }

    case "tlm_out_of_ashes_rfg_and_run": {
      if (!state.runner.discardPile.includes(sourceId)) {
        log(state, `Out of the Ashes — not in heap.`);
        return { ok: true };
      }
      rfgCard(ctx, sourceId);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: (Object.keys(state.servers) as ServerId[]).map((serverId) => ({
          id: `run:${serverId}`,
          label: `Run ${serverId}`,
          effect: fx.do({ kind: "queue_start_run", serverId }),
        })),
        logLine: `Out of the Ashes — remove from game; make a run.`,
      });
      return { ok: true };
    }
    case "cyber_threat": {
      // Printed: "Choose a server." — centrals, including HQ, are legal.
      const servers = Object.keys(state.servers) as ServerId[];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: servers.map((sid) => ({
          id: `cyber:${sid}`,
          label: `Cyber Threat — ${sid}`,
          effect: fx.do({ kind: "cyber_threat_server", serverId: sid }),
        })),
      });
      return { ok: true };
    }
    case "cyber_threat_server": {
      const serverId = (action as { serverId: ServerId }).serverId;
      // Printed: "The Corp may rez 1 piece of ice protecting that server.
      // If they do not, run that server. The Corp cannot rez ice during
      // that run." Rezzing costs the printed rez cost as usual.
      const ice = state.servers[serverId].ice.filter(
        (id) =>
          !state.cards[id]?.rezzed &&
          state.corp.credits >= (state.cards[id]?.rezCost ?? 0),
      );
      if (ice.length === 0) {
        return applyRunKinds(ctx, {
          kind: "run_cyber_threat_server",
          serverId,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...ice.map((id) => ({
            id: `rez:${id}`,
            label: `Rez ${state.cards[id]!.title} (${state.cards[id]!.rezCost ?? 0}¢)`,
            effect: fx.do({ kind: "corp_rez", iceId: id }),
          })),
          {
            id: "decline",
            label: "Do not rez — Runner runs this server",
            effect: fx.do({ kind: "run_cyber_threat_server", serverId }),
          },
        ],
      });
      return { ok: true };
    }
    case "run_cyber_threat_server": {
      const serverId = (action as { serverId: ServerId }).serverId;
      state.pendingStartRun = {
        sourceId,
        serverId,
        forbidCorpRezIceDuringRun: true,
      };
      log(
        state,
        `Cyber Threat — Runner runs ${serverId}; the Corp cannot rez ice during this run.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyRunKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "resolve_subroutine_on_rezzed_ice_protecting_this_server": {
      let serverIce: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverIce = [...server.ice];
          break;
        }
      }
      const picks: Array<{ iceId: string; subIndex: number }> = [];
      for (const id of serverIce) {
        const ice = state.cards[id];
        if (!ice?.rezzed) continue;
        const subs = ice.subroutines ?? [];
        for (let i = 0; i < subs.length; i++) {
          picks.push({ iceId: id, subIndex: i });
        }
      }
      if (picks.length === 0) {
        log(state, `${source.title} — no rezzed protecting ice with subs.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: picks.map((p) => {
          const ice = state.cards[p.iceId]!;
          const sub = ice.subroutines![p.subIndex]!;
          return {
            id: `batty:${p.iceId}:${p.subIndex}`,
            label: `Resolve "${sub.text}" on ${ice.title}`,
            effect: sub.effect,
          };
        }),
        logLine: `${source.title} — resolve 1 subroutine on protecting ice.`,
      });
      return { ok: true };
    }
    case "an_offer_you_cant_refuse": {
      const centrals: ServerId[] = ["hq", "rd", "archives"];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: centrals.map((serverId) => ({
          id: `offer-central:${serverId}`,
          label: `Choose ${serverId.toUpperCase()}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "offer_central_chosen" as const,
              serverId,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "offer_central_chosen": {
      const serverId = action.serverId as ServerId;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "offer-run",
            label: `Run ${serverId.toUpperCase()} (cannot jack out)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "offer_start_run" as const,
                serverId,
              },
            },
          },
          {
            id: "offer-decline",
            label: "Decline — Corp scores An Offer as 1-point agenda",
            effect: {
              op: "do" as const,
              action: {
                kind: "add_to_corp_score_as_agenda" as const,
                agendaPoints: 1,
              },
            },
          },
        ],
      });
      return { ok: true };
    }

    case "offer_start_run": {
      const serverId = action.serverId as ServerId;
      state.pendingStartRun = {
        sourceId,
        serverId,
      };
      state.turn.ohForcedRunCannotJackOut = true;
      log(state, `An Offer — Runner runs ${serverId} (cannot jack out).`);
      return { ok: true };
    }
    default:
      return null;
  }
}
