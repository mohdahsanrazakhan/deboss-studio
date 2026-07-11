"use client";

import type { DebossStudio } from "@/hooks/useDebossStudio";

export function PreviewStage({ studio }: { studio: DebossStudio }) {
  const {
    state,
    canvasRef,
    stageRef,
    hint,
    hintFlash,
    isCopying,
    setTransparent,
    downloadPng,
    copyImage,
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
            onClick={() => void copyImage()}
          >
            Copy image
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void downloadPng()}
          >
            Download PNG
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
