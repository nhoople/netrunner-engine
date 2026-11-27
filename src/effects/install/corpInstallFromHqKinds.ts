/**
 * Primitive kinds for Corp installs from HQ. The kind registry
 * (`applyCoreKinds`) dispatches here.
 */
import { openCardName } from "../../state/visibility/seatVisibility.js";
import { iceInstallCapRefuses } from "../../state/cardFlags/staticFlags.js";
import {
  type EffectCtx,
  type EvalResult,
  evalEffect,
  applyPrimitive,
  fireOnInstall,
} from "../eval.js";
import { museZoneCards } from "./installChoices.js";
import { type Effect } from "../ir/effect.js";
import { type Primitive } from "../ir/primitive.js";
import { fx } from "../ir/fx.js";
import { occurCheckpoint } from "../../legality/checkpoints.js";
import {
  corpInstallCost,
  payInstallCost,
} from "../../state/keywordsAndCredits/costs.js";
import {
  creditsAvailableForInstall,
  subtractRunnerCreditPool,
} from "../../state/keywordsAndCredits/runnerCredits.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { noteInstalledThisTurn } from "../../state/install/programHardwareInstall.js";
import { CR } from "../../timing/labels.js";
import { corpCardInstallable } from "./corpInstall.js";
import { shuffleRunnerStack } from "./runnerInstall.js";
import { trashCard, controllerOf } from "../../state/hostingAndTrash/trash.js";
import { applyInstallCorpCard } from "./corpAbilityInstall.js";
import type { ServerId } from "../../state/types/servers.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { addOutermostIce } from "../../state/uninstallAndPosition/runPosition.js";
import { shuffleInPlace } from "../../state/rng.js";
import { applyCorpInstallFromArchivesAndRdKinds } from "./corpInstallFromArchivesAndRdKinds.js";
import { applyRunnerHandAndDeckTrashKinds } from "../hostingAndTrash/runnerHandAndDeckTrashKinds.js";

function nextRemoteId(state: EffectCtx["state"]): ServerId {
  let n = 1;
  while (state.servers[`remote${n}` as ServerId]) n += 1;
  return `remote${n}` as ServerId;
}

export function applyCorpInstallFromHqKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "install_any_number_from_hq_ignore_costs": {
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "done-hq-install",
          label: "Done",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-any:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "seq",
                effects: [
                  {
                    op: "do",
                    action: {
                      kind: "install_hq_card_ignore_costs",
                      cardId,
                      serverId: server.id,
                    },
                  },
                  {
                    op: "do",
                    action: { kind: "install_any_number_from_hq_ignore_costs" },
                  },
                ],
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `hq-any:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "seq",
                effects: [
                  {
                    op: "do",
                    action: {
                      kind: "install_hq_card_ignore_costs",
                      cardId,
                      serverId: server.id,
                    },
                  },
                  {
                    op: "do",
                    action: { kind: "install_any_number_from_hq_ignore_costs" },
                  },
                ],
              },
            });
          }
          options.push({
            id: `hq-any:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "seq",
              effects: [
                {
                  op: "do",
                  action: {
                    kind: "install_hq_card_ignore_costs",
                    cardId,
                    serverId: "__new_remote__",
                  },
                },
                {
                  op: "do",
                  action: { kind: "install_any_number_from_hq_ignore_costs" },
                },
              ],
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `Install any number from HQ ignoring all costs (${installable.length} installable).`,
      });
      return { ok: true };
    }

    case "install_caissa_from_zone_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "program") return { ok: true };
      if (state.runner.hand.includes(cardId)) {
        state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      } else if (state.runner.discardPile.includes(cardId)) {
        state.runner.discardPile = state.runner.discardPile.filter(
          (id) => id !== cardId,
        );
      } else return { ok: true };
      card.zone = "runner:installed";
      state.runner.installed.push(cardId);
      log(state, `Install ${card.title} ignoring all costs.`);
      return { ok: true };
    }

    case "install_corp_card": {
      return applyInstallCorpCard(ctx, action, evalEffect);
    }

    case "install_from_runner_score": {
      const x = state.turn.ipEnforcementTagsRemoved ?? 0;
      const candidates = state.runner.scoreArea.filter((id) => {
        const c = state.cards[id];
        return c?.type === "agenda" && (c.agendaPoints ?? 0) === x;
      });
      if (candidates.length === 0) {
        log(
          state,
          `IP Enforcement — no agenda in Runner score area with ${x} agenda point(s).`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: candidates.map((cardId) => ({
          id: cardId,
          label: `Install ${state.cards[cardId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_runner_score_agenda_on_remote" as const,
              cardId,
              placeAdvancementIfRunnerTagged: true,
            },
          },
        })),
        logLine: `IP Enforcement — install agenda (${x} point(s)) from Runner score.`,
      });
      return { ok: true };
    }

    case "install_up_to_from_hq_paying_costs": {
      return applyPrimitive(ctx, {
        kind: "install_up_to_from_hq_paying_costs_continue",
        remaining: Math.max(0, action.max),
      });
    }

    case "install_up_to_from_hq_paying_costs_continue": {
      let remaining = Math.max(0, action.remaining);
      if (action.justInstalledId && action.serverId) {
        const id = action.justInstalledId;
        const card = state.cards[id];
        if (card && state.corp.hand.includes(id)) {
          let serverId: import("../../state/types/servers.js").ServerId;
          if (action.serverId === "__new_remote__") {
            const remoteNum = state.nextRemoteNumber++;
            serverId =
              `remote-${remoteNum}` as import("../../state/types/servers.js").ServerId;
            state.servers[serverId] = {
              id: serverId,
              kind: "remote",
              ice: [],
              root: [],
            };
            log(state, `Create ${serverId} for HQ install.`);
          } else {
            serverId =
              action.serverId as import("../../state/types/servers.js").ServerId;
          }
          const dest = state.servers[serverId];
          if (dest) {
            const asIce = Boolean(action.asIce) || card.type === "ice";
            const cost = corpInstallCost(card, asIce ? dest.ice.length : 0);
            if (iceInstallCapRefuses(state, card)) {
              // Not installed; the cap is already logged.
            } else if (creditsAvailableForInstall(state, "corp") < cost) {
              log(state, `Install from HQ — cannot afford ${cost}¢.`);
            } else {
              payInstallCost(state, "corp", cost, undefined, serverId);
              state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
              if (asIce) {
                dest.ice.unshift(id);
                card.zone = `server:${serverId}:ice`;
              } else {
                dest.root.push(id);
                card.zone = `server:${serverId}:root`;
              }
              card.rezzed = false;
              card.faceup = false;
              if (card.type === "agenda" || card.type === "asset") {
                card.advancementCounters = card.advancementCounters ?? 0;
              }
              noteInstalledThisTurn(state, id);
              state.turn.corpInstalledFromHqThisTurn = true;
              remaining = Math.max(0, remaining - 1);
              log(
                state,
                `Install ${card.title} from HQ on ${serverId} for ${cost}¢ (${remaining} remaining).`,
              );
              fireOnInstall(state, id);
              if (remaining > 0 && !state.pendingChoice) {
                occurCheckpoint(
                  state,
                  "instruction",
                  "Between instructions",
                  [CR.resolveAbility],
                  sourceId,
                );
              }
            }
          }
        }
      }
      if (remaining <= 0 || state.pendingChoice) return { ok: true };
      const installable = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        if (t !== "agenda" && t !== "asset" && t !== "upgrade" && t !== "ice") {
          return false;
        }
        return (
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0)
        );
      });
      if (installable.length === 0) {
        log(state, `${source.title} — no affordable HQ cards to install.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "done-hq-installs",
          label: "Done",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const cost = corpInstallCost(card, 0);
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            const iceCost = corpInstallCost(card, server.ice.length);
            if (creditsAvailableForInstall(state, "corp") < iceCost) continue;
            options.push({
              id: `hq-ice:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id} (${iceCost}¢)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_up_to_from_hq_paying_costs_continue" as const,
                  remaining,
                  justInstalledId: cardId,
                  serverId: server.id,
                  asIce: true,
                },
              },
            });
          }
          options.push({
            id: `hq-ice:${cardId}:new`,
            label: `Install ${card.title} protecting a new remote (${cost}¢)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_up_to_from_hq_paying_costs_continue" as const,
                remaining,
                justInstalledId: cardId,
                serverId: "__new_remote__",
                asIce: true,
              },
            },
          });
        } else if (card.type === "upgrade") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-up:${cardId}:${server.id}`,
              label: `Install ${card.title} in ${server.id} root (${cost}¢)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_up_to_from_hq_paying_costs_continue" as const,
                  remaining,
                  justInstalledId: cardId,
                  serverId: server.id,
                  asIce: false,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            options.push({
              id: `hq-root:${cardId}:${server.id}`,
              label: `Install ${card.title} in ${server.id} root (${cost}¢)`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "install_up_to_from_hq_paying_costs_continue" as const,
                  remaining,
                  justInstalledId: cardId,
                  serverId: server.id,
                  asIce: false,
                },
              },
            });
          }
          options.push({
            id: `hq-root:${cardId}:new`,
            label: `Install ${card.title} in a new remote (${cost}¢)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_up_to_from_hq_paying_costs_continue" as const,
                remaining,
                justInstalledId: cardId,
                serverId: "__new_remote__",
                asIce: false,
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source.title} — install up to ${remaining} more from HQ paying costs.`,
      });
      return { ok: true };
    }

    case "install_haas_pet_project_continue": {
      let remaining = Math.max(0, action.remaining);
      const serverId =
        action.serverId as import("../../state/types/servers.js").ServerId;
      const dest = state.servers[serverId];
      if (!dest || dest.kind !== "remote") {
        log(state, `Pet Project install — invalid remote ${serverId}.`);
        return { ok: true };
      }
      if (action.justInstalledId) {
        const id = action.justInstalledId;
        const card = state.cards[id];
        const fromZone =
          action.justInstalledFrom === "archives"
            ? state.corp.discardPile
            : state.corp.hand;
        if (card && fromZone.includes(id)) {
          if (action.justInstalledFrom === "archives") {
            state.corp.discardPile = state.corp.discardPile.filter(
              (cid) => cid !== id,
            );
          } else {
            state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
          }
          if (action.asIce || card.type === "ice") {
            dest.ice.unshift(id);
            card.zone = `server:${serverId}:ice`;
          } else {
            dest.root.push(id);
            card.zone = `server:${serverId}:root`;
          }
          card.rezzed = false;
          card.faceup = false;
          noteInstalledThisTurn(state, id);
          remaining = Math.max(0, remaining - 1);
          log(
            state,
            `Install ${card.title} from ${action.justInstalledFrom === "archives" ? "Archives" : "HQ"} on ${serverId}, ignoring all costs (${remaining} remaining).`,
          );
          fireOnInstall(state, id);
        }
      }
      if (remaining <= 0) return { ok: true };
      const hqCandidates = state.corp.hand.filter((id) =>
        ["agenda", "asset", "upgrade", "ice"].includes(
          state.cards[id]?.type ?? "",
        ),
      );
      const archiveEligible = state.corp.discardPile.filter((id) =>
        ["agenda", "asset", "upgrade", "ice"].includes(
          state.cards[id]?.type ?? "",
        ),
      );
      if (hqCandidates.length === 0 && archiveEligible.length === 0) {
        log(state, `${source.title} — no more eligible cards in HQ/Archives.`);
        return { ok: true };
      }
      const buildOption = (id: string, from: "hq" | "archives") => {
        const card = state.cards[id]!;
        const asIce = card.type === "ice";
        return {
          id: `haas-${from}:${id}`,
          label: `Install ${card.title} from ${from === "hq" ? "HQ" : "Archives"} (ignore costs)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "install_haas_pet_project_continue" as const,
              remaining,
              serverId,
              justInstalledId: id,
              justInstalledFrom: from,
              asIce,
            },
          },
        };
      };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-haas-pet-project",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...hqCandidates.map((id) => buildOption(id, "hq")),
          ...archiveEligible.map((id) => buildOption(id, "archives")),
        ],
        logLine: `${source.title} — install up to ${remaining} more from HQ/Archives into ${serverId}.`,
      });
      return { ok: true };
    }

    case "may_install_from_hq_paying_costs":
    case "install_from_hq_paying_costs": {
      // "Install a card from HQ" with no "may" (Advanced Assembly Lines)
      // offers no Decline once the ability resolves (CR 1.2.1, 1.15.2e).
      const optional = action.kind === "may_install_from_hq_paying_costs";
      const eligible = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        if (action.excludeAgenda && t === "agenda") return false;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      const affordable = eligible.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0),
      );
      if (affordable.length === 0) {
        log(
          state,
          `Install from HQ paying costs — no eligible affordable card.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        // How many HQ cards can be installed is hidden (CR 10.2.2a).
        hiddenFromOpponent: true,
        optionCountHidden: true,
        options: [
          ...(optional
            ? [
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
              ]
            : []),
          ...affordable.map((id) => ({
            id: `hq-install:${id}`,
            label: `Install ${state.cards[id].title} for ${corpInstallCost(state.cards[id]!, 0)}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hq_card_paying_costs" as const,
                cardId: id,
                ...(optional && action.thenMayRemoveTagToAdvance
                  ? { thenMayRemoveTagToAdvance: true }
                  : {}),
                ...(optional && action.cannotScoreInstalledCardThisTurn
                  ? { cannotScoreInstalledCardThisTurn: true }
                  : {}),
              },
            },
          })),
        ],
        logLine: optional
          ? `May install one card from HQ paying install costs.`
          : `Install one card from HQ paying install costs.`,
      });
      return { ok: true };
    }

    case "may_install_from_hq_in_remote_root_paying_costs": {
      const hqCards = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "agenda" || t === "asset" || t === "upgrade";
      });
      const affordable = hqCards.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0),
      );
      if (affordable.length === 0) {
        log(state, `May install from HQ in remote root — none affordable.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline install",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...affordable.map((id) => ({
            id: `drm-install:${id}`,
            label: `Install ${state.cards[id]!.title} in a new remote root for ${corpInstallCost(state.cards[id]!, 0)}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hq_card_paying_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
        logLine: `May install 1 card from HQ in the root of a remote server paying costs.`,
      });
      return { ok: true };
    }

    case "may_install_from_hq_on_other_remote_ignore_costs": {
      const trigger = state.turn.triggerRemoteInstallServerId;
      const remotes = Object.values(state.servers).filter(
        (s) => s.kind === "remote" && s.id !== trigger,
      );
      const hqCards = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      if (remotes.length === 0 || hqCards.length === 0) {
        log(state, `HQ chain install — no other remote or no HQ cards.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of hqCards) {
        for (const remote of remotes) {
          options.push({
            id: `teia:${cardId}:${remote.id}`,
            label: `Install ${state.cards[cardId].title} on ${remote.id} (ignore costs)`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_on_remote_ignore_costs",
                cardId,
                serverId: remote.id,
                cannotScoreInstalledCardThisTurn:
                  action.cannotScoreInstalledCardThisTurn,
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `May install from HQ on another remote ignoring costs.`,
      });
      return { ok: true };
    }

    case "install_hq_on_remote_ignore_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const destId =
        action.serverId as import("../../state/types/servers.js").ServerId;
      const dest = state.servers[destId];
      if (!card || !dest || dest.kind !== "remote") {
        log(state, `HQ remote install — invalid target.`);
        return { ok: true };
      }
      if (!state.corp.hand.includes(cardId)) {
        log(state, `HQ remote install — card not in HQ.`);
        return { ok: true };
      }
      if (destId === state.turn.triggerRemoteInstallServerId) {
        log(state, `HQ remote install — must be another remote.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      if (card.type === "ice") {
        dest.ice.unshift(cardId);
        card.zone = `server:${destId}:ice`;
      } else {
        dest.root.push(cardId);
        card.zone = `server:${destId}:root`;
      }
      card.rezzed = false;
      card.faceup = false;
      if (card.type === "agenda" || card.type === "asset") {
        card.advancementCounters = card.advancementCounters ?? 0;
      }
      noteInstalledThisTurn(state, cardId);
      if (action.cannotScoreInstalledCardThisTurn) {
        if (!state.turn.cannotScoreOrRezCardIds.includes(cardId)) {
          state.turn.cannotScoreOrRezCardIds.push(cardId);
        }
      }
      log(
        state,
        `Install ${card.title} on ${destId} from HQ ignoring all costs.`,
      );
      fireOnInstall(state, cardId);
      return { ok: true };
    }

    case "may_install_from_hq_ignore_costs": {
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      if (installable.length === 0) {
        log(state, `Install from HQ — no installable card.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
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
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
          options.push({
            id: `hq-install:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_card_ignore_costs",
                cardId,
                serverId: "__new_remote__",
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `May install from HQ ignoring all costs.`,
      });
      return { ok: true };
    }

    case "may_install_from_hq_ignore_costs_exclude_source_server": {
      const excludeServerId = state.turn.onTrashSourceServerId;
      const installable = state.corp.hand.filter((id) =>
        corpCardInstallable(state.cards[id]?.type ?? ""),
      );
      if (installable.length === 0) {
        log(
          state,
          `Install from HQ (exclude source server root) — no installable card.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-hq-install",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
        } else {
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            if (excludeServerId && server.id === excludeServerId) continue;
            options.push({
              id: `hq-install:${cardId}:${server.id}`,
              label: `Install ${card.title} on ${server.id}`,
              effect: {
                op: "do",
                action: {
                  kind: "install_hq_card_ignore_costs",
                  cardId,
                  serverId: server.id,
                },
              },
            });
          }
          options.push({
            id: `hq-install:${cardId}:new`,
            label: `Install ${card.title} on new remote`,
            effect: {
              op: "do",
              action: {
                kind: "install_hq_card_ignore_costs",
                cardId,
                serverId: "__new_remote__",
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `May install from HQ ignoring all costs (cannot install in root of ${excludeServerId ?? "source server"}).`,
      });
      return { ok: true };
    }

    case "install_continue": {
      let remaining = Math.max(0, action.remaining);
      let serverId = action.serverId;
      if (serverId === "__new_remote__" && !action.justInstalledId) {
        const remoteNum = state.nextRemoteNumber++;
        const sid =
          `remote-${remoteNum}` as import("../../state/types/servers.js").ServerId;
        serverId = sid;
        state.servers[sid] = {
          id: sid,
          kind: "remote",
          ice: [],
          root: [],
        };
        log(state, `Create ${sid} for Fast Break installs.`);
      }
      if (action.justInstalledId) {
        const id = action.justInstalledId;
        const card = state.cards[id];
        if (card && state.corp.hand.includes(id)) {
          const dest =
            state.servers[
              serverId as import("../../state/types/servers.js").ServerId
            ];
          if (dest) {
            const asIce = Boolean(action.asIce) || card.type === "ice";
            const cost = corpInstallCost(card, asIce ? dest.ice.length : 0);
            if (creditsAvailableForInstall(state, "corp") >= cost) {
              payInstallCost(
                state,
                "corp",
                cost,
                undefined,
                serverId as import("../../state/types/servers.js").ServerId,
              );
              state.corp.hand = state.corp.hand.filter((cid) => cid !== id);
              if (asIce) {
                dest.ice.unshift(id);
                card.zone = `server:${serverId}:ice`;
              } else {
                dest.root.push(id);
                card.zone = `server:${serverId}:root`;
              }
              card.rezzed = false;
              card.faceup = false;
              if (card.type === "agenda" || card.type === "asset") {
                card.advancementCounters = card.advancementCounters ?? 0;
              }
              noteInstalledThisTurn(state, id);
              state.turn.corpInstalledFromHqThisTurn = true;
              remaining = Math.max(0, remaining - 1);
              log(
                state,
                `Install ${card.title} from HQ on ${serverId} for ${cost}¢ (${remaining} remaining).`,
              );
              fireOnInstall(state, id);
            }
          }
        }
      }
      if (remaining <= 0) return { ok: true };
      const dest =
        state.servers[
          serverId as import("../../state/types/servers.js").ServerId
        ];
      if (!dest || dest.kind !== "remote") {
        log(state, `Fast Break install — invalid remote ${serverId}.`);
        return { ok: true };
      }
      const rootCards = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        if (t !== "agenda" && t !== "asset" && t !== "upgrade") return false;
        return (
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0)
        );
      });
      const iceCost = corpInstallCost({ type: "ice" }, dest.ice.length);
      const iceCards = state.corp.hand.filter((id) => {
        if (state.cards[id]?.type !== "ice") return false;
        return creditsAvailableForInstall(state, "corp") >= iceCost;
      });
      if (rootCards.length === 0 && iceCards.length === 0) {
        log(state, `Fast Break — no more affordable HQ cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-fb-install",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...rootCards.map((id) => ({
            id: `fb-root:${id}`,
            label: `Install ${state.cards[id]!.title} in root for ${corpInstallCost(state.cards[id]!, 0)}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_continue" as const,
                remaining,
                serverId,
                justInstalledId: id,
                asIce: false,
              },
            },
          })),
          ...iceCards.map((id) => ({
            id: `fb-ice:${id}`,
            label: `Install ${state.cards[id]!.title} protecting for ${iceCost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_continue" as const,
                remaining,
                serverId,
                justInstalledId: id,
                asIce: true,
              },
            },
          })),
        ],
        logLine: `Fast Break — install up to ${remaining} more into/protecting ${serverId}.`,
      });
      return { ok: true };
    }

    case "install_picked": {
      const card = state.cards[action.cardId];
      if (!card || !museZoneCards(state, action.from).includes(action.cardId)) {
        log(state, `Muse — picked card missing.`);
        if (action.from === "stack") shuffleRunnerStack(state);
        return { ok: true };
      }
      const isTrojan =
        (card.subtypes ?? []).includes("trojan") || Boolean(card.installOnIce);
      if (isTrojan) {
        const iceIds: string[] = [];
        for (const server of Object.values(state.servers)) {
          iceIds.push(...server.ice);
        }
        if (iceIds.length === 0) {
          log(state, `Muse — no ice to host trojan ${card.title}.`);
          if (action.from === "stack") shuffleRunnerStack(state);
          return { ok: true };
        }
        if (iceIds.length === 1) {
          return applyPrimitive(ctx, {
            kind: "install_on_ice",
            cardId: action.cardId,
            iceId: iceIds[0]!,
            from: action.from,
          });
        }
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: iceIds.map((iceId) => ({
            id: `muse-ice:${iceId}`,
            label: `Host on ${openCardName(state, iceId, "runner")}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_on_ice" as const,
                cardId: action.cardId,
                iceId,
                from: action.from,
              },
            },
          })),
          logLine: `Muse — choose ice to host ${card.title}.`,
        });
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "install_on_daemon",
        cardId: action.cardId,
        from: action.from,
      });
    }

    case "haas_pet_project_setup": {
      const remaining = Math.max(0, action.remaining);
      if (remaining <= 0) return { ok: true };
      const remoteNum = state.nextRemoteNumber++;
      const sid =
        `remote-${remoteNum}` as import("../../state/types/servers.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      log(state, `${source.title} — create ${sid} for Pet Project installs.`);
      return applyPrimitive(ctx, {
        kind: "install_haas_pet_project_continue",
        remaining,
        serverId: sid,
      });
    }

    case "install_asa_resolve": {
      const card = state.cards[action.cardId];
      const server = state.servers[action.serverId as ServerId];
      if (!card || !server) return { ok: true };
      const handIdx = state.corp.hand.indexOf(action.cardId);
      if (handIdx < 0) return { ok: true };
      if (action.asIce && iceInstallCapRefuses(state, card))
        return { ok: true };
      state.corp.hand.splice(handIdx, 1);
      card.rezzed = false;
      card.faceup = false;
      card.advancementCounters = card.advancementCounters ?? 0;
      if (action.asIce) {
        // Outermost, as the text names no other position (CR 6.2.2a).
        addOutermostIce(state, action.serverId as ServerId, action.cardId);
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
    case "install_resolve": {
      const cardId = action.cardId;
      const lookedIds = action.lookedIds ?? [];
      const discount = action.discount ?? 5;
      const card = state.cards[cardId];
      if (!card || !state.runner.deck.includes(cardId)) {
        log(state, `Frantic Coding — program not in looked cards.`);
        return applyRunnerHandAndDeckTrashKinds(ctx, {
          kind: "trash_frantic_coding_looked",
          lookedIds,
        });
      }
      const cost = Math.max(0, (card.installCost ?? 0) - discount);
      if (state.runner.credits < cost) {
        log(state, `Frantic Coding — cannot afford ${card.title}.`);
        return applyRunnerHandAndDeckTrashKinds(ctx, {
          kind: "trash_frantic_coding_looked",
          lookedIds,
        });
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      log(state, `Frantic Coding — install ${card.title} for ${cost}¢.`);
      const rest = lookedIds.filter((id) => id !== cardId);
      for (const id of rest) {
        if (!state.runner.deck.includes(id)) continue;
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        trashCard(state, id, { by: controllerOf(state, sourceId) });
      }
      if (rest.length > 0) {
        log(
          state,
          `Frantic Coding — trash ${rest.length} other looked card(s).`,
        );
      }
      return { ok: true };
    }

    case "install_rez_advertisement": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const cost = corpInstallCost(card, 0) + (card.rezCost ?? 0);
      if (state.corp.credits >= cost) {
        state.corp.credits -= cost;
        removeCardFromCurrentZone(state, action.cardId);
        const remoteKey = nextRemoteId(state);
        state.servers[remoteKey] = {
          id: remoteKey,
          kind: "remote",
          ice: [],
          root: [],
        };
        state.servers[remoteKey]!.root.push(action.cardId);
        card.zone = `server:${remoteKey}:root`;
        card.rezzed = true;
        card.faceup = true;
        log(state, `Ad Blitz — install and rez ${card.title}.`);
      } else {
        log(state, `Cannot afford install+rez ${card.title}.`);
      }
      if (action.remaining > 0) {
        state.turn.lastPlayCostX = action.remaining;
        return applyCorpInstallFromArchivesAndRdKinds(ctx, {
          kind: "install_and_rez_x_advertisements_from_hq_or_archives",
        });
      }
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
      openPendingChoose(state, {
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
      });
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

    case "win_remote_enforcement": {
      const ice = state.corp.deck.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (ice.length === 0) {
        log(state, `Remote Enforcement — no ice in R&D.`);
        shuffleInPlace(state, state.corp.deck);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ice.map((id) => ({
          id: `re:${id}`,
          label: `Install and rez ${state.cards[id]!.title} protecting a remote`,
          effect: fx.do({ kind: "win_remote_enforcement_pick_ice", iceId: id }),
        })),
      });
      return { ok: true };
    }

    case "install_remote_enforcement": {
      const ice = state.cards[action.iceId];
      if (!ice) return { ok: true };
      let serverId =
        action.serverId as import("../../state/types/servers.js").ServerId;
      if (action.serverId === "new-remote") {
        let n = state.nextRemoteNumber ?? 1;
        while (
          state.servers[
            `remote-${n}` as import("../../state/types/servers.js").ServerId
          ]
        ) {
          n += 1;
        }
        serverId =
          `remote-${n}` as import("../../state/types/servers.js").ServerId;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          root: [],
          ice: [],
        };
        state.nextRemoteNumber = n + 1;
      }
      const server = state.servers[serverId];
      if (!server) {
        shuffleInPlace(state, state.corp.deck);
        return { ok: true };
      }
      const cost = corpInstallCost(ice, server.ice.length);
      if (state.corp.credits < cost) {
        log(state, `Remote Enforcement — cannot pay install cost ${cost}.`);
        shuffleInPlace(state, state.corp.deck);
        return { ok: true };
      }
      state.corp.credits -= cost;
      const idx = state.corp.deck.indexOf(action.iceId);
      if (idx >= 0) state.corp.deck.splice(idx, 1);
      ice.zone = `server:${serverId}:ice`;
      ice.rezzed = true;
      ice.faceup = true;
      // Outermost, as the text names no other position (CR 6.2.2a).
      addOutermostIce(state, serverId, action.iceId);
      shuffleInPlace(state, state.corp.deck);
      log(
        state,
        `Remote Enforcement — install and rez ${ice.title} on ${serverId} (paid ${cost}¢ install, ignored rez).`,
      );
      return { ok: true };
    }

    case "install_from_hq_new_remote": {
      // New Construction: "install 1 card from HQ in the root of a new
      // server". Ice is not installed in the root of a server (CR 3.4.2), so
      // it is not offered.
      const eligible = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "asset" || t === "agenda" || t === "upgrade";
      });
      if (eligible.length === 0) {
        log(state, `New Construction — no installable HQ card.`);
        return { ok: true };
      }
      const adv = source?.advancementCounters ?? 0;
      const rezIgnore = adv >= 5;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: eligible.map((id) => ({
          id: `nc-install:${id}`,
          label: `Install ${state.cards[id]!.title} in new remote${
            rezIgnore ? " (rez ignoring costs)" : ""
          }`,
          effect: fx.do({
            kind: "install_new_construction_resolve",
            cardId: id,
            rezIgnoringCosts: rezIgnore,
          }),
        })),
      });
      return { ok: true };
    }

    case "install_2_from_hq_ignore_costs": {
      return evalEffect(
        ctx,
        fx.do({ kind: "install_from_hq_continue", remaining: 2 }),
      );
    }

    case "install_from_hq_continue": {
      const remaining = action.remaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Replanting — HQ empty.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const cardId of hq) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `ice:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "seq",
                effects: [
                  fx.do({
                    kind: "install_hq_ice_protecting_server_ignore_costs",
                    cardId,
                    serverId: server.id,
                  }),
                  fx.do({
                    kind: "install_from_hq_continue",
                    remaining: remaining - 1,
                  }),
                ],
              },
            });
          }
        } else if (
          card.type === "asset" ||
          card.type === "agenda" ||
          card.type === "upgrade"
        ) {
          options.push({
            id: `root:${cardId}`,
            label: `Install ${card.title} in a new remote`,
            effect: {
              op: "seq",
              effects: [
                fx.do({
                  kind: "install_root_ignore_costs",
                  cardId,
                }),
                fx.do({
                  kind: "install_from_hq_continue",
                  remaining: remaining - 1,
                }),
              ],
            },
          });
        } else {
          // operations etc — skip installables only
        }
      }
      if (options.length === 0) {
        log(state, `Replanting — no installable cards in HQ.`);
        return { ok: true };
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "install_root_ignore_costs": {
      const cardId = action.cardId;
      if (!cardId || !state.corp.hand.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      let n = 1;
      while (state.servers[`remote${n}` as ServerId]) n += 1;
      const serverId = `remote${n}` as ServerId;
      state.servers[serverId] = {
        id: serverId,
        kind: "remote",
        root: [cardId],
        ice: [],
      };
      card.zone = `server:${serverId}:root`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementCounters = card.advancementCounters ?? 0;
      log(
        state,
        `Replanting — install ${card.title} in ${serverId} (ignore costs).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
