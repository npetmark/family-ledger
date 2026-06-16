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

/** Units we recognise when parsing free-text entries like "chicken 1 kg". */
const KNOWN_UNITS = new Set<string>([
  "kg", "g", "l", "ml", "oz", "lb", "lbs",
  "pc", "pcs", "pack", "packs", "bag", "bags", "can", "cans", "box", "boxes",
  "кг", "г", "гр", "л", "мл", "бр", "броя", "пак",
]);

const UNIT_ALIASES: Record<string, string> = {
  гр: "г",
  броя: "бр",
  pcs: "pc",
  packs: "pack",
  bags: "bag",
  cans: "can",
  boxes: "box",
  lbs: "lb",
};

export interface ParsedShoppingEntry {
  name: string;
  quantity: number;
  unit: string | null;
}

/**
 * Parse "chicken 1 kg" / "сирене 500г" / "apples x3" into name + quantity + unit.
 * If no quantity/unit can be detected, name stays as-is and quantity defaults to 1.
 */
export function parseShoppingEntry(raw: string): ParsedShoppingEntry {
  const input = raw.replace(/\s+/g, " ").trim();
  if (!input) return { name: "", quantity: 1, unit: null };

  // Trailing "<qty> <unit?>" optionally prefixed by × / x
  const re = /^(.*?)(?:\s+|^)(?:[x×]\s*)?(\d+(?:[.,]\d+)?)\s*([A-Za-zА-Яа-я.]{1,6})?\s*$/u;
  const m = input.match(re);
  if (!m) return { name: input, quantity: 1, unit: null };

  const namePart = m[1].trim();
  const qty = parseFloat(m[2].replace(",", "."));
  let unit = (m[3] ?? "").replace(/\.$/, "").toLowerCase() || null;

  if (unit && !KNOWN_UNITS.has(unit)) {
    // Unknown unit suffix — treat it as part of the name and drop the qty too.
    return { name: input, quantity: 1, unit: null };
  }
  if (unit && UNIT_ALIASES[unit]) unit = UNIT_ALIASES[unit];

  if (!namePart) {
    // Just a number / unit — not really a shopping item.
    return { name: input, quantity: 1, unit: null };
  }

  return {
    name: namePart,
    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    unit,
  };
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
