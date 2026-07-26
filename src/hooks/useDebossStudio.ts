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
  TextBlock,
} from "@/types/deboss";
import {
  BRANDING_TEXT_STORAGE_KEY,
  CUSTOM_SETS_STORAGE_KEY,
  DEFAULT_HINT,
  DEFAULT_SET_STORAGE_KEY,
  DEFAULT_STATE,
  DEFAULT_TEXT_BLOCK,
  EXPORT_FILENAME,
  EXPORT_SCALE,
  GALLERY_EXAMPLES,
  MAX_BRANDING_LENGTH,
  MAX_CUSTOM_SETS,
  MAX_PREVIEW_DPR,
  MAX_SET_NAME_LENGTH,
  MAX_TEXT_BLOCKS,
  MIN_LOGICAL_W,
  PRESETS,
  generateId,
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
  // Bumped only when `state.text` is overwritten from OUTSIDE the rich-text
  // editor (currently: the gallery-example deep link effect below), never by
  // the editor's own onChange round trip. RichTextEditor reloads its content
  // when this changes instead of watching state.text directly, so normal
  // typing never fights itself.
  const [textRevision, setTextRevision] = useState(0);
  const [hint, setHint] = useState<string>(DEFAULT_HINT);
  const [isCopying, setIsCopying] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  // Native share (Web Share API with files) is mobile-only in practice; feature-detect
  // once on mount with a throwaway file so the button simply doesn't render where it
  // can't work (desktop, unsupported browsers), rather than showing a dead end.
  const [canShareImage, setCanShareImage] = useState(false);
  // Which text block (if any) is selected (shows a selection outline + a
  // delete control) and which, if any, is actively focused for in-place
  // editing (a block can only be editingBlockId if it's also
  // selectedBlockId). Live here (not local to PreviewStage/
  // CanvasTextOverlay) because the render loop below needs editingBlockId
  // to suppress that ONE block's debossed render: this hook owns ALL
  // interactive state that affects what gets drawn. Never read by
  // buildExportCanvas, so export is unaffected regardless of live editing.
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Latest state for the render loop, without re-creating callbacks.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Latest custom sets for handlers that shouldn't be re-created per save/delete.
  const customSetsRef = useRef(customSets);
  customSetsRef.current = customSets;
  const customSetsLoadedRef = useRef(false);
  const brandingLoadedRef = useRef(false);

  // Latest active-example id, read by updateTextBlock without adding it as a dependency.
  const activeExampleRef = useRef(activeExample);
  activeExampleRef.current = activeExample;

  const fontsReadyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest editing block id for the render loop, without re-creating renderPreview.
  const editingBlockIdRef = useRef(editingBlockId);
  editingBlockIdRef.current = editingBlockId;

  // Latest selected block id, read by addTextBlock (new block copies its
  // style) without adding it as a dependency.
  const selectedBlockIdRef = useRef(selectedBlockId);
  selectedBlockIdRef.current = selectedBlockId;

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

    drawScene(canvas, s, layout, dpr, s.transparent, editingBlockIdRef.current);

    // Present at logical CSS size so it stays crisp but fits the stage.
    canvas.style.width = `${layout.logicalW}px`;
    canvas.style.height = `${layout.logicalH}px`;
  }, [measureLogicalWidth]);

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
  }, [renderPreview]);

  // Re-render whenever any state changes, or editing starts/stops (toggling
  // editingBlockId doesn't touch DebossState, so it needs its own dependency
  // to trigger the suppress/restore repaint).
  useEffect(() => {
    scheduleRender();
  }, [state, editingBlockId, scheduleRender]);

  /* ------------------------------------------------------------------
     Font loading: first paint waits for all three faces
     ------------------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([
        ensureFont("Noto Nastaliq Urdu", DEFAULT_TEXT_BLOCK.fontSize),
        ensureFont("Gulzar", DEFAULT_TEXT_BLOCK.fontSize),
        ensureFont("Noto Naskh Arabic", DEFAULT_TEXT_BLOCK.fontSize),
        ensureFont("Playfair Display", DEFAULT_TEXT_BLOCK.fontSize),
        // Real italic is a separate font resource from the upright weight
        // range above (see FONT_CAPABILITIES, layout.tsx's Google Fonts
        // URL): preload it too, so a first italic toggle doesn't briefly
        // fall back to a synthesized slant while it loads.
        ensureFont("Playfair Display", DEFAULT_TEXT_BLOCK.fontSize, "italic"),
        ensureFont("Noto Serif Devanagari", DEFAULT_TEXT_BLOCK.fontSize),
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
     Branding text: remembered across sessions (unlike the main `text`,
     a handle is a fixed identity, not per-design content), its own
     localStorage key, restored before first paint like the default set
     above. Position (brandingX/Y) is NOT persisted here; it lives in
     DebossState like everything else and resets per document.
     ------------------------------------------------------------------ */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BRANDING_TEXT_STORAGE_KEY);
      if (stored) setState((s) => ({ ...s, brandingText: stored }));
    } catch {
      /* storage unavailable or corrupt: start with no remembered branding */
    } finally {
      brandingLoadedRef.current = true;
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
    setTextRevision((r) => r + 1);
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

  useEffect(() => {
    if (!brandingLoadedRef.current) return;
    try {
      if (state.brandingText) {
        window.localStorage.setItem(BRANDING_TEXT_STORAGE_KEY, state.brandingText);
      } else {
        window.localStorage.removeItem(BRANDING_TEXT_STORAGE_KEY);
      }
    } catch {
      /* storage full/unavailable: branding text stays in memory for this session */
    }
  }, [state.brandingText]);

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

  // A gallery example pins its exact blocks; editing any of them (text,
  // style, or position) breaks that pin, exactly like retyping used to.
  // A preset or custom set excludes textBlocks by design (see CustomSet's
  // Omit), so this never touches those.
  const invalidateExample = useCallback(() => {
    if (activeExampleRef.current) {
      setActiveExample(null);
      clearExampleFromUrl();
    }
  }, [clearExampleFromUrl]);

  /** Generic per-block patch: backs block text, alignment, letter spacing, and line height. Font goes through setBlockFont instead (needs to await ensureFont); position through setBlockPosition (needs clamping). */
  const updateTextBlock = useCallback((id: string, patch: Partial<TextBlock>) => {
    invalidateExample();
    setState((s) => ({
      ...s,
      textBlocks: s.textBlocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }, [invalidateExample]);

  const setBlockFont = useCallback(async (id: string, font: FontFamily) => {
    invalidateExample();
    setState((s) => ({
      ...s,
      textBlocks: s.textBlocks.map((b) => (b.id === id ? { ...b, font } : b)),
    }));
    const size = stateRef.current.textBlocks.find((b) => b.id === id)?.fontSize
      ?? DEFAULT_TEXT_BLOCK.fontSize;
    await ensureFont(font, size);
    // ensureFont may resolve after React's paint; force a fresh frame.
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
  }, [renderPreview, invalidateExample]);

  /** Repositioning a block is orthogonal to "the look," like branding position: no preset/set invalidation beyond the example-pin exception above, no persistence (position is per-document, resets to centered on a fresh document/example/preset like block text itself). */
  const setBlockPosition = useCallback((id: string, x: number, y: number) => {
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setState((s) => ({
      ...s,
      textBlocks: s.textBlocks.map((b) =>
        b.id === id ? { ...b, textAnchorX: clamp(x), textAnchorY: clamp(y) } : b
      ),
    }));
  }, []);

  // Branding is personal metadata orthogonal to "the look": unlike every
  // other mutator below, it deliberately does NOT clear activePreset/
  // activeCustomSet/activeExample or touch the deep-link URL, the same
  // exception already granted to block text/style/position above.
  const setBrandingText = useCallback((text: string) => {
    setState((s) => ({ ...s, brandingText: text.slice(0, MAX_BRANDING_LENGTH) }));
  }, []);

  const setBrandingPosition = useCallback((x: number, y: number) => {
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setState((s) => ({ ...s, brandingX: clamp(x), brandingY: clamp(y) }));
  }, []);

  const setSlider = useCallback((id: SliderId, value: number) => {
    setActivePreset(null); // manual tweak deactivates the preset/set chip
    setActiveCustomSet(null);
    setActiveExample(null);
    clearDeepLinkFromUrl();
    setState((s) => ({ ...s, [id]: value }));
  }, [clearDeepLinkFromUrl]);

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
     Text block actions: add/delete a layer on the canvas
     ------------------------------------------------------------------ */
  /** Creates a new block at the given normalized position, copying the selected (or first) block's style so new text tends to match the last one touched; capped at MAX_TEXT_BLOCKS. Returns "" (and flashes a hint) if the cap is hit. */
  const addTextBlock = useCallback((x: number, y: number): string => {
    if (stateRef.current.textBlocks.length >= MAX_TEXT_BLOCKS) {
      flashHint(`Block limit reached (${MAX_TEXT_BLOCKS}), delete one first`);
      return "";
    }
    invalidateExample();
    const source =
      stateRef.current.textBlocks.find((b) => b.id === selectedBlockIdRef.current)
      ?? stateRef.current.textBlocks[0];
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const id = generateId();
    const newBlock: TextBlock = {
      ...(source ?? DEFAULT_TEXT_BLOCK),
      id,
      text: "",
      textAnchorX: clamp(x),
      textAnchorY: clamp(y),
    };
    setState((s) => ({ ...s, textBlocks: [...s.textBlocks, newBlock] }));
    setSelectedBlockId(id);
    setEditingBlockId(id);
    return id;
  }, [invalidateExample, flashHint]);

  /** Removes a block; clears selection/editing if either pointed at it. */
  const deleteTextBlock = useCallback((id: string) => {
    setState((s) => ({ ...s, textBlocks: s.textBlocks.filter((b) => b.id !== id) }));
    setSelectedBlockId((cur) => (cur === id ? null : cur));
    setEditingBlockId((cur) => (cur === id ? null : cur));
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
      id: generateId(),
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

  // No font/ensureFont dance needed here any more: a CustomSet excludes
  // textBlocks entirely (font lives per-block now, not something a single
  // Set can sensibly restore across N independently-styled blocks), so
  // applying one only ever touches document-level fields already covered
  // by the normal render-scheduling effect.
  const applyCustomSet = useCallback((id: string) => {
    const set = customSetsRef.current.find((x) => x.id === id);
    if (!set) return;
    setActivePreset(null);
    setActiveCustomSet(id);
    setActiveExample(null);
    clearDeepLinkFromUrl();
    setState((s) => ({ ...s, ...set.state }));
  }, [clearDeepLinkFromUrl]);

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
    textRevision,
    paperKey,
    hint,
    hintFlash,
    isCopying,
    isSharing,
    canShareImage,
    selectedBlockId,
    setSelectedBlockId,
    editingBlockId,
    setEditingBlockId,
    canvasRef,
    stageRef,
    updateTextBlock,
    setBlockFont,
    setBlockPosition,
    addTextBlock,
    deleteTextBlock,
    setBrandingText,
    setBrandingPosition,
    setSlider,
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
