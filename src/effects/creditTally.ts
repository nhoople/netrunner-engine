/**
 * Count, then one credit gain (CR 9.12.2b, 9.12.2c).
 * A total of 0 or less does not happen; the caller skips the gain.
 */
import type { GameState, Side } from "../state/types.js";
import type { CreditTally } from "./ir.js";

export function abilityCreditTally(
  state: GameState,
  sourceId: string,
  tally: CreditTally,
): { side: Side; amount: number } {
  const per = tally.per ?? 1;
  return {
    side: tallySide(state, sourceId, tally),
    amount: tallyCount(state, sourceId, tally) * per,
  };
}

function tallySide(
  state: GameState,
  sourceId: string,
  tally: CreditTally,
): Side {
  if (tally.side === "corp" || tally.side === "runner") return tally.side;
  const source = state.cards[sourceId];
  if (
    tally.side === "source" ||
    tally.count === "source_advancement_tokens" ||
    tally.count === "source_power_counters" ||
    tally.count === "source_virus_counters"
  ) {
    return source?.side === "runner" ? "runner" : "corp";
  }
  if (
    tally.count === "runner_grip" ||
    tally.count === "installed_resource_subtype" ||
    tally.count === "copies_in_runner_heap"
  ) {
    return "runner";
  }
  return "corp";
}

function tallyCount(
  state: GameState,
  sourceId: string,
  tally: CreditTally,
): number {
  const source = state.cards[sourceId];
  switch (tally.count) {
    case "source_advancement_tokens":
      return source?.advancementTokens ?? 0;
    case "source_power_counters":
      return source?.powerCounters ?? 0;
    case "source_virus_counters":
      return source?.virusCounters ?? 0;
    case "hq_cards":
      return state.corp.hand.length;
    case "runner_tags":
      return state.runner.tags;
    case "runner_grip":
      return state.runner.hand.length;
    case "runner_score":
      return state.runner.score.length;
    case "bad_publicity":
      return state.corp.badPublicity ?? 0;
    case "rezzed_ice": {
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.rezzed) n += 1;
        }
      }
      return n;
    }
    case "remotes_with_root": {
      let n = 0;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === "hq" || sid === "rd" || sid === "archives") continue;
        if (server.root.length > 0) n += 1;
      }
      return n;
    }
    case "installed_corp_advanced": {
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if ((state.cards[id]?.advancementTokens ?? 0) >= 1) n += 1;
        }
      }
      return n;
    }
    case "installed_resource_subtype": {
      const sub = tally.subtype ?? "connection";
      let n = 0;
      for (const id of state.runner.rig) {
        const c = state.cards[id];
        if (c?.type === "resource" && (c.subtypes ?? []).includes(sub)) n += 1;
      }
      return n;
    }
    case "rezzed_ice_subtype": {
      let n = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.rezzed && (c.subtypes ?? []).includes(tally.subtype ?? "")) {
            n += 1;
          }
        }
      }
      return n;
    }
    case "copies_in_runner_heap": {
      if (!source) return 0;
      return state.runner.discard.filter(
        (id) => state.cards[id]?.defId === source.defId,
      ).length;
    }
    case "ice_protecting_source_server": {
      let serverId: string | null = null;
      if (source?.zone.startsWith("server:") && source.zone.endsWith(":ice")) {
        serverId = source.zone.slice("server:".length, -":ice".length);
      } else if (state.run) {
        serverId = state.run.attackedServerId;
      }
      if (!serverId) return 0;
      return state.servers[serverId as keyof typeof state.servers]?.ice.length ?? 0;
    }
    default: {
      const _n: never = tally.count;
      return _n;
    }
  }
}
