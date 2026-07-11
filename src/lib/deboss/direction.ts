/**
 * First-strong text direction detection (a simplified version of P2/P3 in
 * the Unicode Bidirectional Algorithm): scan for the first character that
 * is strongly LTR or RTL and use its direction. This lets the textarea and
 * the canvas engine auto-switch between scripts (Urdu/Arabic/Hebrew vs.
 * Latin/Devanagari/etc.) without a manual toggle. Falls back to "rtl" when
 * no strong character is found (matches this app's Urdu-first default).
 *
 * Ranges are deliberately non-overlapping: RTL covers Hebrew, Arabic,
 * Syriac, Thaana, NKo, Samaritan, Mandaic, Arabic Extended-A, and Hebrew/
 * Arabic presentation forms; LTR covers Latin, Greek, Cyrillic, Armenian,
 * Devanagari and other major Indic scripts, and most other blocks.
 */
const RTL_CHAR = /[֑-߿ࠀ-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_CHAR =
  /[A-Za-zÀ-ʯͰ-֐ऀ-῿Ⰰ-﬜︀-﹯＀-￿]/;

export type TextDirection = "ltr" | "rtl";

export function detectTextDirection(text: string): TextDirection {
  for (const ch of text) {
    if (RTL_CHAR.test(ch)) return "rtl";
    if (LTR_CHAR.test(ch)) return "ltr";
  }
  return "rtl";
}
