// src/proAccess.ts
// Fail-open Pro gate for Tally. Pro = unlimited receipt scans (one-time unlock).
// Splitting, manual entry, and share/export stay free forever.
//
// HOUSE RULE: if react-native-purchases is not in the running build (Expo Go, or a
// build without the native module) OR the RevenueCat key is still a placeholder, Pro
// is UNLOCKED. Never hide a feature behind a wall the user cannot pay through.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  ENTITLEMENT_ID,
  PRODUCT_ID,
  isPlaceholderKey,
  keyForPlatform,
} from './revenuecat';

type Listener = (pro: boolean) => void;

let pro = false;
let initialized = false;
let failOpen = false; // true once we decide RC can't gate (no native module / placeholder key)
const listeners = new Set<Listener>();

function setPro(next: boolean): void {
  if (next === pro) return;
  pro = next;
  listeners.forEach((l) => l(pro));
}

// Lazy, guarded access to the native SDK. Returns null when it isn't in this build.
function getPurchases(): any | null {
  try {
    // require (not a static import) so a missing native module can't crash module load.
    const mod = require('react-native-purchases');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

function hasEntitlement(info: any): boolean {
  return !!info?.entitlements?.active?.[ENTITLEMENT_ID];
}

export function isProUnlocked(): boolean {
  return pro;
}

export function isFailOpen(): boolean {
  return failOpen;
}

export function subscribeProAccess(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Configure RevenueCat once at app start. Safe to call unconditionally. */
export async function initPurchases(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const os = Platform.OS === 'android' ? 'android' : 'ios';
  const apiKey = keyForPlatform(os);
  const Purchases = getPurchases();

  // Fail-open: no SDK in this build, or keys not configured yet.
  if (!Purchases || isPlaceholderKey(apiKey)) {
    failOpen = true;
    setPro(true);
    return;
  }

  try {
    Purchases.configure({ apiKey });
    Purchases.addCustomerInfoUpdateListener((info: any) => {
      setPro(hasEntitlement(info));
    });
    const info = await Purchases.getCustomerInfo();
    setPro(hasEntitlement(info));
  } catch (e) {
    // Configuration failed in a real build — fail open rather than trap the user.
    console.warn('RevenueCat init failed; unlocking Pro (fail-open):', e);
    failOpen = true;
    setPro(true);
  }
}

/** The RevenueCat package that grants Pro, or null when RC can't gate. */
async function getProPackage(): Promise<any | null> {
  const Purchases = getPurchases();
  if (!Purchases || failOpen) return null;
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings?.current?.availablePackages ?? [];
  return pkgs.find((p: any) => p?.product?.identifier === PRODUCT_ID) ?? pkgs[0] ?? null;
}

/** Localized store price string (e.g. "$4.99"), or null if unavailable
 *  (placeholder keys, no offering, or offline). Never hardcode the price —
 *  the App Store product is the source of truth. */
export async function getProPriceString(): Promise<string | null> {
  try {
    const pkg = await getProPackage();
    return pkg?.product?.priceString ?? null;
  } catch {
    return null;
  }
}

/** Attempt the one-time purchase. Resolves true if Pro is unlocked afterwards,
 *  false if the user cancelled. Throws only on real errors (network, config). */
export async function purchasePro(): Promise<boolean> {
  const Purchases = getPurchases();
  if (!Purchases || failOpen) return true; // nothing to buy — already unlocked

  const pkg = await getProPackage();
  if (!pkg) throw new Error('No products available right now. Please try again later.');

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const ok = hasEntitlement(customerInfo);
    setPro(ok);
    return ok;
  } catch (e: any) {
    if (e?.userCancelled) return false; // not an error — user backed out
    throw e;
  }
}

/** Restore prior purchases (required for App Review). Resolves true if Pro is active. */
export async function restorePurchases(): Promise<boolean> {
  const Purchases = getPurchases();
  if (!Purchases || failOpen) return true;

  const info = await Purchases.restorePurchases();
  const ok = hasEntitlement(info);
  setPro(ok);
  return ok;
}

/** React hook: re-renders when Pro access changes. */
export function useProAccess(): boolean {
  const [value, setValue] = useState<boolean>(isProUnlocked());
  useEffect(() => subscribeProAccess(setValue), []);
  return value;
}
