"use client";

import { Copy, Download, Pencil, Share2 } from "lucide-react";
import type { DebossStudio } from "@/hooks/useDebossStudio";
import { BrandingHandle } from "./BrandingHandle";
import { CanvasTextOverlay } from "./CanvasTextOverlay";

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
    selectedBlockId,
    setSelectedBlockId,
    setEditingBlockId,
    addTextBlock,
    setTransparent,
    downloadPng,
    copyImage,
    shareImage,
  } = studio;

  // Accessibility fallback for CanvasTextOverlay's click-to-edit, which
  // needs a precise click on canvas glyphs: edit the selected block, else
  // the first block, else (no blocks at all) create one at center.
  const handleEditTextClick = () => {
    const targetId = selectedBlockId ?? state.textBlocks[0]?.id;
    if (targetId) {
      setSelectedBlockId(targetId);
      setEditingBlockId(targetId);
    } else {
      addTextBlock(0.5, 0.5);
    }
  };

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
        <CanvasTextOverlay studio={studio} />
        <BrandingHandle studio={studio} />
      </div>

      <div className="stage-bar">
        <div className="stage-bar-left">
          <label className="checkbox">
            <input
              type="checkbox"
              id="transparent"
              checked={state.transparent}
              onChange={(e) => setTransparent(e.target.checked)}
            />
            <span>Transparent background</span>
          </label>
          <button
            type="button"
            className="btn ghost icon"
            aria-label="Edit text"
            title="Edit text"
            onClick={handleEditTextClick}
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
        </div>

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
