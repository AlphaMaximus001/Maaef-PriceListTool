/**
 * Presentation clean-up for the client-facing catalogue (PDF and Excel).
 *
 * The stored data is left untouched — the original list is locked by design, and
 * these are wording choices for the printed document, not facts about the items.
 * Applying them at export time means every version of every list prints the same
 * consistent vocabulary, whatever spelling the source spreadsheet used.
 *
 * The unit map was built from every distinct value in the PAGES / LEAVES column
 * of the FY 2026-27 list. Quantities ("100 Forms", "200 Pages") were already
 * consistent; the mismatches were the per-unit words below.
 */

/** Exact (case- and dot-insensitive) replacements for the PAGES / LEAVES column. */
const UNIT_MAP: Record<string, string> = {
  // One of something → "Single Item"
  "each": "Single Item",
  "pratyek": "Single Item", // Hindi "प्रत्येक" (each), written in Latin script
  "single item": "Single Item",
  "one piece": "Single Item",
  "1 book": "Single Item",
  "one book": "Single Item",
  "one diary": "Single Item",
  "one ticket": "Single Item",
  "single leaf": "Single Item",
  // Packs
  "per pack": "Per Pack",
  "ppkt": "Per Pack",
  "p pkt": "Per Pack",
  "single pack": "Per Pack",
  // Hundreds
  "phund": "Per 100",
  "p hund": "Per 100",
  "per hundred": "Per 100",
  "per 100 count": "Per 100",
  "per 100": "Per 100",
  // Others
  "proll": "Per Roll",
  "p roll": "Per Roll",
  "one set": "Per Set",
  "per ream": "Per Ream",
  "per pad": "Per Pad",
};

/** "100 Slip" → "100 Slips": a count above one takes the plural. */
const PLURALS: Record<string, string> = {
  slip: "Slips",
  chart: "Charts",
  card: "Cards",
  form: "Forms",
  page: "Pages",
  leaf: "Leaves",
  sheet: "Sheets",
  sticker: "Stickers",
  ticket: "Tickets",
};

function key(s: string): string {
  return s.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function normalizeUnitPart(part: string): string {
  const raw = part.trim();
  if (!raw) return raw;
  const mapped = UNIT_MAP[key(raw)];
  if (mapped) return mapped;
  // "<count> <singular noun>" with a count above one → plural.
  const m = /^(\d+(?:x\d+)?)\s+([A-Za-z]+)$/.exec(raw);
  if (m) {
    const n = m[1].split("x").reduce((a, b) => a * Number(b), 1);
    const plural = PLURALS[m[2].toLowerCase()];
    if (plural && n > 1) return `${m[1]} ${plural}`;
  }
  return raw;
}

/** Normalise a PAGES / LEAVES value. Composite values ("100 Leaves | 100 Forms") are
 *  normalised part by part. */
export function normalizeUnit(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .split("|")
    .map(normalizeUnitPart)
    .filter(Boolean)
    .join(" | ");
}

/** Spelling corrections applied to category names and item descriptions. */
const SPELLING: [RegExp, string][] = [
  [/\bEnvelops\b/g, "Envelopes"],
  [/\bENVELOPS\b/g, "ENVELOPES"],
  [/\bEnvelop\b/g, "Envelope"],
  [/\bENVELOP\b/g, "ENVELOPE"],
];

export function fixSpelling(text: string): string {
  return SPELLING.reduce((s, [re, to]) => s.replace(re, to), text);
}
