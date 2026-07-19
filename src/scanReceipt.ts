// src/scanReceipt.ts
// Native side of receipt scanning: expo-image-picker -> ML Kit on-device OCR
// -> pure parser (receiptParse.ts). All recognition happens on the phone —
// no receipt ever leaves the device (local-first house rule).
//
// ML Kit is a native module, so it exists only in dev-client/EAS builds.
// House fail rule: in Expo Go we throw a readable error and the UI falls back
// to manual entry — scanning is an accelerator, never a wall.

import * as ImagePicker from 'expo-image-picker';
import { OcrLine, ParsedReceipt, parseReceipt } from './receiptParse';

// Lazy, guarded require so a missing native module can't crash module load.
function getTextRecognition(): any | null {
  try {
    const mod = require('@react-native-ml-kit/text-recognition');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

export function isScanAvailable(): boolean {
  return getTextRecognition() != null;
}

async function pickImage(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access is needed to scan receipts.');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] });
    return res.canceled ? null : res.assets[0].uri;
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo access is needed to pick a receipt.');
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
  return res.canceled ? null : res.assets[0].uri;
}

/** Full scan flow. Resolves null if the user cancelled the picker.
 *  Throws with a readable message when scanning can't run. */
export async function scanReceipt(
  source: 'camera' | 'library',
): Promise<ParsedReceipt | null> {
  const TextRecognition = getTextRecognition();
  if (!TextRecognition) {
    throw new Error(
      'Scanning needs the full app build (not Expo Go). Add items manually for now.',
    );
  }

  const uri = await pickImage(source);
  if (!uri) return null;

  const result = await TextRecognition.recognize(uri);
  const lines: OcrLine[] = [];
  for (const block of result?.blocks ?? []) {
    for (const line of block?.lines ?? []) {
      if (typeof line?.text !== 'string') continue;
      const f = line.frame;
      lines.push(
        f &&
          typeof f.top === 'number' &&
          typeof f.left === 'number' &&
          typeof f.width === 'number' &&
          typeof f.height === 'number'
          ? { text: line.text, frame: { top: f.top, left: f.left, width: f.width, height: f.height } }
          : { text: line.text },
      );
    }
  }
  if (lines.length === 0) {
    throw new Error("Couldn't read any text on that photo. Try a closer, flatter shot.");
  }
  return parseReceipt(lines);
}
