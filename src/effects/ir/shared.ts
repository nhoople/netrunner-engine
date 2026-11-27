/**
 * Effect IR: types the primitive kinds share (sides, counted amounts, pump duration).
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
export type SideRef = "corp" | "runner" | "payer" | "controller";

/**
 * A count that becomes one aggregated instruction (CR 9.12.2b, 9.12.2c):
 * a credit gain or loss, a draw, net or meat damage, tags, clicks,
 * or bad publicity.
 * `per` defaults to 1. `base` is added before the product.
 * `side: "source"` uses the card that is resolving.
 */
const CREDIT_TALLY_COUNTS = [
  "source_advancement_counters",
  "source_power_counters",
  "source_virus_counters",
  "hq_cards",
  "runner_tags",
  "runner_grip",
  "runner_score",
  "bad_publicity",
  "rezzed_ice",
  "remotes_with_root",
  "installed_corp_advanced",
  "installed_resource_subtype",
  "rezzed_ice_subtype",
  "copies_in_runner_heap",
  "ice_protecting_source_server",
  "clicks_remaining",
  "passed_ice",
  "runner_heap_subtype",
] as const;

type CreditTallyCount = (typeof CREDIT_TALLY_COUNTS)[number];

export type CreditTally = {
  count: CreditTallyCount;
  per?: number;
  /** Added to count × per. Urtica Cipher is 2 plus 1 per advancement. */
  base?: number;
  side?: "corp" | "runner" | "source";
  subtype?: string;
};

export const CREDIT_TALLY_COUNT_SET: ReadonlySet<string> = new Set(
  CREDIT_TALLY_COUNTS,
);

/**
 * Rewrite pinned-catalog overadvance synonyms before validate / materialize.
 * Cards v1.147.5+ author `place_agenda_counters_past` / `dividends` directly.
 */
/** How long a breaker strength pump lasts. Default: encounter. */
export type PumpDuration = "encounter" | "run" | "turn" | "checkpoint";
