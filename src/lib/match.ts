/**
 * Deterministic match scoring (brief §11: "start with deterministic spec-key +
 * string similarity ... token-set ratio on product_name within same category").
 * No LLM, no embeddings — a confidence score that a human still has to confirm
 * (invariant 2). Returns a value in [0, 1].
 */

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Levenshtein-based ratio on two strings, in [0,1]. */
function levRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  const d = new Array(n + 1);
  for (let j = 0; j <= n; j++) d[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(
        d[j] + 1,
        d[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  const dist = d[n];
  return 1 - dist / Math.max(m, n);
}

/**
 * Token-set ratio (fuzzywuzzy-style, simplified & deterministic). Compares the
 * shared-token core against each full string and takes the best, so word order
 * and extra qualifiers don't tank the score.
 */
export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  const intersection = [...ta].filter((t) => tb.has(t)).sort();
  const diffA = [...ta].filter((t) => !tb.has(t)).sort();
  const diffB = [...tb].filter((t) => !ta.has(t)).sort();

  const sortedInter = intersection.join(" ");
  const combinedA = (sortedInter + " " + diffA.join(" ")).trim();
  const combinedB = (sortedInter + " " + diffB.join(" ")).trim();

  // If the intersection is itself a strong base, these comparisons reward it.
  const r1 = levRatio(sortedInter, combinedA);
  const r2 = levRatio(sortedInter, combinedB);
  const r3 = levRatio(combinedA, combinedB);

  // Also a plain Dice coefficient on the token sets as a floor.
  const dice = (2 * intersection.length) / (ta.size + tb.size);

  return Math.max(r1, r2, r3, dice);
}

export const FUZZY_THRESHOLD = 0.6;
