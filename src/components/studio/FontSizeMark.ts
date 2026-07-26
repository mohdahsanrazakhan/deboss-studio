import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Custom Tiptap mark: Tiptap core ships no font-size mark, and this app
 * only needs one attribute (a concrete px value), not a general inline-
 * style mark. Serialized/parsed to/from DebossState.text by
 * lib/deboss/richtext.ts's serializeDoc/deserializeToDoc as
 * `<span style="font-size:Npx">`, the same tag that module's parseRuns
 * understands; keep both in sync if this ever changes.
 *
 * The editor now renders directly on top of the canvas (CanvasTextOverlay.tsx),
 * pixel-matched to what buildMask draws, so `size` is shown at its true
 * value with no display cap (a previous version capped the on-screen CSS at
 * 40px, back when this editor lived in a small fixed sidebar box that a
 * 150px+ word would blow out; that constraint no longer exists). `data-size`
 * stays the canonical attribute (not the CSS `style`) so copy/paste within/
 * into the editor round-trips correctly even for arbitrary pasted-in markup.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: number) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Mark.create({
  name: "fontSize",

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          // Prefer data-size (this mark's own canonical output). Falls back
          // to the CSS value for arbitrary pasted-in content (e.g. from
          // another site) that has no data-size attribute.
          const dataSize = Number.parseFloat(element.getAttribute("data-size") ?? "");
          if (Number.isFinite(dataSize)) return dataSize;
          const cssSize = Number.parseFloat(element.style.fontSize);
          return Number.isFinite(cssSize) ? cssSize : null;
        },
        renderHTML: (attributes: { size?: number | null }) => {
          if (!attributes.size) return {};
          return {
            "data-size": String(attributes.size),
            style: `font-size: ${attributes.size}px`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ style: "font-size" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontSize:
        (size: number) =>
        ({ chain }) =>
          chain().setMark(this.name, { size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    };
  },
});
