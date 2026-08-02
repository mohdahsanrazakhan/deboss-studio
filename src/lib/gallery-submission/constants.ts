/**
 * Constants for the gallery-submission feature. Kept separate from
 * lib/deboss/constants.ts, which stays scoped to the rendering engine's
 * own domain (CLAUDE.md's file-ownership table); nothing here is read by
 * engine.ts.
 */

/** Input length caps, following the same defensive-cap precedent as MAX_TEXT_LENGTH/MAX_SET_NAME_LENGTH in lib/deboss/constants.ts. */
export const MAX_DISPLAY_NAME_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 500;
/** RFC 5321's own practical email length cap. */
export const MAX_EMAIL_LENGTH = 254;

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MS = 15 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 45 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** Per-browser-session cap on OTP sends (sessionStorage-backed, not bypass-proof): cheap spam/quota mitigation, see docs/GALLERY_SUBMISSION_SETUP.md. */
export const MAX_OTP_SENDS_PER_SESSION = 3;
export const OTP_SESSION_SEND_COUNT_KEY = "textDebossStudio.gallerySubmission.otpSendCount";

/** In-modal preview width (logical CSS px), independent of the studio's own preview sizing. */
export const SUBMISSION_PREVIEW_LOGICAL_W = 320;

/**
 * The image actually sent with a submission is rendered much smaller than a
 * real export (EXPORT_SCALE = 3 in lib/deboss/constants.ts): both Google
 * Sheets (~50,000-char cell cap) and EmailJS's own template-variable size
 * limits need a small base64 payload, and this is only a reference
 * thumbnail for the owner, not a print-quality export.
 *
 * Encoded as JPEG (see THUMBNAIL_JPEG_QUALITY below), not PNG: the paper
 * grain/texture layer is high-entropy noise that PNG's lossless compression
 * barely shrinks, so even at this small size a PNG thumbnail could exceed
 * EmailJS's own hard 50KB template-variable cap (confirmed in practice: a
 * real submission 413'd with "Variables size limit... maximum allowed
 * variables size is 50Kb" while the same payload's Sheets row went through
 * fine, since Apps Script has no equivalent per-variable cap). JPEG's
 * lossy compression handles that same noise far better.
 */
export const THUMBNAIL_LOGICAL_W = 240;
export const THUMBNAIL_SCALE = 1;
/** 0-1; tuned to keep a THUMBNAIL_LOGICAL_W-wide debossed thumbnail comfortably under EmailJS's 50KB template-variable cap. */
export const THUMBNAIL_JPEG_QUALITY = 0.6;
