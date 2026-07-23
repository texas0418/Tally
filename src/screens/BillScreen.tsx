// src/screens/BillScreen.tsx
// The whole app on one screen: name the bill, add people, add/scan items,
// tap a person then tap items to assign, tweak tip, read live totals, share.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Assignments, Bill, Item, Person } from '../models';
import {
  allocateProRata,
  buildShareText,
  computeBillTotals,
  formatCents,
  parseQuantity,
} from '../models';
import {
  addItem,
  addPerson,
  deleteItem,
  deletePerson,
  getBill,
  listAssignments,
  listItems,
  listPeople,
  renamePerson,
  setAssigned,
  updateBill,
  updateItem,
} from '../db';
import { scanReceipt } from '../scanReceipt';
import { useSettings } from '../SettingsContext';
import { useProAccess, purchasePro } from '../proAccess';
import { FREE_SCANS } from '../revenuecat';
import { brandStripe, colors, personColor } from '../theme';

const TIP_PRESETS = [0, 15, 18, 20, 25];

interface Props {
  billId: number;
  onHistory: () => void;
  onSettings: () => void;
  onNewBill: () => void;
}

export default function BillScreen({ billId, onHistory, onSettings, onNewBill }: Props) {
  const { settings, update } = useSettings();
  const pro = useProAccess();

  const [bill, setBill] = useState<Bill | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [assignments, setAssignments] = useState<Assignments>(new Map());
  // Item-first assignment: tap an item to focus it, then tap people to toggle
  // who shared it. null = nothing focused.
  const [focusedItemId, setFocusedItemId] = useState<number | null>(null);
  // Tapping a person chip opens an inline rename/remove editor. Seeded on open,
  // never on reload, so persisting a rename doesn't fight what's being typed.
  const [editingPersonId, setEditingPersonId] = useState<number | null>(null);
  const [personNameText, setPersonNameText] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [scanning, setScanning] = useState(false);
  // Tax field holds its own raw text so typing/deleting isn't fought by
  // reformatting. Resynced from the stored cents only on (re)load, never
  // mid-keystroke.
  const [taxText, setTaxText] = useState('');
  // Edit fields for the focused item. Seeded when an item is focused (never on
  // reload), so persisting an edit doesn't fight what's being typed.
  const [editLabel, setEditLabel] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const nameRef = useRef<TextInput>(null);

  const reload = useCallback(() => {
    const b = getBill(billId);
    setBill(b);
    setTaxText(b && b.taxCents > 0 ? (b.taxCents / 100).toFixed(2) : '');
    const ppl = listPeople(billId);
    setPeople(ppl);
    const its = listItems(billId);
    setItems(its);
    setAssignments(listAssignments(billId));
    setFocusedItemId((cur) => (its.some((i) => i.id === cur) ? cur : null));
  }, [billId]);

  useEffect(reload, [reload]);

  const totals = useMemo(
    () => (bill ? computeBillTotals(bill, people, items, assignments) : null),
    [bill, people, items, assignments],
  );

  if (!bill || !totals) return null;

  const saveBill = (patch: Partial<Bill>) => {
    const next = { ...bill, ...patch };
    setBill(next);
    updateBill(next);
  };

  const commitPerson = () => {
    const name = newPersonName.trim();
    setNewPersonName('');
    setAddingPerson(false);
    if (!name) return;
    addPerson({ billId, name, colorIdx: people.length });
    reload();
  };

  const commitItem = () => {
    const label = newLabel.trim();
    const cents = Math.round(parseFloat(newPrice.replace(',', '.')) * 100);
    if (!label || !Number.isFinite(cents) || cents <= 0) return;
    const id = addItem(billId, label, cents);
    setNewLabel('');
    setNewPrice('');
    Keyboard.dismiss(); // decimal-pad has no return key; close it on Add
    reload();
    openItem(id, label, cents); // open the new item so you can assign it right away
  };

  /** Focus an item and seed the edit fields from its current values. */
  const openItem = (id: number, label: string, cents: number) => {
    setFocusedItemId(id);
    setEditLabel(label);
    setEditPrice((cents / 100).toFixed(2));
  };

  /** Tapping an item focuses it (reveals edit fields + people toggles);
   *  tapping the already-focused item collapses it. */
  const focusItem = (item: Item) => {
    if (focusedItemId === item.id) {
      setFocusedItemId(null);
    } else {
      openItem(item.id!, item.label, item.priceCents);
    }
  };

  /** Persist an edit to the focused item's name/price. Keeps the last valid
   *  value when a field is momentarily empty/invalid mid-typing. */
  const commitItemEdit = (id: number, nextLabel: string, nextPrice: string) => {
    const label = nextLabel.trim();
    const cents = Math.round(parseFloat(nextPrice.replace(',', '.')) * 100);
    if (!label || !Number.isFinite(cents) || cents <= 0) return;
    updateItem(id, label, cents);
    reload();
  };

  /** Split a multi-unit line ("2X Caesar $24") into `qty` separate items
   *  ($12 each) so each unit can go to a different person. The original row
   *  becomes unit 1 (keeping its place); the rest are appended. */
  const splitItem = (item: Item, qty: number, base: string) => {
    const parts = allocateProRata(item.priceCents, Array(qty).fill(1));
    updateItem(item.id!, base, parts[0]);
    for (let k = 1; k < qty; k++) addItem(billId, base, parts[k]);
    reload();
    openItem(item.id!, base, parts[0]);
  };

  /** Toggle one person on/off the focused item. */
  const togglePersonOnItem = (itemId: number, personId: number) => {
    const on = assignments.get(itemId)?.has(personId) ?? false;
    setAssigned(itemId, personId, !on);
    reload();
  };

  const deleteFocusedItem = (item: Item) => {
    Alert.alert(`Delete ${item.label}?`, undefined, [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setFocusedItemId(null);
          deleteItem(item.id!);
          reload();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  /** Tap a person chip to open the rename/remove editor; tap again to close. */
  const editPerson = (p: Person) => {
    if (editingPersonId === p.id) {
      setEditingPersonId(null);
    } else {
      setEditingPersonId(p.id!);
      setPersonNameText(p.name);
    }
  };

  const commitPersonName = (id: number, text: string) => {
    const name = text.trim();
    if (!name) return; // keep the old name until a non-empty one is typed
    renamePerson(id, name);
    reload();
  };

  const removePerson = (p: Person) => {
    Alert.alert(`Remove ${p.name}?`, 'Their assignments will be cleared.', [
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setEditingPersonId(null);
          deletePerson(p.id!);
          reload();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const startScan = () => {
    if (!pro && settings.scansUsed >= FREE_SCANS) {
      Alert.alert(
        'Unlock unlimited scans',
        `You've used your ${FREE_SCANS} free scans. Tally Pro is a one-time purchase — manual entry stays free forever.`,
        [
          {
            text: 'Unlock Pro',
            onPress: () =>
              purchasePro().catch((e) => Alert.alert('Purchase failed', String(e?.message ?? e))),
          },
          { text: 'Not now', style: 'cancel' },
        ],
      );
      return;
    }
    Alert.alert('Scan receipt', undefined, [
      { text: 'Take photo', onPress: () => runScan('camera') },
      { text: 'Choose photo', onPress: () => runScan('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const runScan = async (source: 'camera' | 'library') => {
    setScanning(true);
    try {
      const parsed = await scanReceipt(source);
      if (!parsed) return; // user cancelled
      if (parsed.items.length === 0) {
        Alert.alert(
          "No line items found",
          'The photo was readable but no priced lines were recognized. Add items manually.',
        );
        return;
      }
      for (const it of parsed.items) addItem(billId, it.label, it.priceCents);
      const patch: Partial<Bill> = {};
      if (parsed.taxCents != null && bill.taxCents === 0) patch.taxCents = parsed.taxCents;
      if (Object.keys(patch).length) saveBill(patch);
      update({ scansUsed: settings.scansUsed + 1 });
      reload();
      Alert.alert(
        `Added ${parsed.items.length} items`,
        (parsed.taxCents != null ? `Tax ${formatCents(parsed.taxCents)} filled in. ` : '') +
          (parsed.reconciles
            ? 'Items match the printed subtotal.'
            : 'Double-check against the receipt — OCR can miss lines.'),
      );
    } catch (e: any) {
      Alert.alert("Couldn't scan", String(e?.message ?? e));
    } finally {
      setScanning(false);
    }
  };

  const share = () => {
    Share.share({ message: buildShareText(bill.name, people, totals) }).catch(() => {});
  };

  const finishBill = () => {
    if (items.length === 0) {
      onNewBill(); // empty bill — nothing to keep, just start fresh
      return;
    }
    Alert.alert(
      'Done with this bill?',
      "It's saved in History. Starting a fresh bill.",
      [
        { text: 'Done', onPress: onNewBill },
        { text: 'Keep editing', style: 'cancel' },
      ],
    );
  };

  const personById = new Map(people.map((p) => [p.id!, p]));

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.brand}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.brandMark}
            />
            <Text style={styles.brandName}>Tally</Text>
          </View>
          <View style={styles.headerLinks}>
            <Pressable onPress={onHistory} hitSlop={8}>
              <Text style={styles.topLink}>History</Text>
            </Pressable>
            <Pressable onPress={onSettings} hitSlop={8}>
              <Text style={styles.topLink}>Settings</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.accentBar}>
          {brandStripe.map((c) => (
            <View key={c} style={[styles.accentSeg, { backgroundColor: c }]} />
          ))}
        </View>

        <Pressable style={styles.nameField} onPress={() => nameRef.current?.focus()}>
          <TextInput
            ref={nameRef}
            style={styles.billName}
            value={bill.name}
            placeholder="Name this bill"
            placeholderTextColor={colors.textMuted}
            onChangeText={(name) => saveBill({ name })}
          />
          <Text style={styles.pencil}>✎</Text>
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {people.map((p) => {
            const c = personColor(p.colorIdx);
            const editing = p.id === editingPersonId;
            return (
              <Pressable
                key={p.id}
                onPress={() => editPerson(p)}
                style={[
                  styles.chip,
                  { backgroundColor: c.bg },
                  editing && { borderColor: c.main, borderWidth: 2 },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: c.main }]}>
                  <Text style={styles.avatarText}>{p.name[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <Text style={[styles.chipText, { color: c.text }]}>{p.name}</Text>
              </Pressable>
            );
          })}
          {addingPerson ? (
            <TextInput
              style={styles.chipInput}
              value={newPersonName}
              onChangeText={setNewPersonName}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
              autoFocus
              onSubmitEditing={commitPerson}
              onBlur={commitPerson}
            />
          ) : (
            <Pressable style={styles.chipAdd} onPress={() => setAddingPerson(true)}>
              <Text style={styles.chipAddText}>+ Add</Text>
            </Pressable>
          )}
        </ScrollView>

        {editingPersonId != null &&
          (() => {
            const p = people.find((x) => x.id === editingPersonId);
            if (!p) return null;
            const c = personColor(p.colorIdx);
            return (
              <View style={styles.personEditor}>
                <TextInput
                  style={styles.personNameInput}
                  value={personNameText}
                  placeholder="Name"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  onChangeText={(v) => {
                    setPersonNameText(v);
                    commitPersonName(p.id!, v);
                  }}
                  onSubmitEditing={() => setEditingPersonId(null)}
                />
                <Pressable
                  style={[styles.personRemoveBtn, { borderColor: c.main }]}
                  onPress={() => removePerson(p)}
                  hitSlop={6}
                >
                  <Text style={styles.personRemoveText}>Remove</Text>
                </Pressable>
              </View>
            );
          })()}

        {people.length > 0 && (
          <Text style={styles.hint}>
            Tap an item, then tap everyone who shared it. Tap a name to rename or remove.
          </Text>
        )}

        <View style={styles.card}>
          {items.map((item) => {
            const assignedIds = assignments.get(item.id!) ?? new Set<number>();
            const assigned = [...assignedIds]
              .map((id) => personById.get(id))
              .filter(Boolean) as Person[];
            const focused = item.id === focusedItemId;
            return (
              <View key={item.id}>
                <Pressable
                  onPress={() => focusItem(item)}
                  style={[styles.itemRow, focused && styles.itemRowFocused]}
                >
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    {assigned.length > 0 ? (
                      <Text style={styles.itemAssignees}>
                        {assigned.map((p, i) => (
                          <Text key={p.id} style={{ color: personColor(p.colorIdx).main }}>
                            {i > 0 ? ' ' : ''}●{' '}
                            <Text style={styles.assigneeName}>{p.name}</Text>
                          </Text>
                        ))}
                        {assigned.length > 1 && (
                          <Text style={styles.assigneeName}>  ÷{assigned.length}</Text>
                        )}
                      </Text>
                    ) : (
                      <Text style={styles.itemUnassigned}>tap to assign</Text>
                    )}
                  </View>
                  <Text style={styles.itemPrice}>{formatCents(item.priceCents)}</Text>
                </Pressable>

                {focused && (
                  <View style={styles.assignTray}>
                    <View style={styles.editRow}>
                      <TextInput
                        style={styles.editLabelInput}
                        value={editLabel}
                        placeholder="Item name"
                        placeholderTextColor={colors.textMuted}
                        onChangeText={(v) => {
                          setEditLabel(v);
                          commitItemEdit(item.id!, v, editPrice);
                        }}
                      />
                      <TextInput
                        style={styles.editPriceInput}
                        value={editPrice}
                        placeholder="0.00"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="decimal-pad"
                        onChangeText={(v) => {
                          setEditPrice(v);
                          commitItemEdit(item.id!, editLabel, v);
                        }}
                      />
                    </View>
                    {(() => {
                      const q = parseQuantity(editLabel);
                      return q ? (
                        <Pressable
                          style={styles.splitBtn}
                          onPress={() => splitItem(item, q.qty, q.base)}
                        >
                          <Text style={styles.splitBtnText}>
                            Split into {q.qty} separate items · {formatCents(Math.round(item.priceCents / q.qty))} each
                          </Text>
                        </Pressable>
                      ) : null;
                    })()}
                    {people.length === 0 ? (
                      <Text style={styles.assignEmpty}>Add a person above to assign this.</Text>
                    ) : (
                      <>
                        <Text style={styles.assignLabel}>Who shared this?</Text>
                        <View style={styles.assignChips}>
                          {people.map((p) => {
                            const c = personColor(p.colorIdx);
                            const on = assignedIds.has(p.id!);
                            return (
                              <Pressable
                                key={p.id}
                                onPress={() => togglePersonOnItem(item.id!, p.id!)}
                                style={[
                                  styles.toggleChip,
                                  on
                                    ? { backgroundColor: c.bg, borderColor: c.main }
                                    : { borderColor: colors.cardBorder },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.avatar,
                                    { backgroundColor: on ? c.main : colors.hairline },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.avatarText,
                                      { color: on ? '#fff' : colors.textMuted },
                                    ]}
                                  >
                                    {on ? '✓' : p.name[0]?.toUpperCase() ?? '?'}
                                  </Text>
                                </View>
                                <Text
                                  style={[
                                    styles.toggleChipText,
                                    { color: on ? c.text : colors.textBody },
                                  ]}
                                >
                                  {p.name}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        {assigned.length > 1 && (
                          <Text style={styles.assignSplit}>
                            Split {assigned.length} ways ·{' '}
                            {formatCents(Math.round(item.priceCents / assigned.length))} each
                          </Text>
                        )}
                      </>
                    )}
                    <Pressable
                      style={styles.deleteItemBtn}
                      onPress={() => deleteFocusedItem(item)}
                      hitSlop={6}
                    >
                      <Text style={styles.deleteItemText}>Delete item</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}

          <View style={styles.addRow}>
            <TextInput
              style={styles.addLabel}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="Add item"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={commitItem}
            />
            <TextInput
              style={styles.addPrice}
              value={newPrice}
              onChangeText={setNewPrice}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              onSubmitEditing={commitItem}
            />
            <Pressable style={styles.addBtn} onPress={commitItem} hitSlop={8}>
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>

          <Pressable style={styles.scanBtn} onPress={startScan} disabled={scanning}>
            <Text style={styles.scanBtnText}>
              {scanning ? 'Reading receipt…' : 'Scan receipt'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.tipHeader}>
            <Text style={styles.sectionTitle}>Tip {bill.tipPct}%</Text>
            <View style={styles.stepper}>
              <Pressable
                hitSlop={8}
                onPress={() => saveBill({ tipPct: Math.max(0, bill.tipPct - 1) })}
              >
                <Text style={styles.stepBtn}>−</Text>
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() => saveBill({ tipPct: Math.min(100, bill.tipPct + 1) })}
              >
                <Text style={styles.stepBtn}>+</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.presetRow}>
            {TIP_PRESETS.map((pct) => (
              <Pressable
                key={pct}
                onPress={() => saveBill({ tipPct: pct })}
                style={[styles.preset, bill.tipPct === pct && styles.presetOn]}
              >
                <Text
                  style={[styles.presetText, bill.tipPct === pct && styles.presetTextOn]}
                >
                  {pct}%
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.taxRow}>
            <Text style={styles.taxLabel}>Tax</Text>
            <TextInput
              style={styles.taxInput}
              value={taxText}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              onChangeText={(v) => {
                setTaxText(v);
                const cents = Math.round(parseFloat(v.replace(',', '.') || '0') * 100);
                saveBill({ taxCents: Number.isFinite(cents) && cents > 0 ? cents : 0 });
              }}
            />
          </View>
          <Text style={styles.hintInCard}>
            Tip and tax split by each person's share, not evenly.
          </Text>
        </View>

        {totals.unassignedCents > 0 && (
          <Text style={styles.warn}>
            {formatCents(totals.unassignedCents)} not assigned to anyone yet
          </Text>
        )}

        <View style={styles.totalsGrid}>
          {totals.perPerson.map((t) => {
            const p = personById.get(t.personId);
            if (!p) return null;
            const c = personColor(p.colorIdx);
            return (
              <View key={t.personId} style={[styles.totalCard, { backgroundColor: c.main }]}>
                <Text style={[styles.totalName, { color: colors.onSolid }]}>{p.name}</Text>
                <Text style={styles.totalAmount}>{formatCents(t.totalCents)}</Text>
                <Text style={[styles.totalBreakdown, { color: colors.onSolidFaint }]}>
                  {formatCents(t.subtotalCents)} + tip {formatCents(t.tipCents)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.summary}>
          <SummaryRow label="Subtotal" value={formatCents(totals.billSubtotalCents)} />
          <SummaryRow label="Tax" value={formatCents(totals.taxCents)} />
          <SummaryRow label={`Tip (${bill.tipPct}%)`} value={formatCents(totals.tipCents)} />
          <SummaryRow label="Total" value={formatCents(totals.grandTotalCents)} bold />
        </View>

        <Pressable style={styles.shareBtn} onPress={share}>
          <Text style={styles.shareBtnText}>Share totals</Text>
        </Pressable>
        <Pressable style={styles.doneBtn} onPress={finishBill}>
          <Text style={styles.doneBtnText}>Done — start a new bill</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SummaryRow(props: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, props.bold && styles.summaryBold]}>
        {props.label}
      </Text>
      <Text style={[styles.summaryValue, props.bold && styles.summaryBold]}>
        {props.value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingTop: 64, paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 28, height: 28, borderRadius: 7 },
  brandName: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  headerLinks: { flexDirection: 'row', gap: 16 },
  accentBar: { flexDirection: 'row', gap: 3, marginBottom: 16 },
  accentSeg: { flex: 1, height: 3, borderRadius: 2 },
  nameField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: '#dcd6ca',
    paddingBottom: 6,
    marginBottom: 16,
  },
  billName: {
    flex: 1,
    fontSize: 21,
    fontWeight: '600',
    color: colors.textPrimary,
    padding: 0,
  },
  pencil: { fontSize: 15, color: '#a8a29a' },
  topLink: { color: colors.textMuted, fontSize: 14 },
  chipRow: { flexGrow: 0, marginBottom: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  chipText: { fontSize: 14, fontWeight: '500' },
  chipAdd: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipAddText: { color: colors.textBody, fontSize: 14 },
  chipInput: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    minWidth: 100,
    fontSize: 14,
    color: colors.textPrimary,
  },
  personEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  personNameInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  personRemoveBtn: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  personRemoveText: { color: colors.danger, fontSize: 14, fontWeight: '500' },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: 10 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    marginBottom: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    borderRadius: 8,
  },
  itemRowFocused: { backgroundColor: colors.bg },
  itemLeft: { flex: 1, marginRight: 8 },
  itemLabel: { fontSize: 15, color: colors.textPrimary },
  itemAssignees: { fontSize: 12, marginTop: 2 },
  assigneeName: { color: colors.textMuted },
  itemUnassigned: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  assignTray: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 4,
  },
  editRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  editLabelInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  editPriceInput: {
    width: 84,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'right',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  splitBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brand,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  splitBtnText: { color: colors.brand, fontSize: 13, fontWeight: '500' },
  deleteItemBtn: { marginTop: 12, alignSelf: 'flex-start' },
  deleteItemText: { color: colors.danger, fontSize: 13, fontWeight: '500' },
  assignEmpty: { fontSize: 13, color: colors.textMuted },
  assignLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  assignChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    backgroundColor: colors.card,
  },
  toggleChipText: { fontSize: 14, fontWeight: '500' },
  assignSplit: { fontSize: 12, color: colors.textBody, marginTop: 10 },
  itemPrice: { fontSize: 15, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  addRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 10 },
  addLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  addPrice: {
    width: 70,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'right',
    paddingVertical: 8,
  },
  addBtn: { marginLeft: 10 },
  addBtnText: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  scanBtn: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 10,
    alignItems: 'center',
  },
  scanBtnText: { color: colors.textBody, fontSize: 15, fontWeight: '500' },
  tipHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  stepper: { flexDirection: 'row', gap: 18 },
  stepBtn: { fontSize: 20, color: colors.textBody, paddingHorizontal: 4 },
  presetRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  preset: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 7,
    alignItems: 'center',
  },
  presetOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  presetText: { fontSize: 13, color: colors.textBody },
  presetTextOn: { color: '#fff', fontWeight: '600' },
  taxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  taxLabel: { fontSize: 15, color: colors.textBody, flex: 1 },
  taxInput: {
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'right',
    minWidth: 80,
    paddingVertical: 4,
  },
  hintInCard: { color: colors.textMuted, fontSize: 12, marginTop: 10 },
  warn: { color: colors.danger, fontSize: 13, marginBottom: 10, textAlign: 'center' },
  totalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  totalCard: {
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  totalName: { fontSize: 12, fontWeight: '500' },
  totalAmount: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  totalBreakdown: { fontSize: 10, marginTop: 3 },
  summary: { paddingHorizontal: 6, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summaryLabel: { color: colors.textBody, fontSize: 14 },
  summaryValue: { color: colors.textBody, fontSize: 14, fontVariant: ['tabular-nums'] },
  summaryBold: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  shareBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  doneBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  doneBtnText: { color: colors.brand, fontSize: 15, fontWeight: '500' },
});
