// src/screens/SettingsScreen.tsx
// Default tip, backup export/import (never gated), and the Pro section.

import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { exportBackup, pickBackup } from '../backup';
import { replaceAll } from '../db';
import { useSettings } from '../SettingsContext';
import {
  useProAccess,
  isFailOpen,
  getProPriceString,
  purchasePro,
  restorePurchases,
} from '../proAccess';
import { FREE_SCANS } from '../revenuecat';
import { colors } from '../theme';

interface Props {
  onBack: () => void;
}

export default function SettingsScreen({ onBack }: Props) {
  const { settings, update } = useSettings();
  const pro = useProAccess();
  const [busy, setBusy] = useState(false);
  const [priceString, setPriceString] = useState<string | null>(null);

  // Offerings load async on cold start, so the first price fetch can come back
  // empty. Retry a few times until RevenueCat has the package.
  useEffect(() => {
    if (pro) return;
    let cancelled = false;
    let tries = 0;
    const load = () => {
      getProPriceString().then((p) => {
        if (cancelled) return;
        if (p) setPriceString(p);
        else if (tries++ < 6) setTimeout(load, 1500);
      });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [pro]);

  const doExport = async () => {
    setBusy(true);
    try {
      await exportBackup();
    } catch (e: any) {
      Alert.alert('Export failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const backup = await pickBackup();
      if (!backup) return;
      Alert.alert(
        'Restore backup?',
        `This replaces everything in Tally with ${backup.bills.length} bill(s) from the file. There is no undo.`,
        [
          {
            text: 'Replace all',
            style: 'destructive',
            onPress: () => {
              replaceAll(backup);
              Alert.alert('Restored', 'Backup loaded.');
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } catch (e: any) {
      Alert.alert('Import failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const buyPro = () =>
    purchasePro()
      .then((ok) => ok && Alert.alert('Thanks!', 'Unlimited scans unlocked.'))
      .catch((e) => Alert.alert('Purchase failed', String(e?.message ?? e)));

  const restore = () =>
    restorePurchases()
      .then((ok) =>
        Alert.alert(ok ? 'Restored' : 'Nothing to restore', ok ? 'Pro is active.' : undefined),
      )
      .catch((e) => Alert.alert('Restore failed', String(e?.message ?? e)));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.topLink}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Default tip</Text>
          <View style={styles.stepper}>
            <Pressable
              hitSlop={8}
              onPress={() => update({ defaultTipPct: Math.max(0, settings.defaultTipPct - 1) })}
            >
              <Text style={styles.stepBtn}>−</Text>
            </Pressable>
            <Text style={styles.stepValue}>{settings.defaultTipPct}%</Text>
            <Pressable
              hitSlop={8}
              onPress={() => update({ defaultTipPct: Math.min(100, settings.defaultTipPct + 1) })}
            >
              <Text style={styles.stepBtn}>+</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.hint}>New bills start with this tip percent.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Backup</Text>
        <Text style={styles.hint}>
          Everything stays on this phone. Backups are plain JSON you keep wherever you like.
        </Text>
        <Pressable style={styles.btn} onPress={doExport} disabled={busy}>
          <Text style={styles.btnText}>Export backup</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={doImport} disabled={busy}>
          <Text style={styles.btnText}>Import backup</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Tally Pro</Text>
        {pro ? (
          <Text style={styles.hint}>
            {isFailOpen()
              ? 'Pro is unlocked in this build.'
              : 'Unlimited receipt scans — thanks for the support.'}
          </Text>
        ) : (
          <>
            <Text style={styles.hint}>
              One-time purchase for unlimited receipt scans. Manual entry, splitting, and
              export are free forever. Scans used: {settings.scansUsed}/{FREE_SCANS} free.
            </Text>
            <Pressable style={styles.buyBtn} onPress={buyPro}>
              <Text style={styles.buyBtnText}>
                {priceString
                  ? `Unlock unlimited scans — ${priceString}`
                  : 'Unlock unlimited scans'}
              </Text>
            </Pressable>
          </>
        )}
        <Pressable style={styles.btn} onPress={restore}>
          <Text style={styles.btnText}>Restore purchases</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingTop: 0, paddingBottom: 48 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 64,
    paddingBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  topLink: { color: colors.textMuted, fontSize: 14, width: 44 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, color: colors.textPrimary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { fontSize: 20, color: colors.textBody, paddingHorizontal: 4 },
  stepValue: { fontSize: 15, color: colors.textPrimary, minWidth: 40, textAlign: 'center' },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 6 },
  btn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: colors.textBody, fontSize: 15, fontWeight: '500' },
  buyBtn: {
    borderRadius: 10,
    backgroundColor: colors.brand,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
