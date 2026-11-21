/**
 * Legality agreement (FX-legal-moves) in the Standard and Eternal playouts: the legal-action
 * list offers exactly the moves apply accepts. See tests/playout/agreement.ts.
 */
import { describeAgreement } from "./playout/agreement.js";

describeAgreement(["standard", "eternal"]);
