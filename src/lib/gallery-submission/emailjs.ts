import { gallerySubmissionConfig } from "@/config/gallery-submission";
import { EMAILJS_NOTIFY_PAYLOAD_SAFE_LIMIT } from "./constants";
import type { SubmissionPayload } from "./types";

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

/**
 * Plain fetch, no @emailjs/browser SDK dependency: this project keeps its
 * runtime dependency count deliberately minimal (docs/SEO-PLAN.md's "keep
 * it lean" guardrail), and EmailJS's public-key REST endpoint is designed
 * to be called directly from client-side JS with no backend, the exact
 * fit for this app's "no server" hard rule.
 */
async function sendEmail(templateId: string, templateParams: Record<string, string>): Promise<void> {
  const res = await fetch(EMAILJS_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: gallerySubmissionConfig.emailjsServiceId,
      template_id: templateId,
      user_id: gallerySubmissionConfig.emailjsPublicKey,
      template_params: templateParams,
    }),
  });
  if (!res.ok) throw new Error(`EmailJS send failed (${res.status})`);
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  await sendEmail(gallerySubmissionConfig.emailjsOtpTemplateId, {
    to_email: email,
    otp_code: code,
  });
}

/**
 * The owner's own inbox is the template's fixed "To Email" in the EmailJS
 * dashboard, not a parameter here (see config/gallery-submission.ts).
 */
export async function sendSubmissionNotification(
  payload: SubmissionPayload,
  thumbnailDataUrl: string,
): Promise<void> {
  const params: Record<string, string> = {
    display_name: payload.displayName,
    from_email: payload.email,
    description: payload.description,
    set_name: payload.setName,
    state_json: payload.stateJson,
    thumbnail: thumbnailDataUrl,
    source_kind: payload.sourceKind,
  };
  // See EMAILJS_NOTIFY_PAYLOAD_SAFE_LIMIT's own comment (constants.ts): a
  // real design's thumbnail can still land over EmailJS's 50KB hard cap
  // even after JPEG compression, and that would otherwise make the whole
  // notification 413 and vanish silently (the paired Sheets submission
  // still succeeds, so nothing else surfaces the failure). Drop just the
  // image rather than lose the entire email.
  if (JSON.stringify(params).length > EMAILJS_NOTIFY_PAYLOAD_SAFE_LIMIT) {
    params.thumbnail = "(omitted: too large to email, see the full thumbnail in the Google Sheets row instead)";
  }
  await sendEmail(gallerySubmissionConfig.emailjsNotifyTemplateId, params);
}
