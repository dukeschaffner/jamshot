import { StyleSheet } from 'react-native';

// Colors - matching UI globals.css
export const colors = {
  // Primary colors
  p1: '#e4a794',
  p2: '#f59771',
  
  // Secondary colors
  s1: '#86a699',
  s2: '#036745',
  
  // Brand colors
  seafoam: '#93E9BE',
  seafoamLight: '#C1F4D9',
  seafoamDark: '#65d6ad',
  rusticPink: '#E9A9A1',
  rusticPinkLight: '#F4C9C4',
  
  // Status colors
  red: '#fc3232',
  white: '#ffffff',
  
  // Greyscale
  background: '#ffffff',
  grey1: '#f5f5f5',
  grey2: '#e0e0e0',
  grey3: '#555555',
  grey4: '#333333',
  
  // Text colors
  textPrimary: '#171717',
  textSecondary: '#555555',
  textDisabled: '#999999',
};

// Button Styles - matching UI globals.css button classes
export const buttonStyles = StyleSheet.create({
  // Base pill button
  pillBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.grey1,
    borderRadius: 24,
    fontWeight: '600',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  
  // Small pill button
  pillBtnSm: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    fontSize: 14,
  },
  
  // Gradient button (using seafoam as primary color)
  gradientBtn: {
    backgroundColor: colors.seafoam,
    // Note: React Native doesn't support CSS gradients directly
    // Use LinearGradient component from expo-linear-gradient for true gradients
  },
  
  // Pink button
  pinkBtn: {
    backgroundColor: colors.rusticPinkLight,
  },
  
  // Green button
  greenBtn: {
    backgroundColor: colors.seafoamLight,
  }
});

// Button text styles
export const buttonTextStyles = StyleSheet.create({
  pillBtn: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  pillBtnSm: {
    fontSize: 14,
    fontWeight: '600',
  },
  gradientBtn: {
    color: colors.white,
    fontWeight: '600',
  },
  pinkBtn: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  greenBtn: {
    color: colors.textPrimary,
    fontWeight: '600',
  }
});

