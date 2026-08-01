import { OTP_LENGTH } from "./constants";

/**
 * Generates a 6-digit one-time code, client-side. This is a "friction, not
 * fortress" verification: it confirms the visitor typed a real, reachable
 * email address and filters out typos/bots, but since there is no backend
 * to keep it secret (a hard rule of this project), a technically determined
 * user could read it out of devtools/network before "verifying" it. See
 * GallerySubmissionModal.tsx and docs/GALLERY_SUBMISSION_SETUP.md.
 */
export function generateOtp(): string {
  const max = 10 ** OTP_LENGTH;
  let n: number;
  try {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    n = (arr[0] as number) % max;
  } catch {
    n = Math.floor(Math.random() * max);
  }
  return n.toString().padStart(OTP_LENGTH, "0");
}
