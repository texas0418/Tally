# Tally

Split the bill by what each person actually ordered. Assign line items to
people (scan the receipt or type them in); tip and tax are allocated
pro-rata by each person's subtotal — never a lazy even split. Local-first:
every bill lives in SQLite on the phone, nothing leaves the device.

## Stack

House pattern (see DreamFeed): Expo SDK 57, TypeScript strict, no navigation
library, plain StyleSheet. Pure logic in `src/models.ts`, `src/receiptParse.ts`,
`src/dbCore.ts`, `src/backupFormat.ts` — all Node-tested without Expo.

Receipt scanning: `expo-image-picker` → `@react-native-ml-kit/text-recognition`
(on-device OCR, needs a dev-client/EAS build — in Expo Go the scan button
explains and falls back to manual entry).

## Run

```sh
npm install
npm test          # pure-module tests via tsx (models, receipt parser, db schema)
npx expo start    # manual entry works in Expo Go; scanning needs a dev build
```

## Monetization

RevenueCat one-time unlock (`tally_pro_lifetime`): unlimited receipt scans
after 5 free lifetime scans. Manual entry, splitting, and export are free
forever (fail-open house rule — placeholder keys ⇒ Pro unlocked).

## Scanning cost

The receipt scanner is Google ML Kit **on-device** text recognition (OCR, not
generative AI) via `@react-native-ml-kit/text-recognition`. It runs entirely on
the phone — no network, no API, no per-scan cost, works offline. The 5-free-scan
limit is a monetization lever, not cost recovery.

## Pro purchase — remaining setup (only the owner can do these)

Price decided: **$4.99 one-time**, 5 free scans. Code is purchase-ready; the
button can't transact until the product + keys exist:

1. **App Store Connect → In-App Purchases**: create a **non-consumable** with
   product id exactly `tally_pro_lifetime`, price tier **$4.99**, add a display
   name + review screenshot, and get it to "Ready to Submit".
2. **RevenueCat**: create the "Tally" project (app bundle `com.tallysplit.app`);
   add the ASC in-app purchase; create an **Entitlement** — note its id and set
   `ENTITLEMENT_ID` in src/revenuecat.ts to match EXACTLY (`pro` vs `Pro` trap);
   attach `tally_pro_lifetime` to the **current Offering** as a package.
3. **App Store Connect → App Information**: add the App-Specific Shared Secret /
   In-App Purchase API key to RevenueCat so it can validate receipts.
4. Copy the RC **public SDK keys** (iOS `appl_…`, Android `goog_…`) into
   src/revenuecat.ts (safe to ship). Placeholder keys keep Pro fail-open unlocked,
   so the buy button only appears once real keys are in.
5. **Test** with a sandbox Apple ID (Settings → Developer, or first purchase
   prompt) — the paywall shows the live store price, and Restore must work.

## Other pre-ship TODOs

- [x] App icon ("color count" tally marks, assets/icon.png; regenerate via
      scripts/make-icon.swift if the design changes)
- [ ] Splash screen
- [ ] Create EAS project (`eas init`, owner boyscout1970) and paste projectId into app.json
- [ ] Dev-client build, then test scanning on-device against real receipts
      (parser heuristics in receiptParse.ts will need tuning with live OCR data)
- [ ] Android: item price edit is inline now (cross-platform), but re-verify the
      whole flow before any Play release
