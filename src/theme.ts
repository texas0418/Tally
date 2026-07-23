// src/theme.ts — Tally palette, per approved design: clean minimal light UI,
// person accent colors do the visual heavy lifting (chip -> line item -> total).
export const colors = {
  bg: '#f7f5f0', // warm paper, matches the app icon
  card: '#ffffff',
  cardBorder: '#e9e5db',
  hairline: '#f1eee7',
  textPrimary: '#1a1a18',
  textBody: '#44443f',
  textMuted: '#8a8a84',
  accent: '#1a1a18', // primary buttons stay ink-neutral
  brand: '#534ab7', // accent for secondary/brand touches (from the icon)
  danger: '#c93b3b',
  success: '#1d9e75',
  onSolid: 'rgba(255,255,255,0.82)', // label text on a solid person-color card
  onSolidFaint: 'rgba(255,255,255,0.72)',
} as const;

/** The four icon strokes, in order — used for the header accent rule. */
export const brandStripe = ['#534ab7', '#1d9e75', '#d85a30', '#d4537e'];

export interface PersonColor {
  main: string; // avatar fill, dots
  bg: string; // chip / total-card background
  text: string; // text on bg
}

/** Assigned round-robin by colorIdx. Six is plenty for one table. */
export const personColors: PersonColor[] = [
  { main: '#534ab7', bg: '#eeedfe', text: '#3c3489' },
  { main: '#1d9e75', bg: '#e1f5ee', text: '#085041' },
  { main: '#d85a30', bg: '#faece7', text: '#712b13' },
  { main: '#d4537e', bg: '#fbeaf0', text: '#72243e' },
  { main: '#378add', bg: '#e6f1fb', text: '#0c447c' },
  { main: '#ba7517', bg: '#faeeda', text: '#633806' },
];

export const personColor = (idx: number): PersonColor =>
  personColors[((idx % personColors.length) + personColors.length) % personColors.length];
