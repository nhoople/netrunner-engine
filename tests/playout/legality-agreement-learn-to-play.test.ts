/**
 * Legality agreement (FX-legal-moves) in the Learn to play playouts: the legal-action
 * list offers exactly the moves apply accepts. See tests/playout/agreement.ts.
 */
import { describeAgreement } from "./agreement.js";

describeAgreement(["learn_to_play_starter", "learn_to_play_expanded"]);
