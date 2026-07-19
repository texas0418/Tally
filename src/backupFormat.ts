// src/backupFormat.ts
// Pure module (Node-testable): versioned JSON backup format.
// Version 1: every bill with its people, items, and assignments, ids included
// (restore is replace-all, so original ids are safe to keep and the
// cross-table references survive the round-trip). Forward rule: parse must
// tolerate missing fields by defaulting, never throw on well-formed older backups.

import type { Bill, Item, Person } from './models';

export const BACKUP_FORMAT = 'tally-backup';
export const BACKUP_VERSION = 1;

export interface BackupAssignment {
  itemId: number;
  personId: number;
}

export interface BackupV1 {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAtMs: number;
  bills: Bill[];
  people: Person[];
  items: Item[];
  assignments: BackupAssignment[];
}

export function serializeBackup(
  bills: Bill[],
  people: Person[],
  items: Item[],
  assignments: BackupAssignment[],
  nowMs: number,
): string {
  const b: BackupV1 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAtMs: nowMs,
    bills,
    people,
    items,
    assignments,
  };
  return JSON.stringify(b, null, 1);
}

const num = (v: unknown, d: number): number => (typeof v === 'number' ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);

/** Returns a validated backup or throws Error with a human-readable reason. */
export function parseBackup(json: string): BackupV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Not a valid backup file (not JSON).');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Not a valid backup file.');
  }
  const o = raw as Record<string, unknown>;
  if (o.format !== BACKUP_FORMAT) {
    throw new Error('Not a Tally backup file.');
  }
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) {
    throw new Error('Backup was made by a newer version of Tally.');
  }

  const bills: Bill[] = [];
  for (const r of Array.isArray(o.bills) ? o.bills : []) {
    if (typeof r !== 'object' || r === null) continue;
    const b = r as Record<string, unknown>;
    if (typeof b.id !== 'number' || typeof b.createdMs !== 'number') continue;
    bills.push({
      id: b.id,
      name: str(b.name, ''),
      createdMs: b.createdMs,
      tipPct: num(b.tipPct, 20),
      taxCents: num(b.taxCents, 0),
    });
  }
  const billIds = new Set(bills.map((b) => b.id!));

  const people: Person[] = [];
  for (const r of Array.isArray(o.people) ? o.people : []) {
    if (typeof r !== 'object' || r === null) continue;
    const p = r as Record<string, unknown>;
    if (typeof p.id !== 'number' || !billIds.has(p.billId as number)) continue;
    people.push({
      id: p.id,
      billId: p.billId as number,
      name: str(p.name, ''),
      colorIdx: num(p.colorIdx, 0),
    });
  }
  const personIds = new Set(people.map((p) => p.id!));

  const items: Item[] = [];
  for (const r of Array.isArray(o.items) ? o.items : []) {
    if (typeof r !== 'object' || r === null) continue;
    const it = r as Record<string, unknown>;
    if (typeof it.id !== 'number' || !billIds.has(it.billId as number)) continue;
    if (typeof it.priceCents !== 'number') continue;
    items.push({
      id: it.id,
      billId: it.billId as number,
      label: str(it.label, ''),
      priceCents: it.priceCents,
      position: num(it.position, 0),
    });
  }
  const itemIds = new Set(items.map((i) => i.id!));

  const assignments: BackupAssignment[] = [];
  for (const r of Array.isArray(o.assignments) ? o.assignments : []) {
    if (typeof r !== 'object' || r === null) continue;
    const a = r as Record<string, unknown>;
    if (!itemIds.has(a.itemId as number) || !personIds.has(a.personId as number))
      continue;
    assignments.push({ itemId: a.itemId as number, personId: a.personId as number });
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAtMs: num(o.exportedAtMs, 0),
    bills,
    people,
    items,
    assignments,
  };
}
