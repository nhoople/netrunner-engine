/**
 * Seeded playouts of random legal decks (CR audit tool 1.3b) in Core,
 * Standard and Eternal. Failures are recorded in
 * tests/fixtures/playout-seeds.json; see tests/playout/harness.ts.
 */
import { describePlayouts } from "./playout/suite.js";

describePlayouts(["core", "standard", "eternal"]);
