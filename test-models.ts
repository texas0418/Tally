// test-models.ts — split math invariants. Run with: npx tsx test-models.ts
import type { Assignments, Item, Person } from './src/models';
import {
  allocateProRata,
  buildShareText,
  computeBillTotals,
  formatCents,
  parseQuantity,
} from './src/models';

let failures = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok   ${name}`);
};

// ---- allocateProRata ----
eq('even split', allocateProRata(900, [1, 1, 1]), [300, 300, 300]);
eq('uneven cents go to earliest on tie', allocateProRata(1000, [1, 1, 1]), [334, 333, 333]);
eq('proportional', allocateProRata(1000, [3, 1]), [750, 250]);
eq('zero weights -> zeros', allocateProRata(500, [0, 0]), [0, 0]);
eq('empty weights', allocateProRata(500, []), []);
eq('zero total', allocateProRata(0, [1, 2]), [0, 0]);
eq('single weight takes all', allocateProRata(777, [5]), [777]);

// Exactness fuzz: parts must always sum to the total.
let exact = true;
for (let t = 0; t < 500; t++) {
  const total = (t * 7919) % 10000;
  const weights = [t % 7, (t * 3) % 11, (t * 5) % 13, 1].map((w) => w * 100);
  const parts = allocateProRata(total, weights);
  if (parts.reduce((a, b) => a + b, 0) !== total) exact = false;
  if (parts.some((p) => p < 0)) exact = false;
}
eq('fuzz: allocations always sum exactly, never negative', exact, true);

// ---- computeBillTotals ----
const people: Person[] = [
  { id: 1, billId: 1, name: 'Simon', colorIdx: 0 },
  { id: 2, billId: 1, name: 'Maya', colorIdx: 1 },
  { id: 3, billId: 1, name: 'Jess', colorIdx: 2 },
];
const items: Item[] = [
  { id: 10, billId: 1, label: 'Mole negro', priceCents: 2400, position: 1 },
  { id: 11, billId: 1, label: 'Tlayuda', priceCents: 3150, position: 2 },
  { id: 12, billId: 1, label: 'Guacamole', priceCents: 1200, position: 3 },
  { id: 13, billId: 1, label: 'Agua fresca', priceCents: 500, position: 4 },
];
const asg: Assignments = new Map([
  [10, new Set([1])],
  [11, new Set([2])],
  [12, new Set([1, 2, 3])], // shared 3 ways: 400 each
]);
// item 13 unassigned

const bill = { tipPct: 20, taxCents: 610 };
const t = computeBillTotals(bill, people, items, asg);

eq('bill subtotal', t.billSubtotalCents, 7250);
eq('tip is 20% of full subtotal', t.tipCents, 1450);
eq('grand total', t.grandTotalCents, 7250 + 610 + 1450);
eq('unassigned bucket', t.unassignedCents, 500);
eq('unassigned item ids', t.unassignedItemIds, [13]);
eq('simon subtotal (24.00 + guac third)', t.perPerson[0].subtotalCents, 2800);
eq('maya subtotal', t.perPerson[1].subtotalCents, 3550);
eq('jess subtotal (guac third only)', t.perPerson[2].subtotalCents, 400);

// Reconciliation: person totals + unassigned item + its tax/tip share = grand total.
const personSum = t.perPerson.reduce((a, p) => a + p.totalCents, 0);
const unassignedTaxTip =
  t.taxCents +
  t.tipCents -
  t.perPerson.reduce((a, p) => a + p.taxCents + p.tipCents, 0);
eq(
  'per-person totals + unassigned reconcile to grand total',
  personSum + t.unassignedCents + unassignedTaxTip,
  t.grandTotalCents,
);

// Proportionality: Maya ordered more, so she tips more than Jess.
eq('bigger subtotal -> bigger tip', t.perPerson[1].tipCents > t.perPerson[2].tipCents, true);

// Fully-assigned bill: no unassigned bucket, everything lands on people.
const asgFull: Assignments = new Map([...asg, [13, new Set([3])]]);
const tf = computeBillTotals(bill, people, items, asgFull);
eq('fully assigned: no unassigned cents', tf.unassignedCents, 0);
eq(
  'fully assigned: person totals sum to grand total',
  tf.perPerson.reduce((a, p) => a + p.totalCents, 0),
  tf.grandTotalCents,
);

// Empty bill edge case.
const te = computeBillTotals({ tipPct: 20, taxCents: 0 }, people, [], new Map());
eq('empty bill grand total', te.grandTotalCents, 0);
eq('empty bill person total', te.perPerson[0].totalCents, 0);

// ---- formatting ----
eq('formatCents', formatCents(3472), '$34.72');
eq('formatCents zero', formatCents(0), '$0.00');
const share = buildShareText('Casa Oaxaca', people, tf);
eq('share text has header total', share.includes(formatCents(tf.grandTotalCents)), true);
eq('share text lists Simon', share.includes('Simon'), true);

// ---- parseQuantity ----
eq('qty: 2X prefix', parseQuantity('2X CAESAR SALAD'), { qty: 2, base: 'CAESAR SALAD' });
eq('qty: lowercase x with spaces', parseQuantity('3 x Tacos'), { qty: 3, base: 'Tacos' });
eq('qty: number then space', parseQuantity('2 Sparkling Water'), {
  qty: 2,
  base: 'Sparkling Water',
});
eq('qty: no quantity', parseQuantity('Grilled Salmon'), null);
eq('qty: 1X is not a split', parseQuantity('1X Coffee'), null);
eq('qty: number then price-like digits ignored', parseQuantity('2 50 Blend'), null);
eq('qty: absurd count rejected', parseQuantity('99X Fries'), null);
// The split itself is just an even allocation — parts sum to the line price.
eq('qty split allocation is exact', allocateProRata(2400, [1, 1]), [1200, 1200]);
eq('qty split of odd price', allocateProRata(2500, [1, 1, 1]), [834, 833, 833]);

console.log(failures ? `\n${failures} FAILED` : '\nall model tests passed');
process.exit(failures ? 1 : 0);
