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
 *  - High-resolution PNG export: download + clipboard copy.
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
import type {
  AspectId,
  DebossState,
  FontFamily,
  PresetId,
  SliderId,
  TextAlign,
} from "@/types/deboss";
import {
  DEFAULT_HINT,
  DEFAULT_STATE,
  EXPORT_SCALE,
  MAX_PREVIEW_DPR,
  MAX_TEXT_LENGTH,
  MIN_LOGICAL_W,
  PRESETS,
  hexToRgb,
  parsePaperKey,
} from "@/lib/deboss/constants";
import {
  buildExportCanvas,
  canvasToPngBlob,
  computeLayout,
  drawScene,
  ensureFont,
} from "@/lib/deboss/engine";

export function useDebossStudio() {
  const [state, setState] = useState<DebossState>(DEFAULT_STATE);
  const [activePreset, setActivePreset] = useState<PresetId | null>(null);
  const [hint, setHint] = useState<string>(DEFAULT_HINT);
  const [isCopying, setIsCopying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Latest state for the render loop, without re-creating callbacks.
  const stateRef = useRef(state);
  stateRef.current = state;

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
     Font loading — first paint waits for all three faces
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
     Fluid width — ResizeObserver on the stage (debounced)
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
     State mutators
     ------------------------------------------------------------------ */
  const setText = useCallback((text: string) => {
    // Length guard: prevents pathological inputs from freezing the canvas.
    setState((s) => ({ ...s, text: text.slice(0, MAX_TEXT_LENGTH) }));
  }, []);

  const setSlider = useCallback((id: SliderId, value: number) => {
    setActivePreset(null); // manual tweak deactivates the preset chip
    setState((s) => ({ ...s, [id]: value }));
  }, []);

  const setAlign = useCallback((align: TextAlign) => {
    setState((s) => ({ ...s, align }));
  }, []);

  const setFont = useCallback(async (font: FontFamily) => {
    setState((s) => ({ ...s, font }));
    await ensureFont(font, stateRef.current.fontSize);
    // ensureFont may resolve after React's paint; force a fresh frame.
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderPreview);
  }, [renderPreview]);

  const setPaper = useCallback((key: string) => {
    setActivePreset(null);
    setState((s) => ({ ...s, paper: parsePaperKey(key) }));
  }, []);

  const setTransparent = useCallback((transparent: boolean) => {
    setState((s) => ({ ...s, transparent }));
  }, []);

  const setTint = useCallback((hex: string) => {
    setState((s) => ({ ...s, tint: hexToRgb(hex) }));
  }, []);

  const setShadowColor = useCallback((hex: string) => {
    setState((s) => ({ ...s, shadowColor: hexToRgb(hex) }));
  }, []);

  const setAspect = useCallback((aspect: AspectId) => {
    setState((s) => ({ ...s, aspect }));
  }, []);

  const applyPreset = useCallback((id: PresetId) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setActivePreset(id);
    setState((s) => ({
      ...s,
      depth: p.depth,
      shadow: p.shadow,
      highlight: p.highlight,
      blur: p.blur,
      texture: p.texture,
      paper: parsePaperKey(p.paper),
    }));
  }, []);

  /** "r,g,b" key of the current paper — used to highlight the swatch. */
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
     Export actions — same render path as the preview, at 3× resolution
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
      a.download = "text-deboss.png";
      a.click();
      URL.revokeObjectURL(url);
      flashHint("Saved text-deboss.png");
    } catch {
      flashHint("Export failed — try again");
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
      flashHint("Copy not supported here — use Download instead");
    } finally {
      setIsCopying(false);
    }
  }, [flashHint, measureLogicalWidth]);

  return {
    state,
    activePreset,
    paperKey,
    hint,
    hintFlash,
    isCopying,
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
    downloadPng,
    copyImage,
  };
}

export type DebossStudio = ReturnType<typeof useDebossStudio>;
