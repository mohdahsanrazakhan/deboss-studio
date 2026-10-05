"use client";

import { Layers, Plus, SlidersHorizontal, Star, Type as TypeIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { DebossStudio } from "@/hooks/useDebossStudio";
import type { AspectId, FontFamily, LogoAnchor, LogoStyle, LogoTone } from "@/types/deboss";
import {
  ASPECT_OPTIONS,
  BRANDING_FONT_SIZE_MAX,
  BRANDING_FONT_SIZE_MIN,
  FONT_OPTIONS,
  LOGO_OPACITY_MIN,
  LOGO_SCALE_MAX,
  LOGO_SCALE_MIN,
  LOGO_SRC,
  MAX_BRANDING_LENGTH,
  MAX_SET_NAME_LENGTH,
  PAPER_TONES,
  PRESETS,
  SLIDER_DEFS,
  rgbToHex,
} from "@/lib/deboss/constants";
import { resolveBrandingFont, resolveBrandingFontSize, resolveLogoTone } from "@/lib/deboss/engine";
import { ConfirmDialog } from "./ConfirmDialog";
import { RequestPostButton } from "./RequestPostButton";
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

/** The 3x3 snap grid for the logo watermark, in reading order. */
const LOGO_POSITIONS: { id: Exclude<LogoAnchor, "custom">; label: string }[] = [
  { id: "tl", label: "Top left" },
  { id: "tc", label: "Top center" },
  { id: "tr", label: "Top right" },
  { id: "ml", label: "Middle left" },
  { id: "c", label: "Center" },
  { id: "mr", label: "Middle right" },
  { id: "bl", label: "Bottom left" },
  { id: "bc", label: "Bottom center" },
  { id: "br", label: "Bottom right" },
];
const LOGO_TONES: { id: LogoTone; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];
const LOGO_STYLES: { id: LogoStyle; label: string }[] = [
  { id: "ink", label: "Ink" },
  { id: "debossed", label: "Debossed" },
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
    setBrandingFont,
    setBrandingFontSize,
    updateLogo,
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
  // either way. Starts null (matches the server render, and on mobile
  // nothing should open until a mobile-menu button is tapped); on desktop
  // the effect below then opens "Presets & Sets" by default.
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Desktop only: the same state on mobile would pop the Presets bottom
  // sheet open on every page load. 880px must match the max-width:880px
  // switchover in globals.css (and SectionSheet.tsx's matchMedia). Done
  // after mount, not as the useState initializer, so SSR and the first
  // client render agree (no hydration mismatch). The functional update
  // leaves any section the user already opened alone.
  useEffect(() => {
    if (window.matchMedia("(max-width: 880px)").matches) return;
    setOpenSection((cur) => cur ?? "presets");
  }, []);
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
                <RequestPostButton set={set} textBlocks={state.textBlocks} />
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
          <>
            {/* Both show the RESOLVED value: with no override set, this is
                textBlocks[0]'s own font/proportional size (see
                resolveBrandingFont/resolveBrandingFontSize, engine.ts), so
                branding stays visually symmetric with the main text by
                default. Picking a value here overrides branding ONLY,
                never the main text block. */}
            <div className="field-row">
              <label htmlFor="brandingFont">Branding font</label>
              <select
                id="brandingFont"
                value={resolveBrandingFont(state)}
                onChange={(e) => void setBrandingFont(e.target.value as FontFamily)}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <label htmlFor="brandingSize">Branding size</label>
              <input
                type="number"
                id="brandingSize"
                min={BRANDING_FONT_SIZE_MIN}
                max={BRANDING_FONT_SIZE_MAX}
                value={Math.round(resolveBrandingFontSize(state))}
                onChange={(e) => setBrandingFontSize(Number(e.target.value))}
              />
            </div>
            <p className="field-hint">Drag it on the canvas to reposition.</p>
          </>
        )}

        {/* Logo watermark: an image mark (public/watermark/), separate
            from the text Branding above. Settings persist across sessions
            (useDebossStudio.ts), so once it's on it stays on every post. */}
        <div className="logo-wm">
          <div className="field-row">
            <label className="checkbox">
              <input
                type="checkbox"
                id="logoEnabled"
                checked={state.logo.enabled}
                onChange={(e) => updateLogo({ enabled: e.target.checked })}
              />
              <span>Logo watermark</span>
            </label>
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static same-origin thumbnail, next/image adds nothing here */}
            <img
              className={`logo-wm-thumb${resolveLogoTone(state) === "light" ? " is-light" : ""}`}
              src={LOGO_SRC[resolveLogoTone(state)]}
              alt=""
              width={96}
              height={20}
            />
          </div>
          {state.logo.enabled && (
            <>
              <div className="field-row">
                <span id="logo-pos-label">Position</span>
                <div className="logo-pos-grid" role="group" aria-labelledby="logo-pos-label">
                  {LOGO_POSITIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`logo-pos-btn${state.logo.anchor === p.id ? " is-active" : ""}`}
                      aria-label={p.label}
                      aria-pressed={state.logo.anchor === p.id}
                      title={p.label}
                      onClick={() => updateLogo({ anchor: p.id })}
                    />
                  ))}
                </div>
              </div>

              <div className="slider">
                <div className="slider-head">
                  <label htmlFor="logoScale">Logo size</label>
                  <output htmlFor="logoScale">{Math.round(state.logo.scale * 100)}%</output>
                </div>
                <input
                  type="range"
                  id="logoScale"
                  min={LOGO_SCALE_MIN}
                  max={LOGO_SCALE_MAX}
                  step={0.01}
                  value={state.logo.scale}
                  onChange={(e) => updateLogo({ scale: Number(e.target.value) })}
                />
              </div>

              <div className="slider">
                <div className="slider-head">
                  <label htmlFor="logoOpacity">Logo opacity</label>
                  <output htmlFor="logoOpacity">{Math.round(state.logo.opacity * 100)}%</output>
                </div>
                <input
                  type="range"
                  id="logoOpacity"
                  min={LOGO_OPACITY_MIN}
                  max={1}
                  step={0.01}
                  value={state.logo.opacity}
                  onChange={(e) => updateLogo({ opacity: Number(e.target.value) })}
                />
              </div>

              <div className="field-row">
                <span id="logo-tone-label">Logo colour</span>
                <div className="seg" role="group" aria-labelledby="logo-tone-label">
                  {LOGO_TONES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`seg-btn${state.logo.tone === t.id ? " is-active" : ""}`}
                      aria-pressed={state.logo.tone === t.id}
                      disabled={state.logo.style === "debossed"}
                      onClick={() => updateLogo({ tone: t.id })}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field-row">
                <span id="logo-style-label">Logo style</span>
                <div className="seg" role="group" aria-labelledby="logo-style-label">
                  {LOGO_STYLES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      className={`seg-btn${state.logo.style === st.id ? " is-active" : ""}`}
                      aria-pressed={state.logo.style === st.id}
                      onClick={() => updateLogo({ style: st.id })}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="field-hint">
                Drag the logo on the canvas for a custom spot; near a grid position it snaps back exactly.
              </p>
            </>
          )}
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
      </SectionSheet>
    </aside>
  );
}
