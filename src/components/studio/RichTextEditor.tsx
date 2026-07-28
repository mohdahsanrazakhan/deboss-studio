"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Minus, Plus, Underline as UnderlineIcon } from "lucide-react";
import type { FontFamily, TextAlign } from "@/types/deboss";
import { CURSIVE_SCRIPT_FONTS, FONT_CAPABILITIES } from "@/lib/deboss/constants";
import { detectTextDirection } from "@/lib/deboss/direction";
import {
  deserializeToDoc,
  serializeDoc,
  stripTags,
  type RichDoc,
} from "@/lib/deboss/richtext";
import { FontSize } from "./FontSizeMark";

const SIZE_STEP = 1;
const MIN_SIZE = 8;
const MAX_SIZE = 400;
// Gap kept between the floating toolbar and the block it's anchored to,
// and between the toolbar and the viewport edge when clamping/flipping
// (see recomputeToolbarPosition below).
const TOOLBAR_MARGIN = 8;
// Matches globals.css's own primary mobile breakpoint (sidebar -> bottom
// sheets); the toolbar docks at the top of the screen at the same point,
// instead of floating near the block.
const MOBILE_DOCK_QUERY = "(max-width: 880px)";

/** A block's own screen-space box (CanvasTextOverlay.tsx's `Box`, duplicated here rather than imported: that file dynamic-imports this one, and a type-only cross-import back the other way is unnecessary coupling for four numbers). */
type Rect = { left: number; top: number; width: number; height: number };

type RichTextEditorProps = {
  value: string;
  onChange: (text: string) => void;
  font: FontFamily;
  baseSize: number;
  maxLength: number;
  /** Bump to force the editor to reload `value` (e.g. a gallery example deep link, applying a custom set), never on the editor's own onUpdate round trip. */
  externalRevision: number;
  /** Below: pixel-match the canvas render (CanvasTextOverlay.tsx), same formulas buildMask uses. */
  align: TextAlign;
  letterSpacing: number;
  lineHeightFactor: number;
  /** False = selected-only (formatting targets the whole block, see the mount effect below); true = actively typing (today's exact per-character behavior, unchanged). */
  isEditing: boolean;
  /** The block's own content box (CanvasTextOverlay.tsx's computeContentBox), used to anchor the floating toolbar now that it doesn't rely on a character selection existing at all. */
  anchorBox: Rect;
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

function getCurrentSize(editor: Editor | null, baseSize: number): number {
  if (!editor) return baseSize;
  const attrs = editor.getAttributes("fontSize") as { size?: number };
  return typeof attrs.size === "number" ? attrs.size : baseSize;
}

/**
 * Full WYSIWYG rich-text editor for the studio's text input (replaces the
 * plain <textarea>): select text, toggle Bold/Italic/Underline, or set its
 * size via a pill-shaped -/input/+ stepper plus a preset dropdown. Built on
 * Tiptap, trimmed to just paragraph/text/hardBreak + bold/italic/underline
 * + a custom FontSize mark (no headings, lists, links, etc.) so its
 * serialized output stays within the small tag vocabulary
 * lib/deboss/richtext.ts's engine-side parser understands.
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
  align,
  letterSpacing,
  lineHeightFactor,
  isEditing,
  anchorBox,
}: RichTextEditorProps) {
  // Refs so onUpdate always reads the latest props without re-creating the
  // editor or its handlers (same pattern as stateRef in useDebossStudio.ts).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const baseSizeRef = useRef(baseSize);
  baseSizeRef.current = baseSize;
  const maxLengthRef = useRef(maxLength);
  maxLengthRef.current = maxLength;

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number }>({
    top: -9999,
    left: -9999,
  });
  // This component only ever mounts while its block is selected
  // (CanvasTextOverlay.tsx), so the toolbar itself needs no visibility
  // state of its own any more: it always renders (portaled) for as long as
  // the component is mounted, block-selection IS "toolbar visible" now.

  // Below globals.css's own primary mobile breakpoint, the toolbar docks
  // at the top of the screen instead of floating near the block (small
  // screens don't have room to spare, and a block near the top edge would
  // otherwise constantly hit the flip-below case).
  const [isMobileDocked, setIsMobileDocked] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_DOCK_QUERY);
    const update = () => setIsMobileDocked(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Portaled to <body> (see the toolbar's render below) so it's never
  // clipped by `.stage-inner`'s `overflow: hidden` (its positioning
  // ancestor otherwise) and always paints above the sidebar/mobile sheet,
  // which are plain unpositioned/lower-z-index siblings. Position itself
  // is computed here rather than in CSS, since "just above the block,
  // flipping below / clamping sideways near a viewport edge" needs real
  // measured boxes, not something CSS alone can express once the element is
  // no longer a DOM descendant of what it's anchored to. Anchored to the
  // block's own box (not a character selection, which may not exist at
  // all in the selected-only sub-state), passed down from
  // CanvasTextOverlay.tsx's already-computed `contentBox`.
  const recomputeToolbarPosition = useCallback(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const toolbarRect = toolbar.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Vertical: prefer sitting just above the block so it doesn't cover
    // the text. Flip to just below when there isn't room above; if
    // neither fits, clamp fully into view rather than letting either edge clip.
    let top = anchorBox.top - toolbarRect.height - TOOLBAR_MARGIN;
    if (top < TOOLBAR_MARGIN) {
      const below = anchorBox.top + anchorBox.height + TOOLBAR_MARGIN;
      if (below + toolbarRect.height + TOOLBAR_MARGIN <= vh) {
        top = below;
      } else {
        top = Math.min(
          Math.max(top, TOOLBAR_MARGIN),
          Math.max(vh - toolbarRect.height - TOOLBAR_MARGIN, TOOLBAR_MARGIN),
        );
      }
    }

    // Horizontal: centered over the block, clamped fully into the
    // viewport so it can't run off either side near the canvas's edges.
    let left = anchorBox.left + anchorBox.width / 2 - toolbarRect.width / 2;
    left = Math.min(left, vw - toolbarRect.width - TOOLBAR_MARGIN);
    left = Math.max(left, TOOLBAR_MARGIN);

    setToolbarPos({ top, left });
  }, [anchorBox]);

  // Measure/position synchronously before paint (no visible flash), then
  // keep tracking: the resize/scroll listeners re-clamp against the
  // viewport even when the block's own box hasn't moved. Skipped entirely
  // while docked, since that's pure CSS positioning with no JS-computed
  // top/left to keep in sync.
  useLayoutEffect(() => {
    if (isMobileDocked) return;
    recomputeToolbarPosition();
  }, [isMobileDocked, recomputeToolbarPosition]);

  useEffect(() => {
    if (isMobileDocked) return;
    window.addEventListener("resize", recomputeToolbarPosition);
    window.addEventListener("scroll", recomputeToolbarPosition, true);
    return () => {
      window.removeEventListener("resize", recomputeToolbarPosition);
      window.removeEventListener("scroll", recomputeToolbarPosition, true);
    };
  }, [isMobileDocked, recomputeToolbarPosition]);

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
    root.style.fontFamily = `"${font}", "Noto Nastaliq Urdu", "Playfair Display", "Noto Serif Devanagari", "Gulzar", "Noto Naskh Arabic", "Jameel Noori Nastaleeq", "Jameel Noori Nastaleeq Kasheeda", ui-serif, serif`;
    // Base (unmarked-run) size/spacing must match buildMask's own formulas
    // exactly (same principle as letterSpacing/lineHeightFactor's documented
    // measure-vs-draw parity), since this editor now renders pixel-matched
    // directly on top of the canvas (CanvasTextOverlay.tsx) rather than in a
    // small fixed sidebar box with its own decorative CSS size.
    root.style.fontSize = `${baseSize}px`;
    root.style.lineHeight = `${lineHeightFactor}`;
    root.style.letterSpacing = `${letterSpacing}px`;
    root.style.textAlign = align;
  }, [editor, dir, font, baseSize, letterSpacing, lineHeightFactor, align]);

  // While editing (typing mode): focus at the end, exactly like before this
  // component could also mount in a non-typing, selected-only sub-state.
  // While merely selected: select the WHOLE block's content, WITHOUT
  // focusing, so the toolbar's actions (below) apply block-wide by default
  // per the new selection-toolbar model. Deliberately no `.focus()` here:
  // CanvasTextOverlay.tsx's own block-delete keydown listener listens on
  // `window` for Delete/Backspace while selected-not-editing, and doesn't
  // check which element has DOM focus. If this (invisible) editor ever
  // actually held focus, ProseMirror's own keymap would intercept
  // Backspace at the contentEditable before it ever bubbles to `window`,
  // corrupting the hidden doc instead of deleting the block. `selectAll()`
  // only touches ProseMirror's own internal state.selection, which doesn't
  // require or cause DOM focus.
  useEffect(() => {
    if (!editor) return;
    if (isEditing) {
      editor.commands.focus("end");
    } else {
      editor.commands.selectAll();
    }
  }, [editor, isEditing]);

  const capabilities = FONT_CAPABILITIES[font];
  const isCursive = CURSIVE_SCRIPT_FONTS.includes(font);

  // Every toolbar command chain starts here instead of a bare
  // `editor.chain()`: `.focus()` is only appropriate while `isEditing`.
  // Calling it in the selected-only sub-state would steal DOM focus onto
  // this (invisible) editor, reintroducing the exact Delete-key conflict
  // the mount effect above avoids by never calling `.focus()` on select.
  // The underlying commands (toggleBold/Italic/Underline/setFontSize)
  // don't need focus to apply to `editor.state.selection` either way.
  const beginChain = (ed: Editor) => (isEditing ? ed.chain().focus() : ed.chain());

  // Mark-toggle/size commands don't collapse the selection on their own, but
  // this restores it defensively anyway (belt-and-suspenders): the point is
  // "select once, apply multiple actions" must hold even if that ever
  // changes, so a run that unexpectedly collapsed the selection re-expands
  // it to what the user had selected, letting the next tap (e.g. A+ right
  // after Bold) apply to the same range without reselecting.
  const runFormatting = (action: () => void) => {
    if (!editor) return;
    if (isCursive) snapSelectionToWordBoundaries(editor);
    const saved = { from: editor.state.selection.from, to: editor.state.selection.to };
    action();
    const cur = editor.state.selection;
    if (cur.from === cur.to && saved.from !== saved.to) {
      editor.chain().setTextSelection(saved).run();
    }
  };

  const currentSize = getCurrentSize(editor, baseSize);

  // The editable number input in the middle of the stepper: a local text
  // draft, not a value driven straight from currentSize, so the user can
  // freely type/clear digits without the display snapping back mid-keystroke.
  // It re-syncs from currentSize (a preset pick, a +/- press, a different
  // selection, etc.) whenever the input itself isn't the thing with focus,
  // so typing never fights an external update, the same principle already
  // used for RichTextEditor's own content-reload-on-externalRevision effect.
  const sizeInputRef = useRef<HTMLInputElement>(null);
  const [sizeDraft, setSizeDraft] = useState(String(currentSize));
  useEffect(() => {
    if (document.activeElement !== sizeInputRef.current) {
      setSizeDraft(String(currentSize));
    }
  }, [currentSize]);

  /** Clamps to [MIN_SIZE, MAX_SIZE] and applies via the shared runFormatting path (same selection save/restore every other toolbar action gets), used by the -/+ buttons, the editable input's commit, and the preset dropdown alike. */
  const applySize = (raw: number) => {
    if (!editor) return;
    const next = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(raw)));
    runFormatting(() => beginChain(editor).setFontSize(next).run());
    setSizeDraft(String(next));
  };

  const bumpSize = (delta: number) => applySize(currentSize + delta);

  const commitSizeDraft = () => {
    const parsed = Number.parseInt(sizeDraft, 10);
    if (Number.isFinite(parsed)) {
      applySize(parsed);
    } else {
      setSizeDraft(String(currentSize)); // empty/invalid: revert, don't apply
    }
  };

  // Attached to onMouseDown on every toolbar button (not onClick, which
  // fires too late): preventDefault stops the browser's default "move
  // focus to the button" behavior for that press, which is what was
  // blurring the contentEditable and collapsing/clearing its selection
  // before the click handler ever ran. The actual formatting still runs
  // from onClick, by which point the selection is untouched since focus
  // never left the editor.
  //
  // Deliberately mousedown-only, not touchstart, despite this needing to
  // work on touch: two things were tried and both made it worse.
  // (1) `onTouchStart={preserveSelection}` as a React prop never actually
  // prevents anything, since React registers its delegated touchstart
  // listener as PASSIVE by default (scroll-performance optimization) and
  // silently no-ops preventDefault() inside a passive listener, logging
  // "Unable to preventDefault inside passive event listener invocation" on
  // every tap. (2) Bypassing that with a real native `{ passive: false }`
  // touchstart listener DOES successfully preventDefault, but that also
  // cancels the browser's synthesized mousedown/mouseup/click compatibility
  // events for that same tap (verified with Playwright's touch emulation:
  // formatting stopped applying entirely once this was added), so the
  // button's onClick never fires at all. Touch browsers still dispatch a
  // synthesized `mousedown` after every tap release for compatibility
  // (unless touchstart's default was prevented, per case 2 above), and
  // THAT is what actually carries the focus-stealing default action this
  // needs to cancel, on both mouse and touch, so mousedown alone is both
  // necessary and sufficient.
  const preserveSelection = (e: React.SyntheticEvent) => {
    e.preventDefault();
  };

  const toolbar = (
    <div
      ref={toolbarRef}
      className={`rich-text-toolbar${isMobileDocked ? " is-docked" : ""}`}
      role="toolbar"
      aria-label="Text formatting"
      style={isMobileDocked ? undefined : { top: toolbarPos.top, left: toolbarPos.left }}
    >
      <button
        type="button"
        className={`rich-text-btn${editor?.isActive("bold") ? " is-active" : ""}`}
        disabled={!editor || !capabilities.bold}
        aria-pressed={editor?.isActive("bold") ?? false}
        aria-label="Bold"
        title={capabilities.bold ? "Bold" : `Bold isn't available for ${font} (no bold face loaded)`}
        onMouseDown={preserveSelection}
        onClick={() => runFormatting(() => editor && beginChain(editor).toggleBold().run())}
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
        onMouseDown={preserveSelection}
        onClick={() => runFormatting(() => editor && beginChain(editor).toggleItalic().run())}
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
        onMouseDown={preserveSelection}
        onClick={() => runFormatting(() => editor && beginChain(editor).toggleUnderline().run())}
      >
        <UnderlineIcon size={15} aria-hidden="true" />
      </button>
      <span className="rich-text-toolbar-divider" aria-hidden="true" />
      {/*
        Pill stepper: -/+ get the same onMouseDown preventDefault as every
        other toolbar button above (never need real focus, so blocking the
        browser's default focus-shift keeps the ProseMirror selection
        untouched the whole time). The number input deliberately does NOT:
        it must accept real focus/typing to be editable at all. Selection
        safety for it instead comes from the same mechanism runFormatting
        already relies on: ProseMirror doesn't clear editor.state.selection
        on a mere DOM blur (only an explicit transaction does), so the
        original range survives the input stealing focus, and
        `.chain().focus()...` inside applySize/runFormatting re-selects
        that exact range before the size mark is actually applied.
      */}
      <div className="rich-text-size-stepper">
        <button
          type="button"
          className="rich-text-size-btn"
          disabled={!editor || currentSize <= MIN_SIZE}
          aria-label="Decrease font size"
          title="Decrease font size"
          onMouseDown={preserveSelection}
          onClick={() => bumpSize(-SIZE_STEP)}
        >
          <Minus size={13} aria-hidden="true" />
        </button>
        <input
          ref={sizeInputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          className="rich-text-size-input"
          disabled={!editor}
          aria-label="Font size in pixels"
          value={sizeDraft}
          onChange={(e) => setSizeDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => {
            // Applies immediately on Enter; onBlur below is the other commit
            // path (clicking/tabbing away). Not also calling .blur() here
            // avoids double-committing the same value through both handlers.
            if (e.key === "Enter") {
              e.preventDefault();
              commitSizeDraft();
            }
          }}
          onBlur={commitSizeDraft}
        />
        <button
          type="button"
          className="rich-text-size-btn"
          disabled={!editor || currentSize >= MAX_SIZE}
          aria-label="Increase font size"
          title="Increase font size"
          onMouseDown={preserveSelection}
          onClick={() => bumpSize(SIZE_STEP)}
        >
          <Plus size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="rich-text-editor">
      {createPortal(toolbar, document.body)}
      <EditorContent editor={editor} className="rich-text-input" />
    </div>
  );
}
