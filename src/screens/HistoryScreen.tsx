// src/screens/HistoryScreen.tsx
// Past bills: start a new one, open one, or delete it (visible delete button).

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
  deleteBill,
  listAssignments,
  listBills,
  listItems,
  listPeople,
} from '../db';
import { colors } from '../theme';

interface Props {
  currentBillId: number;
  onBack: () => void;
  onOpenBill: (id: number) => void;
  onNewBill: () => void;
}

export default function HistoryScreen({
  currentBillId,
  onBack,
  onOpenBill,
  onNewBill,
}: Props) {
  const [bills, setBills] = useState<Bill[]>([]);

  // Prune empty ($0) bills — leftovers from "Done → new bill" — but never the
  // current one (you may be mid-entry on it).
  const reload = useCallback(() => {
    for (const b of listBills()) {
      if (b.id === currentBillId) continue;
      const t = computeBillTotals(
        b,
        listPeople(b.id!),
        listItems(b.id!),
        listAssignments(b.id!),
      );
      if (t.grandTotalCents === 0) deleteBill(b.id!);
    }
    setBills(listBills());
  }, [currentBillId]);
  useEffect(reload, [reload]);

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
    const isCurrent = bill.id === currentBillId;
    return (
      <View style={styles.row}>
        <Pressable style={styles.rowMain} onPress={() => onOpenBill(bill.id!)}>
          <View style={styles.rowLeft}>
            <View style={styles.rowNameLine}>
              <Text style={styles.rowName}>{bill.name || 'Untitled bill'}</Text>
              {isCurrent && <Text style={styles.currentTag}>Current</Text>}
            </View>
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
        <Pressable
          style={styles.deleteBtn}
          onPress={() => confirmDelete(bill)}
          hitSlop={8}
        >
          <Text style={styles.deleteX}>✕</Text>
        </Pressable>
      </View>
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
        <View style={{ width: 44 }} />
      </View>
      <FlatList
        data={bills}
        keyExtractor={(b) => String(b.id)}
        renderItem={renderBill}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Pressable style={styles.newBtn} onPress={onNewBill}>
            <Text style={styles.newBtnText}>+ New bill</Text>
          </Pressable>
        }
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
  topLink: { color: colors.textMuted, fontSize: 14, width: 44 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  newBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  newBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 8,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  rowLeft: { flex: 1 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  currentTag: {
    fontSize: 11,
    color: colors.success,
    backgroundColor: '#e1f5ee',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  rowDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowTotal: { fontSize: 15, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  deleteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  deleteX: { color: colors.textMuted, fontSize: 16 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 48, fontSize: 14 },
});
