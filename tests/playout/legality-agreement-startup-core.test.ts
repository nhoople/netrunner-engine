/**
 * Legality agreement (FX-legal-moves) in the Startup and Core playouts: the legal-action
 * list offers exactly the moves apply accepts. See tests/playout/agreement.ts.
 */
import { describeAgreement } from "./agreement.js";

describeAgreement(["startup", "core"]);
