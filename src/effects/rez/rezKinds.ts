/**
 * Primitive kinds whose procedure is rez.
 * The effect switch in eval.ts dispatches here.
 */
import { moveForfeitedAgendaOutOfGame } from "../../state/turnAndActions/scoring.js";
import { moveRunnerToIce } from "../../state/uninstallAndPosition/runPosition.js";
import {
  type EffectCtx,
  type EvalResult,
  applyPrimitive,
  fireHostRezStateTriggers,
  fireOnRez,
  fireOnAnyIceRez,
  evalEffect,
} from "../eval.js";
import { fireIceRezDuringRunHooks } from "./rezDuringRunHooks.js";
import { type Effect } from "../ir/effect.js";
import { type Primitive } from "../ir/primitive.js";
import { fx } from "../ir/fx.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { syncEtrPerPowerCounterSubs } from "../../state/counters/powerCounters.js";
import { CR } from "../../timing/labels.js";
import { moveIce } from "../../state/uninstallAndPosition/rearrange.js";
import { openCardName } from "../../state/visibility/seatVisibility.js";
import { rezInstalledIgnoringCosts } from "../install/corpAbilityInstall.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/runnerCredits.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import type { ServerId } from "../../state/types/servers.js";
import type { RuleCite } from "../../state/types/restrictions.js";
import type { GameState } from "../../state/types/game.js";
import { hostCard } from "../../state/hostingAndTrash/host.js";
import {
  applyContinuousGainedSubs,
  collectTourGuideEtrSubs,
  firstDecl,
} from "../../state/continuous/continuousSubs.js";
import { getCardDef } from "../../cards/load.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function applyShootTheMoonPick(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const unrezzed: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      if (!state.cards[id]?.rezzed) unrezzed.push(id);
    }
  }
  if (unrezzed.length === 0) {
    state.turn.shootTheMoonRemaining = undefined;
    return { ok: true };
  }
  const remaining = state.turn.shootTheMoonRemaining ?? 0;
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: [
      ...unrezzed.map((id) => ({
        id: `stm-rez:${id}`,
        label: `Rez ${state.cards[id]!.title} (ignoring costs) [${remaining} left]`,
        effect: fx.do({ kind: "rez_pick", cardId: id }),
      })),
      {
        id: "stm-done",
        label: "Done rezzing",
        effect: fx.gainCredits("corp", 0),
      },
    ],
  });
  return { ok: true };
}

export function installedIce(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

function remoteIce(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const [sid, server] of Object.entries(state.servers)) {
    if (sid === "hq" || sid === "rd" || sid === "archives") continue;
    for (const id of server.ice) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

export function rezzedIceIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const iceId of server.ice) {
      const ice = state.cards[iceId];
      if (ice?.rezzed && ice.type === "ice") out.push(iceId);
    }
  }
  return out;
}

export function syncAllTourGuideSubs(state: EffectCtx["state"]): void {
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      const ice = state.cards[id];
      if (!ice || !firstDecl(ice, "etr_per_rezzed_asset")) continue;
      // Blanked Tour Guide keeps only printed base subs (CR 9.12.1d).
      applyContinuousGainedSubs(state, id, collectTourGuideEtrSubs(state, id));
    }
  }
}

function serverIdHostingCard(
  state: GameState,
  cardId: string,
): ServerId | null {
  const card = state.cards[cardId];
  if (!card?.zone) return null;
  const m = /^server:([^:]+):/.exec(card.zone);
  return m ? (m[1] as ServerId) : null;
}

/** Fire Councilman / Surat after Corp rezzes an installed card. */
export function fireDagAfterCorpRez(state: GameState, rezzedId: string): void {
  const rezzed = state.cards[rezzedId];
  if (!rezzed?.rezzed) return;

  // Councilman: asset or upgrade
  if (rezzed.type === "asset" || rezzed.type === "upgrade") {
    for (const rid of [...state.runner.installed]) {
      const cm = state.cards[rid];
      if (!cm?.onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez) continue;
      const r = applyRezKinds(
        { state, sourceId: rid },
        { kind: "may_derez_rezzed", cardId: rezzedId },
      );
      if (r && !r.ok) {
        log(state, `Councilman failed: ${r.error}`);
      }
      if (state.pendingChoice) return;
    }
  }

  // Surat City Grid: whenever you rez another card in root/protecting this server
  const rezzedServer = serverIdHostingCard(state, rezzedId);
  if (!rezzedServer) return;
  const server = state.servers[rezzedServer];
  if (!server) return;
  for (const upId of server.root) {
    if (upId === rezzedId) continue;
    const up = state.cards[upId];
    if (!up?.rezzed) continue;
    const discount = up.onRezOtherCardInRootOrProtectingMayRezDiscount;
    if (typeof discount !== "number") continue;
    // Triggering rez is in root or ice of this server
    const inRoot = server.root.includes(rezzedId);
    const inIce = server.ice.includes(rezzedId);
    if (!inRoot && !inIce) continue;
    const r = applyRezKinds(
      { state, sourceId: upId },
      { kind: "may_rez_surat_discount", discount },
    );
    if (r && !r.ok) {
      log(state, `Surat City Grid failed: ${r.error}`);
    }
    if (state.pendingChoice) return;
  }
}

function icePrintedRezCost(state: EffectCtx["state"], iceId: string): number {
  const c = state.cards[iceId];
  if (!c) return 0;
  const def = c.defId ? getCardDef(c.defId) : undefined;
  return def?.rezCost ?? c.rezCost ?? 0;
}

export function applyRezKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "rez_and_host": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c && !c.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no unrezzed ice to rez.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `oa:${id}`,
          label: `Rez ${state.cards[id]!.title} (ignore costs); host Oversight AI`,
          effect: {
            op: "do" as const,
            action: {
              kind: "oversight_ai_host_on_ice" as const,
              iceId: id,
            },
          },
        })),
        logLine: `${source.title} — choose ice to rez ignoring costs.`,
      });
      return { ok: true };
    }

    case "rez_bioroid_and_host": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (
            c &&
            !c.rezzed &&
            c.type === "ice" &&
            (c.subtypes ?? []).includes("bioroid")
          ) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no unrezzed bioroid ice to rez.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `ber:${id}`,
          label: `Rez ${state.cards[id]!.title} (ignore costs); host Bioroid Efficiency Research`,
          effect: {
            op: "do" as const,
            action: {
              kind: "host_on_ice" as const,
              iceId: id,
            },
          },
        })),
        logLine: `${source.title} — choose bioroid ice to rez ignoring costs.`,
      });
      return { ok: true };
    }

    case "rez_ice_by_id": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice" || ice.rezzed) return { ok: true };
      const cost = ice.rezCost ?? 0;
      const agendaId = ice.rezAdditionalCostForfeitAgenda
        ? state.corp.scoreArea.find((id) => !state.cards[id]?.cannotForfeit)
        : undefined;
      if (
        state.corp.credits < cost ||
        (ice.rezAdditionalCostForfeitAgenda && !agendaId)
      ) {
        log(
          state,
          `${ice.title} cannot be rezzed without its additional cost (CR ${CR.mustNotForceAdditionalCost.number}).`,
        );
        return applyPrimitive(ctx, {
          kind: "move_unrezzed_ice_to_hq",
          iceId: action.iceId,
        });
      }
      state.corp.credits -= cost;
      if (agendaId) {
        const agenda = state.cards[agendaId]!;
        moveForfeitedAgendaOutOfGame(state, agendaId);
        log(
          state,
          `Forfeit ${agenda.title} and pay ${cost}¢ to rez ${ice.title} (CR ${CR.mustNotForceAdditionalCost.number}).`,
        );
      }
      ice.rezzed = true;
      ice.faceup = true;
      if (!agendaId) log(state, `Corp rezzes ${ice.title}.`);
      return { ok: true };
    }

    case "rez_may_resolve_sub": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.type === "ice" && !c.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Unleash — no unrezzed installed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `unleash-rez:${id}`,
          label: `Rez ${state.cards[id]!.title} ignoring costs`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rez_ice_then_may_resolve_sub" as const,
              cardId: id,
            },
          },
        })),
        logLine: `${source.title} — choose an installed ice to rez ignoring costs.`,
      });
      return { ok: true };
    }

    case "rez_ice_then_may_resolve_sub": {
      const rez = applyPrimitive(ctx, {
        kind: "rez_ice_ignore_costs",
        cardId: action.cardId,
      });
      if (!rez.ok) return rez;
      const ice = state.cards[action.cardId];
      const subs = ice?.subroutines ?? [];
      if (!ice?.rezzed || subs.length === 0) {
        log(
          state,
          `Unleash — no subroutines to resolve on ${ice?.title ?? action.cardId}.`,
        );
        return { ok: true };
      }
      const options: import("../ir/effect.js").ChoiceOption[] = subs.map(
        (sub, i) => ({
          id: `unleash-sub:${action.cardId}:${i}`,
          label: `Resolve "${sub.text}" on ${ice.title}`,
          effect: sub.effect,
        }),
      );
      options.push({
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
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — may resolve 1 subroutine on ${ice.title}.`,
      });
      return { ok: true };
    }

    case "rez_installed_paying": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const cost = card.rezCost ?? 0;
      if (state.corp.credits < cost) {
        return {
          ok: false,
          error: `Cannot pay ${cost}¢ to rez ${card.title}.`,
          cites: [CR.revealForAbilityLimitations],
        };
      }
      state.corp.credits -= cost;
      card.rezzed = true;
      card.faceup = true;
      log(state, `${source.title} — pay ${cost}¢ and rez ${card.title}.`);
      fireOnRez(state, card.id);
      return { ok: true };
    }

    case "rez_hosted": {
      const ice = state.cards[action.cardId];
      if (
        !ice ||
        ice.type !== "ice" ||
        ice.hostId !== sourceId ||
        !(source.hostedCardIds ?? []).includes(action.cardId)
      ) {
        log(state, `${source.title} — invalid hosted ice.`);
        return { ok: true };
      }
      if (ice.rezzed) {
        log(state, `${ice.title} already rezzed.`);
        return { ok: true };
      }
      if (!state.run) {
        log(state, `${source.title} — no run.`);
        return { ok: true };
      }
      const discount = 7;
      const pay = Math.max(0, (ice.rezCost ?? 0) - discount);
      if (state.corp.credits < pay) {
        log(state, `${source.title} — cannot afford to rez ${ice.title}.`);
        return { ok: true };
      }
      state.corp.credits -= pay;
      ice.rezzed = true;
      ice.faceup = true;
      log(
        state,
        `Rez ${ice.title} for ${pay}¢ (${source.title}, −${discount}¢).`,
      );
      fireOnRez(state, action.cardId);
      fireHostRezStateTriggers(state, action.cardId, "rez");
      fireIceRezDuringRunHooks(state, action.cardId);
      state.run.awakeningCenterHostedIceIds = [
        ...(state.run.awakeningCenterHostedIceIds ?? []),
        action.cardId,
      ];
      // Force the Runner to encounter this ice (Konjin-class nested divert;
      // consumed by chooseOption's "Konjin-class" block in apply.ts).
      state.run.forceEncounterIceId = action.cardId;
      state.run.reencounterIceId = action.cardId;
      state.run.resumeEncounterIceId = sourceId;
      log(
        state,
        `Runner will encounter ${ice.title} (${source.title}); trashed when this run ends.`,
      );
      return { ok: true };
    }

    case "rez_card_ignoring_costs": {
      // Eliza's Toybox: "Rez a card, ignoring all costs." Any installed
      // unrezzed card that can be rezzed: ice, an asset or an upgrade
      // (CR 8.1.1, 8.1.2c). Not "may": with a card to rez, the Corp rezzes
      // one. The rez itself is the shared inline one (area 7).
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c || c.rezzed) continue;
          if (c.type !== "ice" && c.type !== "asset" && c.type !== "upgrade") {
            continue;
          }
          unrezzed.push(id);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `${source.title} — no unrezzed card to rez.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: unrezzed.map((id) => ({
          id: `rez-free:${id}`,
          label: `Rez ${state.cards[id]!.title} ignoring all costs`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rez_card_with_discount" as const,
              cardId: id,
              discount: state.cards[id]!.rezCost ?? 0,
            },
          },
        })),
        // The option count is hidden information: it would tell the Runner
        // how many facedown cards are agendas (CR 10.2.2a).
        optionCountHidden: true,
        logLine: `${source.title} — rez a card, ignoring all costs.`,
      });
      return { ok: true };
    }
    case "rez_ice_ignoring_costs": {
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id].rezzed) unrezzed.push(id);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Rez ice ignoring costs — no unrezzed ice.`);
        return { ok: true };
      }
      const options = [
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
        ...unrezzed.map((id) => ({
          id,
          label: `Rez ${state.cards[id].title} (ignore costs)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 0,
            },
          },
        })),
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: source.side === "runner" ? "corp" : "corp",
        options,
        logLine: `Send a Message — may rez ice ignoring all costs.`,
      });
      return { ok: true };
    }

    case "rez_spend_credits_for_power_counters": {
      const amount = Math.max(0, action.amount);
      if (amount > 0) {
        if (state.corp.credits < amount) {
          log(state, `Rez spend for power — insufficient credits.`);
          return { ok: true };
        }
        state.corp.credits -= amount;
        source.powerCounters = (source.powerCounters ?? 0) + amount;
        log(
          state,
          `${source.title} — pay ${amount}¢ → ${amount} power counter(s) (now ${source.powerCounters}).`,
        );
        syncEtrPerPowerCounterSubs(source, state);
      } else {
        log(state, `${source.title} — place 0 power counters.`);
      }
      return { ok: true };
    }

    case "rez_for_expose_interrupt": {
      const card = state.cards[action.cardId];
      if (!card || card.rezzed) {
        return applyPrimitive(ctx, { kind: "may_expose_after_rez_continue" });
      }
      const cost = card.rezCost ?? 0;
      if (state.corp.credits < cost) {
        log(
          state,
          `Cannot rez ${card.title} for expose interrupt — need ${cost}¢.`,
        );
        return applyPrimitive(ctx, { kind: "may_expose_after_rez_continue" });
      }
      state.corp.credits -= cost;
      card.rezzed = true;
      card.faceup = true;
      log(state, `Rez ${card.title} for ${cost}¢ (expose interrupt).`);
      return applyPrimitive(ctx, { kind: "may_expose_after_rez_continue" });
    }

    case "may_rez_installed_ice_discount": {
      const discount = Math.max(0, action.discount);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const ice = state.cards[id];
          if (ice && !ice.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `May rez ice — no unrezzed installed ice.`);
        return { ok: true };
      }
      const options: import("../ir/effect.js").ChoiceOption[] = targets.map(
        (id) => {
          const ice = state.cards[id]!;
          const base = ice.rezCost ?? 0;
          const pay = Math.max(0, base - discount);
          return {
            id: `rez:${id}`,
            label: `Rez ${ice.title} for ${pay}¢ (−${discount})`,
            effect: {
              op: "do" as const,
              action: {
                kind: "rez_ice_with_discount" as const,
                cardId: id,
                discount,
              },
            },
          };
        },
      );
      options.push({
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
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — may rez installed ice (−${discount}¢).`,
      });
      return { ok: true };
    }

    case "rez_ice_with_discount": {
      const ice = state.cards[action.cardId];
      if (!ice || ice.type !== "ice" || ice.rezzed) {
        log(state, `Rez with discount — invalid or already rezzed.`);
        return { ok: true };
      }
      const pay = Math.max(0, (ice.rezCost ?? 0) - action.discount);
      if (state.corp.credits < pay) {
        log(state, `Rez ${ice.title} — insufficient credits (${pay}¢).`);
        return { ok: true };
      }
      state.corp.credits -= pay;
      ice.rezzed = true;
      ice.faceup = true;
      state.turn.iceRezzedThisTurn += 1;
      log(
        state,
        `Rez ${ice.title} for ${pay}¢ (−${action.discount}¢ discount).`,
      );
      fireOnRez(state, action.cardId);
      fireIceRezDuringRunHooks(state, action.cardId);
      fireOnAnyIceRez(state, action.cardId);
      return { ok: true };
    }

    case "rez_move_innermost": {
      // Formicary-class (CR 6.8.2c.ex1): rez (discount), move innermost;
      // encounter only when new timing structures are still allowed.
      if (!state.run || source.type !== "ice") {
        log(state, `Formicary response — no run or source is not ice.`);
        return { ok: true };
      }
      const discount = action.rezDiscount ?? 2;
      if (!source.rezzed) {
        const pay = Math.max(0, (source.rezCost ?? 0) - discount);
        if (state.corp.credits < pay) {
          log(
            state,
            `Formicary response — insufficient credits to rez ${source.title} (${pay}¢).`,
          );
          return { ok: true };
        }
        state.corp.credits -= pay;
        source.rezzed = true;
        source.faceup = true;
        state.turn.iceRezzedThisTurn += 1;
        if (!state.turn.rezzedThisTurnIds) state.turn.rezzedThisTurnIds = [];
        if (!state.turn.rezzedThisTurnIds.includes(sourceId)) {
          state.turn.rezzedThisTurnIds.push(sourceId);
        }
        log(
          state,
          `Rez ${source.title} for ${pay}¢ (−${discount}¢ Formicary discount).`,
        );
        fireOnRez(state, sourceId);
      }
      const attacked = state.run.attackedServerId;
      let fromServer: import("../../state/types/servers.js").Server | null =
        null;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(sourceId)) {
          fromServer = server;
          break;
        }
      }
      if (!fromServer) {
        log(state, `Formicary response — source not installed as ice.`);
        return { ok: true };
      }
      if (!moveIce(state, sourceId, attacked, "innermost")) return { ok: true };
      log(state, `Move ${source.title} to innermost protecting ${attacked}.`);
      if (state.run.forbidNewTimingStructures || state.run.endedTheRun) {
        log(
          state,
          `Cannot move Runner position or initiate encounter after end the run (CR ${CR.runEndsOtherPriorityWindows.number}).`,
        );
        return { ok: true };
      }
      // "The Runner moves to this ice and encounters it" (CR 6.2.8a).
      moveRunnerToIce(state, sourceId);
      state.run.reencounterIceId = sourceId;
      log(
        state,
        `Runner will encounter ${source.title} after Formicary response.`,
      );
      return { ok: true };
    }

    case "may_rez_event_derezzed_ice_ignore_costs": {
      const iceId = state.run?.eventDerezzedIceId;
      if (!iceId || !state.cards[iceId]) {
        log(state, `May rez event-derezzed ice — none recorded.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-window-rez",
            label: "Decline to rez",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          {
            id: `window-rez:${iceId}`,
            label: `Rez ${state.cards[iceId]!.title} ignoring costs`,
            effect: {
              op: "do",
              action: { kind: "rez_ice_ignore_costs", cardId: iceId },
            },
          },
        ],
        logLine: `Window — Corp may rez the derezzed ice ignoring costs.`,
      });
      return { ok: true };
    }

    case "rez_ice_ignore_costs": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Rez ice ignore costs — not ice.`);
        return { ok: true };
      }
      card.rezzed = true;
      card.faceup = true;
      log(state, `Rez ${card.title} ignoring all costs.`);
      fireOnRez(state, action.cardId);
      fireHostRezStateTriggers(state, action.cardId, "rez");
      fireIceRezDuringRunHooks(state, action.cardId);
      return { ok: true };
    }

    case "rez_up_to_ice_protecting_attacked_ignore_costs": {
      if (!state.run) {
        log(state, `Rez protecting ice — no run.`);
        return { ok: true };
      }
      const maxIce = Math.max(0, action.maxIce);
      if (maxIce <= 0) return { ok: true };
      const server = state.servers[state.run.attackedServerId];
      const unrezzed = (server?.ice ?? []).filter(
        (id) => state.cards[id]?.type === "ice" && !state.cards[id]!.rezzed,
      );
      if (unrezzed.length === 0) {
        log(state, `Rez protecting ice — none unrezzed.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-rez-protecting",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...unrezzed.map((id) => ({
            id: `rez-protecting:${id}`,
            label: `Rez ${state.cards[id]!.title} ignoring costs`,
            effect: {
              op: "do" as const,
              action: {
                kind: "rez_one_protecting_attacked_ignore_costs" as const,
                cardId: id,
                remaining: maxIce - 1,
              },
            },
          })),
        ],
        logLine: `Rez up to ${maxIce} ice protecting the attacked server ignoring costs.`,
      });
      return { ok: true };
    }

    case "rez_one_protecting_attacked_ignore_costs": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Rez protecting ice — not ice.`);
        return { ok: true };
      }
      card.rezzed = true;
      card.faceup = true;
      log(state, `Rez ${card.title} ignoring all costs.`);
      fireOnRez(state, action.cardId);
      fireHostRezStateTriggers(state, action.cardId, "rez");
      // Brasília / Thunderbolt hooks (same as paid rez during run).
      fireIceRezDuringRunHooks(state, action.cardId);
      if (state.pendingChoice) return { ok: true };
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0 || !state.run) return { ok: true };
      const server = state.servers[state.run.attackedServerId];
      const unrezzed = (server?.ice ?? []).filter(
        (id) =>
          id !== action.cardId &&
          state.cards[id]?.type === "ice" &&
          !state.cards[id]!.rezzed,
      );
      if (unrezzed.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-rez-protecting",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...unrezzed.map((id) => ({
            id: `rez-protecting:${id}`,
            label: `Rez ${state.cards[id]!.title} ignoring costs`,
            effect: {
              op: "do" as const,
              action: {
                kind: "rez_one_protecting_attacked_ignore_costs" as const,
                cardId: id,
                remaining: remaining - 1,
              },
            },
          })),
        ],
      });
      return { ok: true };
    }

    case "may_rez_card_with_discount": {
      const discount = Math.max(0, action.discount);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c || c.rezzed) continue;
          if (c.type !== "ice" && c.type !== "asset" && c.type !== "upgrade") {
            continue;
          }
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `May rez with discount — no unrezzed installed cards.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-rez-discount",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...targets.map((id) => {
          const c = state.cards[id]!;
          const pay = Math.max(0, (c.rezCost ?? 0) - discount);
          return {
            id: `rez-discount:${id}`,
            label: `Rez ${c.title} for ${pay}¢ (−${discount})`,
            effect: {
              op: "do" as const,
              action: {
                kind: "rez_card_with_discount" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `May rez 1 card (−${discount}¢).`,
      });
      return { ok: true };
    }

    case "rez_card_with_discount": {
      const card = state.cards[action.cardId];
      if (
        !card ||
        card.rezzed ||
        (card.type !== "ice" &&
          card.type !== "asset" &&
          card.type !== "upgrade")
      ) {
        log(state, `Rez with discount — invalid or already rezzed.`);
        return { ok: true };
      }
      const pay = Math.max(0, (card.rezCost ?? 0) - action.discount);
      if (state.corp.credits < pay) {
        log(state, `Rez ${card.title} — insufficient credits (${pay}¢).`);
        return { ok: true };
      }
      state.corp.credits -= pay;
      card.rezzed = true;
      card.faceup = true;
      if (card.type === "ice") {
        state.turn.iceRezzedThisTurn += 1;
      }
      if (!state.turn.rezzedThisTurnIds) state.turn.rezzedThisTurnIds = [];
      if (!state.turn.rezzedThisTurnIds.includes(action.cardId)) {
        state.turn.rezzedThisTurnIds.push(action.cardId);
      }
      log(
        state,
        `Rez ${card.title} for ${pay}¢ (−${action.discount}¢ discount).`,
      );
      fireHostRezStateTriggers(state, action.cardId, "rez");
      if (card.type === "ice") {
        fireIceRezDuringRunHooks(state, action.cardId);
        fireOnAnyIceRez(state, action.cardId);
      }
      fireOnRez(state, action.cardId);
      return { ok: true };
    }

    case "rez_installed_card_ignoring_costs": {
      rezInstalledIgnoringCosts(state, action.cardId);
      return { ok: true };
    }

    case "spend_lightning_counter_rez_up_to_protecting_attacked": {
      if ((source.agendaCounters ?? 0) < 1) {
        log(state, `${source.title} — no agenda counters.`);
        return { ok: true };
      }
      source.agendaCounters = (source.agendaCounters ?? 0) - 1;
      const maxIce = Math.max(0, action.maxIce);
      const serverId = state.run?.attackedServerId;
      if (serverId) {
        state.turn.lightningPendingDerez = { serverId, maxIce };
      }
      log(
        state,
        `${source.title} — remove 1 agenda counter → ${source.agendaCounters}; rez up to ${maxIce} ice.`,
      );
      return applyPrimitive(ctx, {
        kind: "rez_up_to_ice_protecting_attacked_ignore_costs",
        maxIce,
      });
    }

    case "pick_second": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === action.firstIceId) continue;
          if (state.cards[id]?.rezzed) rezzed.push(id);
        }
      }
      if (rezzed.length === 0) {
        return {
          ok: false,
          error: "realloc() — no second rezzed ice.",
          cites: [CR.playOperation],
        };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `realloc-second:${id}`,
          label: `Choose ${state.cards[id]!.title} (2 of 2)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "resolve_realloc" as const,
              iceIds: [action.firstIceId, id] as [string, string],
            },
          },
        })),
        logLine: `${source.title} — choose second rezzed ice.`,
      });
      return { ok: true };
    }

    case "offer_forged_activation_orders_rez": {
      const iceId = action.cardId;
      const ice = iceId ? state.cards[iceId] : undefined;
      if (!ice || ice.rezzed) return { ok: true };
      const rezCost = ice.rezCost ?? 0;
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (state.corp.credits >= rezCost) {
        options.push({
          id: "fao-rez",
          label: `Rez ${ice.title} for ${rezCost}¢`,
          effect: fx.do({ kind: "rez_ice_by_id", iceId }),
        });
      }
      options.push({
        id: "fao-trash",
        label: `Trash ${ice.title}`,
        effect: fx.do({ kind: "trash_installed_corp_card", cardId: iceId }),
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "realloc_two_rezzed_ice": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.rezzed) rezzed.push(id);
        }
      }
      if (rezzed.length < 2) {
        return {
          ok: false,
          error: "realloc() requires 2 rezzed ice.",
          cites: [CR.playOperation],
        };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: rezzed.map((id) => ({
          id: `realloc-first:${id}`,
          label: `Choose ${state.cards[id]!.title} (1 of 2)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "pick_second" as const,
              firstIceId: id,
            },
          },
        })),
        logLine: `${source.title} — choose first rezzed ice.`,
      });
      return { ok: true };
    }

    case "forged_activation_orders": {
      // Printed: "Choose 1 unrezzed piece of ice. The Corp may rez that
      // ice. If they do not, they trash it." The Runner chooses the ice;
      // the Corp chooses rez-or-trash.
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id].rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Forged Activation Orders — no unrezzed ice.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return applyPrimitive(ctx, {
          kind: "offer_forged_activation_orders_rez",
          cardId: targets[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `fao:${id}`,
          label: `Choose ${openCardName(state, id, "runner")}`,
          effect: fx.do({
            kind: "offer_forged_activation_orders_rez",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }
    case "rez_ice_per_tag": {
      const tags = state.runner.tags;
      if (tags <= 0) {
        log(state, `Shoot the Moon — Runner has no tags.`);
        return { ok: true };
      }
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id]?.rezzed) unrezzed.push(id);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Shoot the Moon — no unrezzed ice.`);
        return { ok: true };
      }
      state.turn.shootTheMoonRemaining = Math.min(tags, unrezzed.length);
      return applyShootTheMoonPick(ctx);
    }
    case "rez_pick": {
      const cardId = (action as { cardId: string }).cardId;
      const ice = state.cards[cardId];
      if (ice && !ice.rezzed) {
        ice.rezzed = true;
        ice.faceup = true;
        log(state, `Shoot the Moon — rez ${ice.title} ignoring all costs.`);
      }
      state.turn.shootTheMoonRemaining =
        (state.turn.shootTheMoonRemaining ?? 1) - 1;
      if ((state.turn.shootTheMoonRemaining ?? 0) > 0) {
        return applyShootTheMoonPick(ctx);
      }
      state.turn.shootTheMoonRemaining = undefined;
      return { ok: true };
    }
    case "derez_ice_rez_cost_lte_x": {
      const x = state.turn.lastPlayCostX ?? 0;
      const candidates = installedIce(state).filter((id) => {
        const ice = state.cards[id];
        return ice?.rezzed && (ice.rezCost ?? 0) <= x;
      });
      if (candidates.length === 0) {
        log(state, `Brute-Force Hack — no rezzed ice with rez cost ≤ ${x}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "derez_card", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "derez_remote_ice": {
      const candidates = remoteIce(state).filter(
        (id) => state.cards[id]?.rezzed,
      );
      if (candidates.length === 0) {
        log(state, `Maxwell James — no rezzed remote ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "derez_card", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "choose_remote_card_cannot_rez_this_turn": {
      const candidates: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === "hq" || sid === "rd" || sid === "archives") continue;
        for (const id of [...server.root, ...server.ice]) {
          if (state.cards[id] && !state.cards[id]!.rezzed) candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Careful Planning — no unrezzed remote cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `forbid:${id}`,
          label: `Cannot rez ${openCardName(state, id, "runner")} this turn`,
          effect: fx.do({
            kind: "forbid_rez",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }
    case "derez_up_to_ice": {
      const max = action.max ?? 3;
      const ice = rezzedIceIds(state);
      if (ice.length === 0 || max <= 0) {
        log(state, `Exploit — no rezzed ice to derez.`);
        return { ok: true };
      }
      return evalEffect(
        ctx,
        fx.do({
          kind: "derez_up_to_ice_continue",
          remaining: max,
          cardIds: ice,
        }),
      );
    }

    case "derez_up_to_ice_continue": {
      const remaining = action.remaining ?? 0;
      const cardIds = (action.cardIds ?? []).filter((id) => {
        const c = state.cards[id];
        return c?.rezzed && c.type === "ice";
      });
      if (remaining <= 0 || cardIds.length === 0) {
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] =
        cardIds.map((id) => ({
          id: `derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "derez_card", cardId: id }),
              fx.do({
                kind: "derez_up_to_ice_continue",
                remaining: remaining - 1,
                cardIds: cardIds.filter((x) => x !== id),
              }),
            ],
          },
        }));
      options.push({
        id: "done",
        label: "Done",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "rez_up_to_3_ice_discount": {
      const forfeitedAp = state.lastForfeitedAgendaPoints ?? 1;
      const discountPer = 2 * forfeitedAp;
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          const ice = state.cards[iceId];
          if (ice && !ice.rezzed && ice.type === "ice") unrezzed.push(iceId);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Quarantine System — no unrezzed ice.`);
        return { ok: true };
      }
      return evalEffect(
        ctx,
        fx.do({
          kind: "rez_continue",
          remaining: 3,
          discount: discountPer,
          cardIds: unrezzed,
        }),
      );
    }

    case "rez_continue": {
      const remaining = action.remaining ?? 0;
      const discount = action.discount ?? 0;
      const cardIds = (action.cardIds ?? []).filter((id) => {
        const c = state.cards[id];
        return c && !c.rezzed && c.type === "ice";
      });
      if (remaining <= 0 || cardIds.length === 0) return { ok: true };
      const options: { id: string; label: string; effect: Effect }[] =
        cardIds.map((id) => {
          const ice = state.cards[id]!;
          const cost = Math.max(0, (ice.rezCost ?? 0) - discount);
          return {
            id: `rez:${id}`,
            label: `Rez ${ice.title} for ${cost}¢ (−${discount})`,
            effect: fx.do({
              kind: "rez_one",
              cardId: id,
              discount,
              remaining: remaining - 1,
              cardIds: cardIds.filter((x) => x !== id),
            }),
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "rez_one": {
      const cardId = action.cardId!;
      const discount = action.discount ?? 0;
      const ice = state.cards[cardId];
      if (!ice || ice.rezzed) {
        return evalEffect(
          ctx,
          fx.do({
            kind: "rez_continue",
            remaining: action.remaining ?? 0,
            discount,
            cardIds: action.cardIds ?? [],
          }),
        );
      }
      const cost = Math.max(0, (ice.rezCost ?? 0) - discount);
      if (state.corp.credits < cost) {
        log(state, `Quarantine System — cannot afford ${ice.title}.`);
        return evalEffect(
          ctx,
          fx.do({
            kind: "rez_continue",
            remaining: action.remaining ?? 0,
            discount,
            cardIds: action.cardIds ?? [],
          }),
        );
      }
      state.corp.credits -= cost;
      ice.rezzed = true;
      log(
        state,
        `Quarantine System — rez ${ice.title} for ${cost}¢ (discount ${discount}).`,
      );
      return evalEffect(
        ctx,
        fx.do({
          kind: "rez_continue",
          remaining: action.remaining ?? 0,
          discount,
          cardIds: action.cardIds ?? [],
        }),
      );
    }
    case "derez_all_ice_rezzed_this_run": {
      const ids = state.run?.iceRezzedThisRunIds ?? [];
      for (const id of ids) {
        const ice = state.cards[id];
        if (!ice || ice.type !== "ice" || !ice.rezzed) continue;
        ice.rezzed = false;
        log(state, `Leave No Trace — derez ${ice.title}.`);
      }
      return { ok: true };
    }

    case "derez_encountered_ice": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) return { ok: true };
      const ice = state.cards[iceId];
      if (!ice?.rezzed) return { ok: true };
      ice.rezzed = false;
      if (state.run) state.run.iceDerezzedThisRun = true;
      log(state, `${source?.title ?? "Flashbang"} — derez ${ice.title}.`);
      return { ok: true };
    }

    case "may_derez_rezzed": {
      const rezzedId = action.cardId;
      const rezzed = state.cards[rezzedId];
      if (!rezzed?.rezzed || !source) return { ok: true };
      const cost = rezzed.rezCost ?? 0;
      if (state.runner.credits < cost) {
        log(
          state,
          `Councilman — cannot pay ${cost}¢ to derez ${rezzed.title}.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "cm:accept",
            label: `Pay ${cost}¢ and trash Councilman: derez ${rezzed.title}`,
            effect: fx.do({
              kind: "derez_resolve",
              cardId: rezzedId,
            }),
          },
          {
            id: "cm:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "derez_resolve": {
      const rezzedId = action.cardId;
      const rezzed = state.cards[rezzedId];
      if (!rezzed?.rezzed || !source) return { ok: true };
      const cost = rezzed.rezCost ?? 0;
      if (state.runner.credits < cost) return { ok: true };
      subtractRunnerCreditPool(state, cost);
      rezzed.rezzed = false;
      state.turn.dagCannotRezCardIds = [
        ...(state.turn.dagCannotRezCardIds ?? []),
        rezzedId,
      ];
      trashCard(state, sourceId);
      log(
        state,
        `Councilman — pay ${cost}¢; derez ${rezzed.title}; cannot rez again this turn.`,
      );
      return { ok: true };
    }

    case "may_rez_surat_discount": {
      const discount = action.discount ?? 2;
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c || c.rezzed) continue;
          if (c.side !== "corp") continue;
          if (c.type === "agenda") continue;
          const cost = Math.max(0, (c.rezCost ?? 0) - discount);
          if (state.corp.credits < cost) continue;
          candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Surat City Grid — no card to rez at −${discount}¢.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...candidates.map((cardId) => {
            const c = state.cards[cardId]!;
            const cost = Math.max(0, (c.rezCost ?? 0) - discount);
            return {
              id: `surat:${cardId}`,
              label: `Rez ${c.title} for ${cost}¢ (−${discount})`,
              effect: fx.do({
                kind: "rez_surat_discount_resolve",
                cardId,
                discount,
              }),
            };
          }),
          {
            id: "surat:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "rez_surat_discount_resolve": {
      const cardId = action.cardId;
      const discount = action.discount ?? 2;
      const card = state.cards[cardId];
      if (!card || card.rezzed) return { ok: true };
      const cost = Math.max(0, (card.rezCost ?? 0) - discount);
      if (state.corp.credits < cost) return { ok: true };
      state.corp.credits -= cost;
      card.rezzed = true;
      card.faceup = true;
      log(
        state,
        `Surat City Grid — rez ${card.title} for ${cost}¢ (−${discount}).`,
      );
      return { ok: true };
    }

    case "rez_sensor_net_bioroid_ignoring_costs_derez_turn_end": {
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (!c || c.rezzed) continue;
          if (!(c.subtypes ?? []).includes("bioroid")) continue;
          candidates.push(id);
        }
        for (const id of server.root) {
          const c = state.cards[id];
          if (!c || c.rezzed) continue;
          if (!(c.subtypes ?? []).includes("bioroid")) continue;
          candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Sensor Net Activation — no unrezzed bioroid.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `sensor-net:${id}`,
          label: `Rez ${state.cards[id]!.title} ignoring all costs`,
          effect: fx.do({
            kind: "rez_sensor_net_bioroid_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "rez_sensor_net_bioroid_resolve": {
      const cardId = action.cardId;
      const card = cardId ? state.cards[cardId] : undefined;
      if (!card || card.rezzed) {
        log(state, `Sensor Net Activation — invalid bioroid.`);
        return { ok: true };
      }
      card.rezzed = true;
      card.faceup = true;
      if (!state.turn.sensorNetPendingDerezIds) {
        state.turn.sensorNetPendingDerezIds = [];
      }
      state.turn.sensorNetPendingDerezIds.push(cardId!);
      log(
        state,
        `Sensor Net Activation — rez ${card.title} ignoring costs; derez at turn end.`,
      );
      return { ok: true };
    }
    case "rez_emp_device_limit_ice_this_run": {
      // "The Corp cannot rez more than 1 piece of ice for the remainder of
      // this run": ice rezzed before EMP Device was used do not count. A
      // second use keeps the count the first one started, so it lifts
      // nothing (CR 1.2.2).
      if (state.run && state.run.bfMaxIceRezThisRun === undefined) {
        state.run.bfMaxIceRezThisRun = 1;
        state.run.bfIceRezzedThisRun = 0;
      }
      log(
        state,
        `${source?.title ?? "EMP Device"} — Corp cannot rez more than 1 ice this run.`,
      );
      return { ok: true };
    }

    case "derez_rezzed_this_turn": {
      const rezzedThisTurn = state.turn.rezzedThisTurnIds ?? [];
      const candidates = installedIce(state).filter((id) => {
        const ice = state.cards[id];
        return ice?.rezzed && rezzedThisTurn.includes(id);
      });
      if (candidates.length === 0) {
        log(state, `Rubicon Switch — no ice rezzed this turn.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const id of candidates) {
        const x = icePrintedRezCost(state, id);
        if (state.runner.credits < x) continue;
        options.push({
          id: `derez:${id}`,
          label: `Pay ${x}¢: Derez ${state.cards[id]!.title}`,
          effect: fx.seq(
            fx.do({ kind: "lose_credits", side: "runner", amount: x }),
            fx.do({ kind: "derez_card", cardId: id }),
          ),
        });
      }
      if (options.length === 0) {
        log(
          state,
          `Rubicon Switch — cannot pay printed rez cost of any candidate.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }
    case "corp_rez": {
      const iceId = (action as { iceId: string }).iceId;
      const card = state.cards[iceId]!;
      const cost = card.rezCost ?? 0;
      if (state.corp.credits < cost) {
        log(
          state,
          `Cyber Threat — Corp cannot pay ${cost}¢ to rez ${card.title}.`,
        );
        return { ok: true };
      }
      state.corp.credits -= cost;
      card.rezzed = true;
      log(state, `Cyber Threat — Corp rezzed ${card.title} for ${cost}¢.`);
      return { ok: true };
    }
    case "social_engineering": {
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id]?.rezzed) unrezzed.push(id);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Social Engineering — no unrezzed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: unrezzed.map((id) => ({
          id: `soc:${id}`,
          label: `Choose ${openCardName(state, id, "runner")}`,
          effect: fx.do({ kind: "social_engineering_mark", iceId: id }),
        })),
      });
      return { ok: true };
    }
    case "social_engineering_mark": {
      const iceId = (action as { iceId: string }).iceId;
      state.turn.socialEngineeringMarkedIce = iceId;
      log(state, `Social Engineering — marked ${state.cards[iceId]!.title}.`);
      return { ok: true };
    }
    default:
      return null;
  }
}

export function applyRezKindsWhenSourceExists(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;
  switch (action.kind) {
    case "resolve_worlds_plaza": {
      const cardId = action.cardId;
      const discount = action.discount;
      if (!state.corp.hand.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      if (card.type !== "asset") return { ok: true };
      const max = source.maxHostedCards ?? 3;
      if ((source.hostedCardIds?.length ?? 0) >= max) return { ok: true };
      const cost = Math.max(0, (card.rezCost ?? 0) - discount);
      if (state.corp.credits < cost) {
        log(state, `Worlds Plaza — insufficient credits to rez (${cost}¢).`);
        return { ok: true };
      }
      state.corp.credits -= cost;
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      hostCard(state, card.id, sourceId, { installed: true });
      card.zone = `hosted:${sourceId}`;
      card.faceup = true;
      card.rezzed = true;
      syncAllTourGuideSubs(state);
      log(
        state,
        `Worlds Plaza — install and rez ${card.title} for ${cost}¢ (−${discount}).`,
      );
      return { ok: true };
    }

    case "corp_derez_a_card": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c?.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Muertos — no rezzed Corp card to derez.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        state.cards[id]!.rezzed = false;
        log(state, `Muertos — Corp derezzes ${state.cards[id]!.title}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `muertos-derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "derez_card" as const, cardId: id },
          },
        })),
        logLine: `Muertos — Corp must choose a card to derez.`,
      });
      return { ok: true };
    }

    case "may_corp_rez_ignoring_cost": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c && c.side === "corp" && !c.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Muertos — no unrezzed Corp card to rez.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => ({
          id: `muertos-rez:${id}`,
          label: `Rez ${state.cards[id]!.title} (ignore cost)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "corp_rez_ignoring_cost" as const,
              cardId: id,
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
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `Muertos — Corp may rez a card, ignoring rez cost.`,
      });
      return { ok: true };
    }

    case "corp_rez_ignoring_cost": {
      const card = state.cards[action.cardId];
      if (!card || card.side !== "corp") return { ok: true };
      card.rezzed = true;
      card.faceup = true;
      log(state, `Corp rezzes ${card.title}, ignoring rez cost.`);
      return { ok: true };
    }

    case "derez_per_advancement_on_self": {
      const n = source.advancementCounters ?? 0;
      if (n <= 0) {
        log(state, `${source.title} — no advancements; nothing to derez.`);
        return { ok: true };
      }
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c?.rezzed && id !== sourceId) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no rezzed cards to derez.`);
        return { ok: true };
      }
      const max = Math.min(n, targets.length);
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((id) => ({
            id: `tg-derez:${id}`,
            label: `Derez ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "derez_n_from_list" as const,
                cardIds: [id],
                remaining: max - 1,
              },
            },
          })),
        ],
        logLine: `${source.title} — derez up to ${max} card(s).`,
      });
      return { ok: true };
    }

    case "derez_n_from_list": {
      for (const id of action.cardIds) {
        const c = state.cards[id];
        if (c?.rezzed) {
          c.rezzed = false;
          log(state, `Derez ${c.title}.`);
        }
      }
      const remaining = action.remaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c?.rezzed && id !== sourceId && !action.cardIds.includes(id)) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `tg-derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "derez_n_from_list" as const,
              cardIds: [...action.cardIds, id],
              remaining: remaining - 1,
            },
          },
        })),
      });
      return { ok: true };
    }
    default:
      return null;
  }
}
