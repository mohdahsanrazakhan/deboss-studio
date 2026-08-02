import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Custom Tiptap mark: Tiptap core ships no text-case mark. Deliberately
 * non-destructive, matching Bold/Italic/Underline (not a one-time text
 * mutation): the stored text keeps its original typed case, only the
 * DISPLAY is transformed uppercase, both here (via `text-transform`, so
 * the live editor's WYSIWYG DOM matches what the canvas will draw) and in
 * lib/deboss/richtext.ts's serializeDoc/deserializeToDoc, which map this
 * mark to/from `<uc>` (that module's own closed tag vocabulary) and
 * engine.ts's buildBlockMask/measureRichLines, which apply the actual
 * `.toUpperCase()`/`text-transform: uppercase` at draw/measure time. No
 * attributes needed, unlike FontSizeMark: this is a plain boolean toggle.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    uppercase: {
      toggleUppercase: () => ReturnType;
    };
  }
}

export const Uppercase = Mark.create({
  name: "uppercase",

  parseHTML() {
    return [{ style: "text-transform=uppercase" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { style: "text-transform: uppercase" }), 0];
  },

  addCommands() {
    return {
      toggleUppercase:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});
