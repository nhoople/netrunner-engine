/** Legal targets and restrictions for trashing installed cards (CR 1.16.1c), and the first-R&D-trash hook. */
import type { GameState } from "../../state/types.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import type { EvalResult } from "../eval.js";
import { effectiveAdvancementRequirement } from "../../state/turnAndActions/scoring.js";

/** Nuvem: first R&D trash each Corp turn gains credits. */
export function maybeFireNuvemFirstRdTrash(state: GameState): void {
  if (state.turn.nuvemFirstRdTrashUsedThisTurn) return;
  const idCard = state.cards[state.corp.identityId];
  const n = idCard?.creditsOnFirstRdTrashThisTurn ?? 0;
  if (n <= 0) return;
  state.turn.nuvemFirstRdTrashUsedThisTurn = true;
  state.corp.credits += n;
  log(state, `${idCard!.title} — gain ${n}¢ (first R&D trash this turn).`);
}

type TrashInstalledParams = {
  rezzedOnly?: boolean;
  includeSubtypes?: string[];
  attackedServerOnly?: boolean;
};

/** Legal targets for `trash_installed` (LEO Labor Solutions gate). */
export function trashInstalledLegalTargets(
  state: GameState,
  _sourceId: string,
  action: TrashInstalledParams,
): string[] {
  const targets: string[] = [];
  const attacked = action.attackedServerOnly
    ? state.run?.attackedServerId
    : undefined;
  if (action.attackedServerOnly && !attacked) return targets;
  const servers = attacked
    ? [state.servers[attacked]].filter(Boolean)
    : Object.values(state.servers);
  for (const server of servers) {
    if (!server) continue;
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (!c || c.side !== "corp") continue;
      if (action.rezzedOnly && !c.rezzed) continue;
      if (action.includeSubtypes?.length) {
        const subs = c.subtypes ?? [];
        if (!action.includeSubtypes.some((st) => subs.includes(st))) {
          continue;
        }
      }
      targets.push(id);
    }
  }
  return targets;
}

export function pendingTrashAmong(
  state: GameState,
  sourceId: string,
  candidates: string[],
  label: string,
  /**
   * Who chooses and carries out the trash: the ability's controller, unless
   * its text names the Runner ("The Runner trashes", CR 1.14.5).
   */
  chooser?: "corp" | "runner",
): EvalResult {
  if (candidates.length === 0) {
    log(state, `Trash ${label} — no targets (CR ${CR.trashing.number}).`);
    return { ok: true };
  }
  if (candidates.length > 1) {
    state.pendingTrashProgram = {
      sourceId,
      candidates: [...candidates],
      ...(chooser ? { chooser } : {}),
    };
    log(
      state,
      `Trash ${label} — ${chooser === "runner" ? "Runner" : "Corp"} must choose among ${candidates.length} (CR ${CR.trashing.number}).`,
    );
    return { ok: true };
  }
  const id = candidates[0]!;
  const title = state.cards[id].title;
  trashCard(state, id, chooser ? { by: chooser } : {});
  log(state, `Trash installed ${title} (CR ${CR.trashing.number}).`);
  return { ok: true };
}

/** Trashing this card must leave a scoring restriction still met (CR 1.16.1c). */
export function trashingKeepsScoreRestriction(
  state: GameState,
  agenda: import("../../state/types.js").CardInstance,
  trashId: string,
): boolean {
  if (agenda.type !== "agenda") return true;
  const up = state.cards[trashId];
  const reduction =
    up?.rezzed || up?.persistent
      ? (up.advancementRequirementReduction ?? 0)
      : 0;
  if (reduction <= 0) return true;
  const req = effectiveAdvancementRequirement(state, agenda) + reduction;
  return (agenda.advancementCounters ?? 0) >= req;
}
