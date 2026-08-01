/**
 * Domain types for the gallery-submission feature: a visitor requesting
 * their own saved CustomSet be considered for the curated public gallery
 * (GALLERY_EXAMPLES). Kept separate from types/deboss.ts, which is scoped
 * to the rendering engine's own domain (CLAUDE.md's file-ownership table).
 */

/** Where a submission was launched from; both reach the same modal/flow. */
export type SubmissionSourceKind = "chip" | "navbar";

/** Everything the owner needs to review and (if they choose) hand-author a real GalleryExample entry from. */
export interface SubmissionPayload {
  displayName: string;
  email: string;
  description: string;
  setName: string;
  /** JSON.stringify of the synthesized DebossState (chosen set's style + the paired text), lossless even if the thumbnail is too small to judge by eye. */
  stateJson: string;
  sourceKind: SubmissionSourceKind;
}
