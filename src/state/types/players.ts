/** Per-player state: credits, clicks, tags, damage and the player's zones. */

import type { Side } from "./shared.js";

export interface PlayerState {
  side: Side;
  clicks: number;
  credits: number;
  maxHandSize: number;
  identityId: string;
  /** Runner tags (CR 10.5). Corp unused in v0. */
  tags: number;
  /** Runner core damage (CR 10.4). */
  coreDamage: number;
  /** Runner link (identity + modifiers). */
  link: number;
  /**
   * Runner base memory limit before card bonuses (default 4).
   * Corp unused.
   */
  memoryLimit: number;
  /** Deck / stack card ids, top at index 0. */
  deck: string[];
  hand: string[];
  discardPile: string[];
  scoreArea: string[];
  /** Runner only: installed card ids. */
  installed: string[];
  /**
   * Non-installed play-area partition (CR 4.6 / 8.6.x): ops, events, currents,
   * lockdowns lingering faceup. Synced with `corp:play-area` / `runner:play-area`.
   */
  playArea: string[];
  /**
   * Valley Grid, Gyri Labyrinth: cumulative −N max hand size until the
   * beginning of the Corp's next turn.
   */
  handSizePenaltyUntilCorpTurn?: number;
  /** Corp bad publicity (CR 10.6). */
  badPublicity?: number;
  /** Runner set-aside zone (Ayla). */
  setAside?: string[];
  /**
   * Runner outside-game additional-identities pile (CR 1.5.4a / DJ Fenris).
   * Instance ids live in `cards` with zone `runner:outside-game-identities`.
   */
  additionalIdentities?: string[];
  /** Corp temporary set-aside (Deep Dive top-of-R&D). */
  corpSetAside?: string[];
}
