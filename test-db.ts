// test-db.ts — runs the real schema/SQL from dbCore.ts against node:sqlite.
// Requires Node 22+ (node:sqlite). Run with: npx tsx test-db.ts
// @ts-expect-error node:sqlite has no types under Expo's tsconfig; tsx runs it fine
import { DatabaseSync } from 'node:sqlite';
import {
  ALL_ASSIGNMENTS_SQL, ALL_BILLS_SQL, ALL_ITEMS_SQL, ALL_PEOPLE_SQL,
  AssignmentRow, BillRow, DELETE_ALL_BILLS_SQL, DELETE_ASSIGNMENT_SQL,
  DELETE_BILL_SQL, DELETE_ITEM_SQL, DELETE_PERSON_SQL, ENABLE_FK_SQL,
  GET_BILL_SQL, INSERT_ASSIGNMENT_SQL, INSERT_BILL_SQL, INSERT_ITEM_SQL,
  INSERT_PERSON_SQL, ItemRow, LIST_ASSIGNMENTS_SQL, LIST_BILLS_SQL,
  LIST_ITEMS_SQL, LIST_PEOPLE_SQL, MIGRATIONS, NEXT_ITEM_POSITION_SQL,
  PersonRow, RESTORE_BILL_SQL, RESTORE_ITEM_SQL, RESTORE_PERSON_SQL,
  TARGET_DB_VERSION, UPDATE_BILL_SQL, UPDATE_ITEM_SQL,
  billToParams, rowToBill, rowToItem, rowToPerson,
} from './src/dbCore';
import { parseBackup, serializeBackup } from './src/backupFormat';

let failures = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok   ${name}`);
};

const db = new DatabaseSync(':memory:');
db.exec(ENABLE_FK_SQL);

function migrate(): void {
  let v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  while (v < MIGRATIONS.length) {
    for (const sql of MIGRATIONS[v]) db.exec(sql);
    v++;
    db.exec(`PRAGMA user_version = ${v}`);
  }
}

migrate();
eq('migrates to target version',
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
  TARGET_DB_VERSION);
migrate();
eq('re-migrate is a no-op', true, true);

// ---- bill round-trip ----
const T0 = new Date(2026, 6, 19, 19, 30).getTime();
const billId = Number(
  db.prepare(INSERT_BILL_SQL).run(
    ...billToParams({ name: 'Casa Oaxaca', createdMs: T0, tipPct: 20, taxCents: 610 }),
  ).lastInsertRowid,
);
const bill = rowToBill(db.prepare(GET_BILL_SQL).get(billId) as unknown as BillRow);
eq('bill round-trip', bill, {
  id: billId, name: 'Casa Oaxaca', createdMs: T0, tipPct: 20, taxCents: 610,
});

db.prepare(UPDATE_BILL_SQL).run('Casa Oaxaca', T0, 25, 610, billId);
eq('bill update tip',
  rowToBill(db.prepare(GET_BILL_SQL).get(billId) as unknown as BillRow).tipPct, 25);

// ---- people / items / assignments ----
const pid = (name: string, idx: number): number =>
  Number(db.prepare(INSERT_PERSON_SQL).run(billId, name, idx).lastInsertRowid);
const simon = pid('Simon', 0);
const maya = pid('Maya', 1);

const nextPos = (): number =>
  (db.prepare(NEXT_ITEM_POSITION_SQL).get(billId) as { pos: number }).pos;
eq('first item position is 1', nextPos(), 1);
const iid = (label: string, cents: number): number =>
  Number(db.prepare(INSERT_ITEM_SQL).run(billId, label, cents, nextPos()).lastInsertRowid);
const mole = iid('Mole negro', 2400);
const guac = iid('Guacamole', 1200);
eq('positions increment', nextPos(), 3);

db.prepare(INSERT_ASSIGNMENT_SQL).run(mole, simon);
db.prepare(INSERT_ASSIGNMENT_SQL).run(guac, simon);
db.prepare(INSERT_ASSIGNMENT_SQL).run(guac, maya);
db.prepare(INSERT_ASSIGNMENT_SQL).run(guac, maya); // duplicate: INSERT OR IGNORE
eq('assignments list (dupe ignored)',
  (db.prepare(LIST_ASSIGNMENTS_SQL).all(billId) as unknown as AssignmentRow[]).length, 3);

db.prepare(DELETE_ASSIGNMENT_SQL).run(guac, maya);
eq('unassign works',
  (db.prepare(LIST_ASSIGNMENTS_SQL).all(billId) as unknown as AssignmentRow[]).length, 2);

db.prepare(UPDATE_ITEM_SQL).run('Guacamole grande', 1500, guac);
const itemsNow = (db.prepare(LIST_ITEMS_SQL).all(billId) as unknown as ItemRow[]).map(rowToItem);
eq('item update', itemsNow[1].priceCents, 1500);

// ---- cascades ----
db.prepare(DELETE_PERSON_SQL).run(maya);
db.prepare(DELETE_ITEM_SQL).run(mole);
eq('deleting item cascades its assignments',
  (db.prepare(LIST_ASSIGNMENTS_SQL).all(billId) as unknown as AssignmentRow[])
    .filter((a) => a.item_id === mole).length, 0);

const bill2 = Number(
  db.prepare(INSERT_BILL_SQL).run(...billToParams({ name: 'Temp', createdMs: T0 + 1, tipPct: 20, taxCents: 0 })).lastInsertRowid,
);
db.prepare(INSERT_PERSON_SQL).run(bill2, 'Ghost', 0);
db.prepare(DELETE_BILL_SQL).run(bill2);
eq('deleting bill cascades people',
  (db.prepare(LIST_PEOPLE_SQL).all(bill2) as unknown as PersonRow[]).length, 0);
eq('bills list newest first',
  (db.prepare(LIST_BILLS_SQL).all() as unknown as BillRow[]).map((b) => b.id), [billId]);

// ---- backup round-trip through the real SQL ----
const snapshot = () => ({
  bills: (db.prepare(ALL_BILLS_SQL).all() as unknown as BillRow[]).map(rowToBill),
  people: (db.prepare(ALL_PEOPLE_SQL).all() as unknown as PersonRow[]).map(rowToPerson),
  items: (db.prepare(ALL_ITEMS_SQL).all() as unknown as ItemRow[]).map(rowToItem),
  assignments: (db.prepare(ALL_ASSIGNMENTS_SQL).all() as unknown as AssignmentRow[])
    .map((r) => ({ itemId: r.item_id, personId: r.person_id })),
});
const before = snapshot();
const json = serializeBackup(before.bills, before.people, before.items, before.assignments, T0);
const parsed = parseBackup(json);

db.exec(DELETE_ALL_BILLS_SQL);
eq('delete-all leaves nothing', snapshot().bills.length, 0);
for (const b of parsed.bills)
  db.prepare(RESTORE_BILL_SQL).run(b.id!, b.name, b.createdMs, b.tipPct, b.taxCents);
for (const p of parsed.people)
  db.prepare(RESTORE_PERSON_SQL).run(p.id!, p.billId, p.name, p.colorIdx);
for (const i of parsed.items)
  db.prepare(RESTORE_ITEM_SQL).run(i.id!, i.billId, i.label, i.priceCents, i.position);
for (const a of parsed.assignments)
  db.prepare(INSERT_ASSIGNMENT_SQL).run(a.itemId, a.personId);
eq('backup restore round-trips exactly', snapshot(), before);

// ---- backup format guards ----
let threw = '';
try { parseBackup('not json'); } catch (e: any) { threw = e.message; }
eq('parse rejects non-JSON', threw.includes('not JSON'), true);
try { parseBackup('{"format":"other"}'); } catch (e: any) { threw = e.message; }
eq('parse rejects foreign format', threw.includes('Not a Tally backup'), true);
const orphan = parseBackup(JSON.stringify({
  format: 'tally-backup', version: 1, exportedAtMs: 0,
  bills: [], people: [{ id: 9, billId: 99, name: 'X', colorIdx: 0 }], items: [], assignments: [],
}));
eq('orphaned person dropped on parse', orphan.people.length, 0);

console.log(failures ? `\n${failures} FAILED` : '\nall db tests passed');
process.exit(failures ? 1 : 0);
