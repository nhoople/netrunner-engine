/**
 * Seeded playouts of random legal decks (CR audit tool 1.3b) in the formats
 * the first Activity matches offer: System Gateway (the Learn to play pool)
 * and Startup. Failures are recorded in tests/fixtures/playout-seeds.json;
 * see tests/playout/harness.ts.
 */
import { describePlayouts } from "./playout/suite.js";

describePlayouts(["system_gateway", "startup"]);
