// src/receiptParse.ts
// Pure module (no expo imports): turns OCR output into bill line items.
// Node-tested in test-receipt.ts against real-world receipt text shapes.
//
// Input is a flat list of OCR lines with optional bounding frames (ML Kit
// gives one frame per line). Receipts print label and price in separate
// columns, which OCR often returns as separate lines — so we first rebuild
// visual rows by grouping lines with overlapping vertical centers, then pull
// the rightmost money token of each row as its price.

export interface OcrLine {
  text: string;
  /** ML Kit line frame; absent in degraded inputs (then text order is kept) */
  frame?: { top: number; left: number; width: number; height: number };
}

export interface ParsedItem {
  label: string;
  priceCents: number;
}

export interface ParsedReceipt {
  items: ParsedItem[];
  taxCents: number | null;
  subtotalCents: number | null;
  totalCents: number | null;
  /** true when found items sum to the printed subtotal (±2¢) */
  reconciles: boolean;
}

const MONEY_RE = /(?:\$|USD?\s?)?(\d{1,4})[.,](\d{2})(?!\d)/g;

const SKIP_RE =
  /\b(cash|change|visa|master|amex|debit|credit|card|auth|approval|payment|balance due|tender|server|table|guests?|order|check ?#|receipt|thank)\b/i;
const NEG_RE = /\b(void|refund|discount|promo|coupon|comp)\b/i;
const SUBTOTAL_RE = /sub\s*-?\s*total/i;
const TAX_RE = /\b(tax|hst|gst|pst|vat)\b/i;
const TIP_RE = /\b(tip|gratuity|service charge|svc)\b/i;
const TOTAL_RE = /\b(total|amount due)\b/i;

interface Row {
  text: string;
  top: number;
}

/** Rebuild visual rows: lines whose vertical centers fall within each other's
 *  frame belong to one row; rows sort top-to-bottom, cells left-to-right. */
export function linesToRows(lines: OcrLine[]): string[] {
  if (!lines.some((l) => l.frame)) return lines.map((l) => l.text);
  const framed = lines.filter((l) => l.frame);
  const rows: { cells: OcrLine[]; top: number; bottom: number }[] = [];
  const sorted = [...framed].sort((a, b) => a.frame!.top - b.frame!.top);
  for (const line of sorted) {
    const c = line.frame!.top + line.frame!.height / 2;
    const row = rows.find((r) => c >= r.top && c <= r.bottom);
    if (row) {
      row.cells.push(line);
      row.top = Math.min(row.top, line.frame!.top);
      row.bottom = Math.max(row.bottom, line.frame!.top + line.frame!.height);
    } else {
      rows.push({
        cells: [line],
        top: line.frame!.top,
        bottom: line.frame!.top + line.frame!.height,
      });
    }
  }
  return rows.map((r) =>
    r.cells
      .sort((a, b) => a.frame!.left - b.frame!.left)
      .map((c) => c.text)
      .join(' '),
  );
}

/** Rightmost money token in a row, or null. */
function lastMoney(text: string): { cents: number; index: number } | null {
  let m: RegExpExecArray | null;
  let best: { cents: number; index: number } | null = null;
  MONEY_RE.lastIndex = 0;
  while ((m = MONEY_RE.exec(text))) {
    best = { cents: parseInt(m[1], 10) * 100 + parseInt(m[2], 10), index: m.index };
  }
  return best;
}

function cleanLabel(raw: string): string {
  return raw
    .replace(/[.·•*_-]{2,}/g, ' ') // dot leaders
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseReceipt(lines: OcrLine[]): ParsedReceipt {
  const rows = linesToRows(lines);
  const items: ParsedItem[] = [];
  let taxCents: number | null = null;
  let subtotalCents: number | null = null;
  let totalCents: number | null = null;
  let pastItems = false; // once subtotal/total appears, stop collecting items

  for (const row of rows) {
    const money = lastMoney(row);
    if (!money) continue;

    if (SUBTOTAL_RE.test(row)) {
      subtotalCents = subtotalCents ?? money.cents;
      pastItems = true;
      continue;
    }
    if (TAX_RE.test(row)) {
      taxCents = (taxCents ?? 0) + money.cents;
      pastItems = true;
      continue;
    }
    if (TIP_RE.test(row)) {
      pastItems = true;
      continue;
    }
    if (TOTAL_RE.test(row)) {
      totalCents = money.cents; // later totals win (grand total prints last)
      pastItems = true;
      continue;
    }
    if (pastItems || SKIP_RE.test(row)) continue;
    // Voids/discounts print as negative or keyword lines; v1 skips them and
    // lets the reconciles flag surface the mismatch for a manual fix.
    if (NEG_RE.test(row) || /-\s*$/.test(row.slice(0, money.index))) continue;

    const label = cleanLabel(row.slice(0, money.index));
    if (!label || !/[a-zA-Z]{2}/.test(label)) continue;
    if (money.cents <= 0 || money.cents > 200000) continue;
    items.push({ label, priceCents: money.cents });
  }

  const sum = items.reduce((a, i) => a + i.priceCents, 0);
  const reconciles =
    subtotalCents != null && items.length > 0 && Math.abs(sum - subtotalCents) <= 2;
  return { items, taxCents, subtotalCents, totalCents, reconciles };
}
