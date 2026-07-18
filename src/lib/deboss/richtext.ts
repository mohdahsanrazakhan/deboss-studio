/**
 * Rich-text tag vocabulary: parsing, stripping, and Tiptap-doc <-> string
 * serialization for `DebossState.text`.
 * ---------------------------------------------------------------------
 * `DebossState.text` stays a plain `string`. It may now contain a small,
 * fixed, closed set of inline tags that ONLY the serializer below ever
 * generates: `<b>`, `<i>`, `<u>`, `<span style="font-size:Npx">`,
 * nestable, with paragraphs still joined by literal "\n" exactly as
 * before this feature existed. A plain untagged string (the default
 * sample text, every GALLERY_EXAMPLES entry) is valid as-is; nothing here
 * changes what those already mean.
 *
 * This module never touches React or Tiptap types directly (src/lib/deboss/
 * stays framework-free, CLAUDE.md hard rule #2); the rich-text editor
 * component adapts between this module's plain doc shape and Tiptap's own
 * JSONContent when it calls into Tiptap's API.
 *
 * The tag vocabulary is a closed set under this codebase's own control
 * (the editor's paste handling sanitizes pasted content down to only the
 * marks registered on it), so the parser below is a small, purpose-built
 * scanner, not a general HTML parser.
 */

import type { TextRun } from "@/types/deboss";

/* -------------------------------------------------------------------
   Escaping: literal <, >, & typed as real content must not be mistaken
   for tag boundaries on the next parse.
   ------------------------------------------------------------------- */
export function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function unescapeText(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** True if `text` contains any of this codebase's recognized rich-text tags. */
export function hasRichRuns(text: string): boolean {
  return /<\/?(b|i|u|span)(?:[\s>])/.test(text);
}

/**
 * Plain-text extraction: strips every recognized tag, leaving the actual
 * characters. MUST run before `detectTextDirection` on anything that might
 * contain markup: tag names ("span", "style") are Latin characters that
 * would otherwise misdetect LTR direction on genuinely RTL content.
 */
export function stripTags(text: string): string {
  return unescapeText(text.replace(/<[^>]+>/g, ""));
}

type OpenTag = { kind: "b" | "i" | "u" } | { kind: "span"; size: number };

/** Parse one "\n"-delimited line into styled runs. `baseSize` fills in for text with no explicit size override. */
export function parseRuns(line: string, baseSize: number): TextRun[] {
  const runs: TextRun[] = [];
  const stack: OpenTag[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.length === 0) return;
    let bold = false;
    let italic = false;
    let underline = false;
    let size = baseSize;
    for (const tag of stack) {
      if (tag.kind === "span") size = tag.size;
      else if (tag.kind === "b") bold = true;
      else if (tag.kind === "i") italic = true;
      else underline = true;
    }
    runs.push({ text: unescapeText(buffer), bold, italic, underline, size });
    buffer = "";
  };

  let i = 0;
  while (i < line.length) {
    if (line[i] !== "<") {
      buffer += line[i];
      i++;
      continue;
    }
    const closeIdx = line.indexOf(">", i);
    if (closeIdx === -1) {
      // No matching '>': not a tag, treat '<' as literal (shouldn't happen
      // for our own serialized output, but never corrupt/drop user text).
      buffer += line[i];
      i++;
      continue;
    }
    const tag = line.slice(i + 1, closeIdx);
    const sizeMatch = /^span style="font-size:(\d+)px"$/.exec(tag);
    if (tag === "b" || tag === "i" || tag === "u") {
      flush();
      stack.push({ kind: tag });
    } else if (sizeMatch) {
      flush();
      stack.push({ kind: "span", size: Number.parseInt(sizeMatch[1] ?? "0", 10) });
    } else if (tag === "/b" || tag === "/i" || tag === "/u" || tag === "/span") {
      flush();
      const want = tag.slice(1) as "b" | "i" | "u" | "span";
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k]?.kind === want) {
          stack.splice(k, 1);
          break;
        }
      }
    } else {
      // Unrecognized tag: treat literally rather than silently dropping text.
      buffer += line.slice(i, closeIdx + 1);
    }
    i = closeIdx + 1;
  }
  flush();
  return runs;
}

function wrapRun(text: string, run: Omit<TextRun, "text">, baseSize: number): string {
  let out = escapeText(text);
  if (run.underline) out = `<u>${out}</u>`;
  if (run.italic) out = `<i>${out}</i>`;
  if (run.bold) out = `<b>${out}</b>`;
  if (run.size !== baseSize) out = `<span style="font-size:${Math.round(run.size)}px">${out}</span>`;
  return out;
}

/* -------------------------------------------------------------------
   Tiptap doc <-> tagged string. Locally-typed (structurally compatible
   with Tiptap's JSONContent, never imported here, see file header).
   ------------------------------------------------------------------- */
export interface RichTextNode {
  type: "text";
  text: string;
  marks?: { type: string; attrs?: { size?: number } }[];
}
export interface RichHardBreakNode {
  type: "hardBreak";
}
export interface RichParagraphNode {
  type: "paragraph";
  content?: (RichTextNode | RichHardBreakNode)[];
}
export interface RichDoc {
  type: "doc";
  content: RichParagraphNode[];
}

/** Tiptap doc -> DebossState.text. */
export function serializeDoc(doc: RichDoc, baseSize: number): string {
  const outputLines: string[] = [];
  for (const para of doc.content) {
    let current = "";
    for (const node of para.content ?? []) {
      if (node.type === "hardBreak") {
        outputLines.push(current);
        current = "";
      } else {
        const marks = node.marks ?? [];
        const bold = marks.some((m) => m.type === "bold");
        const italic = marks.some((m) => m.type === "italic");
        const underline = marks.some((m) => m.type === "underline");
        const sizeMark = marks.find((m) => m.type === "fontSize");
        const size = sizeMark?.attrs?.size ?? baseSize;
        current += wrapRun(node.text, { bold, italic, underline, size }, baseSize);
      }
    }
    outputLines.push(current);
  }
  return outputLines.join("\n");
}

/** DebossState.text -> Tiptap doc, for loading external text into the editor. */
export function deserializeToDoc(text: string, baseSize: number): RichDoc {
  const lines = text.replace(/\r/g, "").split("\n");
  const content: RichParagraphNode[] = lines.map((line) => {
    const runs = parseRuns(line, baseSize);
    const paraContent: RichTextNode[] = [];
    for (const run of runs) {
      if (run.text.length === 0) continue;
      const marks: { type: string; attrs?: { size?: number } }[] = [];
      if (run.bold) marks.push({ type: "bold" });
      if (run.italic) marks.push({ type: "italic" });
      if (run.underline) marks.push({ type: "underline" });
      if (run.size !== baseSize) marks.push({ type: "fontSize", attrs: { size: run.size } });
      paraContent.push({ type: "text", text: run.text, marks: marks.length ? marks : undefined });
    }
    return { type: "paragraph", content: paraContent.length ? paraContent : undefined };
  });
  return { type: "doc", content };
}
