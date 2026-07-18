"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Underline as UnderlineIcon } from "lucide-react";
import type { FontFamily } from "@/types/deboss";
import { CURSIVE_SCRIPT_FONTS, FONT_CAPABILITIES } from "@/lib/deboss/constants";
import { detectTextDirection } from "@/lib/deboss/direction";
import {
  deserializeToDoc,
  serializeDoc,
  stripTags,
  type RichDoc,
} from "@/lib/deboss/richtext";
import { FontSize } from "./FontSizeMark";

const SIZE_STEP = 8;
const MIN_SIZE = 16;
const MAX_SIZE = 200;

type RichTextEditorProps = {
  value: string;
  onChange: (text: string) => void;
  font: FontFamily;
  baseSize: number;
  maxLength: number;
  /** Bump to force the editor to reload `value` (e.g. a gallery example deep link, applying a custom set), never on the editor's own onUpdate round trip. */
  externalRevision: number;
};

/** Expands a partial-word selection out to the nearest whitespace on both sides, so a style boundary never lands mid-word. Safe no-op for a collapsed selection or one spanning multiple paragraphs. */
function snapSelectionToWordBoundaries(editor: Editor): void {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty) return;

  const $from = state.doc.resolve(from);
  const paraStart = $from.start($from.depth);
  const paraEnd = $from.end($from.depth);
  if (to > paraEnd) return; // spans multiple paragraphs: leave selection as-is

  const paraText = state.doc.textBetween(paraStart, paraEnd, "\n");
  let relFrom = from - paraStart;
  let relTo = to - paraStart;

  while (relFrom > 0 && !/\s/.test(paraText[relFrom - 1] ?? "")) relFrom--;
  while (relTo < paraText.length && !/\s/.test(paraText[relTo] ?? "")) relTo++;

  const newFrom = paraStart + relFrom;
  const newTo = paraStart + relTo;
  if (newFrom !== from || newTo !== to) {
    editor.chain().setTextSelection({ from: newFrom, to: newTo }).run();
  }
}

function getCurrentSize(editor: Editor, baseSize: number): number {
  const attrs = editor.getAttributes("fontSize") as { size?: number };
  return typeof attrs.size === "number" ? attrs.size : baseSize;
}

/**
 * Full WYSIWYG rich-text editor for the studio's text input (replaces the
 * plain <textarea>): select text, toggle Bold/Italic/Underline, or bump
 * its size with A-/A+. Built on Tiptap, trimmed to just paragraph/text/
 * hardBreak + bold/italic/underline + a custom FontSize mark (no headings,
 * lists, links, etc.) so its serialized output stays within the small tag
 * vocabulary lib/deboss/richtext.ts's engine-side parser understands.
 *
 * Loaded via next/dynamic (see ControlPanel.tsx) so its bytes land in a
 * separate chunk outside the page's tracked First Load JS.
 */
export function RichTextEditor({
  value,
  onChange,
  font,
  baseSize,
  maxLength,
  externalRevision,
}: RichTextEditorProps) {
  // Refs so onUpdate always reads the latest props without re-creating the
  // editor or its handlers (same pattern as stateRef in useDebossStudio.ts).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const baseSizeRef = useRef(baseSize);
  baseSizeRef.current = baseSize;
  const maxLengthRef = useRef(maxLength);
  maxLengthRef.current = maxLength;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
      }),
      FontSize,
    ],
    content: deserializeToDoc(value, baseSize) as JSONContent,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      const plainLength = ed.getText().length;
      if (plainLength > maxLengthRef.current) {
        ed.commands.undo();
        return;
      }
      const doc = ed.getJSON() as unknown as RichDoc;
      onChangeRef.current(serializeDoc(doc, baseSizeRef.current));
    },
  });

  // Reload content only when told to (external overwrite), never in
  // response to the editor's own onUpdate -> onChange round trip.
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(deserializeToDoc(value, baseSize) as JSONContent, {
      emitUpdate: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, externalRevision]);

  // dir tracks the CURRENT plain-text content, recomputed reactively, never
  // hardcoded (hard project rule: direction always flows from detectTextDirection).
  const dir = detectTextDirection(stripTags(value));

  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom as HTMLElement;
    root.dir = dir;
    // Active font first (matches what the canvas will actually render),
    // then the same multi-script fallback stack as the CSS default (see
    // .rich-text-input .ProseMirror in globals.css), so typing a script
    // the active font doesn't cover still shows readable glyphs.
    root.style.fontFamily = `"${font}", "Noto Nastaliq Urdu", "Playfair Display", "Noto Serif Devanagari", "Gulzar", "Noto Naskh Arabic", ui-serif, serif`;
  }, [editor, dir, font]);

  const capabilities = FONT_CAPABILITIES[font];
  const isCursive = CURSIVE_SCRIPT_FONTS.includes(font);

  const runFormatting = (action: () => void) => {
    if (!editor) return;
    if (isCursive) snapSelectionToWordBoundaries(editor);
    action();
  };

  const bumpSize = (delta: number) => {
    if (!editor) return;
    const current = getCurrentSize(editor, baseSize);
    const next = Math.min(MAX_SIZE, Math.max(MIN_SIZE, current + delta));
    runFormatting(() => editor.chain().focus().setFontSize(next).run());
  };

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting">
        <button
          type="button"
          className={`rich-text-btn${editor?.isActive("bold") ? " is-active" : ""}`}
          disabled={!editor || !capabilities.bold}
          aria-pressed={editor?.isActive("bold") ?? false}
          aria-label="Bold"
          title={capabilities.bold ? "Bold" : `Bold isn't available for ${font} (no bold face loaded)`}
          onClick={() => runFormatting(() => editor?.chain().focus().toggleBold().run())}
        >
          <Bold size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`rich-text-btn${editor?.isActive("italic") ? " is-active" : ""}`}
          disabled={!editor || !capabilities.italic}
          aria-pressed={editor?.isActive("italic") ?? false}
          aria-label="Italic"
          title={capabilities.italic ? "Italic" : `Italic isn't available for ${font} (no italic face loaded)`}
          onClick={() => runFormatting(() => editor?.chain().focus().toggleItalic().run())}
        >
          <Italic size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`rich-text-btn${editor?.isActive("underline") ? " is-active" : ""}`}
          disabled={!editor}
          aria-pressed={editor?.isActive("underline") ?? false}
          aria-label="Underline"
          title="Underline"
          onClick={() => runFormatting(() => editor?.chain().focus().toggleUnderline().run())}
        >
          <UnderlineIcon size={15} aria-hidden="true" />
        </button>
        <span className="rich-text-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="rich-text-btn"
          disabled={!editor}
          aria-label="Decrease size"
          title="Decrease size"
          onClick={() => bumpSize(-SIZE_STEP)}
        >
          A-
        </button>
        <button
          type="button"
          className="rich-text-btn"
          disabled={!editor}
          aria-label="Increase size"
          title="Increase size"
          onClick={() => bumpSize(SIZE_STEP)}
        >
          A+
        </button>
      </div>
      <EditorContent editor={editor} className="rich-text-input" />
    </div>
  );
}
