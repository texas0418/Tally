// src/screens/HistoryScreen.tsx
// Past bills: open one, start a new one, or delete (long-press).

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Bill } from '../models';
import { computeBillTotals, formatCents } from '../models';
import {
  createBill,
  deleteBill,
  listAssignments,
  listBills,
  listItems,
  listPeople,
} from '../db';
import { useSettings } from '../SettingsContext';
import { colors } from '../theme';

interface Props {
  onBack: () => void;
  onOpenBill: (id: number) => void;
}

export default function HistoryScreen({ onBack, onOpenBill }: Props) {
  const { settings } = useSettings();
  const [bills, setBills] = useState<Bill[]>([]);

  const reload = useCallback(() => setBills(listBills()), []);
  useEffect(reload, [reload]);

  const newBill = () => {
    const id = createBill({
      name: '',
      createdMs: Date.now(),
      tipPct: settings.defaultTipPct,
      taxCents: 0,
    });
    onOpenBill(id);
  };

  const confirmDelete = (bill: Bill) => {
    Alert.alert(
      `Delete ${bill.name || 'this bill'}?`,
      'This removes its items and people. There is no undo.',
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteBill(bill.id!);
            reload();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const renderBill = ({ item: bill }: { item: Bill }) => {
    const totals = computeBillTotals(
      bill,
      listPeople(bill.id!),
      listItems(bill.id!),
      listAssignments(bill.id!),
    );
    const date = new Date(bill.createdMs);
    return (
      <Pressable
        style={styles.row}
        onPress={() => onOpenBill(bill.id!)}
        onLongPress={() => confirmDelete(bill)}
      >
        <View style={styles.rowLeft}>
          <Text style={styles.rowName}>{bill.name || 'Untitled bill'}</Text>
          <Text style={styles.rowDate}>
            {date.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>
        <Text style={styles.rowTotal}>{formatCents(totals.grandTotalCents)}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.topLink}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>History</Text>
        <Pressable onPress={newBill} hitSlop={8}>
          <Text style={styles.topLink}>New bill</Text>
        </Pressable>
      </View>
      <FlatList
        data={bills}
        keyExtractor={(b) => String(b.id)}
        renderItem={renderBill}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No bills yet. Start one and it lands here.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 64,
    paddingBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  topLink: { color: colors.textMuted, fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    marginBottom: 8,
  },
  rowLeft: { flex: 1 },
  rowName: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  rowDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowTotal: { fontSize: 15, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 48, fontSize: 14 },
});
