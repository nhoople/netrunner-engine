/**
 * Effect IR: the `Primitive` members whose procedure is breach.
 * Their handlers are in `../kinds/breachKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
export type BreachPrimitive =
  /** Indexing: may look top 5 R&D arrange instead of breach. */
  | { kind: "may_breach_instead_indexing" }
  | { kind: "breach_instead_indexing_arrange" }
  | { kind: "breach_instead_record_reconstructor_archives" }
  /**
   * Cataloguer paid ability: begin a standalone breach of the named server
   * (Virtuoso post-run shell; not a successful run).
   */
  | {
      kind: "breach_server_standalone";
      server: "rd" | "hq" | "archives" | string;
      /** Mind's Eye: exclude cards in the server root during this breach. */
      cannotAccessRoot?: boolean;
    }
  /** Mala Tempora — Expert Schedule Analyzer replace-breach reveal HQ. */
  | { kind: "may_breach_instead_expert_schedule_analyzer" }
  | { kind: "breach_hq_no_root" }
  /** True Colors — Keyhole replace-breach. */
  | { kind: "may_breach_instead_keyhole" }
  | { kind: "breach_instead_keyhole" }
  /** Double Time — Singularity replace-breach trash root. */
  | { kind: "breach_instead_singularity_trash_root" }
  | { kind: "breach_hq" }
  | { kind: "breach_hq_resolve"; cardId: string }
  | { kind: "breach_archives" }
  | { kind: "may_breach_instead_code_siphon" }
  | {
      kind: "breach_instead_code_siphon";
      /** Filled by the stack search pick. */
      cardIds?: string[];
    }
  | { kind: "breach_instead_wanton_destruction" }
  | { kind: "may_breach_instead_analog_dreamers" }
  | { kind: "breach_instead_cbi_raid" }
  | { kind: "breach_reduce_access_remainder_of_run"; amount?: number }
  /** Kampala Ascendent (ka) */
  | { kind: "may_breach_instead_diversion_funds_ka" }
  | { kind: "may_breach_instead_eden_shard" }
  | {
      kind: "breach_server_during_encounter";
      server: "hq" | "rd" | "archives";
      cannotAccessRoot?: boolean;
    }
  /** Account Siphon: may instead of breach HQ — lose up to 5¢, gain 2×, take 2 tags. */
  | { kind: "may_breach_instead_account_siphon" }
  /**
   * Vamp: may instead of breach HQ — spend X Runner ¢ (X≥0); Corp loses X;
   * if X>0 take 1 tag; skip breach.
   */
  | { kind: "may_breach_instead_vamp" }
  /**
   * Exploratory Romp: may instead of breach — remove up to `amount`
   * advancement counters from 1 card in the attacked server.
   */
  | { kind: "may_breach_instead_exploratory_romp"; amount: number }
  /**
   * After the current run ends, breach the named central server
   * (Virtuoso non-HQ mark branch). Not a run; does not declare success.
   */
  | {
      kind: "breach_server_when_run_ends";
      server: "hq" | "rd" | "archives";
    };
