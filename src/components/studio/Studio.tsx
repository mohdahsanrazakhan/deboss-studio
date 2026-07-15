"use client";

/**
 * Studio: the interactive application shell.
 * Composes the control panel (left) and the live preview stage (right).
 * All state lives in useDebossStudio; children are presentational.
 */

import { useDebossStudio } from "@/hooks/useDebossStudio";
import type { PresetId } from "@/types/deboss";
import { ControlPanel } from "./ControlPanel";
import { PreviewStage } from "./PreviewStage";

type StudioProps = {
  /** A validated `?preset=` id resolved server-side (app/page.tsx), or null when absent. */
  initialPresetId?: PresetId | null;
};

export function Studio({ initialPresetId = null }: StudioProps) {
  const studio = useDebossStudio(initialPresetId);

  return (
    <main className="layout">
      <ControlPanel studio={studio} />
      <PreviewStage studio={studio} />
    </main>
  );
}
