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

## Pre-ship TODOs

- [ ] App icon + splash (assets/ is empty; app.json has no icon refs yet)
- [ ] Create EAS project (`eas init`, owner boyscout1970) and paste projectId into app.json
- [ ] Create RevenueCat project; paste real keys into src/revenuecat.ts and
      CONFIRM the entitlement id on the RC dashboard (`pro` vs `Pro` trap)
- [ ] Create `tally_pro_lifetime` non-consumable in App Store Connect / Play
- [ ] Dev-client build, then test scanning on-device against real receipts
      (parser heuristics in receiptParse.ts will need tuning with live OCR data)
- [ ] Android: Alert.prompt (edit item price) is iOS-only — add a small edit
      sheet for Android before Play release
- [ ] Decide price point for Pro
