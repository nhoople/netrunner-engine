/**
 * Seeded playouts of random legal Startup decks (CR audit tool 1.3b), the
 * one sanctioned format the first Activity matches offer beside the Learn to
 * play lists. Failures are recorded in tests/fixtures/playout-seeds.json;
 * see tests/playout/harness.ts.
 */
import { describePlayouts } from "./suite.js";

describePlayouts(["startup"]);
