/** The Universe of Tomorrow (uot) SanSan pack primitives. */
import { log } from "../state/createGame.js";
import type { EffectCtx } from "./eval.js";
import type { Effect } from "./ir.js";
import type { Primitive } from "./ir.js";
import type { RuleCite, ServerId } from "../state/types.js";
import { syncEtrPerRezzedAssetSubs } from "../state/powerCounters.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };


function countRezzedAssets(state: EffectCtx["state"]): number {
  let n = 0;
  for (const c of Object.values(state.cards)) {
    if (!c?.rezzed || c.type !== "asset") continue;
    // Installed in a server root or hosted on Worlds Plaza-class.
    if ((c.zone ?? "").includes(":root") || (c.zone ?? "").startsWith("hosted:")) {
      n += 1;
    }
  }
  return n;
}

export function syncAllTourGuideSubs(state: EffectCtx["state"]): void {
  const n = countRezzedAssets(state);
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      const ice = state.cards[id];
      if (!ice?.etrSubroutinesPerRezzedAsset) continue;
      syncEtrPerRezzedAssetSubs(ice, n);
    }
  }
}

export function applySansanUotPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;

  switch (action.kind) {
    case "arm_gain_credits_on_first_agenda_access": {
      state.turn.uotFirstAgendaAccessCredits = action.amount;
      log(
        state,
        `${source.title} — first agenda access this turn gains ${action.amount}¢.`,
      );
      return { ok: true };
    }

    case "arm_cannot_rez_outermost_ice_this_turn": {
      state.turn.uotCannotRezOutermostIce = true;
      log(
        state,
        `${source.title} — Corp cannot rez outermost ice during a run this turn.`,
      );
      return { ok: true };
    }

    case "surfer_swap_encounter_barrier_adjacent": {
      const run = state.run;
      const iceId = run?.encounter?.iceId;
      if (!run || !iceId) {
        log(state, `Surfer — not encountering ice.`);
        return { ok: true };
      }
      const ice = state.cards[iceId];
      if (!ice || !(ice.subtypes ?? []).some((s) => s.toLowerCase() === "barrier")) {
        log(state, `Surfer — not encountering barrier.`);
        return { ok: true };
      }
      const sid = run.attackedServerId;
      const server = state.servers[sid];
      if (!server) return { ok: true };
      const pos = server.ice.indexOf(iceId);
      if (pos < 0) return { ok: true };
      const neighbors: number[] = [];
      if (pos > 0) neighbors.push(pos - 1);
      if (pos < server.ice.length - 1) neighbors.push(pos + 1);
      if (neighbors.length === 0) {
        log(state, `Surfer — no adjacent ice.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: neighbors.map((nPos) => {
          const otherId = server.ice[nPos]!;
          return {
            id: `surfer-swap:${otherId}`,
            label: `Swap with ${state.cards[otherId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "uot_surfer_swap_resolve" as const,
                otherIceId: otherId,
              },
            },
          };
        }),
      };
      log(state, `Surfer — choose adjacent ice to swap.`);
      return { ok: true };
    }

    case "uot_surfer_swap_resolve": {
      const run = state.run;
      const iceId = run?.encounter?.iceId;
      if (!run || !iceId) return { ok: true };
      const otherId = action.otherIceId;
      const sid = run.attackedServerId;
      const server = state.servers[sid];
      if (!server) return { ok: true };
      const a = server.ice.indexOf(iceId);
      const b = server.ice.indexOf(otherId);
      if (a < 0 || b < 0) return { ok: true };
      server.ice[a] = otherId;
      server.ice[b] = iceId;
      run.position = b;
      if (run.encounter) {
        run.encounter.iceId = otherId;
        run.encounter.broken = (state.cards[otherId]?.subroutines ?? []).map(
          () => false,
        );
      }
      log(
        state,
        `Surfer — swap ${state.cards[iceId]!.title} with ${state.cards[otherId]!.title}; still encountering.`,
      );
      return { ok: true };
    }

    case "bookmark_host_up_to_3_from_grip_facedown": {
      const max = source.maxHostedCards ?? 3;
      const have = source.hostedCardIds?.length ?? 0;
      const room = max - have;
      if (room <= 0 || state.runner.hand.length === 0) {
        log(state, `${source.title} — cannot host more from grip.`);
        return { ok: true };
      }
      state.turn.uotBookmarkHostRemaining = room;
      return offerBookmarkHostChoice(ctx);
    }

    case "uot_bookmark_host_one": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) return { ok: true };
      const max = source.maxHostedCards ?? 3;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) return { ok: true };
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      card.hostId = sourceId;
      card.faceup = false;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(cardId);
      state.turn.uotBookmarkHostRemaining =
        (state.turn.uotBookmarkHostRemaining ?? 1) - 1;
      log(state, `${source.title} hosts a card facedown from grip.`);
      if (
        (state.turn.uotBookmarkHostRemaining ?? 0) <= 0 ||
        state.runner.hand.length === 0
      ) {
        state.turn.uotBookmarkHostRemaining = undefined;
        return { ok: true };
      }
      return offerBookmarkHostChoice(ctx);
    }

    case "bookmark_add_all_hosted_to_grip": {
      const hosted = [...(source.hostedCardIds ?? [])];
      source.hostedCardIds = [];
      for (const id of hosted) {
        const card = state.cards[id];
        if (!card) continue;
        card.hostId = undefined;
        card.faceup = true;
        card.zone = "runner:grip";
        state.runner.hand.push(id);
      }
      log(
        state,
        `${source.title} — add ${hosted.length} hosted card(s) to grip.`,
      );
      return { ok: true };
    }

    case "davinci_install_from_grip_ignore_cost": {
      const counters = source.powerCounters ?? 0;
      const candidates = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (c.type !== "program" && c.type !== "hardware" && c.type !== "resource") {
          return false;
        }
        return (c.installCost ?? 0) <= counters;
      });
      if (candidates.length === 0) {
        log(state, `DaVinci — no eligible grip card (≤ ${counters}).`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((cardId) => ({
          id: `davinci:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} (ignore install cost)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "uot_davinci_install_resolve" as const,
              cardId,
            },
          },
        })),
      };
      log(state, `DaVinci — choose grip card to install (≤ ${counters}).`);
      return { ok: true };
    }

    case "uot_davinci_install_resolve": {
      const cardId = action.cardId;
      if (!state.runner.hand.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.rig.push(cardId);
      card.zone = "runner:rig";
      card.faceup = true;
      card.rezzed = true;
      log(
        state,
        `DaVinci — install ${card.title} ignoring install cost.`,
      );
      return { ok: true };
    }

    case "may_install_from_hq_or_archives_ignore_costs": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-ts",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      const addInstallable = (zone: "hq" | "archives", ids: string[]) => {
        for (const cardId of ids) {
          const card = state.cards[cardId];
          if (!card) continue;
          if (
            card.type !== "agenda" &&
            card.type !== "asset" &&
            card.type !== "upgrade" &&
            card.type !== "ice"
          ) {
            continue;
          }
          if (card.type === "ice") {
            for (const server of Object.values(state.servers)) {
              options.push({
                id: `ts-${zone}:${cardId}:${server.id}`,
                label: `Install ${card.title} from ${zone.toUpperCase()} protecting ${server.id}`,
                effect: {
                  op: "do",
                  action: {
                    kind:
                      zone === "hq"
                        ? ("install_hq_card_ignore_costs" as const)
                        : ("install_archives_card_ignore_costs" as const),
                    cardId,
                    serverId: server.id,
                  },
                },
              });
            }
          } else {
            for (const server of Object.values(state.servers)) {
              if (server.kind !== "remote") continue;
              options.push({
                id: `ts-${zone}:${cardId}:${server.id}`,
                label: `Install ${card.title} from ${zone.toUpperCase()} on ${server.id}`,
                effect: {
                  op: "do",
                  action: {
                    kind:
                      zone === "hq"
                        ? ("install_hq_card_ignore_costs" as const)
                        : ("install_archives_card_ignore_costs" as const),
                    cardId,
                    serverId: server.id,
                  },
                },
              });
            }
            options.push({
              id: `ts-${zone}:${cardId}:new`,
              label: `Install ${card.title} from ${zone.toUpperCase()} on new remote`,
              effect: {
                op: "do",
                action: {
                  kind:
                    zone === "hq"
                      ? ("install_hq_card_ignore_costs" as const)
                      : ("install_archives_card_ignore_costs" as const),
                  cardId,
                  serverId: "__new_remote__",
                },
              },
            });
          }
        }
      };
      addInstallable("hq", [...state.corp.hand]);
      addInstallable("archives", [...state.corp.discard]);
      if (options.length === 1) {
        log(state, `Team Sponsorship — no installable card in HQ/Archives.`);
        return { ok: true };
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `Team Sponsorship — may install from HQ or Archives ignoring install cost.`,
      );
      return { ok: true };
    }

    case "worlds_plaza_install_asset_from_hq_rez_discount": {
      const discount = action.discount ?? 2;
      const max = source.maxHostedCards ?? 3;
      const have = source.hostedCardIds?.length ?? 0;
      if (have >= max) {
        log(state, `Worlds Plaza — host capacity full.`);
        return { ok: true };
      }
      const assets = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "asset",
      );
      if (assets.length === 0) {
        log(state, `Worlds Plaza — no asset in HQ.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: assets.map((cardId) => ({
          id: `wp:${cardId}`,
          label: `Install and rez ${state.cards[cardId]!.title} (−${discount}¢)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "uot_worlds_plaza_resolve" as const,
              cardId,
              discount,
            },
          },
        })),
      };
      return { ok: true };
    }

    case "uot_worlds_plaza_resolve": {
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
      card.hostId = sourceId;
      card.zone = `hosted:${sourceId}`;
      card.faceup = true;
      card.rezzed = true;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(cardId);
      syncAllTourGuideSubs(state);
      log(
        state,
        `Worlds Plaza — install and rez ${card.title} for ${cost}¢ (−${discount}).`,
      );
      return { ok: true };
    }

    case "expo_grid_gain_if_rezzed_asset_in_root": {
      // Find server hosting this upgrade
      let serverId: ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverId = sid as ServerId;
          break;
        }
      }
      if (!serverId) return { ok: true };
      const root = state.servers[serverId]!.root;
      const hasRezzedAsset = root.some((id) => {
        const c = state.cards[id];
        return c?.rezzed && c.type === "asset";
      });
      if (!hasRezzedAsset) {
        log(state, `Expo Grid — no rezzed asset in this server root.`);
        return { ok: true };
      }
      state.corp.credits += 1;
      log(state, `Expo Grid — gain 1¢ → ${state.corp.credits}¢.`);
      return { ok: true };
    }

    case "search_rd_any_card_to_hq": {
      const deck = [...state.corp.deck];
      if (deck.length === 0) {
        log(state, `${source.title} — R&D empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: deck.map((cardId) => ({
          id: `futurenow:${cardId}`,
          label: `Add ${state.cards[cardId]!.title} to HQ`,
          effect: {
            op: "do" as const,
            action: {
              kind: "search_rd_take_card_to_hq" as const,
              cardId,
            },
          },
        })),
      };
      log(state, `${source.title} — search R&D for a card to add to HQ.`);
      return { ok: true };
    }

    case "uot_chronos_trash_pick": {
      const cardId = action.cardId;
      const remaining = state.turn.uotChronosTrashRemaining ?? 0;
      if (!state.runner.hand.includes(cardId) || remaining <= 0) {
        return { ok: true };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      const card = state.cards[cardId]!;
      card.zone = "runner:heap";
      card.faceup = true;
      state.runner.discard.push(cardId);
      state.turn.uotChronosTrashRemaining = remaining - 1;
      log(state, `Chronos Protocol — trash ${card.title} from grip.`);
      if ((state.turn.uotChronosTrashRemaining ?? 0) <= 0) {
        state.turn.uotChronosTrashRemaining = undefined;
        return { ok: true };
      }
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        state.turn.uotChronosTrashRemaining = undefined;
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId: state.corp.identityId,
        chooser: "corp",
        options: grip.map((id) => ({
          id: `chronos:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "uot_chronos_trash_pick" as const,
              cardId: id,
            },
          },
        })),
      };
      return { ok: true };
    }

    default:
      return null;
  }
}

function offerBookmarkHostChoice(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId]!;
  const remaining = state.turn.uotBookmarkHostRemaining ?? 0;
  if (remaining <= 0 || state.runner.hand.length === 0) {
    state.turn.uotBookmarkHostRemaining = undefined;
    return { ok: true };
  }
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: [
      ...state.runner.hand.map((cardId) => ({
        id: `bookmark-host:${cardId}`,
        label: `Host ${state.cards[cardId]!.title} facedown`,
        effect: {
          op: "do" as const,
          action: {
            kind: "uot_bookmark_host_one" as const,
            cardId,
          },
        },
      })),
      {
        id: "bookmark-done",
        label: "Done hosting",
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
  };
  log(
    state,
    `${source.title} — host from grip (${remaining} remaining capacity).`,
  );
  return { ok: true };
}

export function countRezzedAssetsForTourGuide(
  state: EffectCtx["state"],
): number {
  return countRezzedAssets(state);
}
