"use client";

import { Plus, Star, X } from "lucide-react";
import { useState } from "react";
import type { DebossStudio } from "@/hooks/useDebossStudio";
import type { AspectId, FontFamily, TextAlign } from "@/types/deboss";
import {
  ASPECT_OPTIONS,
  FONT_OPTIONS,
  MAX_SET_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  PAPER_TONES,
  PRESETS,
  SLIDER_DEFS,
  rgbToHex,
} from "@/lib/deboss/constants";
import { detectTextDirection } from "@/lib/deboss/direction";
import { ConfirmDialog } from "./ConfirmDialog";

/** Icon size for the compact chip/form controls in the "My sets" section. */
const CHIP_ICON_SIZE = 14;

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
    customSets,
    activeCustomSet,
    defaultSetId,
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
    saveCurrentAsSet,
    applyCustomSet,
    deleteCustomSet,
    toggleDefaultSet,
  } = studio;

  // UI-only: whether the "name + save" form is expanded, and which set
  // (if any) is awaiting delete confirmation. Neither belongs in DebossState.
  const [isAddingSet, setIsAddingSet] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteSet =
    customSets.find((s) => s.id === pendingDeleteId) ?? null;

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

      {/* Custom sets — user-saved full configurations, kept separate from Presets */}
      <section className="group">
        <span className="group-label" id="sets-label">
          My sets
        </span>

        {customSets.length > 0 ? (
          <div className="set-row" role="group" aria-labelledby="sets-label">
            {customSets.map((set) => (
              <div
                key={set.id}
                className={`set-chip${activeCustomSet === set.id ? " is-active" : ""}`}
              >
                <button
                  type="button"
                  className="set-chip-name"
                  aria-pressed={activeCustomSet === set.id}
                  onClick={() => void applyCustomSet(set.id)}
                >
                  {set.name}
                </button>
                <button
                  type="button"
                  className={`set-chip-star${defaultSetId === set.id ? " is-default" : ""}`}
                  aria-pressed={defaultSetId === set.id}
                  aria-label={
                    defaultSetId === set.id
                      ? `Unset "${set.name}" as the default style on load`
                      : `Set "${set.name}" as the default style on load`
                  }
                  title={
                    defaultSetId === set.id
                      ? "Default on load — click to unset"
                      : "Set as default on load"
                  }
                  onClick={() => toggleDefaultSet(set.id)}
                >
                  <Star
                    size={CHIP_ICON_SIZE}
                    fill={defaultSetId === set.id ? "currentColor" : "none"}
                  />
                </button>
                <button
                  type="button"
                  className="set-chip-delete"
                  aria-label={`Delete set: ${set.name}`}
                  onClick={() => setPendingDeleteId(set.id)}
                >
                  <X size={CHIP_ICON_SIZE} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="set-empty">
            Tune the controls to your taste, then save the look below.
          </p>
        )}

        {isAddingSet ? (
          <form
            className="set-save-row"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem(
                "setName",
              ) as HTMLInputElement;
              if (saveCurrentAsSet(input.value)) setIsAddingSet(false);
            }}
          >
            <input
              type="text"
              name="setName"
              placeholder="Name this set…"
              maxLength={MAX_SET_NAME_LENGTH}
              aria-label="New set name"
              autoFocus
            />
            <button type="submit" className="btn ghost small">
              Save set
            </button>
            <button
              type="button"
              className="set-add-cancel"
              aria-label="Cancel adding a set"
              onClick={() => setIsAddingSet(false)}
            >
              <X size={CHIP_ICON_SIZE} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="set-add-toggle"
            onClick={() => setIsAddingSet(true)}
          >
            <Plus size={CHIP_ICON_SIZE} aria-hidden="true" /> Add set
          </button>
        )}
      </section>

      <ConfirmDialog
        open={pendingDeleteSet !== null}
        title="Delete this set?"
        message={
          pendingDeleteSet
            ? `"${pendingDeleteSet.name}" will be removed. This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDeleteId) deleteCustomSet(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />

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
