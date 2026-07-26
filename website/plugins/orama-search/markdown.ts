/**
 * Markdown/MDX → search chunks.
 *
 * Docs are split at headings first (a heading is the smallest thing we can
 * deep-link to), then long sections are packed into chunks that fit the
 * embedding model's context. Every chunk keeps its heading trail so the
 * embedding sees where in the page it came from — "Concurrency" alone is
 * ambiguous, "Remote cache > Concurrency" is not.
 */
import GithubSlugger from 'github-slugger';

/** Characters per chunk. gte-small tops out at 512 tokens ≈ 2 000 characters;
 *  staying under that leaves room for the heading trail we prepend. */
const MAX_CHUNK_CHARS = 1400;
/** Paragraphs shorter than this are folded into the next chunk rather than
 *  shipped alone — a two-word line embeds to noise. */
const MIN_CHUNK_CHARS = 80;

export interface RawChunk {
  /** Heading anchor the chunk belongs to; empty for a page's lead paragraphs. */
  anchor: string;
  /** Nearest heading text. */
  heading: string;
  /** Heading trail below the page title, e.g. `Outputs > Collisions`. */
  breadcrumb: string;
  /** Plain-text body. */
  content: string;
}

interface Section {
  anchor: string;
  heading: string;
  breadcrumb: string;
  lines: string[];
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const FENCE = /^\s{0,3}(```+|~~~+)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
const EXPLICIT_ANCHOR = /\s*\{#([^}]+)\}\s*$/;
/** MDX plumbing: `import X from 'y'`, `export const z = …`. */
const MDX_STATEMENT = /^\s*(import|export)\s/;

/** Strips markdown emphasis/link/tag syntax so the embedding sees prose. */
function toPlainText(line: string): string {
  return line
    // Images carry no searchable prose.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Links and reference links → their label.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    // HTML / JSX tags.
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    // Inline code, bold, italics — keep the text, drop the markers.
    .replace(/`+/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Leading list bullets, quotes, and table pipes.
    .replace(/^\s{0,6}([-*+]|\d+\.)\s+/, '')
    .replace(/^\s{0,3}>\s?/, '')
    .replace(/\s*\|\s*/g, ' ')
    // Table rules (`|---|---|`) reduce to punctuation soup.
    .replace(/^[-:\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `:::tip Heading` → `Heading`; a bare `:::` disappears. */
function stripAdmonitionMarker(line: string): string | null {
  const match = /^\s*:::+\s*(\w+)?\s*(.*)$/.exec(line);
  if (!match) return null;
  return match[2]?.trim() ?? '';
}

function splitIntoSections(markdown: string, slugger: GithubSlugger): Section[] {
  const body = markdown.replace(FRONTMATTER, '');
  const sections: Section[] = [];
  const trail: string[] = [];

  let current: Section = {
    anchor: '', heading: '', breadcrumb: '', lines: [],
  };
  let fence: string | null = null;

  body.split('\n').forEach((rawLine) => {
    const fenceMatch = FENCE.exec(rawLine);
    if (fenceMatch) {
      // A fence of the same kind closes the block; anything else opens one.
      fence = fence && rawLine.trimStart().startsWith(fence) ? null : fenceMatch[1] ?? null;
      return;
    }

    if (fence) {
      // Code is kept verbatim: config keys and flags are exactly what people
      // search for, and BM25 matches them literally.
      current.lines.push(rawLine.trim());
      return;
    }

    if (MDX_STATEMENT.test(rawLine)) return;

    const heading = HEADING.exec(rawLine);
    if (heading) {
      if (current.lines.length > 0 || current.heading) sections.push(current);

      const level = (heading[1] ?? '#').length;
      const raw = heading[2] ?? '';
      const explicit = EXPLICIT_ANCHOR.exec(raw)?.[1];
      const text = toPlainText(raw.replace(EXPLICIT_ANCHOR, ''));

      trail.length = Math.max(0, level - 1);
      trail[level - 1] = text;

      current = {
        anchor: explicit ?? slugger.slug(text),
        heading: text,
        // Level 1 is the page title, which every chunk already carries.
        breadcrumb: trail.slice(1, level).filter(Boolean).join(' > '),
        lines: [],
      };
      return;
    }

    const admonition = stripAdmonitionMarker(rawLine);
    const text = admonition === null ? toPlainText(rawLine) : toPlainText(admonition);
    current.lines.push(text);
  });

  if (current.lines.length > 0 || current.heading) sections.push(current);
  return sections;
}

/** Packs a section's paragraphs into chunks no larger than the model's window. */
function packParagraphs(section: Section): string[] {
  const paragraphs = section.lines
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').filter(Boolean).join(' ').trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim());
    buffer = '';
  };

  paragraphs.forEach((paragraph) => {
    // A single oversized paragraph (a long table, a big code block) is cut on
    // sentence boundaries so neither half starts mid-thought.
    if (paragraph.length > MAX_CHUNK_CHARS) {
      flush();
      const sentences = paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph];
      sentences.forEach((sentence) => {
        if (buffer.length + sentence.length > MAX_CHUNK_CHARS) flush();
        buffer += sentence;
      });
      flush();
      return;
    }

    if (buffer.length + paragraph.length + 1 > MAX_CHUNK_CHARS) flush();
    buffer += buffer ? `\n${paragraph}` : paragraph;
  });

  flush();

  // Fold a runt tail into its predecessor rather than embedding it alone.
  const tail = chunks[chunks.length - 1];
  const previous = chunks[chunks.length - 2];
  if (tail !== undefined && previous !== undefined && tail.length < MIN_CHUNK_CHARS) {
    chunks.splice(chunks.length - 2, 2, `${previous}\n${tail}`);
  }

  return chunks;
}

export function chunkMarkdown(markdown: string): RawChunk[] {
  const slugger = new GithubSlugger();
  return splitIntoSections(markdown, slugger).flatMap((section) => packParagraphs(section)
    .map((content) => ({
      anchor: section.anchor,
      heading: section.heading,
      breadcrumb: section.breadcrumb,
      content,
    })));
}
