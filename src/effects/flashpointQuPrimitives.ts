/** Quorum (qu) Flashpoint pack primitives — v1.127.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashRunnerCardToHeap(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  state.runner.discard.push(cardId);
  card.zone = "runner:heap";
  card.faceup = true;
}

function rfgCard(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  card.zone = "removed-from-game";
  card.faceup = true;
  if (!state.removedFromGame) state.removedFromGame = [];
  if (!state.removedFromGame.includes(cardId)) {
    state.removedFromGame.push(cardId);
  }
}

export function applyFlashpointQuPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "prevent_x_damage": {
      const pending = state.pendingDamage?.remaining ?? 0;
      if (pending <= 0) {
        log(state, `Recon Drone — no pending damage.`);
        return { ok: true };
      }
      const maxX = Math.min(pending, state.runner.credits);
      if (maxX <= 0) {
        log(state, `Recon Drone — no credits to spend.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 1; x <= maxX; x++) {
        options.push({
          id: `recon-drone-x:${x}`,
          label: `Spend ${x}¢: prevent ${x} damage`,
          effect: fx.do({
            kind: "prevent_x_damage_resolve",
            amount: x,
          }),
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "prevent_x_damage_resolve": {
      const x = action.amount ?? 0;
      if (x <= 0 || state.runner.credits < x) {
        log(state, `Recon Drone — cannot afford ${x}¢.`);
        return { ok: true };
      }
      state.runner.credits -= x;
      return evalEffect(ctx, fx.do({ kind: "prevent_pending_damage", amount: x }));
    }

    case "gain_credits_per_corp_credits": {
      const gainAmt = Math.floor((state.corp.credits ?? 0) / 5);
      if (gainAmt <= 0) {
        log(state, `Tapwrm — Corp has <5¢; gain 0.`);
        return { ok: true };
      }
      state.runner.credits += gainAmt;
      log(
        state,
        `Tapwrm — gain ${gainAmt}¢ (Corp has ${state.corp.credits}¢).`,
      );
      return { ok: true };
    }

    case "tracker_run_chosen_prevent_first_sub": {
      const serverId = source.chosenServerId as ServerId | undefined;
      if (!serverId || !state.servers[serverId]) {
        log(state, `Tracker — no chosen server.`);
        return { ok: true };
      }
      if (state.run) {
        log(state, `Tracker — already running.`);
        return { ok: true };
      }
      state.run = {
        attackedServerId: serverId,
        phase: "initiation",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        accessRemaining: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        encounter: null,
        accessingCardId: null,
        runSourceId: sourceId,
        quTrackerPreventFirstSubroutine: true,
      };
      log(
        state,
        `Tracker — run ${serverId}; first subroutine that would resolve is prevented.`,
      );
      return { ok: true };
    }

    case "schedule_additional_runner_turn": {
      state.pendingExtraRunnerTurns = (state.pendingExtraRunnerTurns ?? 0) + 1;
      log(state, `Encore — take an additional turn after this one.`);
      return { ok: true };
    }

    case "spend_x_pump": {
      const credits = state.runner.credits;
      if (credits <= 0) {
        log(state, `Fawkes — no credits to spend.`);
        return { ok: true };
      }
      const maxX = Math.min(credits, 20);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 1; x <= maxX; x++) {
        options.push({
          id: `fawkes-x:${x}`,
          label: `Spend ${x}¢ (≥1 stealth): +${x} strength this run`,
          effect: fx.do({
            kind: "spend_x_pump_resolve",
            amount: x,
          }),
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "spend_x_pump_resolve": {
      const x = action.amount ?? 1;
      if (state.runner.credits < x) {
        log(state, `Fawkes — cannot afford ${x}¢.`);
        return { ok: true };
      }
      // Stealth spend is enforced by paid ability cost.minCreditsFromStealth when
      // the ability is paid normally; this leaf is also used from pendingChoice
      // after the ability opened — deduct from pool (stealth accounting approx).
      state.runner.credits -= x;
      if (!state.run) return { ok: true };
      state.run.strengthBoosts[sourceId] =
        (state.run.strengthBoosts[sourceId] ?? 0) + x;
      log(state, `Fawkes — spend ${x}¢ → +${x} strength this run.`);
      return { ok: true };
    }

    case "sensor_net_rez_bioroid_ignoring_costs_derez_turn_end": {
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
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: candidates.map((id) => ({
          id: `sensor-net:${id}`,
          label: `Rez ${state.cards[id]!.title} ignoring all costs`,
          effect: fx.do({
            kind: "sensor_net_rez_bioroid_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "sensor_net_rez_bioroid_resolve": {
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

    case "look_top5_may_install_remote": {
      if (state.turn.rdLookedCards.length > 0) {
        return {
          ok: false,
          error: "R&D look already in progress.",
          cites: [],
        };
      }
      const n = 5;
      const taken = state.corp.deck.splice(
        0,
        Math.min(n, state.corp.deck.length),
      );
      state.turn.rdLookedCards = taken;
      for (const id of taken) {
        state.cards[id].faceup = true;
        log(state, `Psychokinesis — look ${state.cards[id].title}.`);
      }
      const installable = taken.filter((id) => {
        const t = state.cards[id].type;
        return t === "agenda" || t === "asset" || t === "upgrade";
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline to install",
            effect: fx.do({ kind: "return_looked" }),
          },
          ...installable.map((id) => ({
            id: `psychokinesis-install:${id}`,
            label: `Install ${state.cards[id].title} in a remote`,
            effect: fx.do({
              kind: "install_remote",
              cardId: id,
            }),
          })),
        ],
      };
      return { ok: true };
    }

    case "return_looked": {
      const looked = [...state.turn.rdLookedCards];
      state.turn.rdLookedCards = [];
      for (const id of looked.reverse()) {
        state.cards[id].faceup = false;
        state.corp.deck.unshift(id);
        state.cards[id].zone = "corp:rd";
      }
      log(state, `Psychokinesis — return looked cards to R&D.`);
      return { ok: true };
    }

    case "install_remote": {
      const cardId = action.cardId;
      if (!cardId || !state.turn.rdLookedCards.includes(cardId)) {
        log(state, `Psychokinesis — card not in looked set.`);
        return { ok: true };
      }
      const remotes = (Object.keys(state.servers) as ServerId[]).filter(
        (sid) => state.servers[sid]?.kind === "remote",
      );
      let targets = [...remotes];
      if (targets.length === 0) {
        let n = 1;
        while (state.servers[`remote-${n}` as ServerId]) n += 1;
        const sid = `remote-${n}` as ServerId;
        state.servers[sid] = {
          id: sid,
          kind: "remote",
          root: [],
          ice: [],
        };
        targets = [sid];
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((serverId) => ({
          id: `psychokinesis-server:${serverId}`,
          label: `Install into ${serverId}`,
          effect: fx.do({
            kind: "install_remote_resolve",
            cardId,
            serverId,
          }),
        })),
      };
      return { ok: true };
    }

    case "install_remote_resolve": {
      const cardId = action.cardId;
      const serverId = action.serverId as ServerId | undefined;
      if (!cardId || !serverId || !state.servers[serverId]) {
        return evalEffect(ctx, fx.do({ kind: "return_looked" }));
      }
      const looked = state.turn.rdLookedCards.filter((id) => id !== cardId);
      state.turn.rdLookedCards = [];
      const card = state.cards[cardId]!;
      card.faceup = card.type === "agenda" ? false : true;
      card.zone = `server:${serverId}:root`;
      state.servers[serverId]!.root.push(cardId);
      for (const id of looked.reverse()) {
        state.cards[id].faceup = false;
        state.corp.deck.unshift(id);
        state.cards[id].zone = "corp:rd";
      }
      log(
        state,
        `Psychokinesis — install ${card.title} in ${serverId}; return rest to R&D.`,
      );
      return { ok: true };
    }

    case "pay_up_to_place_advancements": {
      const max = Math.max(0, action.max ?? 2);
      const credits = state.corp.credits;
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c) continue;
          if (c.type === "agenda" || c.canAdvance) targets.push(id);
        }
      }
      if (targets.length === 0 || credits <= 0 || max <= 0) {
        log(state, `Herald — nothing to advance.`);
        return { ok: true };
      }
      const maxPay = Math.min(max, credits);
      for (let n = 1; n <= maxPay; n++) {
        for (const cardId of targets) {
          options.push({
            id: `herald-adv:${n}:${cardId}`,
            label: `Pay ${n}¢: place ${n} advancement on ${state.cards[cardId]!.title}`,
            effect: fx.do({
              kind: "pay_place_advancements_resolve",
              amount: n,
              cardId,
            }),
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "pay_place_advancements_resolve": {
      const n = action.amount ?? 0;
      const cardId = action.cardId;
      if (!cardId || n <= 0 || state.corp.credits < n) {
        log(state, `Herald — cannot pay.`);
        return { ok: true };
      }
      state.corp.credits -= n;
      const card = state.cards[cardId]!;
      card.advancementTokens = (card.advancementTokens ?? 0) + n;
      log(
        state,
        `Herald — pay ${n}¢ → place ${n} advancement on ${card.title}.`,
      );
      return { ok: true };
    }

    case "trash_installed_virus": {
      const viruses = state.runner.rig.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("virus"),
      );
      if (viruses.length === 0) {
        log(state, `Macrophage — no installed virus.`);
        return { ok: true };
      }
      if (viruses.length === 1 || action.pick === "first") {
        const id = viruses[0]!;
        trashRunnerCardToHeap(state, id);
        log(state, `Macrophage — trash virus ${state.cards[id]!.title}.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: viruses.map((id) => ({
          id: `trash-virus:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "trash_installed_virus_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "trash_installed_virus_resolve": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.rig.includes(cardId)) return { ok: true };
      trashRunnerCardToHeap(state, cardId);
      log(state, `Macrophage — trash virus ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }

    case "rfg_virus_from_heap": {
      const viruses = state.runner.discard.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("virus"),
      );
      if (viruses.length === 0) {
        log(state, `Macrophage — no virus in heap.`);
        return { ok: true };
      }
      if (viruses.length === 1) {
        const id = viruses[0]!;
        rfgCard(state, id);
        log(state, `Macrophage — RFG virus ${state.cards[id]!.title} from heap.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: viruses.map((id) => ({
          id: `rfg-heap-virus:${id}`,
          label: `RFG ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "rfg_virus_from_heap_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "rfg_virus_from_heap_resolve": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.discard.includes(cardId)) return { ok: true };
      rfgCard(state, cardId);
      log(
        state,
        `Macrophage — RFG virus ${state.cards[cardId]!.title} from heap.`,
      );
      return { ok: true };
    }

    case "play_archives_transaction": {
      const txs = state.corp.discard.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "operation" && (c.subtypes ?? []).includes("transaction")
        );
      });
      if (txs.length === 0) {
        log(state, `Bryan Stinson — no transaction in Archives.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: txs.map((id) => ({
          id: `bryan-tx:${id}`,
          label: `Play ${state.cards[id]!.title} ignoring costs (RFG)`,
          effect: fx.do({
            kind: "play_archives_transaction_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "play_archives_transaction_resolve": {
      const cardId = action.cardId;
      const card = cardId ? state.cards[cardId] : undefined;
      if (!card || !state.corp.discard.includes(cardId!)) {
        log(state, `Bryan Stinson — transaction not in Archives.`);
        return { ok: true };
      }
      // Play ignoring costs: fire onPlay then RFG.
      removeCardFromCurrentZone(state, cardId!);
      if (card.onPlay) {
        const r = evalEffect({ state, sourceId: cardId! }, card.onPlay);
        if (!r.ok) {
          log(state, `Bryan Stinson — play failed: ${r.error}`);
        }
      }
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame) state.removedFromGame = [];
      state.removedFromGame.push(cardId!);
      log(
        state,
        `Bryan Stinson — play ${card.title} from Archives ignoring costs; RFG.`,
      );
      return { ok: true };
    }

    case "may_spend_to_place_power": {
      const maxGain = action.amount ?? 0;
      if (maxGain <= 0) return { ok: true };
      const maxSpend = Math.min(2, state.corp.credits, maxGain);
      if (maxSpend <= 0) {
        log(state, `NASX — cannot spend to place power.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (let n = 1; n <= maxSpend; n++) {
        options.push({
          id: `nasx-power:${n}`,
          label: `Spend ${n}¢: place ${n} power on NASX`,
          effect: fx.do({
            kind: "spend_place_power_resolve",
            amount: n,
            nasxId: sourceId,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "spend_place_power_resolve": {
      const n = action.amount ?? 0;
      const nasxId = action.nasxId ?? sourceId;
      const nasx = state.cards[nasxId];
      if (!nasx || n <= 0 || state.corp.credits < n) return { ok: true };
      state.corp.credits -= n;
      nasx.powerCounters = (nasx.powerCounters ?? 0) + n;
      log(state, `NASX — spend ${n}¢ → ${nasx.powerCounters} power.`);
      return { ok: true };
    }

    case "sifr_zero_encounter_ice_strength": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId || !state.run) {
        log(state, `Şifr — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[iceId]!;
      const current =
        (ice.strength ?? 0) + (state.run.iceStrengthBoosts[iceId] ?? 0);
      state.run.iceStrengthBoosts[iceId] =
        (state.run.iceStrengthBoosts[iceId] ?? 0) - current;
      state.turn.sifrHandSizePenaltyActive = true;
      state.turn.sifrUsedThisTurn = true;
      state.runner.maxHandSize = Math.max(0, state.runner.maxHandSize - 1);
      log(
        state,
        `Şifr — −1 max hand size until next turn; ${ice.title} strength → 0 this encounter.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
