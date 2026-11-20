import { Platform } from 'react-native';

export const IS_ANDROID = Platform.OS === 'android';
export const IS_IOS = Platform.OS === 'ios';

/**
 * Dual-platform design tokens:
 * - iOS: Apple iOS 26 Liquid Glass vibrancy palette
 * - Android: Material 3 Expressive Dark tonal surface system
 */
export const THEME = IS_ANDROID
  ? {
      surface: '#111318',
      surfaceContainerLow: '#191C22',
      surfaceContainer: '#1D2028',
      surfaceContainerHigh: '#272A33',
      surfaceContainerHighest: '#323540',
      outline: '#434754',
      outlineVariant: 'rgba(142, 144, 153, 0.28)',

      primary: '#A8C7FA',
      onPrimary: '#062E6F',
      primaryContainer: '#0842A0',
      onPrimaryContainer: '#D3E3FD',

      secondaryContainer: '#334863',
      onSecondaryContainer: '#D3E4FF',

      tertiary: '#6DD58C',
      onTertiary: '#003915',
      tertiaryContainer: '#0F5223',
      onTertiaryContainer: '#C4EED0',

      error: '#FFB4AB',
      onError: '#690005',
      errorContainer: '#93000A',
      onErrorContainer: '#FFDAD6',
      redLine: '#E53935',

      onSurface: '#E2E2E9',
      onSurfaceVariant: '#C4C6D0',

      rippleColor: 'rgba(168, 199, 250, 0.24)',

      cardRadius: 24,
      innerCardRadius: 18,
      pillRadius: 999,
      sheetRadius: 28,
    }
  : {
      surface: '#000000',
      surfaceContainerLow: 'rgba(18, 22, 32, 0.34)',
      surfaceContainer: 'rgba(255, 255, 255, 0.06)',
      surfaceContainerHigh: 'rgba(255, 255, 255, 0.09)',
      surfaceContainerHighest: 'rgba(255, 255, 255, 0.14)',
      outline: 'rgba(255, 255, 255, 0.22)',
      outlineVariant: 'rgba(255, 255, 255, 0.14)',

      primary: '#0A84FF',
      onPrimary: '#FFFFFF',
      primaryContainer: 'rgba(10, 132, 255, 0.25)',
      onPrimaryContainer: '#64D2FF',

      secondaryContainer: 'rgba(255, 255, 255, 0.09)',
      onSecondaryContainer: '#E2E8F0',

      tertiary: '#30D158',
      onTertiary: '#FFFFFF',
      tertiaryContainer: 'rgba(48, 209, 88, 0.20)',
      onTertiaryContainer: '#30D158',

      error: '#FF453A',
      onError: '#FFFFFF',
      errorContainer: 'rgba(255, 69, 58, 0.25)',
      onErrorContainer: '#FCA5A5',
      redLine: '#FF453A',

      onSurface: '#FFFFFF',
      onSurfaceVariant: 'rgba(255, 255, 255, 0.65)',

      rippleColor: 'rgba(255, 255, 255, 0.15)',

      cardRadius: 22,
      innerCardRadius: 16,
      pillRadius: 999,
      sheetRadius: 30,
    };
