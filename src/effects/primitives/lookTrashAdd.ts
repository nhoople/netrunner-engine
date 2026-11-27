import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { GameState, RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { applySansanOhPrimitive } from "./shuffleLookPick.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyMumbadSiPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
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
        action.serverId as import("../../state/types.js").ServerId;
      log(state, `Patron — name ${action.serverId}.`);
      return { ok: true };
    }

    default:
      // Delegate arrange helpers used by Making an Entrance trash→arrange flow.
      if (
        action.kind === "look_top_n_stack_arrange" ||
        action.kind === "pick_stack_arrange"
      ) {
        return applySansanOhPrimitive(ctx, action);
      }
      return null;
  }
}

/** Indian Union Stock Exchange: rez/play out-of-faction → gain credits. */
export function fireSiAfterCorpRezOrPlay(
  state: GameState,
  cardId: string,
): void {
  const played = state.cards[cardId];
  if (!played) return;
  const idFaction = state.cards[state.corp.identityId]?.faction;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const exchange = state.cards[rid];
      if (!exchange?.rezzed) continue;
      const gain = exchange.onRezOrPlayOutOfFactionGainCredits;
      if (typeof gain !== "number") continue;
      const cardFaction = played.faction;
      const isSelf = cardId === rid;
      const isOutOfFaction =
        Boolean(idFaction) && Boolean(cardFaction) && cardFaction !== idFaction;
      if (!isSelf && !isOutOfFaction) continue;
      state.corp.credits += gain;
      log(
        state,
        `${exchange.title} — rez/play ${played.title}: gain ${gain}¢.`,
      );
    }
  }
}

/** Jeeves: first time spend ≥N clicks on same paid ability each turn → gain click. */
export function fireSiAfterPaidAbilityClicks(
  state: GameState,
  clicksSpent: number,
): void {
  if (clicksSpent < 1) return;
  if (state.turn.siJeevesGainClickUsedThisTurn) return;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const jeeves = state.cards[rid];
      if (!jeeves?.rezzed) continue;
      // A blanked Jeeves gives no click (CR 9.1.9a).
      if (abilitiesSuppressed(state, rid)) continue;
      const need = jeeves.gainClickFirstTimeSpendClicksGteOnSameActionEachTurn;
      if (typeof need !== "number" || clicksSpent < need) continue;
      state.corp.clicks += 1;
      state.turn.siJeevesGainClickUsedThisTurn = true;
      log(
        state,
        `${jeeves.title} — spent ${clicksSpent} [click] on one action; gain [click] → ${state.corp.clicks}.`,
      );
      return;
    }
  }
}
