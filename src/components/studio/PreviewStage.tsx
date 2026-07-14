"use client";

import { Copy, Download, Share2 } from "lucide-react";
import type { DebossStudio } from "@/hooks/useDebossStudio";

export function PreviewStage({ studio }: { studio: DebossStudio }) {
  const {
    state,
    canvasRef,
    stageRef,
    hint,
    hintFlash,
    isCopying,
    isSharing,
    canShareImage,
    setTransparent,
    downloadPng,
    copyImage,
    shareImage,
  } = studio;

  return (
    <section className="stage" aria-label="Preview">
      <div className="stage-inner" ref={stageRef}>
        {/* Canvas is drawn entirely in the deboss engine */}
        <canvas
          id="preview"
          ref={canvasRef}
          role="img"
          aria-label="Live preview of the debossed text"
        />
      </div>

      <div className="stage-bar">
        <label className="checkbox">
          <input
            type="checkbox"
            id="transparent"
            checked={state.transparent}
            onChange={(e) => setTransparent(e.target.checked)}
          />
          <span>Transparent background</span>
        </label>

        <div className="actions">
          <button
            type="button"
            className={`btn ghost${isCopying ? " is-busy" : ""}`}
            aria-label="Copy image"
            title="Copy image"
            onClick={() => void copyImage()}
          >
            <Copy size={16} aria-hidden="true" />
            <span className="btn-label">Copy image</span>
          </button>
          {canShareImage && (
            <button
              type="button"
              className={`btn ghost icon${isSharing ? " is-busy" : ""}`}
              aria-label="Share image"
              title="Share image"
              onClick={() => void shareImage()}
            >
              <Share2 size={17} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            aria-label="Download PNG"
            title="Download PNG"
            onClick={() => void downloadPng()}
          >
            <Download size={16} aria-hidden="true" />
            <span className="btn-label">Download PNG</span>
          </button>
        </div>
      </div>

      <p
        className={`hint${hintFlash ? " flash" : ""}`}
        aria-live="polite"
      >
        {hint}
      </p>
    </section>
  );
}
