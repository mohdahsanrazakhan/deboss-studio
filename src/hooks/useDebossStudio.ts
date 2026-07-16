"use client";

/**
 * useDebossStudio
 * ---------------------------------------------------------------------
 * Owns the entire interactive lifecycle of the studio:
 *
 *  - DebossState (single source of truth, mirrored into a ref so the
 *    render loop always reads the latest values without re-binding).
 *  - Font readiness (canvas can't shape non-Latin scripts until faces load).
 *  - rAF-coalesced preview rendering (one paint per frame max).
 *  - ResizeObserver-driven re-layout (the preview width is fluid).
 *  - High-resolution PNG export: download + clipboard copy + native share.
 *  - User-saved "sets" in localStorage, one of which can be starred as the
 *    default that auto-applies its style (not its text) on every future load.
 *
 * The hook returns plain values + handlers; components stay dumb.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type {
  AspectId,
  CustomSet,
  DebossState,
  FontFamily,
  PresetId,
  SliderId,
  TextAlign,
} from "@/types/deboss";
import {
  CUSTOM_SETS_STORAGE_KEY,
  DEFAULT_HINT,
  DEFAULT_SET_STORAGE_KEY,
  DEFAULT_STATE,
  EXPORT_FILENAME,
  EXPORT_SCALE,
  GALLERY_EXAMPLES,
  MAX_CUSTOM_SETS,
  MAX_PREVIEW_DPR,
  MAX_SET_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  MIN_LOGICAL_W,
  PRESETS,
  generateSetId,
  hexToRgb,
  parsePaperKey,
  toSetSnapshot,
} from "@/lib/deboss/constants";
import {
  buildExportCanvas,
  canvasToPngBlob,
  computeLayout,
  drawScene,
  ensureFont,
} from "@/lib/deboss/engine";

export function useDebossStudio(
  initialPresetId: PresetId | null = null,
  initialExampleSlug: string | null = null,
) {
  const router = useRouter();
  const [state, setState] = useState<DebossState>(DEFAULT_STATE);
  const [activePreset, setActivePreset] = useState<PresetId | null>(null);
  const [customSets, setCustomSets] = useState<CustomSet[]>([]);
  const [activeCustomSet, setActiveCustomSet] = useState<string | null>(null);
  const [activeExample, setActiveExample] = useState<string | null>(null);
  const [defaultSetId, setDefaultSetId] = useState<string | null>(null);
  const [hint, setHint] = useState<string>(DEFAULT_HINT);
  const [isCopying, setIsCopying] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  // Native share (Web Share API with files) is mobile-only in practice; feature-detect
  // once on mount with a throwaway file so the button simply doesn't render where it
  // can't work (desktop, unsupported browsers), rather than showing a dead end.
  const [canShareImage, setCanShareImage] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Latest state for the render loop, without re-creating callbacks.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Latest custom sets for handlers that shouldn't be re-created per save/delete.
  const customSetsRef = useRef(customSets);
  customSetsRef.current = customSets;
  const customSetsLoadedRef = useRef(false);

  // Latest active-example id, read by setText without adding it as a dependency.
  const activeExampleRef = useRef(activeExample);
  activeExampleRef.current = activeExample;

  const fontsReadyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------------------------------------------------
     Preview rendering (debounced to one paint per animation frame)
     ------------------------------------------------------------------ */
  const measureLogicalWidth = useCallback((): number => {
    const stage = stageRef.current;
    if (!stage) return MIN_LOGICAL_W;
    const pad = Number.parseFloat(getComputedStyle(stage).paddingLeft) || 0;
    return Math.max(stage.clientWidth - pad * 2, MIN_LOGICAL_W);
  }, []);

  const renderPreview = useCallback(() => {
    if (!fontsReadyRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const s = stateRef.current;
    const logicalW = measureLogicalWidth();
    const layout = computeLayout(s, logicalW);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PREVIEW_DPR);

    drawScene(canvas, s, layout, dpr, s.transparent);

    // Present at logical CSS size so it stays crisp but fits the stage.
    canvas.style.width = `${layout.logicalW}px`;
    canvas.style.height = `${layout.logicalH}px`;
  }, [measureLogicalWidth]);

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
  }, [renderPreview]);

  // Re-render whenever any state changes.
  useEffect(() => {
    scheduleRender();
  }, [state, scheduleRender]);

  /* ------------------------------------------------------------------
     Font loading: first paint waits for all three faces
     ------------------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([
        ensureFont("Noto Nastaliq Urdu", DEFAULT_STATE.fontSize),
        ensureFont("Gulzar", DEFAULT_STATE.fontSize),
        ensureFont("Noto Naskh Arabic", DEFAULT_STATE.fontSize),
        ensureFont("Playfair Display", DEFAULT_STATE.fontSize),
        ensureFont("Noto Serif Devanagari", DEFAULT_STATE.fontSize),
        document.fonts.ready,
      ]);
      if (cancelled) return;
      fontsReadyRef.current = true;
      scheduleRender();
    })();
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, [scheduleRender]);

  /* ------------------------------------------------------------------
     Fluid width: ResizeObserver on the stage (debounced)
     ------------------------------------------------------------------ */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(scheduleRender, 120);
    });
    ro.observe(stage);
    return () => {
      if (timer) clearTimeout(timer);
      ro.disconnect();
    };
  }, [scheduleRender]);

  /* ------------------------------------------------------------------
     Native-share capability check (once, on mount)
     ------------------------------------------------------------------ */
  useEffect(() => {
    try {
      const testFile = new File([], EXPORT_FILENAME, { type: "image/png" });
      setCanShareImage(!!navigator.canShare?.({ files: [testFile] }));
    } catch {
      setCanShareImage(false);
    }
  }, []);

  /* ------------------------------------------------------------------
     Custom sets: load once on mount, persist on every change. Guarded
     with a "loaded" flag so the pre-load empty array never overwrites
     whatever is already in storage.

     The default set (if any) is applied to `state` in this SAME effect,
     synchronously with the load, not in a later render, so the very
     first canvas paint (gated on fonts being ready, which takes far
     longer than this localStorage read) already reflects it. No flash
     of the built-in default before the user's default set appears.
     ------------------------------------------------------------------ */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_SETS_STORAGE_KEY);
      const loadedSets: CustomSet[] = raw ? (JSON.parse(raw) as CustomSet[]) : [];
      setCustomSets(loadedSets);

      const storedDefaultId = window.localStorage.getItem(DEFAULT_SET_STORAGE_KEY);
      const defaultSet = storedDefaultId
        ? loadedSets.find((s) => s.id === storedDefaultId)
        : undefined;
      if (defaultSet) {
        setDefaultSetId(defaultSet.id);
        setState((s) => ({ ...s, ...defaultSet.state }));
      }
    } catch {
      /* storage unavailable or corrupt: start with an empty list, no default */
    } finally {
      customSetsLoadedRef.current = true;
    }
  }, []);

  /* ------------------------------------------------------------------
     Preset deep link: a validated `?preset=` query value resolved
     server-side (app/page.tsx) applies on first paint. Declared AFTER
     the custom-sets/default-set load effect above so its state update
     commits second in the same effect flush: a shared/linked preset
     URL takes priority over a starred default set, never the other
     way round. Runs once for the value present at mount; changing the
     preset afterwards goes through applyPreset, which updates the URL
     itself via setPresetInUrl.
     ------------------------------------------------------------------ */
  useEffect(() => {
    if (!initialPresetId) return;
    const p = PRESETS.find((x) => x.id === initialPresetId);
    if (!p) return;
    setActivePreset(p.id);
    setActiveCustomSet(null);
    setState((s) => ({
      ...s,
      depth: p.depth,
      shadow: p.shadow,
      highlight: p.highlight,
      blur: p.blur,
      texture: p.texture,
      paper: parsePaperKey(p.paper),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------------
     Gallery example deep link: a validated `?example=` query value
     resolved server-side (app/page.tsx/gallery pages) applies on first
     paint. Declared AFTER the preset-apply effect above, so if a URL
     somehow carries both `?preset=` and `?example=`, the example's
     full-state overwrite (including text) commits last and wins, the
     same "declared later wins" mechanism that already lets a preset
     beat a starred default set. A GalleryExample is a bespoke full
     look (font, paper, engraving, tint, align, aspect, AND text), so
     unlike a preset it fully replaces `state`, not a partial merge.
     ------------------------------------------------------------------ */
  useEffect(() => {
    if (!initialExampleSlug) return;
    const example = GALLERY_EXAMPLES.find((e) => e.slug === initialExampleSlug);
    if (!example) return;
    setActiveExample(example.slug);
    setActivePreset(null);
    setActiveCustomSet(null);
    setState(example.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!customSetsLoadedRef.current) return;
    try {
      window.localStorage.setItem(
        CUSTOM_SETS_STORAGE_KEY,
        JSON.stringify(customSets),
      );
    } catch {
      /* storage full/unavailable: sets stay in memory for this session */
    }
  }, [customSets]);

  useEffect(() => {
    if (!customSetsLoadedRef.current) return;
    try {
      if (defaultSetId) {
        window.localStorage.setItem(DEFAULT_SET_STORAGE_KEY, defaultSetId);
      } else {
        window.localStorage.removeItem(DEFAULT_SET_STORAGE_KEY);
      }
    } catch {
      /* storage full/unavailable: default choice stays in memory for this session */
    }
  }, [defaultSetId]);

  /* ------------------------------------------------------------------
     State mutators
     ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------
     Deep-link URL sync: reflects the active preset in `?preset=`, or
     the active gallery example in `?example=`, so a shared link stays
     accurate to what's on screen.

     `clearDeepLinkFromUrl` wipes the whole query string: used by
     mutators that invalidate BOTH a preset and an example alike
     (setSlider, setPaper, applyCustomSet, applyPreset's own state
     change before it sets its own param).

     `clearExampleFromUrl` removes only `?example=`, leaving `?preset=`
     untouched: used by mutators that invalidate a gallery example
     (which pins font/align/aspect/tint/transparency/text too) but do
     NOT invalidate a preset (which only cares about the 5 engraving
     numbers + paper, per the existing, unchanged precedent).
     ------------------------------------------------------------------ */
  const setPresetInUrl = useCallback((id: PresetId) => {
    router.replace(`${window.location.pathname}?preset=${id}`, { scroll: false });
  }, [router]);

  const clearDeepLinkFromUrl = useCallback(() => {
    if (!window.location.search) return;
    router.replace(window.location.pathname, { scroll: false });
  }, [router]);

  const clearExampleFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("example")) return;
    params.delete("example");
    const qs = params.toString();
    router.replace(
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
      { scroll: false },
    );
  }, [router]);

  const setText = useCallback((text: string) => {
    // A gallery example pins a specific text; retyping breaks it. A preset
    // or custom set excludes text by design, so this never touches those.
    if (activeExampleRef.current) {
      setActiveExample(null);
      clearExampleFromUrl();
    }
    // Length guard: prevents pathological inputs from freezing the canvas.
    setState((s) => ({ ...s, text: text.slice(0, MAX_TEXT_LENGTH) }));
  }, [clearExampleFromUrl]);

  const setSlider = useCallback((id: SliderId, value: number) => {
    setActivePreset(null); // manual tweak deactivates the preset/set chip
    setActiveCustomSet(null);
    setActiveExample(null);
    clearDeepLinkFromUrl();
    setState((s) => ({ ...s, [id]: value }));
  }, [clearDeepLinkFromUrl]);

  const setAlign = useCallback((align: TextAlign) => {
    setActiveCustomSet(null);
    setActiveExample(null);
    clearExampleFromUrl();
    setState((s) => ({ ...s, align }));
  }, [clearExampleFromUrl]);

  const setFont = useCallback(async (font: FontFamily) => {
    setActiveCustomSet(null);
    setActiveExample(null);
    clearExampleFromUrl();
    setState((s) => ({ ...s, font }));
    await ensureFont(font, stateRef.current.fontSize);
    // ensureFont may resolve after React's paint; force a fresh frame.
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
  }, [renderPreview, clearExampleFromUrl]);

  const setPaper = useCallback((key: string) => {
    setActivePreset(null);
    setActiveCustomSet(null);
    setActiveExample(null);
    clearDeepLinkFromUrl();
    setState((s) => ({ ...s, paper: parsePaperKey(key) }));
  }, [clearDeepLinkFromUrl]);

  const setTransparent = useCallback((transparent: boolean) => {
    setActiveCustomSet(null);
    setActiveExample(null);
    clearExampleFromUrl();
    setState((s) => ({ ...s, transparent }));
  }, [clearExampleFromUrl]);

  const setTint = useCallback((hex: string) => {
    setActiveCustomSet(null);
    setActiveExample(null);
    clearExampleFromUrl();
    setState((s) => ({ ...s, tint: hexToRgb(hex) }));
  }, [clearExampleFromUrl]);

  const setShadowColor = useCallback((hex: string) => {
    setActiveCustomSet(null);
    setActiveExample(null);
    clearExampleFromUrl();
    setState((s) => ({ ...s, shadowColor: hexToRgb(hex) }));
  }, [clearExampleFromUrl]);

  const setAspect = useCallback((aspect: AspectId) => {
    setActiveCustomSet(null);
    setActiveExample(null);
    clearExampleFromUrl();
    setState((s) => ({ ...s, aspect }));
  }, [clearExampleFromUrl]);

  const applyPreset = useCallback((id: PresetId) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setActivePreset(id);
    setActiveCustomSet(null);
    setActiveExample(null);
    setState((s) => ({
      ...s,
      depth: p.depth,
      shadow: p.shadow,
      highlight: p.highlight,
      blur: p.blur,
      texture: p.texture,
      paper: parsePaperKey(p.paper),
    }));
    setPresetInUrl(id);
  }, [setPresetInUrl]);

  /** "r,g,b" key of the current paper, used to highlight the swatch. */
  const paperKey = useMemo(
    () => `${state.paper.r},${state.paper.g},${state.paper.b}`,
    [state.paper],
  );

  /* ------------------------------------------------------------------
     Hint flash
     ------------------------------------------------------------------ */
  const [hintFlash, setHintFlash] = useState(false);
  const flashHint = useCallback((msg: string) => {
    setHint(msg);
    setHintFlash(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      setHint(DEFAULT_HINT);
      setHintFlash(false);
    }, 2600);
  }, []);

  /* ------------------------------------------------------------------
     Custom set actions: save/apply/delete a user-named full snapshot
     (everything but the typed text). Kept separate from applyPreset:
     a Set restores font/align/aspect/tint too, a Preset never does.
     ------------------------------------------------------------------ */
  /** Returns whether the set was actually saved, so the UI knows whether to collapse the form. */
  const saveCurrentAsSet = useCallback((name: string): boolean => {
    const trimmed = name.trim().slice(0, MAX_SET_NAME_LENGTH);
    if (!trimmed) return false;
    if (customSetsRef.current.length >= MAX_CUSTOM_SETS) {
      flashHint(`Set limit reached (${MAX_CUSTOM_SETS}), delete one first`);
      return false;
    }
    const newSet: CustomSet = {
      id: generateSetId(),
      name: trimmed,
      createdAt: Date.now(),
      state: toSetSnapshot(stateRef.current),
    };
    setCustomSets((sets) => [...sets, newSet]);
    setActivePreset(null);
    setActiveCustomSet(newSet.id);
    flashHint(`Saved "${trimmed}"`);
    return true;
  }, [flashHint]);

  const applyCustomSet = useCallback(async (id: string) => {
    const set = customSetsRef.current.find((x) => x.id === id);
    if (!set) return;
    setActivePreset(null);
    setActiveCustomSet(id);
    setActiveExample(null);
    clearDeepLinkFromUrl();
    setState((s) => ({ ...s, ...set.state }));
    await ensureFont(set.state.font, set.state.fontSize);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
  }, [renderPreview, clearDeepLinkFromUrl]);

  const deleteCustomSet = useCallback((id: string) => {
    setCustomSets((sets) => sets.filter((x) => x.id !== id));
    setActiveCustomSet((cur) => (cur === id ? null : cur));
    setDefaultSetId((cur) => (cur === id ? null : cur));
  }, []);

  /** Marks `id` as the set that auto-applies on future page loads; clicking the current default unsets it. */
  const toggleDefaultSet = useCallback((id: string) => {
    setDefaultSetId((cur) => (cur === id ? null : id));
  }, []);

  /* ------------------------------------------------------------------
     Export actions: same render path as the preview, at 3× resolution
     ------------------------------------------------------------------ */
  const downloadPng = useCallback(async () => {
    try {
      const out = buildExportCanvas(
        stateRef.current,
        measureLogicalWidth(),
        EXPORT_SCALE,
      );
      const blob = await canvasToPngBlob(out);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = EXPORT_FILENAME;
      a.click();
      URL.revokeObjectURL(url);
      flashHint(`Saved ${EXPORT_FILENAME}`);
    } catch {
      flashHint("Export failed, try again");
    }
  }, [flashHint, measureLogicalWidth]);

  const copyImage = useCallback(async () => {
    setIsCopying(true);
    try {
      const out = buildExportCanvas(
        stateRef.current,
        measureLogicalWidth(),
        EXPORT_SCALE,
      );
      const blob = await canvasToPngBlob(out);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      flashHint("Image copied to clipboard");
    } catch {
      flashHint("Copy not supported here, use Download instead");
    } finally {
      setIsCopying(false);
    }
  }, [flashHint, measureLogicalWidth]);

  /**
   * Hands the exported PNG to the OS share sheet (Instagram, Messages,
   * WhatsApp, etc. all appear there on supported mobile browsers; there is
   * no API to publish into a specific app directly). `canShareImage` gates
   * whether the button rendering this even exists; still guard here too in
   * case support changes between mount and click.
   */
  const shareImage = useCallback(async () => {
    setIsSharing(true);
    try {
      const out = buildExportCanvas(
        stateRef.current,
        measureLogicalWidth(),
        EXPORT_SCALE,
      );
      const blob = await canvasToPngBlob(out);
      const file = new File([blob], EXPORT_FILENAME, { type: "image/png" });
      if (!navigator.canShare?.({ files: [file] })) {
        flashHint("Sharing isn't supported here, try Download instead");
        return;
      }
      await navigator.share({ files: [file] });
    } catch (err) {
      // The user closing the share sheet without picking an app also
      // rejects with AbortError; that's a normal cancel, not a failure.
      if (err instanceof Error && err.name === "AbortError") return;
      flashHint("Share failed, try again");
    } finally {
      setIsSharing(false);
    }
  }, [flashHint, measureLogicalWidth]);

  return {
    state,
    activePreset,
    customSets,
    activeCustomSet,
    activeExample,
    defaultSetId,
    paperKey,
    hint,
    hintFlash,
    isCopying,
    isSharing,
    canShareImage,
    canvasRef,
    stageRef,
    setText,
    setSlider,
    setAlign,
    setFont,
    setPaper,
    setTransparent,
    setTint,
    setShadowColor,
    setAspect,
    applyPreset,
    saveCurrentAsSet,
    applyCustomSet,
    deleteCustomSet,
    toggleDefaultSet,
    downloadPng,
    copyImage,
    shareImage,
  };
}

export type DebossStudio = ReturnType<typeof useDebossStudio>;
