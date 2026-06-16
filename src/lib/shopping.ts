import { toast } from "sonner";

/** Lowercase, strip diacritics, collapse whitespace. Works for Latin + Cyrillic. */
export function normalizeName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Detect language: bg if any Cyrillic letter present, otherwise en. */
export function detectLanguage(input: string): "en" | "bg" | "other" {
  if (/[\u0400-\u04FF]/.test(input)) return "bg";
  if (/[a-zA-Z]/.test(input)) return "en";
  return "other";
}

export interface UndoableDeleteOptions {
  message: string;
  onConfirm: () => Promise<void> | void;
  onUndo?: () => void;
  durationMs?: number;
}

/**
 * Show a toast with an Undo button. The destructive action only runs if the
 * user doesn't undo within `durationMs` (default 5s). Returns a function that
 * can be used to cancel the pending action manually.
 */
export function scheduleUndoableDelete(opts: UndoableDeleteOptions): () => void {
  const duration = opts.durationMs ?? 5000;
  let cancelled = false;
  const timer = setTimeout(async () => {
    if (cancelled) return;
    try {
      await opts.onConfirm();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
      opts.onUndo?.();
    }
  }, duration);

  toast(opts.message, {
    duration,
    action: {
      label: "Undo",
      onClick: () => {
        cancelled = true;
        clearTimeout(timer);
        opts.onUndo?.();
      },
    },
  });

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
