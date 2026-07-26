/**
 * Snippet extraction — the slice of a chunk shown under a result, cut around
 * the first query match rather than always from the top.
 */

export interface Segment {
  text: string;
  match: boolean;
}

const SNIPPET_CHARS = 165;
/** Characters of run-up kept before the match, so it does not sit flush left. */
const LEAD_CHARS = 45;

function terms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((t) => t.length > 1);
}

function firstMatch(haystack: string, needles: string[]): number {
  return needles.reduce((best, needle) => {
    const at = haystack.indexOf(needle);
    if (at === -1) return best;
    return best === -1 || at < best ? at : best;
  }, -1);
}

interface Match {
  at: number;
  length: number;
}

/** Earliest occurrence of any needle at or after `from`; longest wins a tie. */
function nextMatch(haystack: string, needles: string[], from: number): Match | null {
  return needles.reduce<Match | null>((best, needle) => {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return best;
    if (!best || at < best.at || (at === best.at && needle.length > best.length)) {
      return { at, length: needle.length };
    }
    return best;
  }, null);
}

/** Splits `content` into a snippet of plain and matched segments. */
export function snippet(content: string, query: string): Segment[] {
  const needles = terms(query);
  const lower = content.toLowerCase();
  const at = firstMatch(lower, needles);

  let start = at === -1 ? 0 : Math.max(0, at - LEAD_CHARS);
  // Never start mid-word.
  if (start > 0) {
    const space = content.indexOf(' ', start);
    start = space === -1 ? start : space + 1;
  }
  const end = Math.min(content.length, start + SNIPPET_CHARS);

  const text = (start > 0 ? '…' : '')
    + content.slice(start, end).trim()
    + (end < content.length ? '…' : '');

  const segments: Segment[] = [];
  const haystack = text.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    // Earliest match at or after the cursor, longest term winning a tie.
    const hit = nextMatch(haystack, needles, cursor);

    if (!hit) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (hit.at > cursor) segments.push({ text: text.slice(cursor, hit.at), match: false });
    segments.push({ text: text.slice(hit.at, hit.at + hit.length), match: true });
    cursor = hit.at + hit.length;
  }

  return segments;
}
