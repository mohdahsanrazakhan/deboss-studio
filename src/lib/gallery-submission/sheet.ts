import { gallerySubmissionConfig } from "@/config/gallery-submission";
import type { SubmissionPayload } from "./types";

/**
 * Google Sheets (and any spreadsheet app) treats a cell value starting
 * with `=`, `+`, `-`, `@`, tab, or carriage return as a formula. Without
 * this, a visitor could submit a Display Name/Description/Set Name like
 * `=IMPORTXML(...)` and have it silently execute once the row lands in
 * the owner's Sheet (a known class of bug called CSV/spreadsheet formula
 * injection). Prefixing a leading apostrophe forces Sheets to treat the
 * value as plain text; EmailJS's plain-text email body has no equivalent
 * risk, so this is applied only for the Sheet payload below, not the
 * notification email in emailjs.ts.
 */
function sanitizeForSheet(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Appends one row to the owner's Google Sheet via their own deployed Apps
 * Script Web App (docs/GALLERY_SUBMISSION_SETUP.md has the exact doPost
 * script to paste there). Posted as `text/plain` deliberately: a JSON
 * content-type would trigger a CORS preflight OPTIONS request, which Apps
 * Script web apps can't answer, silently breaking the call. Apps Script's
 * own CORS response headers are inconsistent for `fetch` to read back
 * reliably, so this is treated as fire-and-forget best-effort (same
 * "friction, not fortress" posture already accepted for the OTP): any
 * non-throwing fetch is treated as success.
 */
export async function submitToSheet(
  payload: SubmissionPayload,
  thumbnailDataUrl: string,
): Promise<void> {
  await fetch(gallerySubmissionConfig.sheetWebAppUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      displayName: sanitizeForSheet(payload.displayName),
      email: sanitizeForSheet(payload.email),
      description: sanitizeForSheet(payload.description),
      setName: sanitizeForSheet(payload.setName),
      stateJson: payload.stateJson,
      thumbnail: thumbnailDataUrl,
      sourceKind: payload.sourceKind,
    }),
  });
}
