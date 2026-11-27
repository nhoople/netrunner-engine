/** Opening steps before the first turn (CR 1.6.6a mulligans, 1.6.7a before the first turn), part of STEPS in timing/graph.ts. */
import { opening } from "./stepHelpers.js";
import { corpStartsWithBadPublicity } from "../../state/cardFlags/staticFlags.js";
import { startIdentitySetup } from "../../state/cardFlags/cardDeclarations.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../labels.js";
import { noteOnBeforeFirstTurn } from "../../state/setupAndEnd/beforeFirstTurnHooks.js";
import { checkpointAfterInstruction } from "../../legality/checkpoints.js";
import type { TimingStepDef } from "../graph.js";

export const OPENING_STEP_DEFS: Record<string, TimingStepDef> = {
  // --- Opening (CR 1.6.6a mulligan; then 1.6.7a placeholder; then Corp turn) ---
  "opening.corpMulligan": opening(
    "opening.corpMulligan",
    "rule_mulligan",
    "1.6.6a",
    "Corp may take a mulligan.",
    "action",
    "opening.runnerMulligan",
    {
      allows: ["keep_starting_hand", "mulligan"],
    },
  ),
  "opening.runnerMulligan": opening(
    "opening.runnerMulligan",
    "rule_mulligan",
    "1.6.6a",
    "Runner may take a mulligan.",
    "action",
    "opening.beforeFirstTurn",
    {
      allows: ["keep_starting_hand", "mulligan"],
    },
  ),
  /**
   * CR 1.6.7a — a Corp identity ability "before taking your first turn"
   * resolves here, after mulligans and before the first Corp turn.
   */
  "opening.beforeFirstTurn": opening(
    "opening.beforeFirstTurn",
    "rule_before_first_turn",
    "1.6.7a",
    "Before taking your first turn.",
    "auto",
    "corp.gainClicks",
    {
      onResolve: (s) => {
        corpStartsWithBadPublicity(s);
        startIdentitySetup(s);
        const identity = s.cards[s.corp.identityId];
        if (
          !identity?.onBeforeFirstTurn ||
          abilitiesSuppressed(s, identity.id)
        ) {
          log(
            s,
            `No identity ability resolves before the Corp's first turn (CR ${CR.beforeFirstTurn.number}).`,
          );
          return;
        }
        log(
          s,
          `${identity.title} resolves before the Corp's first turn (CR ${CR.beforeFirstTurn.number}).`,
        );
        noteOnBeforeFirstTurn(s, identity.id);
        if ((s.turn.beforeFirstTurnPending ?? []).length > 0) {
          checkpointAfterInstruction(s, "opening.beforeFirstTurn");
        }
      },
    },
  ),
};
