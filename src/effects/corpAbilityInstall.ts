/**
 * An ability has the Corp install a card from HQ, Archives or R&D.
 *
 * The Corp declares the destination (CR 8.5.16b) and may trash cards
 * already there first (CR 8.5.6a, 8.5.6b); the engine does not pick a
 * server for them (CR 1.15.2). The install itself is the same process the
 * basic action uses (CR 8.5.16). An ability that names a destination that
 * cannot be used installs nothing (CR 8.5.14).
 */
import { installCorp, likeCardsAtDestination } from "../actions/installCorp.js";
import { occurCheckpoint } from "../legality/checkpoints.js";
import { fireOnRez } from "../state/cardLifecycleHooks.js";
import { cloneState, log } from "../state/createGame.js";
import { openPendingChoose } from "../state/pendingChoice.js";
import { revealCards } from "../state/reveal.js";
import type { GameState, InstallDestination, ServerId } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { chooseCards } from "./chooseCards.js";
import type { EffectCtx, EvalResult } from "./eval.js";
import type { Effect, Primitive } from "./ir.js";

export type InstallCorpCard = Extract<Primitive, { kind: "install_corp_card" }>;

const NEW_REMOTE = "__new_remote__";

function installable(type: string | undefined): boolean {
  return type === "agenda" || type === "asset" || type === "ice" || type === "upgrade";
}

function destinationFor(
  state: GameState,
  cardId: string,
  serverId: string,
): InstallDestination {
  if (serverId === NEW_REMOTE) return { kind: "new_remote" };
  return state.cards[cardId]?.type === "ice"
    ? { kind: "protect", serverId: serverId as ServerId }
    : { kind: "remote_root", serverId: serverId as ServerId };
}

function serverLabel(serverId: string): string {
  if (serverId === "hq") return "HQ";
  if (serverId === "rd") return "R&D";
  if (serverId === "archives") return "Archives";
  return serverId.replace(/^remote-/, "Remote ");
}

/** Cards in the destination the Corp may trash first but need not. */
function optionalLikeCards(
  state: GameState,
  cardId: string,
  serverId: string,
): string[] {
  if (serverId === NEW_REMOTE) return [];
  const like = likeCardsAtDestination(state, cardId, serverId as ServerId);
  // Any of the ice can go (CR 8.5.6b). The Runner's position is an element
  // of the path (CR 6.2.6), and trashing the ice they are approaching or
  // encountering ends that approach or encounter (CR 8.5.10).
  return like.may.filter((id) => !like.must.includes(id));
}

/**
 * Destinations this install can use, found by trying the install on a
 * copy of the game. `trashFirst` marks a destination that holds cards the
 * Corp may trash first.
 */
export function corpAbilityInstallDestinations(
  state: GameState,
  action: InstallCorpCard,
): Array<{ serverId: string; trashFirst: boolean; needsTrash: boolean }> {
  const card = state.cards[action.cardId];
  if (!card || !installable(card.type)) return [];
  const out: Array<{ serverId: string; trashFirst: boolean; needsTrash: boolean }> = [];
  const works = (serverId: string, trashFirstIds: string[]): boolean => {
    const trial = cloneState(state);
    return installCorp(
      trial,
      action.cardId,
      destinationFor(trial, action.cardId, serverId),
      {
        byAbility: true,
        ignoreInstallCost: action.ignoreInstallCost,
        trashFirstIds,
      },
    ).ok;
  };
  for (const serverId of [NEW_REMOTE, ...Object.keys(state.servers)]) {
    if (serverId === action.excludeServerId) continue;
    const optional = optionalLikeCards(state, action.cardId, serverId);
    const plain = works(serverId, []);
    const withTrash = optional.length > 0 && works(serverId, optional);
    if (!plain && !withTrash) continue;
    out.push({ serverId, trashFirst: withTrash, needsTrash: !plain });
  }
  return out;
}

/** Rez an installed card, ignoring all costs (CR 8.5.15). */
export function rezInstalledIgnoringCosts(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card || !card.zone.startsWith("server:") || card.type === "agenda") return;
  card.rezzed = true;
  card.faceup = true;
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.badPublicityCountersOnRez ?? 0) > 0) {
    card.badPublicityCounters = card.badPublicityCountersOnRez;
  }
  log(state, `Rez ${card.title}, ignoring costs (CR ${CR.installAndRez.number}).`);
  fireOnRez(state, cardId);
}

/**
 * The rez half of "install and rez". An agenda cannot be rezzed, and the
 * Corp need not pay an additional cost to rez (CR 1.16.4c); in both cases
 * the installed card is revealed instead (CR 8.5.13d).
 */
function rezAfterInstall(state: GameState, sourceId: string, cardId: string): void {
  const card = state.cards[cardId];
  if (!card || !card.zone.startsWith("server:")) return;
  if (card.type === "agenda") {
    revealCards(state, [cardId], sourceId, CR.revealForInstallAndRez);
    return;
  }
  const hasAdditionalCost =
    Boolean(card.rezAdditionalCostForfeitAgenda) ||
    Boolean(card.rezAdditionalCostDerezSubtype) ||
    Boolean(card.rezAdditionalCost);
  if (!hasAdditionalCost) {
    rezInstalledIgnoringCosts(state, cardId);
    return;
  }
  const agendas = card.rezAdditionalCostForfeitAgenda
    ? state.corp.scoreArea.filter((id) => !state.cards[id]?.cannotForfeit)
    : [];
  const reveal: Effect = {
    op: "do",
    action: { kind: "reveal_installed_to_verify", cardId, forRez: true },
  };
  if (agendas.length === 0 || state.pendingChoice) {
    // The additional cost is not paid, so the card is not rezzed.
    revealCards(state, [cardId], sourceId, CR.revealForInstallAndRez);
    return;
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: [
      ...agendas.map((agendaId) => ({
        id: `install-rez-forfeit:${agendaId}`,
        label: `Forfeit ${state.cards[agendaId]!.title} to rez ${card.title}`,
        effect: {
          op: "seq" as const,
          effects: [
            {
              op: "do" as const,
              action: { kind: "forfeit_scored_agenda" as const, cardId: agendaId },
            },
            {
              op: "do" as const,
              action: {
                kind: "rez_installed_card_ignoring_costs" as const,
                cardId,
              },
            },
          ],
        },
      })),
      {
        id: "install-rez-decline",
        label: `Do not pay the additional cost to rez ${card.title}`,
        effect: reveal,
      },
    ],
    logLine: `${card.title} has an additional cost to rez; the Corp may decline it (CR ${CR.mustNotForceAdditionalCost.number}).`,
  });
}

/**
 * Resolve `install_corp_card`. Without a server the Corp is asked for the
 * destination; with one, and with any cards to trash first chosen, the
 * card is installed.
 */
export function applyInstallCorpCard(
  ctx: EffectCtx,
  action: InstallCorpCard,
  evalEffect: (ctx: EffectCtx, effect: Effect) => EvalResult,
): EvalResult {
  const { state, sourceId } = ctx;
  const card = state.cards[action.cardId];
  const reachable =
    state.corp.hand.includes(action.cardId) ||
    state.corp.discardPile.includes(action.cardId) ||
    state.corp.deck.includes(action.cardId);
  if (!card || !reachable || !installable(card.type)) {
    log(state, `Install — that card cannot be installed (CR ${CR.installing.number}).`);
    return { ok: true };
  }

  if (!action.serverId) {
    const destinations = corpAbilityInstallDestinations(state, action);
    if (destinations.length === 0) {
      log(
        state,
        `Install — no destination can be used, so nothing is installed (CR ${CR.installInvalidDestination.number}).`,
      );
      return { ok: true };
    }
    const options: Array<{ id: string; label: string; effect: Effect }> = [];
    for (const d of destinations) {
      const where =
        d.serverId === NEW_REMOTE
          ? "A new remote server"
          : card.type === "ice"
            ? `Protecting ${serverLabel(d.serverId)}`
            : `The root of ${serverLabel(d.serverId)}`;
      if (!d.needsTrash) {
        options.push({
          id: `install-dest:${d.serverId}`,
          label: where,
          effect: { op: "do", action: { ...action, serverId: d.serverId } },
        });
      }
      if (d.trashFirst) {
        options.push({
          id: `install-dest-trash:${d.serverId}`,
          label: `${where}, trashing cards there first`,
          effect: {
            op: "do",
            action: { ...action, serverId: d.serverId, trashFirst: true },
          },
        });
      }
    }
    if (options.length === 1) return evalEffect(ctx, options[0]!.effect);
    openPendingChoose(state, {
      sourceId,
      chooser: "corp",
      options,
      prompt: "Choose where to install the card.",
      logLine: `The Corp chooses where to install (CR ${CR.installDestination.number}).`,
    });
    return { ok: true };
  }

  if (action.trashFirst && !action.cardIds) {
    const optional = optionalLikeCards(state, action.cardId, action.serverId);
    if (optional.length > 0) {
      return evalEffect(
        ctx,
        chooseCards({
          chooser: "corp",
          candidates: optional,
          count: optional.length,
          upTo: true,
          purpose: "resume",
          label: "trash before installing",
          resume: { ...action },
        }),
      );
    }
  }

  const attackedRoot =
    state.timing.structure === "breach" &&
    state.run?.attackedServerId === action.serverId &&
    card.type !== "ice";
  const result = installCorp(
    state,
    action.cardId,
    destinationFor(state, action.cardId, action.serverId),
    {
      byAbility: true,
      ignoreInstallCost: action.ignoreInstallCost,
      trashFirstIds: action.cardIds ?? [],
    },
  );
  if (!result.ok) {
    log(state, `Install — ${result.error} Nothing is installed.`);
    return { ok: true };
  }
  state.turn.lastInstalledFromEffectId = action.cardId;
  if (action.rez) rezAfterInstall(state, sourceId, action.cardId);
  if (attackedRoot) {
    log(
      state,
      `A card is installed in the root of the breached server (CR ${CR.checkpointCardEnteringRoot.number}).`,
    );
    // CR 10.3.1j candidates come from the zone diff at 10.3.1a.
    occurCheckpoint(
      state,
      "instruction",
      "Install into a breached root",
      [CR.checkpointCardEnteringRoot],
      sourceId,
    );
  }
  return { ok: true };
}

/**
 * The Corp picks 1 card to install from `candidates`, then its
 * destination. `required` is an instruction without "may".
 */
export function chooseCorpCardToInstall(args: {
  candidates: string[];
  required?: boolean;
  resume: Primitive;
}): Effect {
  return chooseCards({
    chooser: "corp",
    candidates: args.candidates,
    count: 1,
    upTo: !args.required,
    purpose: "resume",
    label: "install",
    resume: args.resume,
  });
}

export function corpInstallableIds(
  state: GameState,
  zones: Array<"hq" | "archives">,
  keep: (cardId: string) => boolean = () => true,
): string[] {
  const ids: string[] = [];
  if (zones.includes("hq")) ids.push(...state.corp.hand);
  if (zones.includes("archives")) ids.push(...state.corp.discardPile);
  return ids.filter((id) => installable(state.cards[id]?.type) && keep(id));
}
