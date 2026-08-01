"use client";

import { useEffect, useRef, useState } from "react";
import type { CustomSet, DebossState, TextBlock } from "@/types/deboss";
import type { SubmissionSourceKind } from "@/lib/gallery-submission/types";
import { DEFAULT_STATE } from "@/lib/deboss/constants";
import { buildExportCanvas } from "@/lib/deboss/engine";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_OTP_SENDS_PER_SESSION,
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_SESSION_SEND_COUNT_KEY,
  SUBMISSION_PREVIEW_LOGICAL_W,
  THUMBNAIL_LOGICAL_W,
  THUMBNAIL_SCALE,
} from "@/lib/gallery-submission/constants";
import { isGallerySubmissionConfigured } from "@/config/gallery-submission";
import { generateOtp } from "@/lib/gallery-submission/otp";
import { sendOtpEmail, sendSubmissionNotification } from "@/lib/gallery-submission/emailjs";
import { submitToSheet } from "@/lib/gallery-submission/sheet";
import { GalleryPreview } from "./GalleryPreview";

type Step = "form" | "otp" | "success" | "error";

interface GallerySubmissionModalProps {
  targetSet: CustomSet;
  textBlocks: TextBlock[];
  sourceKind: SubmissionSourceKind;
  onClose: () => void;
}

function readSessionSendCount(): number {
  try {
    return Number(window.sessionStorage.getItem(OTP_SESSION_SEND_COUNT_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function bumpSessionSendCount(): void {
  try {
    window.sessionStorage.setItem(
      OTP_SESSION_SEND_COUNT_KEY,
      String(readSessionSendCount() + 1),
    );
  } catch {
    /* storage unavailable: the per-session cap simply won't persist across reloads */
  }
}

/**
 * The one shared "request to post on gallery" modal, used by both entry
 * points (RequestPostButton in ControlPanel.tsx's set-chip row, and
 * CreateLauncher.tsx's navbar picker). `textBlocks` is the ONLY thing that
 * differs by source: the studio page passes the visitor's current on-
 * canvas text, the navbar (no live canvas) passes DEFAULT_TEXT_BLOCK.
 *
 * OTP is friction, not fortress: a 6-digit code generated client-side,
 * emailed via EmailJS, compared to browser state; there is no backend to
 * keep it secret (this app's hard "no backend" rule), so this only
 * confirms the email is reachable and deters casual bots/typos, not a
 * cryptographic guarantee. See docs/GALLERY_SUBMISSION_SETUP.md.
 */
export function GallerySubmissionModal({
  targetSet,
  textBlocks,
  sourceKind,
  onClose,
}: GallerySubmissionModalProps) {
  const configured = isGallerySubmissionConfigured();

  // Same merge order applyCustomSet already uses (useDebossStudio.ts):
  // DEFAULT_STATE as the base, the chosen set's style on top, since a
  // CustomSet excludes textBlocks/branding entirely and has nothing else
  // to seed a preview with.
  const previewState: DebossState = {
    ...DEFAULT_STATE,
    ...targetSet.state,
    textBlocks,
  };

  const [step, setStep] = useState<Step>("form");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);

  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [verifying, setVerifying] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);

  const otpCodeRef = useRef<string | null>(null);
  const expiresAtRef = useRef(0);
  const cooldownUntilRef = useRef(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Ticks once a second only while on the OTP step, purely to keep the
  // resend-cooldown countdown displayed live.
  useEffect(() => {
    if (step !== "otp") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  if (!configured) {
    return (
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="modal gallery-submit-modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Not set up yet</h2>
          <p>Gallery submissions aren&apos;t configured on this site yet. Please check back later.</p>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  async function startOtpStep() {
    setFormError(null);
    // Honeypot: a real visitor never fills this in (hidden via CSS); a bot
    // that autofills every field trips it and is silently dropped, no
    // network call and no indication to the bot that anything failed.
    if (honeypot.trim()) return;

    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setFormError("Please enter a display name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError("Please enter a valid email address.");
      return;
    }
    if (readSessionSendCount() >= MAX_OTP_SENDS_PER_SESSION) {
      setFormError("Too many verification attempts this session. Please try again later.");
      return;
    }

    setSendingOtp(true);
    try {
      const code = generateOtp();
      await sendOtpEmail(trimmedEmail, code);
      otpCodeRef.current = code;
      expiresAtRef.current = Date.now() + OTP_EXPIRY_MS;
      cooldownUntilRef.current = Date.now() + OTP_RESEND_COOLDOWN_MS;
      bumpSessionSendCount();
      setAttempts(0);
      setOtpInput("");
      setOtpError(null);
      setNow(Date.now());
      setStep("otp");
    } catch {
      setFormError("Couldn't send the verification email. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  }

  async function resendOtp() {
    if (now < cooldownUntilRef.current) return;
    if (readSessionSendCount() >= MAX_OTP_SENDS_PER_SESSION) {
      setOtpError("Too many verification attempts this session. Please try again later.");
      return;
    }
    setSendingOtp(true);
    try {
      const code = generateOtp();
      await sendOtpEmail(email.trim(), code);
      otpCodeRef.current = code;
      expiresAtRef.current = Date.now() + OTP_EXPIRY_MS;
      cooldownUntilRef.current = Date.now() + OTP_RESEND_COOLDOWN_MS;
      bumpSessionSendCount();
      setAttempts(0);
      setOtpInput("");
      setOtpError(null);
      setNow(Date.now());
    } catch {
      setOtpError("Couldn't resend the code. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  }

  async function verifyAndSubmit() {
    // Belt-and-suspenders: the submit button is also disabled once
    // attemptsExceeded, but guard here too in case a caller bypasses the
    // disabled UI (e.g. resubmitting the <form> directly).
    if (attempts >= OTP_MAX_ATTEMPTS) {
      setOtpError("Too many incorrect attempts. Send a new code.");
      return;
    }
    if (Date.now() > expiresAtRef.current) {
      setOtpError("This code has expired. Send a new one.");
      return;
    }
    if (otpInput.trim() !== otpCodeRef.current) {
      const next = attempts + 1;
      setAttempts(next);
      setOtpError(
        next >= OTP_MAX_ATTEMPTS
          ? "Too many incorrect attempts. Send a new code."
          : `Incorrect code (${OTP_MAX_ATTEMPTS - next} attempts left).`,
      );
      return;
    }

    setVerifying(true);
    setOtpError(null);
    try {
      const canvas = buildExportCanvas(previewState, THUMBNAIL_LOGICAL_W, THUMBNAIL_SCALE);
      const thumbnailDataUrl = canvas.toDataURL("image/png");
      const payload = {
        displayName: displayName.trim(),
        email: email.trim(),
        description: description.trim(),
        setName: targetSet.name,
        stateJson: JSON.stringify(previewState),
        sourceKind,
      };
      const results = await Promise.allSettled([
        sendSubmissionNotification(payload, thumbnailDataUrl),
        submitToSheet(payload, thumbnailDataUrl),
      ]);
      const allFailed = results.every((r) => r.status === "rejected");
      if (allFailed) {
        setResultError("Something went wrong sending your request. Please try again.");
        setStep("error");
      } else {
        setStep("success");
      }
    } catch {
      setResultError("Something went wrong sending your request. Please try again.");
      setStep("error");
    } finally {
      setVerifying(false);
    }
  }

  const secondsLeft = Math.max(0, Math.ceil((cooldownUntilRef.current - now) / 1000));

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal modal-lg gallery-submit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-submit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="gallery-submit-title">Request to post &ldquo;{targetSet.name}&rdquo; on the gallery</h2>

        <GalleryPreview
          state={previewState}
          width={SUBMISSION_PREVIEW_LOGICAL_W}
          label={`Preview of ${targetSet.name}`}
        />

        {step === "form" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void startOtpStep();
            }}
          >
            <p className="gallery-submit-notice">
              Your set needs to be genuinely unique: not already in the gallery, and not just a
              small tweak of an existing look, or it won&apos;t be published.
            </p>

            <div className="gallery-submit-field">
              <label htmlFor="gs-name">Display name</label>
              <input
                id="gs-name"
                type="text"
                value={displayName}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="gallery-submit-field">
              <label htmlFor="gs-email">Email</label>
              <input
                id="gs-email"
                type="email"
                value={email}
                maxLength={MAX_EMAIL_LENGTH}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="gallery-submit-field">
              <label htmlFor="gs-description">Description (optional)</label>
              <textarea
                id="gs-description"
                value={description}
                maxLength={MAX_DESCRIPTION_LENGTH}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <input
              type="text"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="gallery-submit-honeypot"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            {formError && <p className="gallery-submit-error">{formError}</p>}

            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn primary${sendingOtp ? " is-busy" : ""}`}
                disabled={sendingOtp}
              >
                {sendingOtp ? "Sending code…" : "Send verification code"}
              </button>
            </div>
          </form>
        )}

        {step === "otp" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verifyAndSubmit();
            }}
          >
            <p className="gallery-submit-notice">
              We sent a 6-digit code to {email.trim()}. Enter it below to confirm and submit your
              request.
            </p>

            <div className="gallery-submit-field">
              <label htmlFor="gs-otp">Verification code</label>
              <input
                id="gs-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="gallery-submit-otp-input"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                autoFocus
              />
            </div>

            {otpError && <p className="gallery-submit-error">{otpError}</p>}

            <div className="gallery-submit-otp-actions">
              <button
                type="button"
                className="btn ghost small"
                disabled={sendingOtp || now < cooldownUntilRef.current}
                onClick={() => void resendOtp()}
              >
                {now < cooldownUntilRef.current ? `Resend in ${secondsLeft}s` : "Resend code"}
              </button>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn primary${verifying ? " is-busy" : ""}`}
                disabled={verifying || otpInput.length !== 6 || attempts >= OTP_MAX_ATTEMPTS}
              >
                {verifying ? "Verifying…" : "Verify & submit"}
              </button>
            </div>
          </form>
        )}

        {step === "success" && (
          <div>
            <p>Thanks! Your request has been sent for review.</p>
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div>
            <p className="gallery-submit-error">{resultError}</p>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn primary" onClick={() => setStep("otp")}>
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
