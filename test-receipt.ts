// test-receipt.ts — OCR receipt parser against realistic shapes.
// Run with: npx tsx test-receipt.ts
import type { OcrLine } from './src/receiptParse';
import { linesToRows, parseReceipt } from './src/receiptParse';

let failures = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok   ${name}`);
};

// ---- frameless: OCR returned whole rows as single lines ----
const flat: OcrLine[] = [
  { text: 'CASA OAXACA' },
  { text: '123 Main St' },
  { text: 'Server: Ana   Table 4' },
  { text: 'Mole Negro 24.00' },
  { text: '2 Tlayuda 31.50' },
  { text: 'Guacamole ..... 12.00' },
  { text: 'Agua Fresca $5.00' },
  { text: 'Subtotal 72.50' },
  { text: 'Tax 6.10' },
  { text: 'Total 78.60' },
  { text: 'VISA **** 4242 78.60' },
  { text: 'Thank you!' },
];
const p1 = parseReceipt(flat);
eq('flat: item count', p1.items.length, 4);
eq('flat: first item', p1.items[0], { label: 'Mole Negro', priceCents: 2400 });
eq('flat: qty prefix kept in label', p1.items[1].label, '2 Tlayuda');
eq('flat: dot leaders stripped', p1.items[2], { label: 'Guacamole', priceCents: 1200 });
eq('flat: dollar sign price', p1.items[3].priceCents, 500);
eq('flat: subtotal', p1.subtotalCents, 7250);
eq('flat: tax', p1.taxCents, 610);
eq('flat: total (card line ignored — past items)', p1.totalCents, 7860);
eq('flat: reconciles with printed subtotal', p1.reconciles, true);

// ---- framed: label and price came back as separate lines in two columns ----
const framed: OcrLine[] = [
  { text: 'Burger', frame: { top: 100, left: 10, width: 80, height: 20 } },
  { text: '14.50', frame: { top: 102, left: 200, width: 40, height: 18 } },
  { text: 'Fries', frame: { top: 130, left: 10, width: 60, height: 20 } },
  { text: '6.25', frame: { top: 129, left: 200, width: 40, height: 20 } },
  { text: 'Sales Tax', frame: { top: 170, left: 10, width: 80, height: 20 } },
  { text: '1.87', frame: { top: 171, left: 200, width: 40, height: 18 } },
];
eq('rows: columns merge by vertical overlap', linesToRows(framed), [
  'Burger 14.50',
  'Fries 6.25',
  'Sales Tax 1.87',
]);
const p2 = parseReceipt(framed);
eq('framed: items', p2.items, [
  { label: 'Burger', priceCents: 1450 },
  { label: 'Fries', priceCents: 625 },
]);
eq('framed: tax picked up', p2.taxCents, 187);
eq('framed: no subtotal -> no reconcile claim', p2.reconciles, false);

// ---- noise handling ----
const noisy: OcrLine[] = [
  { text: 'GST 5% 2.50' },
  { text: 'PST 7% 3.50' },
  { text: 'Latte 4.75' },
];
const p3 = parseReceipt(noisy);
eq('two tax lines accumulate', p3.taxCents, 600);
eq('item after tax lines is dropped (past items)', p3.items.length, 0);

const euro: OcrLine[] = [
  { text: 'Schnitzel 18,90' },
  { text: 'Bier 4,20' },
];
const p4 = parseReceipt(euro);
eq('comma decimals parse', p4.items, [
  { label: 'Schnitzel', priceCents: 1890 },
  { label: 'Bier', priceCents: 420 },
]);

const junk: OcrLine[] = [
  { text: '00000 000' },
  { text: '9.99' }, // price with no label
  { text: 'x 9.99' }, // label too short
  { text: 'Void -12.00' },
];
eq('junk rows produce no items', parseReceipt(junk).items.length, 1 - 1);

eq('empty input', parseReceipt([]), {
  items: [],
  taxCents: null,
  subtotalCents: null,
  totalCents: null,
  reconciles: false,
});

console.log(failures ? `\n${failures} FAILED` : '\nall receipt tests passed');
process.exit(failures ? 1 : 0);
