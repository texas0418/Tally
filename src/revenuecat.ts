// src/revenuecat.ts
// RevenueCat configuration for Tally's one-time Pro unlock.
//
// FAIL-OPEN HOUSE RULE: while these keys are placeholders — or react-native-purchases
// is not in the running build (e.g. Expo Go) — Pro is treated as UNLOCKED. We never
// lock content without a working way to pay. Gate logic lives in proAccess.ts.
//
// What Pro buys in Tally: unlimited receipt scans (first FREE_SCANS are free).
// Manual entry, splitting, and share/export are free forever — core record-keeping
// is never gated (house rule).
//
// PRICE: $4.99 one-time (decided 2026-07). The App Store product is the source of
// truth for the actual charged price and its localization — the app shows the
// store's priceString, never a hardcoded number. Set $4.99 on the ASC product.
//
// SETUP (Simon): after creating the RevenueCat "Tally" project, paste the PUBLIC
// SDK keys below. Then open the RC Entitlements page and confirm ENTITLEMENT_ID matches
// EXACTLY what the wizard created — identifiers are IMMUTABLE (the Billowe capital-`P`
// trap: the wizard auto-created `Pro`, not `pro`). Whatever it created, this constant
// must equal it character-for-character.

// Public SDK keys (safe to ship in the app bundle — these are NOT secret).
export const RC_API_KEY_IOS = 'appl_oNVNGwDoCURZXhnrARzVVXiXDxz'; // public SDK key (safe to ship)
export const RC_API_KEY_ANDROID = 'REPLACE_WITH_RC_ANDROID_KEY'; // starts with "goog_"

// The entitlement that grants Pro. CONFIRM on the RC Entitlements page before trusting.
export const ENTITLEMENT_ID = 'pro';

// The App Store / Play non-consumable product id. Must match App Store Connect exactly.
export const PRODUCT_ID = 'tally_pro_lifetime';

/** Lifetime free receipt scans before the Pro prompt. */
export const FREE_SCANS = 5;

const PLACEHOLDER_KEYS = new Set([
  'REPLACE_WITH_RC_IOS_KEY',
  'REPLACE_WITH_RC_ANDROID_KEY',
  '',
]);

export function keyForPlatform(os: 'ios' | 'android'): string {
  return os === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
}

export function isPlaceholderKey(key: string): boolean {
  return PLACEHOLDER_KEYS.has(key.trim());
}
