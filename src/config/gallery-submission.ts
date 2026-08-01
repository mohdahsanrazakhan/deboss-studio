/**
 * Config for the gallery-submission feature (EmailJS + a Google Apps
 * Script Sheet web app). All values are NEXT_PUBLIC_* by necessity: this
 * app has no server, so every call these back (emailjs.ts, sheet.ts) makes
 * originates directly from the browser. This is safe by EmailJS's own
 * design (its "public key" is meant to be exposed client-side, unlike a
 * traditional API secret); the Apps Script URL is a public web-app
 * endpoint the owner deploys themselves, not a credential either.
 *
 * See docs/GALLERY_SUBMISSION_SETUP.md for how the site owner obtains each
 * value. Until all five are set to real values, isGallerySubmissionConfigured()
 * returns false and every entry point (RequestPostButton, CreateLauncher)
 * hides or disables the "request to post" affordance instead of letting a
 * visitor hit a broken, half-wired network call in production.
 */

const PLACEHOLDER = "__NOT_CONFIGURED__";

function readEnv(name: string, value: string | undefined): string {
  return value && value.trim() ? value : PLACEHOLDER;
}

export const gallerySubmissionConfig = {
  emailjsPublicKey: readEnv(
    "NEXT_PUBLIC_EMAILJS_PUBLIC_KEY",
    process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY,
  ),
  emailjsServiceId: readEnv(
    "NEXT_PUBLIC_EMAILJS_SERVICE_ID",
    process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
  ),
  /** Template must include an {{otp_code}} variable. */
  emailjsOtpTemplateId: readEnv(
    "NEXT_PUBLIC_EMAILJS_OTP_TEMPLATE_ID",
    process.env.NEXT_PUBLIC_EMAILJS_OTP_TEMPLATE_ID,
  ),
  /**
   * Template's own "To Email" field is fixed to the owner's inbox inside
   * the EmailJS dashboard itself, not passed as a client parameter, so the
   * owner's address never appears in client-side code.
   */
  emailjsNotifyTemplateId: readEnv(
    "NEXT_PUBLIC_EMAILJS_NOTIFY_TEMPLATE_ID",
    process.env.NEXT_PUBLIC_EMAILJS_NOTIFY_TEMPLATE_ID,
  ),
  /** Google Apps Script Web App URL (ends in /exec); appends a row to the owner's Sheet. */
  sheetWebAppUrl: readEnv(
    "NEXT_PUBLIC_GALLERY_SHEET_WEBAPP_URL",
    process.env.NEXT_PUBLIC_GALLERY_SHEET_WEBAPP_URL,
  ),
} as const;

/** True only once every value above has been replaced with a real one. */
export function isGallerySubmissionConfigured(): boolean {
  return Object.values(gallerySubmissionConfig).every((v) => v !== PLACEHOLDER);
}
