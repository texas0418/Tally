// src/review.ts
// One polite App Store review ask, at the earned-value moment: the user has
// just finished a bill split (confirmed "Done" after reading the per-person
// totals). Never mid-assignment, never over the paywall. Eligible from the
// 2nd completed split onward; asks at most once ever (kv-store flag; Apple
// further rate-limits on their side).
// Fail-open: if the native module is missing or throws, nothing happens.

import Storage from 'expo-sqlite/kv-store';

const ASKED_KEY = 'tally.review.asked.v1';
const SPLITS_KEY = 'tally.review.splitsCompleted.v1';

function getStoreReview(): any | null {
  // Do NOT rely on try/catch around require() for fail-open here: when a
  // module's factory throws (native half missing from the binary), Metro's
  // guardedLoadModule reports it as a FATAL error itself — the exception
  // never reaches this catch, and a release build aborts. This bricked
  // Number Nine's 2026-07-27 device build the first night the trigger fired.
  // Check the native registry BEFORE requiring so the factory can't throw.
  const native = (globalThis as any).expo?.modules?.ExpoStoreReview;
  if (!native) return null;
  try {
    const mod = require('expo-store-review');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

/** Record one completed bill split; on the 2nd or later, request a review if
 *  never asked before. Fire-and-forget and fail-open — safe to call often. */
export function recordSplitCompleted(): void {
  countAndMaybeAsk().catch(() => {
    /* fail open */
  });
}

async function countAndMaybeAsk(): Promise<void> {
  const raw = await Storage.getItem(SPLITS_KEY);
  const count = (Number.parseInt(raw ?? '0', 10) || 0) + 1;
  await Storage.setItem(SPLITS_KEY, String(count));
  if (count < 2) return;
  if (await Storage.getItem(ASKED_KEY)) return;
  const SR = getStoreReview();
  if (!SR) return;
  await Storage.setItem(ASKED_KEY, String(Date.now()));
  // isAvailableAsync + requestReview both resolve quietly; the OS decides
  // whether anything is actually shown.
  const ok = await SR.isAvailableAsync?.();
  if (ok) await SR.requestReview?.();
}
