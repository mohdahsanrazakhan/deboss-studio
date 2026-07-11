"use client";

/**
 * Studio — the interactive application shell.
 * Composes the control panel (left) and the live preview stage (right).
 * All state lives in useDebossStudio; children are presentational.
 */

import { useDebossStudio } from "@/hooks/useDebossStudio";
import { ControlPanel } from "./ControlPanel";
import { PreviewStage } from "./PreviewStage";

export function Studio() {
  const studio = useDebossStudio();

  return (
    <main className="layout">
      <ControlPanel studio={studio} />
      <PreviewStage studio={studio} />
    </main>
  );
}
