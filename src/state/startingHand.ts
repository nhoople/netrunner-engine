/**
 * Return the starting hand size for an identity card def/instance.
 * Default 5; Andromeda uses startingHandSize: 9.
 */
export function startingHandSizeFor(
  identity: { startingHandSize?: number } | null | undefined,
): number {
  const n = identity?.startingHandSize;
  return typeof n === "number" && n >= 1 ? n : 5;
}
