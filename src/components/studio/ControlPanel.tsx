"use client";

import { Layers, Plus, SlidersHorizontal, Star, Type as TypeIcon, X } from "lucide-react";
import { useState } from "react";
import type { DebossStudio } from "@/hooks/useDebossStudio";
import type { AspectId, FontFamily } from "@/types/deboss";
import {
  ASPECT_OPTIONS,
  FONT_OPTIONS,
  MAX_BRANDING_LENGTH,
  MAX_SET_NAME_LENGTH,
  PAPER_TONES,
  PRESETS,
  SLIDER_DEFS,
  rgbToHex,
} from "@/lib/deboss/constants";
import { ConfirmDialog } from "./ConfirmDialog";
import { SectionSheet } from "./SectionSheet";

/** Icon sizes for the "My sets" chips: star sits inline, delete is a small floating badge. */
const CHIP_STAR_ICON_SIZE = 15;
const CHIP_DELETE_ICON_SIZE = 12;
/** Icon size for the add-set form's own controls (cancel × and the "+" toggle). */
const CHIP_ICON_SIZE = 14;

/**
 * On narrow screens (see max-width:880px in globals.css), Presets/Sets,
 * Engraving, and Type & paper collapse into bottom sheets reached through
 * this menu: see SectionSheet for how the same markup serves both roles.
 */
const MOBILE_MENU: { id: string; label: string; Icon: typeof Layers }[] = [
  { id: "presets", label: "Presets & Sets", Icon: Layers },
  { id: "engraving", label: "Engraving", Icon: SlidersHorizontal },
  { id: "type-paper", label: "Type & Paper", Icon: TypeIcon },
];

function formatSliderValue(v: number): string {
  return v.toFixed(2).replace(/\.00$/, ".0");
}

export function ControlPanel({ studio }: { studio: DebossStudio }) {
  const {
    state,
    activePreset,
    customSets,
    activeCustomSet,
    defaultSetId,
    paperKey,
    selectedBlockId,
    setSelectedBlockId,
    setEditingBlockId,
    setBlockFont,
    setBrandingText,
    setSlider,
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

  // Font (below) edits whichever block is selected on the canvas; with
  // nothing selected it falls back to the first block, so the picker is
  // never just dead — there's always a sensible target to apply it to.
  const selectedBlock = state.textBlocks.find((b) => b.id === selectedBlockId) ?? null;
  const fontTargetBlock = selectedBlock ?? state.textBlocks[0] ?? null;

  // UI-only: whether the "name + save" form is expanded, and which set
  // (if any) is awaiting delete confirmation. Neither belongs in DebossState.
  const [isAddingSet, setIsAddingSet] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteSet =
    customSets.find((s) => s.id === pendingDeleteId) ?? null;

  // UI-only: which section is open, shared by the mobile bottom sheet AND
  // the desktop accordion (see SectionSheet) so exactly one is ever open
  // either way. Starts fully collapsed on both: nothing to open on mobile
  // until a mobile-menu button is tapped, and starting collapsed on desktop
  // is what keeps the sidebar short until the user picks something to tweak.
  const [openSection, setOpenSection] = useState<string | null>(null);
  const closeSection = () => setOpenSection(null);
  const toggleSection = (id: string) =>
    setOpenSection((cur) => (cur === id ? null : id));

  return (
    <aside className="panel" aria-label="Controls">
      {/* Text is edited directly on the canvas now (CanvasTextOverlay.tsx,
          PreviewStage.tsx): click the text, or use the "Edit text" button in
          the stage bar. No sidebar text box any more. */}

      {/* Mobile-only menu: opens the sections below as bottom sheets. Hidden
          on wide screens, where those sections already render inline. */}
      <nav className="mobile-menu" aria-label="Style menu">
        {MOBILE_MENU.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="mobile-menu-btn"
            onClick={() => {
              // Deselect any active text block first: on mobile, a selected
              // block's formatting toolbar docks at the top of the screen
              // (RichTextEditor.tsx), the same real estate a floating
              // .mini-preview swatch uses while a sheet is open. Only one of
              // the two ever needs to show at once, so opening a sheet wins.
              setSelectedBlockId(null);
              setEditingBlockId(null);
              setOpenSection(id);
            }}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <SectionSheet
        id="presets"
        title="Presets & Sets"
        icon={Layers}
        openSection={openSection}
        onToggle={() => toggleSection("presets")}
        onClose={closeSection}
        previewState={state}
      >
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

      {/* Custom sets: user-saved full configurations, kept separate from Presets */}
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
                  className={`set-chip-star${defaultSetId === set.id ? " is-default" : ""}`}
                  aria-pressed={defaultSetId === set.id}
                  aria-label={
                    defaultSetId === set.id
                      ? `Unset "${set.name}" as the default style on load`
                      : `Set "${set.name}" as the default style on load`
                  }
                  title={
                    defaultSetId === set.id
                      ? "Default on load, click to unset"
                      : "Set as default on load"
                  }
                  onClick={() => toggleDefaultSet(set.id)}
                >
                  <Star
                    size={CHIP_STAR_ICON_SIZE}
                    fill={defaultSetId === set.id ? "currentColor" : "none"}
                  />
                </button>
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
                  className="set-chip-delete"
                  aria-label={`Delete set: ${set.name}`}
                  onClick={() => setPendingDeleteId(set.id)}
                >
                  <X size={CHIP_DELETE_ICON_SIZE} />
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
      </SectionSheet>

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

      <SectionSheet
        id="engraving"
        title="Engraving"
        icon={SlidersHorizontal}
        openSection={openSection}
        onToggle={() => toggleSection("engraving")}
        onClose={closeSection}
        previewState={state}
      >
      {/* Sliders */}
      <section className="group">
        <span className="group-label">Engraving</span>
        {SLIDER_DEFS.map((def) => (
          <div className="slider" key={def.id}>
            <div className="slider-head">
              <label htmlFor={def.id}>{def.label}</label>
              <output htmlFor={def.id}>
                {formatSliderValue(state[def.id])}
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
      </SectionSheet>

      <SectionSheet
        id="type-paper"
        title="Type & Paper"
        icon={TypeIcon}
        openSection={openSection}
        onToggle={() => toggleSection("type-paper")}
        onClose={closeSection}
        previewState={state}
      >
      {/* Type & paper */}
      <section className="group">
        <span className="group-label">Type &amp; paper</span>

        <div className="field-row">
          <label htmlFor="font">Font</label>
          <select
            id="font"
            disabled={!fontTargetBlock}
            value={fontTargetBlock?.font ?? ""}
            onChange={(e) => {
              if (fontTargetBlock) void setBlockFont(fontTargetBlock.id, e.target.value as FontFamily);
            }}
          >
            {!fontTargetBlock && <option value="" />}
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
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
          <label htmlFor="brandingText">Branding</label>
          <input
            type="text"
            id="brandingText"
            placeholder="e.g. @yourname"
            maxLength={MAX_BRANDING_LENGTH}
            value={state.brandingText}
            onChange={(e) => setBrandingText(e.target.value)}
          />
        </div>
        {state.brandingText.trim() && (
          <p className="field-hint">Drag it on the canvas to reposition.</p>
        )}

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
      </SectionSheet>
    </aside>
  );
}
