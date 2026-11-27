/**
 * Seat visibility policy (standardization S5).
 * What a seat may see for faces, counters, and hosted cards (CR 1.18 / 4.6 / 4.8).
 */
import { consideredAdvancement, gripRevealed } from "./cardDeclarations.js";
import { isInstalled } from "./procedures/uninstall.js";
import type {
  CardInstance,
  GameState,
  PendingAbilityInstance,
  PendingEffectContinuation,
  PublicHostedCardView,
  ReactionWindowFrame,
  Side,
} from "./types.js";

/** Advancement counters hosted on an installed card. Zero stays unset. */
export function openAdvancement(
  state: GameState,
  card: CardInstance,
): number | null {
  const count = consideredAdvancement(state, card);
  return count > 0 ? count : null;
}

/** Credit counters hosted on an installed card (CR 1.9.5a). Zero stays unset. */
export function openHostedCredits(card: {
  hostedCredits?: number;
}): number | null {
  const count = card.hostedCredits ?? 0;
  return count > 0 ? count : null;
}

/**
 * Face of a card in the play area / set-aside for a viewer (CR 4.6.3 / 4.8.6).
 * Location is always open; the face is open when faceup or the viewer controls it.
 */
export function openFace(
  card: CardInstance,
  viewer: Side,
): { title: string | null; type: CardInstance["type"] | null } {
  const faceOpen = card.faceup || card.side === viewer;
  return {
    title: faceOpen ? card.title : null,
    type: faceOpen ? card.type : null,
  };
}

/** True when the viewer may see an ice face (rezzed or Corp). */
export function iceFaceVisible(card: CardInstance, viewer: Side): boolean {
  return card.rezzed || viewer === "corp";
}

/** Hosted-card public rows for a host (CR 4.6.5). */
export function hostedCardViews(
  state: GameState,
  hostId: string,
  viewer: Side,
): PublicHostedCardView[] {
  const host = state.cards[hostId];
  if (!host) return [];
  const out: PublicHostedCardView[] = [];
  for (const hid of host.hostedCardIds ?? []) {
    const card = state.cards[hid];
    if (!card) continue;
    const face = openFace(card, viewer);
    out.push({
      id: hid,
      title: face.title,
      type: face.type,
      faceup: card.faceup,
      side: card.side,
    });
  }
  return out;
}

/**
 * Ids of cards whose face the viewer may not see: cards in the other
 * player's hand, facedown cards in either deck, facedown cards in Archives,
 * unrezzed installed Corp cards, and facedown Runner cards
 * (CR 1.21.1, 4.4.6c).
 */
function idsHiddenFrom(state: GameState, viewer: Side): string[] {
  const other = viewer === "corp" ? state.runner : state.corp;
  const otherHand = new Set(other.hand);
  const decks = new Set([...state.corp.deck, ...state.runner.deck]);
  const handOpen = viewer === "corp" && gripRevealed(state);
  const hidden: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.type === "identity") continue;
    // The player looking at a card sees it, whoever owns it (CR 1.21.2).
    if (card.lookedBy === viewer) continue;
    // A card in a deck is neither faceup nor facedown: neither player sees
    // it, its owner included (CR 1.21.1a).
    if (decks.has(card.id)) {
      hidden.push(card.id);
      continue;
    }
    // A card taken from a deck while an ability resolves is seen by the
    // player looking at it, or by both when it is revealed (CR 1.21.6).
    if (takenFromDeck(state, card)) {
      if (card.lookedBy || !card.faceup) hidden.push(card.id);
      continue;
    }
    if (card.side === viewer) continue;
    if (otherHand.has(card.id)) {
      if (!handOpen) hidden.push(card.id);
      continue;
    }
    if (!(card.faceup || card.rezzed)) hidden.push(card.id);
  }
  return hidden;
}

/**
 * True for a card whose zone is still a deck but which is not in it: an
 * ability took it to look at, reveal, or set aside while it resolves.
 */
function takenFromDeck(state: GameState, card: CardInstance): boolean {
  if (card.zone !== "corp:rd" && card.zone !== "runner:stack") return false;
  const player = card.zone === "corp:rd" ? state.corp : state.runner;
  return !player.deck.includes(card.id);
}

/** Every string inside an effect tree: the card ids it can name. */
export function stringsIn(value: unknown, out: Set<string>): void {
  if (typeof value === "string") out.add(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, out);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) stringsIn(item, out);
  }
}

/**
 * `idsHiddenFrom` less the cards this viewer sees for now: the card the
 * Runner is accessing (CR 7.1.2) and a card being revealed (CR 1.21.3,
 * 1.21.6).
 */
function idsHiddenNow(state: GameState, viewer: Side): Set<string> {
  const hidden = new Set(idsHiddenFrom(state, viewer));
  for (const id of [...hidden]) {
    if (state.cards[id]?.revealing) hidden.delete(id);
  }
  const accessing = state.run?.accessingCardId;
  if (viewer === "runner" && accessing) hidden.delete(accessing);
  return hidden;
}

/**
 * True when the viewer may not see `sourceId`'s face, so may not learn that
 * one of its abilities is pending or resolving (CR 10.2.2a, 10.2.2b).
 */
function sourceHiddenFrom(
  state: GameState,
  viewer: Side,
  sourceId: string,
  hidden: ReadonlySet<string> = idsHiddenNow(state, viewer),
): boolean {
  return hidden.has(sourceId);
}

/**
 * The other player's pending ability instances from cards the viewer may not
 * see (CR 10.2.2a). `hiddenCard` ones come from a card in HQ, R&D, Archives,
 * the grip or the stack: the viewer sees nothing of that card, so knowing
 * the instance is there would tell them what the card is (Subliminal
 * Messaging facedown in Archives). `hiddenFace` ones come from an installed
 * (or hosted) card the viewer sees facedown: where it is is open, what it
 * is is not, so the instance stays without its ability or payload.
 */
function pendingHiddenFrom(
  state: GameState,
  viewer: Side,
  hidden: ReadonlySet<string> = idsHiddenNow(state, viewer),
): { hiddenCard: Set<string>; hiddenFace: Set<string> } {
  const hiddenCard = new Set<string>();
  const hiddenFace = new Set<string>();
  for (const instance of state.pendingAbilities) {
    if (instance.controller === viewer) continue;
    if (!sourceHiddenFrom(state, viewer, instance.sourceId, hidden)) continue;
    if (inPlayLocation(state, instance.sourceId)) hiddenFace.add(instance.id);
    else hiddenCard.add(instance.id);
  }
  return { hiddenCard, hiddenFace };
}

/**
 * Ids an option may not name to the viewer: the cards it may not see and
 * the other player's pending instances from them (CR 10.2.2a). An option
 * that triggers one of those instances (CR 9.2.8d) is shown without its
 * label.
 */
export function secretIdsFrom(state: GameState, viewer: Side): string[] {
  const hidden = idsHiddenFrom(state, viewer);
  const { hiddenCard, hiddenFace } = pendingHiddenFrom(state, viewer);
  return [...hidden, ...hiddenCard, ...hiddenFace];
}

/** A server's name as both players read it. */
export function serverName(serverId: string): string {
  if (serverId === "hq") return "HQ";
  if (serverId === "rd") return "R&D";
  if (serverId === "archives") return "Archives";
  return serverId.replace(/^remote-/, "Remote ");
}

/**
 * How a choice label names a card to `viewer`: its title when the viewer
 * may see its face, otherwise only where it is, which is open information
 * (CR 4.6.3, 10.2.2a, 10.2.3a). An unrezzed ice is named by the server it
 * protects and its position from the outermost (CR 4.6.9a), a facedown card
 * in a root by its server, a facedown hosted card by its host, and a card in
 * R&D by its place from the top (CR 4.2.3). The chooser's own cards keep their titles
 * (CR 1.21.2a), so a Corp choice over its facedown cards still names them.
 */
export function openCardName(
  state: GameState,
  cardId: string,
  viewer: Side,
): string {
  const card = state.cards[cardId];
  if (!card) return "a card";
  const hidden = idsHiddenNow(state, viewer);
  if (!hidden.has(cardId)) return card.title;
  for (const [sid, server] of Object.entries(state.servers)) {
    const position = server.ice.indexOf(cardId);
    if (position >= 0) {
      return `the unrezzed ice protecting ${serverName(sid)}, position ${position + 1} from the outermost`;
    }
    if (server.root.includes(cardId)) {
      const facedown = server.root.filter((id) => hidden.has(id));
      const where = `in the root of ${serverName(sid)}`;
      return facedown.length > 1
        ? `facedown card ${facedown.indexOf(cardId) + 1} ${where}`
        : `the facedown card ${where}`;
    }
  }
  const host = card.hostId ? state.cards[card.hostId] : undefined;
  if (host) {
    const facedown = (host.hostedCardIds ?? []).filter((id) => hidden.has(id));
    const on = `hosted on ${openCardName(state, host.id, viewer)}`;
    return facedown.length > 1
      ? `facedown card ${facedown.indexOf(cardId) + 1} ${on}`
      : `a facedown card ${on}`;
  }
  const fromTop = state.corp.deck.indexOf(cardId);
  if (fromTop >= 0) return `the card ${fromTop + 1} from the top of R&D`;
  return "a hidden card";
}

/**
 * True for an installed card or a card hosted on one: where it is is open
 * information even when its face is not (CR 4.6.5, 10.2.3a).
 */
function inPlayLocation(state: GameState, cardId: string): boolean {
  let id: string | undefined = cardId;
  for (let depth = 0; id && depth < 8; depth++) {
    if (isInstalled(state, id)) return true;
    const child: string = id;
    id = Object.values(state.cards).find((card) =>
      card.hostedCardIds?.includes(child),
    )?.id;
  }
  return false;
}

/** True when `value` names a card or pending instance in `secret`. */
function names(value: unknown, secret: ReadonlySet<string>): boolean {
  const named = new Set<string>();
  stringsIn(value, named);
  return [...named].some((item) => secret.has(item));
}

/**
 * True when the open choice is the other player's and may not be shown to
 * the viewer at all: its source is facedown in Archives (a facedown
 * Subliminal Messaging's offer, decided 2026-11-21), or it orders pending
 * abilities and one comes from a card the viewer sees nothing of
 * (CR 9.2.8d). Seeing that the other player is asked would tell the viewer
 * the card is there (CR 10.2.2a, 10.2.2b). Other choices stay in view:
 * open information cannot be hidden from an opponent (CR 10.2.3a, 10.2.3b).
 * They include one from an installed card, such as its rez cost, and one
 * from a card being played or installed from HQ or the grip, such as
 * which program to trash for memory.
 */
export function choiceHiddenFrom(state: GameState, viewer: Side): boolean {
  const choice = state.pendingChoice;
  if (!choice || choice.chooser === viewer || choice.shownToOpponent) {
    return false;
  }
  const hidden = idsHiddenNow(state, viewer);
  if (
    sourceHiddenFrom(state, viewer, choice.sourceId, hidden) &&
    state.corp.discardPile.includes(choice.sourceId)
  ) {
    return true;
  }
  const { hiddenCard } = pendingHiddenFrom(state, viewer, hidden);
  return (
    hiddenCard.size > 0 &&
    choice.options.some((option) => names(option.effect, hiddenCard))
  );
}

/**
 * What a seat sees of pending abilities, the reaction windows that hold
 * them, and an effect's held-over remainder (CR 9.6.2, 9.2.8a, 10.2.2a).
 * The other player's instance from a card this seat sees nothing of is
 * left out, with its id in the windows; from a facedown installed card it
 * stays without its ability or payload. A payload or a held-over effect
 * that names a card this seat may not see is left out too. Area 4 extends this
 * one filter for the other payloads.
 */
export function seatPendingView(
  state: GameState,
  viewer: Side,
): {
  pendingAbilities: PendingAbilityInstance[];
  reactionStack: ReactionWindowFrame[];
  pendingEffectContinuation: PendingEffectContinuation | null;
} {
  const hidden = idsHiddenNow(state, viewer);
  const { hiddenCard, hiddenFace } = pendingHiddenFrom(state, viewer, hidden);
  // Where an installed card is is open even when its face is not
  // (CR 10.2.3a), so a payload may name it.
  const unnamed = new Set(
    [...hidden].filter((id) => !inPlayLocation(state, id)),
  );
  const pendingAbilities = state.pendingAbilities
    .filter((instance) => !hiddenCard.has(instance.id))
    .map((instance) => {
      const copy = structuredClone(instance);
      if (hiddenFace.has(copy.id)) copy.abilityKey = "hidden";
      if (
        copy.payload &&
        (hiddenFace.has(copy.id) || names(copy.payload, unnamed))
      ) {
        delete copy.payload;
      }
      return copy;
    });
  // A window opened only for instances this seat may not know of is left
  // out too (CR 9.2.8, 10.2.2a).
  const reactionStack = state.reactionStack.flatMap((frame) => {
    const ids = frame.pendingInstanceIds.filter((id) => !hiddenCard.has(id));
    if (ids.length === 0 && frame.pendingInstanceIds.length > 0) return [];
    return [{ ...structuredClone(frame), pendingInstanceIds: ids }];
  });
  const segment = (
    held: PendingEffectContinuation | undefined | null,
  ): PendingEffectContinuation | null => {
    if (!held) return null;
    const rest = segment(held.followedBy);
    const controller = held.payerSide ?? state.cards[held.sourceId]?.side;
    if (
      controller !== viewer &&
      sourceHiddenFrom(state, viewer, held.sourceId, hidden)
    ) {
      return rest;
    }
    const copy = structuredClone(held);
    delete copy.followedBy;
    if (names(copy.effects, unnamed)) copy.effects = [];
    return rest ? { ...copy, followedBy: rest } : copy;
  };
  return {
    pendingAbilities,
    reactionStack,
    pendingEffectContinuation: segment(state.pendingEffectContinuation),
  };
}
