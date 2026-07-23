import { useEffect, useState } from 'react';
import BillScreen from './src/screens/BillScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { SettingsProvider, useSettings } from './src/SettingsContext';
import { initPurchases } from './src/proAccess';
import { createBill, getBill, listBills } from './src/db';

type Screen = 'bill' | 'history' | 'settings';

function Root() {
  const { settings, loaded } = useSettings();
  const [screen, setScreen] = useState<Screen>('bill');
  const [billId, setBillId] = useState<number | null>(null);

  const startNewBill = () => {
    const id = createBill({
      name: '',
      createdMs: Date.now(),
      tipPct: settings.defaultTipPct,
      taxCents: 0,
    });
    setBillId(id);
    setScreen('bill');
  };

  useEffect(() => {
    if (!loaded || billId != null) return;
    // Open the most recent bill; a brand-new install starts one.
    const bills = listBills();
    setBillId(bills[0]?.id ?? null);
    if (bills.length === 0) startNewBill();
  }, [loaded, billId]);

  // If the current bill was deleted from History, repoint to the most recent
  // remaining one (or a fresh bill) when we come back to the bill screen.
  useEffect(() => {
    if (!loaded || billId == null || screen !== 'bill') return;
    if (getBill(billId) == null) {
      const bills = listBills();
      if (bills.length > 0) setBillId(bills[0].id!);
      else startNewBill();
    }
  }, [loaded, billId, screen]);

  if (!loaded || billId == null) return null;
  if (screen === 'history')
    return (
      <HistoryScreen
        currentBillId={billId}
        onBack={() => setScreen('bill')}
        onNewBill={startNewBill}
        onOpenBill={(id) => {
          setBillId(id);
          setScreen('bill');
        }}
      />
    );
  if (screen === 'settings') return <SettingsScreen onBack={() => setScreen('bill')} />;
  return (
    <BillScreen
      billId={billId}
      onHistory={() => setScreen('history')}
      onSettings={() => setScreen('settings')}
      onNewBill={startNewBill}
    />
  );
}

export default function App() {
  useEffect(() => {
    // Fail-open: unlocks Pro immediately in Expo Go / placeholder builds.
    initPurchases();
  }, []);
  return (
    <SettingsProvider>
      <Root />
    </SettingsProvider>
  );
}
