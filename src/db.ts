// src/db.ts
// expo-sqlite wrapper. All SQL and mapping live in dbCore.ts (pure, tested).
// Billowe pattern: lazy singleton, PRAGMA user_version migrations in a
// transaction, integer epoch-ms / integer cents everywhere.

import * as SQLite from 'expo-sqlite';
import type { Assignments, Bill, Item, Person } from './models';
import type { BackupV1 } from './backupFormat';
import {
  ALL_ASSIGNMENTS_SQL,
  ALL_BILLS_SQL,
  ALL_ITEMS_SQL,
  ALL_PEOPLE_SQL,
  AssignmentRow,
  BillRow,
  DELETE_ALL_BILLS_SQL,
  DELETE_ASSIGNMENT_SQL,
  DELETE_BILL_SQL,
  DELETE_ITEM_SQL,
  DELETE_PERSON_SQL,
  ENABLE_FK_SQL,
  GET_BILL_SQL,
  INSERT_ASSIGNMENT_SQL,
  INSERT_BILL_SQL,
  INSERT_ITEM_SQL,
  INSERT_PERSON_SQL,
  ItemRow,
  LIST_ASSIGNMENTS_SQL,
  LIST_BILLS_SQL,
  LIST_ITEMS_SQL,
  LIST_PEOPLE_SQL,
  MIGRATIONS,
  NEXT_ITEM_POSITION_SQL,
  PersonRow,
  RENAME_PERSON_SQL,
  RESTORE_BILL_SQL,
  RESTORE_ITEM_SQL,
  RESTORE_PERSON_SQL,
  UPDATE_BILL_SQL,
  UPDATE_ITEM_SQL,
  billToParams,
  rowToBill,
  rowToItem,
  rowToPerson,
} from './dbCore';

const DB_NAME = 'tally.db';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    db.execSync('PRAGMA journal_mode = WAL');
    db.execSync(ENABLE_FK_SQL);
    runMigrations(db);
  }
  return db;
}

function runMigrations(d: SQLite.SQLiteDatabase): void {
  const row = d.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const batch = MIGRATIONS[version];
    d.withTransactionSync(() => {
      for (const sql of batch) d.execSync(sql);
    });
    version++;
    d.execSync(`PRAGMA user_version = ${version}`);
  }
}

// ------------------------------------------------------------------- bills

export function createBill(b: Bill): number {
  const res = getDb().runSync(INSERT_BILL_SQL, billToParams(b));
  return Number(res.lastInsertRowId);
}

export function updateBill(b: Bill): void {
  if (b.id == null) throw new Error('updateBill requires id');
  getDb().runSync(UPDATE_BILL_SQL, [...billToParams(b), b.id]);
}

export function deleteBill(id: number): void {
  getDb().runSync(DELETE_BILL_SQL, [id]);
}

export function getBill(id: number): Bill | null {
  const row = getDb().getFirstSync<BillRow>(GET_BILL_SQL, [id]);
  return row ? rowToBill(row) : null;
}

export function listBills(): Bill[] {
  return getDb().getAllSync<BillRow>(LIST_BILLS_SQL).map(rowToBill);
}

// ------------------------------------------------------------------ people

export function addPerson(p: Person): number {
  const res = getDb().runSync(INSERT_PERSON_SQL, [p.billId, p.name, p.colorIdx]);
  return Number(res.lastInsertRowId);
}

export function renamePerson(id: number, name: string): void {
  getDb().runSync(RENAME_PERSON_SQL, [name, id]);
}

export function deletePerson(id: number): void {
  getDb().runSync(DELETE_PERSON_SQL, [id]);
}

export function listPeople(billId: number): Person[] {
  return getDb().getAllSync<PersonRow>(LIST_PEOPLE_SQL, [billId]).map(rowToPerson);
}

// ------------------------------------------------------------------- items

export function addItem(billId: number, label: string, priceCents: number): number {
  const d = getDb();
  const pos =
    d.getFirstSync<{ pos: number }>(NEXT_ITEM_POSITION_SQL, [billId])?.pos ?? 1;
  const res = d.runSync(INSERT_ITEM_SQL, [billId, label, priceCents, pos]);
  return Number(res.lastInsertRowId);
}

export function updateItem(id: number, label: string, priceCents: number): void {
  getDb().runSync(UPDATE_ITEM_SQL, [label, priceCents, id]);
}

export function deleteItem(id: number): void {
  getDb().runSync(DELETE_ITEM_SQL, [id]);
}

export function listItems(billId: number): Item[] {
  return getDb().getAllSync<ItemRow>(LIST_ITEMS_SQL, [billId]).map(rowToItem);
}

// ------------------------------------------------------------- assignments

export function listAssignments(billId: number): Assignments {
  const rows = getDb().getAllSync<AssignmentRow>(LIST_ASSIGNMENTS_SQL, [billId]);
  const map: Assignments = new Map();
  for (const r of rows) {
    if (!map.has(r.item_id)) map.set(r.item_id, new Set());
    map.get(r.item_id)!.add(r.person_id);
  }
  return map;
}

export function setAssigned(itemId: number, personId: number, on: boolean): void {
  getDb().runSync(on ? INSERT_ASSIGNMENT_SQL : DELETE_ASSIGNMENT_SQL, [
    itemId,
    personId,
  ]);
}

// ------------------------------------------------------------------ backup

export function getAllForBackup(): {
  bills: Bill[];
  people: Person[];
  items: Item[];
  assignments: { itemId: number; personId: number }[];
} {
  const d = getDb();
  return {
    bills: d.getAllSync<BillRow>(ALL_BILLS_SQL).map(rowToBill),
    people: d.getAllSync<PersonRow>(ALL_PEOPLE_SQL).map(rowToPerson),
    items: d.getAllSync<ItemRow>(ALL_ITEMS_SQL).map(rowToItem),
    assignments: d
      .getAllSync<AssignmentRow>(ALL_ASSIGNMENTS_SQL)
      .map((r) => ({ itemId: r.item_id, personId: r.person_id })),
  };
}

/** Restore: replace-all inside one transaction (Billowe backup semantics). */
export function replaceAll(backup: BackupV1): void {
  const d = getDb();
  d.withTransactionSync(() => {
    d.execSync(DELETE_ALL_BILLS_SQL); // cascades to people/items/assignments
    for (const b of backup.bills)
      d.runSync(RESTORE_BILL_SQL, [b.id!, b.name, b.createdMs, b.tipPct, b.taxCents]);
    for (const p of backup.people)
      d.runSync(RESTORE_PERSON_SQL, [p.id!, p.billId, p.name, p.colorIdx]);
    for (const i of backup.items)
      d.runSync(RESTORE_ITEM_SQL, [i.id!, i.billId, i.label, i.priceCents, i.position]);
    for (const a of backup.assignments)
      d.runSync(INSERT_ASSIGNMENT_SQL, [a.itemId, a.personId]);
  });
}
