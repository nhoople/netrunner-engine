/**
 * Effect IR: the `Primitive` members whose procedure is play.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
import type { Effect } from "./effect.js";

export type PlayPrimitive =
  /** Threat follow-up: may play an operation or install from HQ (Pivot). */
  | { kind: "may_play_or_install_from_hq" }
  /** Leaf: play an operation from HQ paying playCost only. */
  | { kind: "play_hq_operation_paying_costs"; cardId: string }
  | { kind: "may_play_nonterminal_operation_from_hq" }
  | { kind: "may_play_operation_from_hq" }
  | { kind: "play_hq_operation_card"; cardId: string }
  /** Adrian Seis / Hyoubu / Akiko: interactive psi bid then branch effects. */
  | {
      kind: "play_psi_game";
      maxBid: number;
      /** Optional — when omitted, differing bids resolve as a no-op. */
      ifBidsDiffer?: Effect;
      /** Optional — when omitted, matching bids resolve as a no-op. */
      ifBidsMatch?: Effect;
    }
  | { kind: "play_self_from_archives_then_rfg" }
  /** Same Old Thing: may play an event from the heap, paying its play cost. */
  | { kind: "play_event_from_heap_paying_costs" }
  | { kind: "play_heap_event_card"; cardId: string }
  | { kind: "may_play_transaction_from_archives" }
  | { kind: "play_archives_transaction_then_rfg"; cardId: string }
  | { kind: "play_current_from_hq_or_archives" }
  | { kind: "play_current_card"; cardId: string }
  | { kind: "play_resolve"; cardId: string }
  | { kind: "play_ops_from_hq"; max?: number }
  | { kind: "play_op_resolve"; cardId: string }
  | { kind: "play_archives_transaction" }
  | { kind: "play_archives_transaction_resolve"; cardId: string }
  | { kind: "play_event_from_heap" }
  | { kind: "play_run_event_from_stack" }
  | { kind: "play_heap_event_ignore_cost"; cardId: string };
