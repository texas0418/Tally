// src/dbCore.ts
// Pure module: SQL schema/migrations and row<->model mapping.
// No expo imports so it can be tested in Node against node:sqlite.

import type { Bill, Item, Person } from './models';

/** Each entry is the batch of statements that upgrades user_version N-1 -> N.
 *  MIGRATIONS[0] builds version 1. Append only; never edit shipped entries. */
export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      created_ms INTEGER NOT NULL,
      tip_pct INTEGER NOT NULL DEFAULT 20,
      tax_cents INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color_idx INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS item_people (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, person_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_people_bill ON people(bill_id)`,
    `CREATE INDEX IF NOT EXISTS idx_items_bill ON items(bill_id)`,
  ],
];

export const TARGET_DB_VERSION = MIGRATIONS.length;

export interface BillRow {
  id: number;
  name: string;
  created_ms: number;
  tip_pct: number;
  tax_cents: number;
}
export interface PersonRow {
  id: number;
  bill_id: number;
  name: string;
  color_idx: number;
}
export interface ItemRow {
  id: number;
  bill_id: number;
  label: string;
  price_cents: number;
  position: number;
}
export interface AssignmentRow {
  item_id: number;
  person_id: number;
}

export const rowToBill = (r: BillRow): Bill => ({
  id: r.id,
  name: r.name,
  createdMs: r.created_ms,
  tipPct: r.tip_pct,
  taxCents: r.tax_cents,
});
export const rowToPerson = (r: PersonRow): Person => ({
  id: r.id,
  billId: r.bill_id,
  name: r.name,
  colorIdx: r.color_idx,
});
export const rowToItem = (r: ItemRow): Item => ({
  id: r.id,
  billId: r.bill_id,
  label: r.label,
  priceCents: r.price_cents,
  position: r.position,
});

export const billToParams = (b: Bill): [string, number, number, number] => [
  b.name,
  b.createdMs,
  b.tipPct,
  b.taxCents,
];

export const INSERT_BILL_SQL = `INSERT INTO bills (name, created_ms, tip_pct, tax_cents) VALUES (?, ?, ?, ?)`;
export const UPDATE_BILL_SQL = `UPDATE bills SET name = ?, created_ms = ?, tip_pct = ?, tax_cents = ? WHERE id = ?`;
export const DELETE_BILL_SQL = `DELETE FROM bills WHERE id = ?`;
export const GET_BILL_SQL = `SELECT * FROM bills WHERE id = ?`;
export const LIST_BILLS_SQL = `SELECT * FROM bills ORDER BY created_ms DESC`;

export const INSERT_PERSON_SQL = `INSERT INTO people (bill_id, name, color_idx) VALUES (?, ?, ?)`;
export const RENAME_PERSON_SQL = `UPDATE people SET name = ? WHERE id = ?`;
export const DELETE_PERSON_SQL = `DELETE FROM people WHERE id = ?`;
export const LIST_PEOPLE_SQL = `SELECT * FROM people WHERE bill_id = ? ORDER BY id`;

export const INSERT_ITEM_SQL = `INSERT INTO items (bill_id, label, price_cents, position) VALUES (?, ?, ?, ?)`;
export const UPDATE_ITEM_SQL = `UPDATE items SET label = ?, price_cents = ? WHERE id = ?`;
export const DELETE_ITEM_SQL = `DELETE FROM items WHERE id = ?`;
export const LIST_ITEMS_SQL = `SELECT * FROM items WHERE bill_id = ? ORDER BY position, id`;
export const NEXT_ITEM_POSITION_SQL = `SELECT COALESCE(MAX(position), 0) + 1 AS pos FROM items WHERE bill_id = ?`;

export const INSERT_ASSIGNMENT_SQL = `INSERT OR IGNORE INTO item_people (item_id, person_id) VALUES (?, ?)`;
export const DELETE_ASSIGNMENT_SQL = `DELETE FROM item_people WHERE item_id = ? AND person_id = ?`;
export const LIST_ASSIGNMENTS_SQL = `SELECT ip.item_id, ip.person_id FROM item_people ip
  JOIN items i ON i.id = ip.item_id WHERE i.bill_id = ?`;

// FK cascades require this pragma per-connection in SQLite.
export const ENABLE_FK_SQL = `PRAGMA foreign_keys = ON`;

// ------------------------------------------------------------------ backup
export const ALL_BILLS_SQL = `SELECT * FROM bills ORDER BY id`;
export const ALL_PEOPLE_SQL = `SELECT * FROM people ORDER BY id`;
export const ALL_ITEMS_SQL = `SELECT * FROM items ORDER BY id`;
export const ALL_ASSIGNMENTS_SQL = `SELECT * FROM item_people ORDER BY item_id, person_id`;
export const DELETE_ALL_BILLS_SQL = `DELETE FROM bills`;

// Restore keeps original ids so cross-table references survive round-trip.
export const RESTORE_BILL_SQL = `INSERT INTO bills (id, name, created_ms, tip_pct, tax_cents) VALUES (?, ?, ?, ?, ?)`;
export const RESTORE_PERSON_SQL = `INSERT INTO people (id, bill_id, name, color_idx) VALUES (?, ?, ?, ?)`;
export const RESTORE_ITEM_SQL = `INSERT INTO items (id, bill_id, label, price_cents, position) VALUES (?, ?, ?, ?, ?)`;
