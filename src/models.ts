// src/models.ts
// Pure module (no expo imports): Tally's domain model and the split math.
// Money is integer cents everywhere; display converts. Times are epoch ms.
//
// The core promise of the app: every person's tip and tax is proportional to
// what THEY ordered, and the per-person totals always sum exactly to the bill
// total (largest-remainder allocation — no lost or invented cents).

export interface Bill {
  id?: number;
  name: string; // restaurant / occasion, may be ''
  createdMs: number;
  tipPct: number; // integer percent, 0..100
  taxCents: number;
}

export interface Person {
  id?: number;
  billId: number;
  name: string;
  colorIdx: number; // index into theme personColors
}

export interface Item {
  id?: number;
  billId: number;
  label: string;
  priceCents: number;
  position: number; // stable display order
}

/** item -> set of person ids sharing it */
export type Assignments = Map<number, Set<number>>;

export const formatCents = (cents: number): string =>
  `$${(cents / 100).toFixed(2)}`;

/** Detect a leading quantity like "2X CAESAR SALAD", "2 x Tacos", or "3 TACOS".
 *  Returns the quantity (2..20) and the base label with the count stripped, or
 *  null when the label isn't a multi-unit line. Used to offer "split into N
 *  separate items" so each unit can go to a different person. */
export function parseQuantity(label: string): { qty: number; base: string } | null {
  const m =
    label.match(/^\s*(\d{1,2})\s*[xX]\s*(.+)$/) ?? // "2X NAME" / "2 x NAME"
    label.match(/^\s*(\d{1,2})\s+(\D.+)$/); //        "2 NAME" (not "2 50")
  if (!m) return null;
  const qty = parseInt(m[1], 10);
  const base = m[2].trim();
  if (qty < 2 || qty > 20 || !base) return null;
  return { qty, base };
}

/** Split totalCents across weights so the parts sum exactly to totalCents.
 *  Largest fractional remainder wins the leftover cents; ties go to the
 *  lower index so the result is deterministic. Zero/negative weight sum
 *  returns all zeros. */
export function allocateProRata(totalCents: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || totalCents === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalCents * w) / sum);
  const parts = raw.map(Math.floor);
  let left = totalCents - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) parts[order[k].i]++;
  return parts;
}

export interface PersonTotal {
  personId: number;
  subtotalCents: number; // their share of assigned items
  taxCents: number;
  tipCents: number;
  totalCents: number;
}

export interface BillTotals {
  perPerson: PersonTotal[];
  billSubtotalCents: number; // all items
  tipCents: number; // tipPct of billSubtotal
  taxCents: number;
  grandTotalCents: number;
  /** items nobody is assigned to yet (their money sits in no one's column) */
  unassignedCents: number;
  unassignedItemIds: number[];
}

/** The whole app in one function. Each item splits evenly (to the cent) among
 *  its assignees; tax and tip are then allocated pro-rata by each person's
 *  subtotal. Unassigned items form an implicit extra bucket so a partially
 *  assigned bill still reconciles: person totals + unassigned share = grand total. */
export function computeBillTotals(
  bill: Pick<Bill, 'tipPct' | 'taxCents'>,
  people: Person[],
  items: Item[],
  assignments: Assignments,
): BillTotals {
  const ids = people.map((p) => p.id!).filter((id) => id != null);
  const subtotal = new Map<number, number>(ids.map((id) => [id, 0]));
  let unassignedCents = 0;
  const unassignedItemIds: number[] = [];

  for (const item of items) {
    const assignees = [...(assignments.get(item.id!) ?? [])].filter((id) =>
      subtotal.has(id),
    );
    if (assignees.length === 0) {
      unassignedCents += item.priceCents;
      unassignedItemIds.push(item.id!);
      continue;
    }
    assignees.sort((a, b) => a - b);
    const shares = allocateProRata(item.priceCents, assignees.map(() => 1));
    assignees.forEach((id, i) =>
      subtotal.set(id, subtotal.get(id)! + shares[i]),
    );
  }

  const billSubtotalCents = items.reduce((a, i) => a + i.priceCents, 0);
  const tipCents = Math.round((billSubtotalCents * bill.tipPct) / 100);

  // Pro-rata weights: each person's subtotal, plus the unassigned bucket last.
  const weights = [...ids.map((id) => subtotal.get(id)!), unassignedCents];
  const taxParts = allocateProRata(bill.taxCents, weights);
  const tipParts = allocateProRata(tipCents, weights);

  const perPerson: PersonTotal[] = ids.map((personId, i) => ({
    personId,
    subtotalCents: subtotal.get(personId)!,
    taxCents: taxParts[i],
    tipCents: tipParts[i],
    totalCents: subtotal.get(personId)! + taxParts[i] + tipParts[i],
  }));

  return {
    perPerson,
    billSubtotalCents,
    tipCents,
    taxCents: bill.taxCents,
    grandTotalCents: billSubtotalCents + bill.taxCents + tipCents,
    unassignedCents,
    unassignedItemIds,
  };
}

/** Share-sheet text: "Casa Oaxaca — $87.20\nSimon $34.72 · Maya $44.02 ..." */
export function buildShareText(
  billName: string,
  people: Person[],
  totals: BillTotals,
): string {
  const byId = new Map(people.map((p) => [p.id!, p.name]));
  const lines = totals.perPerson
    .filter((t) => t.subtotalCents > 0)
    .map((t) => `${byId.get(t.personId) ?? '?'}  ${formatCents(t.totalCents)}`);
  const header = `${billName || 'Bill'} — ${formatCents(totals.grandTotalCents)} (tip ${formatCents(totals.tipCents)})`;
  return [header, ...lines].join('\n');
}
