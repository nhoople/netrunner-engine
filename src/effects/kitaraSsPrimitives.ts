/** Sovereign Sight (ss) Kitara pack primitives — v1.136.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function serverIdForInstalledCorpCard(
  state: EffectCtx["state"],
  cardId: string,
): ServerId | null {
  for (const [sid, server] of Object.entries(state.servers)) {
    if (server.root.includes(cardId) || server.ice.includes(cardId)) {
      return sid as ServerId;
    }
  }
  return null;
}

function trashRunnerInstalled(
  state: EffectCtx["state"],
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
  card.zone = "runner:heap";
  card.hostId = undefined;
  card.faceup = true;
  state.runner.discard.push(cardId);
}

function addInstalledToGrip(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card || !state.runner.rig.includes(cardId)) return;
  state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
  for (const id of [...state.runner.rig]) {
    const c = state.cards[id];
    if (c?.hostId === cardId) c.hostId = undefined;
  }
  card.hostId = undefined;
  card.zone = "runner:grip";
  card.faceup = true;
  card.rezzed = false;
  state.runner.hand.push(cardId);
}

export function applyKitaraSsPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "ss_activate_by_any_means": {
      state.turn.ssByAnyMeansActive = true;
      log(
        state,
        `${source?.title ?? "By Any Means"} — remainder of turn: access not in Archives → trash + 1 meat.`,
      );
      return { ok: true };
    }

    case "ss_puffer_add_or_remove_power": {
      const have = source?.powerCounters ?? 0;
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "add",
          label: "Place 1 power counter",
          effect: fx.do({ kind: "add_power_counter", amount: 1 }),
        },
      ];
      if (have > 0) {
        options.push({
          id: "remove",
          label: "Remove 1 hosted power counter",
          effect: fx.do({ kind: "remove_power_counter", amount: 1 }),
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      log(state, `${source?.title ?? "Puffer"} — add or remove 1 power counter.`);
      return { ok: true };
    }

    case "ss_assimilator_turn_facedown_faceup": {
      const facedown = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return c && c.faceup === false;
      });
      if (facedown.length === 0) {
        log(state, `${source?.title ?? "Assimilator"} — no facedown installed cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: facedown.map((id) => ({
          id: `faceup:${id}`,
          label: `Turn ${state.cards[id]!.title} faceup`,
          effect: fx.do({ kind: "ss_assimilator_faceup_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "ss_assimilator_faceup_resolve": {
      const card = state.cards[action.cardId];
      if (!card || !state.runner.rig.includes(action.cardId)) {
        return { ok: true };
      }
      card.faceup = true;
      log(state, `Assimilator — turn ${card.title} faceup.`);
      if (card.type === "event") {
        trashRunnerInstalled(state, action.cardId);
        log(state, `Assimilator — trash event ${card.title}.`);
      }
      return { ok: true };
    }

    case "ss_asa_install_non_agenda_same_server": {
      const lastId = state.turn.installedThisTurn.at(-1);
      if (!lastId) {
        log(state, `Asa Group — no install to match.`);
        return { ok: true };
      }
      const serverId = serverIdForInstalledCorpCard(state, lastId);
      if (!serverId) {
        log(state, `Asa Group — last install has no server.`);
        return { ok: true };
      }
      const hq = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "asset" || t === "upgrade" || t === "ice";
      });
      if (hq.length === 0) {
        log(state, `Asa Group — no non-agenda in HQ.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const cardId of hq) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          options.push({
            id: `asa-ice:${cardId}`,
            label: `Install ${card.title} protecting ${serverId}`,
            effect: fx.do({
              kind: "ss_asa_install_resolve",
              cardId,
              serverId,
              asIce: true,
            }),
          });
        } else {
          options.push({
            id: `asa-root:${cardId}`,
            label: `Install ${card.title} in root of ${serverId}`,
            effect: fx.do({
              kind: "ss_asa_install_resolve",
              cardId,
              serverId,
              asIce: false,
            }),
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `${source?.title ?? "Asa Group"} — may install non-agenda same server (${serverId}).`,
      );
      return { ok: true };
    }

    case "ss_asa_install_resolve": {
      const card = state.cards[action.cardId];
      const server = state.servers[action.serverId as ServerId];
      if (!card || !server) return { ok: true };
      const handIdx = state.corp.hand.indexOf(action.cardId);
      if (handIdx < 0) return { ok: true };
      state.corp.hand.splice(handIdx, 1);
      card.rezzed = false;
      card.faceup = false;
      card.advancementTokens = card.advancementTokens ?? 0;
      if (action.asIce) {
        server.ice.push(action.cardId);
        card.zone = `server:${action.serverId}:ice`;
      } else {
        server.root.push(action.cardId);
        card.zone = `server:${action.serverId}:root`;
      }
      state.turn.installedThisTurn.push(action.cardId);
      log(
        state,
        `Asa Group — install ${card.title} on ${action.serverId} (${action.asIce ? "ice" : "root"}).`,
      );
      return { ok: true };
    }

    case "ss_add_n_installed_runner_to_grip": {
      const n = Math.max(1, action.amount ?? 2);
      const targets = [...state.runner.rig];
      if (targets.length === 0) {
        log(state, `${source?.title ?? "Self-Growth Program"} — no installed Runner cards.`);
        return { ok: true };
      }
      // Offer choosing up to n cards; if fewer exist, take all via sequential choices.
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `sgp:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "ss_add_n_installed_runner_to_grip_pick",
            cardId: id,
            remaining: n - 1,
          }),
        })),
      };
      log(
        state,
        `${source?.title ?? "Self-Growth Program"} — add ${n} installed Runner card(s) to grip.`,
      );
      return { ok: true };
    }

    case "ss_add_n_installed_runner_to_grip_pick": {
      addInstalledToGrip(state, action.cardId);
      log(state, `Add ${state.cards[action.cardId]?.title ?? action.cardId} to the grip.`);
      const remaining = action.remaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const targets = [...state.runner.rig];
      if (targets.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `sgp:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "ss_add_n_installed_runner_to_grip_pick",
            cardId: id,
            remaining: remaining - 1,
          }),
        })),
      };
      return { ok: true };
    }

    case "ss_place_advancement_on_root_of_this_server": {
      let serverId: ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverId = sid as ServerId;
          break;
        }
      }
      if (!serverId) {
        log(state, `${source?.title ?? "Calibration Testing"} — not in a server root.`);
        return { ok: true };
      }
      const root = (state.servers[serverId]?.root ?? []).filter(
        (id) => id !== sourceId,
      );
      if (root.length === 0) {
        log(state, `${source?.title ?? "Calibration Testing"} — no other root cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: root.map((id) => ({
          id: `cal:${id}`,
          label: `Advance ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "ss_place_advancement_on_card",
            cardId: id,
            amount: 1,
          }),
        })),
      };
      return { ok: true };
    }

    case "ss_place_advancement_on_card": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      card.advancementTokens = (card.advancementTokens ?? 0) + (action.amount ?? 1);
      log(
        state,
        `Place ${action.amount ?? 1} advancement on ${card.title} → ${card.advancementTokens}.`,
      );
      return { ok: true };
    }

    case "ss_wake_up_call": {
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (c.type === "hardware") return true;
        if (c.type === "resource" && !(c.subtypes ?? []).includes("virtual")) {
          return true;
        }
        return false;
      });
      if (targets.length === 0) {
        log(state, `${source?.title ?? "Wake Up Call"} — no legal targets.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `wuc:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "ss_wake_up_call_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "ss_wake_up_call_resolve": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "trash",
            label: `Trash ${card.title}`,
            effect: fx.do({
              kind: "ss_wake_up_call_trash",
              cardId: action.cardId,
            }),
          },
          {
            id: "meat",
            label: "Suffer 4 meat damage",
            effect: fx.do({ kind: "meat_damage", amount: 4 }),
          },
        ],
      };
      log(
        state,
        `${source?.title ?? "Wake Up Call"} — Runner chooses trash ${card.title} or 4 meat.`,
      );
      return { ok: true };
    }

    case "ss_wake_up_call_trash": {
      trashRunnerInstalled(state, action.cardId);
      log(
        state,
        `Wake Up Call — trash ${state.cards[action.cardId]?.title ?? action.cardId}.`,
      );
      return { ok: true };
    }

    case "ss_move_any_advancements_from_self_to_advanceable": {
      const have = source?.advancementTokens ?? 0;
      if (have <= 0) {
        log(state, `${source?.title ?? "Reconstruction Contract"} — no advancements.`);
        return { ok: true };
      }
      const dests: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (id === sourceId) continue;
          const c = state.cards[id];
          if (!c) continue;
          if (
            c.type === "agenda" ||
            c.canAdvance ||
            c.type === "asset" ||
            c.type === "ice"
          ) {
            dests.push(id);
          }
        }
      }
      if (dests.length === 0) {
        log(state, `${source?.title ?? "Reconstruction Contract"} — no advanceable cards.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const destId of dests) {
        for (let n = 1; n <= have; n++) {
          options.push({
            id: `rc:${destId}:${n}`,
            label: `Move ${n} advancement(s) to ${state.cards[destId]!.title}`,
            effect: fx.do({
              kind: "ss_move_advancements_resolve",
              destId,
              amount: n,
            }),
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "ss_move_advancements_resolve": {
      if (!source) return { ok: true };
      const dest = state.cards[action.destId];
      if (!dest) return { ok: true };
      const move = Math.min(action.amount, source.advancementTokens ?? 0);
      source.advancementTokens = (source.advancementTokens ?? 0) - move;
      dest.advancementTokens = (dest.advancementTokens ?? 0) + move;
      log(
        state,
        `Reconstruction Contract — move ${move} advancement(s) to ${dest.title}.`,
      );
      return { ok: true };
    }

    case "ss_may_place_advancement_on_self_meat": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "accept",
            label: "Place 1 advancement on Reconstruction Contract",
            effect: fx.do({
              kind: "ss_place_advancement_on_card",
              cardId: sourceId,
              amount: 1,
            }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    default:
      return null;
  }
}

/** Hook: By Any Means forced trash + meat on non-Archives access. */
export function maybeApplyByAnyMeansOnAccess(
  state: EffectCtx["state"],
): { trash: boolean; meat: number } | null {
  if (!state.turn.ssByAnyMeansActive) return null;
  const run = state.run;
  if (!run?.accessingCardId) return null;
  if (run.attackedServerId === "archives") return null;
  return { trash: true, meat: 1 };
}

/** Fire Cyberdelia-class first fully-break credits. */
export function maybeFireGainCreditsOnFirstFullyBreak(
  state: EffectCtx["state"],
): void {
  if (!state.run?.encounter?.broken.every(Boolean)) return;
  if (state.turn.ssFirstFullyBreakCreditsFired) return;
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    const n = c?.gainCreditsOnFirstFullyBreakEachTurn;
    if (!c || typeof n !== "number" || n <= 0) continue;
    state.turn.ssFirstFullyBreakCreditsFired = true;
    state.runner.credits += n;
    log(
      state,
      `${c.title} — gain ${n}¢ (first full break this turn) → ${state.runner.credits}¢.`,
    );
    return;
  }
}

/** Zamba-class: may gain credits when a Corp card is exposed. */
export function maybeOfferGainCreditsOnExpose(
  state: EffectCtx["state"],
): void {
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    const n = c?.mayGainCreditsOnCorpCardExposed;
    if (!c || typeof n !== "number" || n <= 0) continue;
    // If a choice is already pending, skip (expose continues).
    if (state.pendingChoice) return;
    state.pendingChoice = {
      sourceId: id,
      chooser: "runner",
      options: [
        {
          id: "accept",
          label: `Gain ${n}¢`,
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: n }),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        },
      ],
    };
    log(state, `${c.title} — may gain ${n}¢ (Corp card exposed).`);
    return;
  }
}

/** Reconstruction Contract: may place advancement on meat damage. */
export function maybeOfferAdvancementOnMeatDamage(
  state: EffectCtx["state"],
): void {
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const c = state.cards[id];
      if (!c?.rezzed || !c.placeAdvancementOnSufferMeatDamage) continue;
      if (state.pendingChoice) return;
      state.pendingChoice = {
        sourceId: id,
        chooser: "corp",
        options: [
          {
            id: "accept",
            label: `Place 1 advancement on ${c.title}`,
            effect: fx.do({
              kind: "ss_place_advancement_on_card",
              cardId: id,
              amount: 1,
            }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      log(state, `${c.title} — may place 1 advancement (meat damage).`);
      return;
    }
  }
}
