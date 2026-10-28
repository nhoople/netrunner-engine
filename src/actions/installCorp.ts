/**
 * Corp basic install from HQ, including creating a remote.
 * Effect-driven installs stay in the effect evaluator.
 */
import { log } from "../state/createGame.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { runnerWinsOnEmptyRnd } from "../state/emptyRnd.js";
import { evalEffect } from "../effects/eval.js";
import {
  corpInstallCost,
  creditsAvailableForInstall,
  spendCreditsForInstall,
} from "../state/costs.js";
import { fireOnInstall } from "../state/cardLifecycleHooks.js";
import { fireStoredConditionals } from "../state/storedTriggers.js";
import { noteInstalledThisTurn } from "../state/programHardwareInstall.js";
import { cardBecameNewObject } from "../state/turn.js";
import { firePowerCounterOnAnyCorpInstall } from "../state/powerCounters.js";
import {
  noteFirstCorpCardInstallEachTurn,
  noteFirstCorpRootInstallEachTurn,
  noteFirstInstallInServerRootThisTurn,
  noteFirstRemoteInstallThisTurn,
} from "../state/trashHooks.js";
import { fireTdatd419OnFirstCorpInstall } from "../effects/kitaraTdatdPrimitives.js";
import type { ApplyResult, GameState, InstallDestination, RuleCite, Server, ServerId } from "../state/types.js";
import { fx } from "../effects/ir.js";
import { CR } from "../timing/labels.js";
import { installBlockReason } from "../state/staticFlags.js";
import { onCorpCardInstalledInRemote } from "../state/cardDeclarations.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

function remoteServerCount(state: GameState): number {
  return Object.values(state.servers).filter((s) => s.kind === "remote").length;
}

function canCreateAnotherRemote(state: GameState): boolean {
  const idCard = state.cards[state.corp.identityId];
  const max = idCard?.maxRemoteServers;
  if (max === undefined) return true;
  return remoteServerCount(state) < max;
}

/** Amazon Industrial Zone-class: rezzed unblanked immediate-rez discount. */
export function amazonIndustrialZoneDiscount(
  state: GameState,
  serverId: ServerId,
): number | null {
  const server = state.servers[serverId];
  if (!server) return null;
  for (const rid of server.root) {
    if (abilitiesSuppressed(state, rid)) continue;
    const up = state.cards[rid];
    const discount =
      up?.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount;
    if (up?.rezzed && typeof discount === "number") return discount;
  }
  return null;
}

/** Hijacked Router-class: Corp credit loss when creating a server. */
export function corpLosesCreditsOnCreateServerTotal(state: GameState): number {
  let total = 0;
  for (const rid of state.runner.installed) {
    if (abilitiesSuppressed(state, rid)) continue;
    const n = state.cards[rid]?.corpLosesCreditsOnCreateServer;
    if (typeof n === "number" && n > 0) total += n;
  }
  return total;
}

/** Turtlebacks-class: Corp credit gain when creating a server. */
export function corpGainsCreditsOnCreateServerTotal(state: GameState): number {
  let total = 0;
  for (const serverObj of Object.values(state.servers)) {
    for (const rid of [...serverObj.root, ...serverObj.ice]) {
      if (abilitiesSuppressed(state, rid)) continue;
      const card = state.cards[rid];
      if (!card?.rezzed) continue;
      const n = card.gainCreditsOnCreateServer;
      if (typeof n === "number" && n > 0) total += n;
    }
  }
  return total;
}

function createRemote(state: GameState): Server {
  const id = `remote-${state.nextRemoteNumber++}` as ServerId;
  const server: Server = { id, kind: "remote", ice: [], root: [] };
  state.servers[id] = server;
  state.turn.remotesCreatedThisTurn += 1;
  const idCard = state.cards[state.corp.identityId];
  if (
    idCard?.drawOnFirstRemoteCreated &&
    state.turn.remotesCreatedThisTurn === 1
  ) {
    const n = idCard.drawOnFirstRemoteCreated;
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      const top = state.corp.deck.shift();
      if (!top) break;
      drawn += 1;
      state.corp.hand.push(top);
      state.cards[top].zone = "corp:hq";
    }
    log(
      state,
      `${idCard.title} — draw ${n} (first remote this turn).`,
    );
    if (drawn < n) runnerWinsOnEmptyRnd(state);
  }
  // Hijacked Router-class: Corp loses credits when creating a server.
  for (const rid of state.runner.installed) {
    if (abilitiesSuppressed(state, rid)) continue;
    const card = state.cards[rid];
    const n = card?.corpLosesCreditsOnCreateServer;
    if (typeof n !== "number" || n <= 0) continue;
    const lost = Math.min(n, state.corp.credits);
    state.corp.credits -= lost;
    log(
      state,
      `${card!.title} — Corp loses ${lost}¢ creating a server → ${state.corp.credits}¢.`,
    );
  }
  // Turtlebacks-class: Corp gains credits when creating a server.
  for (const serverObj of Object.values(state.servers)) {
    for (const rid of [...serverObj.root, ...serverObj.ice]) {
      if (abilitiesSuppressed(state, rid)) continue;
      const card = state.cards[rid];
      if (!card?.rezzed) continue;
      const n = card.gainCreditsOnCreateServer;
      if (typeof n !== "number" || n <= 0) continue;
      state.corp.credits += n;
      log(
        state,
        `${card.title} — gain ${n}¢ creating a server → ${state.corp.credits}¢.`,
      );
    }
  }
  return server;
}

export function installCorp(
  state: GameState,
  cardId: string,
  destination: InstallDestination,
): ApplyResult {
  state.turn.corpInstallInProgress = true;
  try {
    return installCorpInner(state, cardId, destination);
  } finally {
    state.turn.corpInstallInProgress = false;
    state.turn.installDestinationServerId = undefined;
  }
}

function installCorpInner(
  state: GameState,
  cardId: string,
  destination: InstallDestination,
): ApplyResult {
  const card = state.cards[cardId];
  if (!card || card.side !== "corp") {
    return fail("Card not in Corp hand.", [CR.corpBasicInstall]);
  }
  const handIdx = state.corp.hand.indexOf(cardId);
  if (handIdx < 0) {
    return fail("Card not in HQ.", [CR.corpBasicInstall]);
  }
  if (
    card.type !== "asset" &&
    card.type !== "agenda" &&
    card.type !== "ice" &&
    card.type !== "upgrade"
  ) {
    return fail("Corp install supports asset/agenda/ice/upgrade only.", [
      CR.installing,
    ]);
  }
  const destServer =
    destination.kind === "remote_root" || destination.kind === "protect"
      ? destination.serverId
      : undefined;
  const blocked = installBlockReason(state, card, destServer);
  if (blocked) return fail(blocked, [CR.corpBasicInstall]);
  if (card.installServers?.length) {
    const allowed = new Set(card.installServers);
    if (destination.kind === "new_remote") {
      return fail(
        `${card.title} may only be installed on ${card.installServers.join("/")}.`,
        [CR.corpInstallDest],
      );
    }
    if (destination.kind === "remote_root") {
      const sid = String(destination.serverId);
      if (!allowed.has(sid as "hq" | "rd" | "archives")) {
        return fail(
          `${card.title} may only be installed on ${card.installServers.join("/")}.`,
          [CR.corpInstallDest],
        );
      }
    }
  }

  if (destination.kind === "host_upgrade") {
    if (card.type !== "ice" || !(card.subtypes ?? []).includes("bioroid")) {
      return fail("Only bioroid ice may be hosted this way.", [
        CR.corpBasicInstall,
      ]);
    }
    const host = state.cards[destination.hostId];
    if (
      !host ||
      host.type !== "upgrade" ||
      !host.rezzed ||
      !host.hostsBioroidIceIgnoreInstallCost
    ) {
      return fail("Invalid host for hosted bioroid ice.", [
        CR.corpBasicInstall,
      ]);
    }
    const hostInServer = Object.values(state.servers).some((srv) =>
      srv.root.includes(destination.hostId),
    );
    if (!hostInServer) {
      return fail("Host upgrade is not installed.", [CR.corpBasicInstall]);
    }
    state.corp.hand.splice(handIdx, 1);
    card.hostId = destination.hostId;
    card.zone = `hosted:${destination.hostId}`;
    card.rezzed = false;
    card.faceup = false;
    card.advancementCounters = card.advancementCounters ?? 0;
    if (!host.hostedCardIds) host.hostedCardIds = [];
    host.hostedCardIds.push(cardId);
    log(
      state,
      `Corp installs ${card.title} hosted on ${host.title}, ignoring install cost.`,
    );
    noteInstalledThisTurn(state, cardId);
    state.turn.corpInstalledFromHqThisTurn = true;
    firePowerCounterOnAnyCorpInstall(state, cardId);
    noteFirstCorpCardInstallEachTurn(state);
    fireTdatd419OnFirstCorpInstall(state, cardId);
    return ok(state);
  }

  let server: Server;
  if (destination.kind === "new_remote") {
    if (!canCreateAnotherRemote(state)) {
      return fail("Cannot create another remote server.", [CR.corpBasicInstall]);
    }
    if (card.type === "ice") {
      server = createRemote(state);
      state.turn.installDestinationServerId = server.id;
      log(
        state,
        `Created ${server.id} by installing ice (CR ${CR.creatingRemotes.number} / ${CR.remoteExistence.number}).`,
      );
      fireRunnerOnCorpRemoteServerCreated(state);
    } else if (
      card.type === "asset" ||
      card.type === "agenda" ||
      card.type === "upgrade"
    ) {
      if (!canCreateAnotherRemote(state)) {
        return fail("Cannot create another remote server.", [CR.corpBasicInstall]);
      }
      server = createRemote(state);
      state.turn.installDestinationServerId = server.id;
      log(
        state,
        `Created ${server.id} for ${card.type} (CR ${CR.agendaAssetRemote.number}).`,
      );
      fireRunnerOnCorpRemoteServerCreated(state);
    } else {
      return fail("Upgrade needs an existing server.", [CR.corpInstallDest]);
    }
  } else if (destination.kind === "remote_root") {
    server = state.servers[destination.serverId];
    if (!server) {
      return fail("Unknown server.", [CR.corpInstallDest]);
    }
    // Upgrades (and installServers-gated cards) may target central roots;
    // assets/agendas still need remotes unless installServers allows the central.
    if (
      server.kind !== "remote" &&
      card.type !== "upgrade" &&
      !(card.installServers ?? []).includes(
        destination.serverId as "hq" | "rd" | "archives",
      )
    ) {
      return fail("Destination must be a remote server.", [CR.agendaAssetRemote]);
    }
  } else if (destination.kind === "protect") {
    server = state.servers[destination.serverId];
    if (!server) {
      return fail("Unknown server.", [CR.corpInstallDest]);
    }
    if (card.type !== "ice") {
      return fail("Only ice protects a server.", [CR.corpBasicInstall]);
    }
  } else {
    return fail("Corp cannot install to runner .", [CR.corpBasicInstall]);
  }

  if (card.remoteOnly && server.kind !== "remote") {
    return fail("Card may only be installed in a remote server.", [
      CR.corpBasicInstall,
    ]);
  }

  const iceAlready = card.type === "ice" ? server.ice.length : 0;
  let installCost = corpInstallCost(card, iceAlready);
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const diwan = state.cards[id];
    const extra = diwan?.additionalCreditCostToInstallInChosenServer ?? 0;
    if (extra > 0 && diwan?.chosenServerId === server.id) installCost += extra;
  }
  if (card.type === "ice" && server.ice.length > 0) {
    for (const other of Object.values(state.cards)) {
      if (!other || abilitiesSuppressed(state, other.id)) continue;
      installCost += other.iceNotInnermostInstallCostIncrease ?? 0;
    }
  }
  if (
    card.type === "ice" &&
    !state.turn.ignoredFirstIceInstallCostThisTurn &&
    Object.values(state.cards).some(
      (other) =>
        other &&
        !abilitiesSuppressed(state, other.id) &&
        other.ignoreInstallCostFirstIceEachTurn &&
        other.zone === "corp:score",
    )
  ) {
    installCost = 0;
    state.turn.ignoredFirstIceInstallCostThisTurn = true;
    log(state, `First ice this turn is installed ignoring its install cost.`);
  }
  if (
    server.kind === "remote" &&
    (card.type === "asset" || card.type === "agenda") &&
    server.root.some((id) => {
      const other = state.cards[id];
      return other?.type === "asset" || other?.type === "agenda";
    })
  ) {
    return fail("A remote root can hold only one asset or agenda.", [
      CR.serverRoot,
    ]);
  }
  if (creditsAvailableForInstall(state, "corp") < installCost) {
    return fail("Insufficient credits for install cost.", [
      { number: "8.5.11", id: "sec_install_cost" },
    ]);
  }
  spendCreditsForInstall(state, "corp", installCost);
  state.corp.hand.splice(handIdx, 1);

  if (card.type === "ice") {
    server.ice.unshift(cardId);
    card.zone = `server:${server.id}:ice`;
    card.rezzed = false;
    card.faceup = false;
    card.advancementCounters = card.advancementCounters ?? 0;
    // Server Diagnostics: trash when the Corp installs any ice.
    for (const other of Object.values(state.cards)) {
      if (!other.trashSelfOnCorpIceInstall) continue;
      if (other.side !== "corp" || !other.rezzed) continue;
      if (other.id === cardId) continue;
      log(
        state,
        `${other.title} — trashed (Corp installed ice: ${card.title}).`,
      );
      const r = evalEffect({ state, sourceId: other.id }, fx.trashSelf());
      if (!r.ok) {
        log(state, `trashSelfOnCorpIceInstall failed on ${other.title}: ${r.error}`);
      }
    }
  } else {
    // Region limit: trash existing region in this server's root.
    if ((card.subtypes ?? []).includes("region")) {
      trashExistingRegions(state, server, cardId);
    }
    server.root.push(cardId);
    card.zone = `server:${server.id}:root`;
    if (server.kind === "remote") onCorpCardInstalledInRemote(state);
    card.rezzed = false;
    const corpId = state.cards[state.corp.identityId];
    const bangunFaceup =
      card.type === "agenda" && Boolean(corpId?.mayInstallAgendasFaceup);
    if (
      card.installFaceup ||
      (card.subtypes ?? []).includes("public") ||
      bangunFaceup
    ) {
      card.faceup = true;
      if (bangunFaceup) card.faceupInstalledInactive = true;
    } else {
      card.faceup = false;
    }
    if (card.type === "agenda" || card.type === "asset") {
      card.advancementCounters = card.advancementCounters ?? 0;
    }
  }

  log(
    state,
    `Corp installs ${card.title} on ${server.id} (CR ${CR.corpBasicInstall.number}, ${CR.installing.number}).`,
  );
  fireOnInstall(state, cardId);
  noteInstalledThisTurn(state, cardId);
  cardBecameNewObject(state, cardId);
  state.turn.corpInstalledFromHqThisTurn = true;
  firePowerCounterOnAnyCorpInstall(state, cardId);
  noteFirstCorpCardInstallEachTurn(state);
  fireTdatd419OnFirstCorpInstall(state, cardId);
  if (server.kind === "remote") {
    noteFirstRemoteInstallThisTurn(state, server.id);
  }
  if (card.type !== "ice") {
    noteFirstCorpRootInstallEachTurn(state);
    noteFirstInstallInServerRootThisTurn(state, server.id, cardId);
  }
  // Amazon Industrial Zone: may immediately rez ice protecting this server (−N).
  if (card.type === "ice" && !state.pendingChoice) {
    for (const rid of server.root) {
      if (abilitiesSuppressed(state, rid)) continue;
      const up = state.cards[rid];
      const discount =
        up?.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount;
      if (!up?.rezzed || typeof discount !== "number") continue;
      const pay = Math.max(0, (card.rezCost ?? 0) - discount);
      state.pendingChoice = {
        sourceId: rid,
        chooser: "corp",
        options: [
          {
            id: `aiz-rez:${cardId}`,
            label: `Rez ${card.title} for ${pay}¢ (−${discount})`,
            effect: {
              op: "do",
              action: {
                kind: "rez_ice_with_discount",
                cardId,
                discount,
              },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      };
      log(
        state,
        `${up.title} — may immediately rez ${card.title} (−${discount}¢).`,
      );
      break;
    }
  }
  return ok(state);
}

function fireRunnerOnCorpRemoteServerCreated(state: GameState): void {
  const items = [];
  for (const id of state.runner.installed) {
    const c = state.cards[id];
    if (!c?.onCorpRemoteServerCreated) continue;
    items.push({
      abilityKey: "on-corp-remote-server-created",
      sourceId: id,
      controller: "runner" as const,
      mandatory: true,
      effectKey: "onCorpRemoteServerCreated" as const,
      logLine: `${c.title} becomes pending — Corp created a remote server.`,
    });
  }
  fireStoredConditionals(state, items);
}

function trashExistingRegions(
  state: GameState,
  server: Server,
  keepId: string,
): void {
  const toTrash = server.root.filter((id) => {
    if (id === keepId) return false;
    const existing = state.cards[id];
    if (!existing) return false;
    return (
      (existing.subtypes ?? []).includes("region") ||
      Boolean(existing.limitOnePerServer)
    );
  });
  for (const id of toTrash) {
    const card = state.cards[id];
    server.root = server.root.filter((x) => x !== id);
    state.corp.discardPile.push(id);
    card.zone = "corp:archives";
    card.faceup = true;
    card.rezzed = false;
    log(
      state,
      `Trash ${card.title} — region limit (CR ${CR.trashing.number}).`,
    );
  }
}
