"use client";

import { useEffect, useRef } from "react";
import { X, Undo2, RotateCw, Check } from "lucide-react";
import { AiMagicIcon } from "./ai-magic-icon";

export type OptimizationModalProps = {
  open: boolean;
  title: string;
  /** The text before optimization ran. */
  before: string;
  /** The text produced by the optimizer. */
  after: string;
  /** Accept the optimized version and close. */
  onAccept: () => void;
  /** Revert to the previous version and close. */
  onRevert: () => void;
  /** Run optimization again (optional). */
  onReoptimize?: () => void;
  /** Close without changing anything. */
  onClose: () => void;
  busy?: boolean;
};

export function OptimizationModal({
  open,
  title,
  before,
  after,
  onAccept,
  onRevert,
  onReoptimize,
  onClose,
  busy,
}: OptimizationModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const changed = before.trim() !== after.trim();

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <AiMagicIcon size="md" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {changed ? (
            <div className="flex flex-col gap-5">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                  <Undo2 size={12} />
                  Before
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-red-50/50 p-3 text-sm leading-relaxed whitespace-pre-wrap dark:bg-red-950/10">
                  {before.trim() || "(empty)"}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                  <AiMagicIcon size="sm" />
                  After
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-accent/30 bg-emerald-50/50 p-3 text-sm leading-relaxed whitespace-pre-wrap dark:bg-emerald-950/10">
                  {after.trim() || "(empty)"}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border p-4 text-center text-sm text-muted">
              No changes — the optimizer returned the same text.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onRevert}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-zinc-50 hover:text-foreground disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            <Undo2 size={14} />
            Revert
          </button>
          <div className="flex items-center gap-2">
            {onReoptimize ? (
              <button
                type="button"
                onClick={onReoptimize}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800"
              >
                <RotateCw size={14} className={busy ? "animate-spin" : ""} />
                {busy ? "Optimizing..." : "Re-optimize"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onAccept}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark disabled:opacity-50"
            >
              <Check size={14} />
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
