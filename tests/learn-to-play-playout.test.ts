/**
 * Seeded playouts of every Learn to play list (CR audit tool 1.3a): the
 * System Gateway starter lists and the expanded lists with the booster cards,
 * as netrunner-game deals them. Failures are recorded in
 * tests/fixtures/playout-seeds.json; see tests/playout/harness.ts.
 */
import { describePlayouts } from "./playout/suite.js";

describePlayouts(["learn_to_play_starter", "learn_to_play_expanded"]);
