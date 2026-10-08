/**
 * Effect IR kind names.
 *
 * A kind is snake_case and names the procedure: a verb, then the object.
 * `may_` means the player may decline. `corp_` or `runner_` may name the
 * actor before the verb. Pack codes and card titles are not prefixes.
 * Amounts, sides, and zones are fields.
 *
 * `_resolve`, `_pick`, and `_continue` are follow-ups the engine builds
 * while a choice is open. They are not the name of the printed ability.
 */

export const PACK_CODE_PREFIXES: ReadonlySet<string> = new Set([
  "au",
  "ber",
  "cotc",
  "dad",
  "dtwn",
  "ip",
  "ka",
  "kg",
  "mca",
  "mo",
  "o2",
  "oh",
  "si",
  "ss",
  "tdatd",
  "tlm",
  "uot",
  "win",
]);

/** First word of a procedure name, after optional may_ / corp_ / runner_. */
export const PROCEDURE_VERBS: ReadonlySet<string> = new Set([
  "access",
  "add",
  "advance",
  "arrange",
  "blank",
  "boost",
  "bottom",
  "brain",
  "break",
  "breach",
  "bypass",
  "charge",
  "choose",
  "copy",
  "core",
  "derez",
  "draw",
  "end",
  "expose",
  "fire",
  "flip",
  "forbid",
  "force",
  "forfeit",
  "fortify",
  "gain",
  "give",
  "grant",
  "host",
  "identify",
  "install",
  "jack",
  "look",
  "lose",
  "mark",
  "meat",
  "move",
  "name",
  "net",
  "offer",
  "pay",
  "pick",
  "place",
  "play",
  "prevent",
  "psi",
  "pump",
  "put",
  "redirect",
  "remove",
  "resolve",
  "return",
  "reveal",
  "rez",
  "rfg",
  "sabotage",
  "score",
  "search",
  "set",
  "shuffle",
  "spend",
  "steal",
  "suffer",
  "swap",
  "tag",
  "take",
  "top",
  "trace",
  "trash",
  "turn",
  "unless",
  "weaken",
]);

export function primitiveNameFollowsStandard(kind: string): boolean {
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(kind)) return false;
  const lead = kind.split("_")[0]!;
  if (PACK_CODE_PREFIXES.has(lead)) return false;
  let parts = kind.split("_");
  if (parts[0] === "may") parts = parts.slice(1);
  if (parts[0] === "corp" || parts[0] === "runner") parts = parts.slice(1);
  const verb = parts[0];
  return verb !== undefined && PROCEDURE_VERBS.has(verb);
}
