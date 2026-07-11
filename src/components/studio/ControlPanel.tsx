"use client";

import type { DebossStudio } from "@/hooks/useDebossStudio";
import type { AspectId, FontFamily, TextAlign } from "@/types/deboss";
import {
  ASPECT_OPTIONS,
  FONT_OPTIONS,
  MAX_TEXT_LENGTH,
  PAPER_TONES,
  PRESETS,
  SLIDER_DEFS,
  rgbToHex,
} from "@/lib/deboss/constants";
import { detectTextDirection } from "@/lib/deboss/direction";

const ALIGNMENTS: { value: TextAlign; label: string }[] = [
  { value: "right", label: "Right" },
  { value: "center", label: "Center" },
  { value: "left", label: "Left" },
];

function formatSliderValue(id: string, v: number): string {
  return id === "fontSize"
    ? String(Math.round(v))
    : v.toFixed(2).replace(/\.00$/, ".0");
}

export function ControlPanel({ studio }: { studio: DebossStudio }) {
  const {
    state,
    activePreset,
    paperKey,
    setText,
    setSlider,
    setAlign,
    setFont,
    setPaper,
    setTint,
    setShadowColor,
    setAspect,
    applyPreset,
  } = studio;

  return (
    <aside className="panel" aria-label="Controls">
      {/* Text input */}
      <section className="group">
        <label className="group-label" htmlFor="text-input">
          Text
        </label>
        <textarea
          id="text-input"
          dir={detectTextDirection(state.text)}
          spellCheck={false}
          placeholder="Type or paste any text…"
          maxLength={MAX_TEXT_LENGTH}
          value={state.text}
          onChange={(e) => setText(e.target.value)}
        />
      </section>

      {/* Presets */}
      <section className="group">
        <span className="group-label" id="presets-label">
          Presets
        </span>
        <div className="preset-row" role="group" aria-labelledby="presets-label">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`preset${activePreset === p.id ? " is-active" : ""}`}
              aria-pressed={activePreset === p.id}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Sliders */}
      <section className="group">
        <span className="group-label">Engraving</span>
        {SLIDER_DEFS.map((def) => (
          <div className="slider" key={def.id}>
            <div className="slider-head">
              <label htmlFor={def.id}>{def.label}</label>
              <output htmlFor={def.id}>
                {formatSliderValue(def.id, state[def.id])}
              </output>
            </div>
            <input
              type="range"
              id={def.id}
              min={def.min}
              max={def.max}
              step={def.step}
              value={state[def.id]}
              onChange={(e) => setSlider(def.id, Number(e.target.value))}
            />
          </div>
        ))}
      </section>

      {/* Type & paper */}
      <section className="group">
        <span className="group-label">Type &amp; paper</span>

        <div className="field-row">
          <label htmlFor="font">Font</label>
          <select
            id="font"
            value={state.font}
            onChange={(e) => void setFont(e.target.value as FontFamily)}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <span id="align-label">Alignment</span>
          <div className="seg" role="group" aria-labelledby="align-label">
            {ALIGNMENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                className={`seg-btn${state.align === a.value ? " is-active" : ""}`}
                aria-pressed={state.align === a.value}
                onClick={() => setAlign(a.value)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-row">
          <label htmlFor="aspect">Canvas shape</label>
          <select
            id="aspect"
            value={state.aspect}
            onChange={(e) => setAspect(e.target.value as AspectId)}
          >
            {ASPECT_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <label htmlFor="tintColor">Text colour</label>
          <input
            type="color"
            id="tintColor"
            value={rgbToHex(state.tint)}
            onChange={(e) => setTint(e.target.value)}
          />
        </div>

        <div className="field-row">
          <label htmlFor="shadowColor">Shadow colour</label>
          <input
            type="color"
            id="shadowColor"
            value={rgbToHex(state.shadowColor)}
            onChange={(e) => setShadowColor(e.target.value)}
          />
        </div>

        <div className="field-row">
          <span id="paper-label">Paper tone</span>
          <div className="swatches" role="group" aria-labelledby="paper-label">
            {PAPER_TONES.map((tone) => (
              <button
                key={tone.key}
                type="button"
                className={`swatch${paperKey === tone.key ? " is-active" : ""}`}
                style={{ ["--c" as string]: tone.css }}
                title={tone.label}
                aria-label={`Paper tone: ${tone.label}`}
                aria-pressed={paperKey === tone.key}
                onClick={() => setPaper(tone.key)}
              />
            ))}
          </div>
        </div>
      </section>
    </aside>
  );
}
