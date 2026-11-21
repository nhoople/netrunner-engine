/**
 * Legality agreement: does the legal-action list (`queryLegality`) offer
 * exactly the moves `applyAction` accepts?
 *
 * The match host takes only listed moves, so a move apply accepts but the
 * list leaves out can never be made at the table (Net Shield's prevention
 * while net damage was pending, CR 9.9.4d), and a listed move apply refuses
 * stalls the table. This module tries every move a position could plausibly
 * take (`probeActions`) against both and reports where they differ.
 *
 * Priority is the one thing the list checks and apply does not: an action
 * carries no actor, so apply cannot tell who sent it. A move refused only
 * because the other player holds priority in a paid ability window
 * (CR 9.2.7a) is not a disagreement. In an interrupt window both players
 * have priority (CR 9.2.9c), so a priority refusal there is one.
 *
 * This module only reports. Nothing in the engine reads it. Tests run it in
 * seeded playouts (`tests/legality-agreement.test.ts`).
 */

import { applyAction } from "../actions/apply.js";
import { pendingStepOpen } from "../legality/candidatePending.js";
import {
  explainAction,
  queryLegality,
  windowRefusal,
} from "../legality/query.js";
import { setApplyHook } from "./applyHook.js";
import type { Action, GameState, ServerId } from "../state/types.js";

/** Stable codes. Baselines key on these, so never rename one. */
type DisagreementCode =
  /** The list offers a move apply refuses. */
  | "LISTED_REFUSED"
  /** Apply accepts a move the list leaves out. */
  | "ACCEPTED_UNLISTED"
  /** Apply throws on a move instead of refusing it. */
  | "APPLY_THREW";

export interface Disagreement {
  code: DisagreementCode;
  action: Action;
  timingKey: string;
  /** The card the move names, by card definition, for a stable key. */
  defId: string | null;
  /** Apply's error, or legality's reason for leaving the move out. */
  detail: string;
}

const PRIORITY_REASON = "The other player has priority.";

/** The card a move names, when it names one. */
function namedCardId(action: Action): string | null {
  if ("cardId" in action && typeof action.cardId === "string")
    return action.cardId;
  if (action.type === "break_subroutine") return action.breakerId;
  return null;
}

function defIdOf(state: GameState, action: Action): string | null {
  const id = namedCardId(action);
  if (!id) return null;
  return state.cards[id]?.defId ?? id;
}

/**
 * A stable key for a disagreement: code, move, window and card definition.
 * Baselines record these.
 */
export function disagreementKey(d: Disagreement): string {
  return [d.code, d.action.type, d.timingKey, d.defId ?? "-"].join(" ");
}

/**
 * True when every field the probe sets has the same value on `listed`.
 * The list may add fields the probe leaves out (a server for an ability
 * that names one, cost cards), so a bare probe matches its targeted forms.
 */
function matchesShape(probe: Action, listed: Action): boolean {
  if (probe.type !== listed.type) return false;
  const l = listed as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(probe)) {
    if (JSON.stringify(l[key]) !== JSON.stringify(value)) return false;
  }
  return true;
}

/**
 * Whether a probe and a listed move are the same move: the list adds a
 * target the probe leaves out, apply ignores a field the probe adds (a
 * server named for an event that does not run), or an identity's ability is
 * named as a paid ability of the identity card.
 */
function sameMove(state: GameState, probe: Action, listed: Action): boolean {
  if (matchesShape(probe, listed)) return true;
  // Apply ignores a server named for an event that does not run.
  if (
    probe.type === "play_event" &&
    listed.type === "play_event" &&
    probe.cardId === listed.cardId &&
    listed.serverId === undefined
  )
    return true;
  return (
    identityAlias(state, probe, listed) || identityAlias(state, listed, probe)
  );
}

function identityAlias(state: GameState, a: Action, b: Action): boolean {
  return (
    a.type === "use_paid_ability" &&
    b.type === "use_identity_ability" &&
    state.cards[a.cardId]?.type === "identity" &&
    a.abilityId === b.abilityId
  );
}

function serverIds(state: GameState): ServerId[] {
  return Object.keys(state.servers) as ServerId[];
}

function isInstalledCorp(state: GameState, id: string): boolean {
  const zone = state.cards[id]?.zone ?? "";
  return zone.startsWith("server:");
}

/**
 * Every move worth trying in this position: each action shape, with each
 * card or amount it could name. A superset of what the list offers, built
 * without the list's resource, cost or window checks.
 */
function probeActions(state: GameState): Action[] {
  const probes: Action[] = [
    { type: "pass_window" },
    { type: "keep_starting_hand" },
    { type: "mulligan" },
    { type: "basic_gain_credit" },
    { type: "basic_draw" },
    { type: "basic_remove_tag" },
    { type: "basic_purge_virus" },
    { type: "continue_run" },
    { type: "jack_out" },
    { type: "finish_access" },
    { type: "finish_breach" },
    { type: "access_trash_from_grip" },
    { type: "accept_expose" },
    { type: "accept_installed_trash" },
    { type: "resolve_trace" },
    { type: "prevent_damage_lose_all_clicks" },
    { type: "accept_damage" },
    { type: "accept_tags" },
    { type: "accept_end_the_run" },
    { type: "discard_to_hand_size" },
  ];
  const servers = serverIds(state);
  for (const serverId of servers) probes.push({ type: "basic_run", serverId });

  if (state.trace) {
    for (let c = 0; c <= Math.min(state.corp.credits, 10); c++)
      probes.push({ type: "boost_trace", credits: c });
    for (let c = 0; c <= Math.min(state.runner.credits, 10); c++)
      probes.push({ type: "spend_link", amount: c });
  }
  if (state.psi) {
    for (let b = 0; b <= state.psi.maxBid + 1; b++) {
      probes.push({ type: "psi_runner_bid", amount: b });
      probes.push({ type: "psi_corp_bid", amount: b });
    }
  }
  if (state.pendingDamage) {
    for (let a = 1; a <= state.pendingDamage.remaining; a++)
      probes.push({ type: "prevent_damage", amount: a });
  }
  for (const opt of state.pendingChoice?.options ?? [])
    probes.push({ type: "choose_option", optionId: opt.id });
  for (const id of state.pendingTrashPrevent?.pendingInterruptIds ?? [])
    probes.push({ type: "trigger_pending_trash_interrupt", cardId: id });
  for (const id of state.pendingTrashProgram?.candidates ?? [])
    probes.push({ type: "choose_trash_program", cardId: id });

  const accessing = state.run?.accessingCardId;
  if (accessing) {
    probes.push({ type: "steal_agenda", cardId: accessing });
    probes.push({ type: "trash_accessed", cardId: accessing });
    probes.push({ type: "access_trash_with_virus", cardId: accessing });
    probes.push({ type: "access_trash_free", cardId: accessing });
    probes.push({ type: "access_host_non_agenda_faceup", cardId: accessing });
  }

  const encounter = state.run?.encounter;
  const encountered = encounter ? state.cards[encounter.iceId] : undefined;
  const subCount = encountered?.subroutines?.length ?? 0;
  for (let i = 0; i < subCount; i++)
    probes.push({ type: "break_bioroid_subroutine", subIndex: i });

  for (const card of Object.values(state.cards)) {
    const id = card.id;
    // Abilities on every card outside the two decks.
    const inDeck = card.zone === "corp:rd" || card.zone === "runner:stack";
    for (const ab of inDeck ? [] : (card.paidAbilities ?? [])) {
      probes.push({ type: "use_paid_ability", cardId: id, abilityId: ab.id });
      if (card.type === "identity")
        probes.push({ type: "use_identity_ability", abilityId: ab.id });
    }
    if (card.side === "corp") {
      if (isInstalledCorp(state, id)) {
        if (!card.rezzed) {
          probes.push(
            card.type === "ice"
              ? { type: "rez_ice", cardId: id }
              : { type: "rez_asset", cardId: id },
          );
        }
        probes.push({ type: "advance", cardId: id });
        if (card.type === "agenda")
          probes.push({ type: "score_agenda", cardId: id });
      } else if (card.zone === "corp:hq") {
        if (card.type === "operation") {
          probes.push({ type: "play_operation", cardId: id });
        } else {
          probes.push({
            type: "basic_install",
            cardId: id,
            destination: { kind: "new_remote" },
          });
          for (const serverId of servers) {
            probes.push({
              type: "basic_install",
              cardId: id,
              destination:
                card.type === "ice"
                  ? { kind: "protect", serverId }
                  : { kind: "remote_root", serverId },
            });
          }
        }
      }
    } else if (card.zone === "runner:grip") {
      if (card.type === "event") {
        probes.push({ type: "play_event", cardId: id });
        for (const serverId of servers)
          probes.push({ type: "play_event", cardId: id, serverId });
      } else {
        probes.push({
          type: "basic_install",
          cardId: id,
          destination: { kind: "installed" },
        });
      }
    } else if (card.zone === "runner:installed") {
      if (card.type === "resource")
        probes.push({ type: "basic_trash_resource", cardId: id });
      if (card.type === "program" && subCount > 0) {
        for (let i = 0; i < subCount; i++)
          probes.push({ type: "break_subroutine", breakerId: id, subIndex: i });
      }
    }
  }
  return probes;
}

/**
 * Try every probe and every listed move in `state` against the list and
 * apply. `state` is not changed. The apply hook is paused while probing, so
 * test invariants are not checked on the probed states.
 */
export function legalityDisagreements(
  state: GameState,
  /** The list to check; `queryLegality`'s by default. Tests pass a broken one. */
  listed: readonly Action[] = queryLegality(state).legal.map((e) => e.action),
): Disagreement[] {
  const previousHook = setApplyHook(null);
  try {
    return compare(state, listed);
  } finally {
    setApplyHook(previousHook);
  }
}

function compare(state: GameState, listed: readonly Action[]): Disagreement[] {
  // A finished game lists nothing and the match takes no move (CR 1.7.1);
  // apply still takes a pass there, which the first-cycle stop tests use.
  if (state.done) return [];
  const out: Disagreement[] = [];
  const note = (code: DisagreementCode, action: Action, detail: string) =>
    out.push({
      code,
      action,
      timingKey: state.timingKey,
      defId: defIdOf(state, action),
      detail,
    });
  const tryApply = (action: Action): { ok: boolean; detail: string } => {
    try {
      const result = applyAction(state, action);
      return result.ok
        ? { ok: true, detail: "" }
        : { ok: false, detail: result.error };
    } catch (error) {
      note(
        "APPLY_THREW",
        action,
        error instanceof Error ? error.message : String(error),
      );
      return { ok: false, detail: "threw" };
    }
  };

  for (const action of listed) {
    const applied = tryApply(action);
    if (!applied.ok && applied.detail !== "threw")
      note("LISTED_REFUSED", action, applied.detail);
  }

  // An interrupt window, trace, psi game or pending choice is open: its
  // moves are not governed by the paid ability window's priority.
  const interruptOpen = pendingStepOpen(state);
  const seen = new Set<string>();
  for (const probe of probeActions(state)) {
    const key = JSON.stringify(probe);
    if (seen.has(key)) continue;
    seen.add(key);
    if (listed.some((l) => sameMove(state, probe, l))) continue;
    // Apply refuses whatever the shared window gate refuses, so only moves
    // the window allows need a (costly) try.
    if (windowRefusal(state, probe, { priority: false })) continue;
    const applied = tryApply(probe);
    if (!applied.ok) continue;
    const why = explainAction(state, probe);
    if (!why.legal && why.reason === PRIORITY_REASON && !interruptOpen)
      continue;
    note(
      "ACCEPTED_UNLISTED",
      probe,
      why.legal ? "explainAction says legal" : why.reason,
    );
  }
  return out;
}
