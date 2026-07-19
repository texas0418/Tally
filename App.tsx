import { useEffect, useState } from 'react';
import BillScreen from './src/screens/BillScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { SettingsProvider, useSettings } from './src/SettingsContext';
import { initPurchases } from './src/proAccess';
import { createBill, listBills } from './src/db';

type Screen = 'bill' | 'history' | 'settings';

function Root() {
  const { settings, loaded } = useSettings();
  const [screen, setScreen] = useState<Screen>('bill');
  const [billId, setBillId] = useState<number | null>(null);

  useEffect(() => {
    if (!loaded || billId != null) return;
    // Open the most recent bill; a brand-new install starts one.
    const bills = listBills();
    if (bills.length > 0) {
      setBillId(bills[0].id!);
    } else {
      setBillId(
        createBill({
          name: '',
          createdMs: Date.now(),
          tipPct: settings.defaultTipPct,
          taxCents: 0,
        }),
      );
    }
  }, [loaded, billId, settings.defaultTipPct]);

  if (!loaded || billId == null) return null;
  if (screen === 'history')
    return (
      <HistoryScreen
        onBack={() => setScreen('bill')}
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
