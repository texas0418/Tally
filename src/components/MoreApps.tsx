// src/components/MoreApps.tsx
// The "More from Simon Shih" section at the foot of Settings. Three sibling
// apps, each opening its App Store page. Its own file so SettingsScreen does
// not grow. No network and no tracking: the list is static data from moreApps.ts.

import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { FleetApp, relatedApps, storeUrl } from '../moreApps';

export default function MoreApps() {
  const apps = relatedApps();
  if (apps.length === 0) return null;

  const open = (app: FleetApp) => {
    // openURL rejects when nothing can handle the scheme. Nothing useful to
    // tell the user in that case, so swallow it rather than throw.
    Linking.openURL(storeUrl(app)).catch(() => {});
  };

  return (
    <>
      <Text style={s.heading}>More from Simon Shih</Text>
      <View style={s.card}>
        {apps.map((app, i) => (
          <React.Fragment key={app.key}>
            {i > 0 ? <View style={s.hairline} /> : null}
            <Pressable
              onPress={() => open(app)}
              hitSlop={6}
              accessibilityRole="link"
              accessibilityLabel={`${app.name}, ${app.line}. Opens the App Store.`}
            >
              <Text style={s.name}>{app.name}</Text>
              <Text style={s.line}>{app.line}</Text>
            </Pressable>
          </React.Fragment>
        ))}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4, marginTop: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 12,
  },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  name: { color: colors.brand, fontSize: 15 },
  line: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
});
