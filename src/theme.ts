import { StyleSheet } from 'react-native';

// Palette lifted from the web app's CSS (deploy/index.html).
export const C = {
  bg: '#fff7fb',
  ink: '#26324d',
  inkSoft: '#4c4560',
  muted: '#6b6785',
  faint: '#8a84a0',
  purple: '#7c3aed',
  purpleDeep: '#4c1d95',
  purpleText: '#6d28a8',
  purpleDark: '#5b21b6',
  lavender: '#ede9fe',
  lavenderLight: '#f3e8ff',
  chipBg: '#fbfaff',
  chipBorder: '#e9e3f8',
  cardBorder: '#eee3f2',
  track: '#eadff7',
  gold: '#f5a623',
  red: '#dc2626',
  green: '#1d9e41',
  greenBg: '#e7f8ee',
  recBg: '#f6f2ff',
  recBorder: '#c9b8f5',
  white: '#ffffff',
};

export const shared = StyleSheet.create({
  primaryBtn: {
    backgroundColor: C.purple,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryBtn: {
    backgroundColor: C.lavender,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: C.purpleDeep,
    fontSize: 16,
    fontWeight: '800',
  },
  stepPill: {
    alignSelf: 'center',
    backgroundColor: C.lavender,
    color: C.purpleText,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
