import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Custom Tiptap mark: Tiptap core ships no font-size mark, and this app
 * only needs one attribute (a concrete px value), not a general inline-
 * style mark. Serialized/parsed to/from DebossState.text by
 * lib/deboss/richtext.ts's serializeDoc/deserializeToDoc as
 * `<span style="font-size:Npx">`, the same tag that module's parseRuns
 * understands; keep both in sync if this ever changes.
 *
 * The REAL size (used for canvas rendering and serialization) and the size
 * actually rendered on screen INSIDE the small editor box are deliberately
 * different: a 150px+ word would blow out the ~92-260px editor container.
 * `size` stays the true value everywhere that matters (attrs, editor.getJSON(),
 * the data-size attribute); only the `style` CSS shown in the editable DOM is
 * capped at EDITOR_MAX_DISPLAY_PX. `data-size` (not the capped inline style)
 * is what parseHTML reads back from, so copy/paste within/into the editor
 * round-trips the true value, not the visually-capped one.
 */
const EDITOR_MAX_DISPLAY_PX = 40;

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
          // Prefer data-size (this mark's own canonical output) over the
          // rendered CSS value, which is a capped DISPLAY size, not the
          // true one. Falls back to the CSS value for arbitrary pasted-in
          // content (e.g. from another site) that has no data-size.
          const dataSize = Number.parseFloat(element.getAttribute("data-size") ?? "");
          if (Number.isFinite(dataSize)) return dataSize;
          const cssSize = Number.parseFloat(element.style.fontSize);
          return Number.isFinite(cssSize) ? cssSize : null;
        },
        renderHTML: (attributes: { size?: number | null }) => {
          if (!attributes.size) return {};
          const displaySize = Math.min(attributes.size, EDITOR_MAX_DISPLAY_PX);
          return {
            "data-size": String(attributes.size),
            style: `font-size: ${displaySize}px`,
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
