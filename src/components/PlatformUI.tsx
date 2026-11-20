import React from 'react';
import {
  Platform,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
  ViewProps,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { IS_ANDROID, THEME } from '../theme/platformTheme';

const HAS_NATIVE_LIQUID_GLASS =
  Platform.OS === 'ios' &&
  typeof isLiquidGlassAvailable === 'function' &&
  isLiquidGlassAvailable();

/**
 * AdaptiveSurface:
 * - On iOS: Apple Liquid Glass (`UIGlassEffect` / `systemUltraThinMaterialDark` + specular highlight).
 * - On Android: Material 3 Expressive Tonal Container (`surfaceContainer` + subtle tonal outline & elevation).
 */
export function AdaptiveSurface({
  children,
  style,
  intensity = 65,
  interactive = false,
  tonalLevel = 'container',
}: {
  children: React.ReactNode;
  style?: ViewProps['style'];
  intensity?: number;
  interactive?: boolean;
  tonalLevel?: 'low' | 'container' | 'high';
}) {
  if (IS_ANDROID) {
    const bg =
      tonalLevel === 'low'
        ? THEME.surfaceContainerLow
        : tonalLevel === 'high'
        ? THEME.surfaceContainerHigh
        : THEME.surfaceContainer;
    return (
      <View
        style={[
          styles.androidSurfaceBase,
          { backgroundColor: bg },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  if (HAS_NATIVE_LIQUID_GLASS) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive={interactive}
        style={[styles.iosGlassBase, style]}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={intensity}
      tint="systemUltraThinMaterialDark"
      style={[styles.iosGlassBase, styles.iosGlassFallback, style]}
    >
      <LinearGradient
        colors={[
          'rgba(255, 255, 255, 0.14)',
          'rgba(255, 255, 255, 0.03)',
          'rgba(255, 255, 255, 0.0)',
        ]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </BlurView>
  );
}

/**
 * AdaptivePressable:
 * - On Android: Native Material 3 `android_ripple` ink splash + expressive press scale feel.
 * - On iOS: Clean opacity feedback.
 */
export function AdaptivePressable({
  children,
  style,
  borderless = false,
  rippleColor = THEME.rippleColor,
  ...rest
}: PressableProps & {
  borderless?: boolean;
  rippleColor?: string;
}) {
  return (
    <Pressable
      android_ripple={
        IS_ANDROID
          ? { color: rippleColor, borderless, foreground: true }
          : undefined
      }
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        !IS_ANDROID && state.pressed ? { opacity: 0.78 } : null,
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

/**
 * M3ExpressiveSegmentedControl (Android only):
 * Renders Material 3 Expressive Connected Pill Button Group with checkmark icon on the selected segment,
 * rounded outer pill caps, and native Android ripple.
 */
export function M3ExpressiveSegmentedControl({
  values,
  selectedIndex,
  onSelect,
}: {
  values: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={styles.m3SegContainer}>
      {values.map((label, idx) => {
        const selected = idx === selectedIndex;
        const isFirst = idx === 0;
        const isLast = idx === values.length - 1;
        return (
          <View
            key={label}
            style={[
              styles.m3SegClip,
              isFirst && styles.m3SegFirst,
              isLast && styles.m3SegLast,
              !isLast && styles.m3SegDividerRight,
            ]}
          >
            <Pressable
              android_ripple={{ color: THEME.rippleColor, foreground: true }}
              onPress={() => onSelect(idx)}
              style={[
                styles.m3SegBtn,
                selected && styles.m3SegBtnSelected,
              ]}
            >
              {selected && (
                <Ionicons
                  name="checkmark"
                  size={14}
                  color={THEME.onSecondaryContainer}
                />
              )}
              <Text
                style={[
                  styles.m3SegText,
                  selected && styles.m3SegTextSelected,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  iosGlassBase: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  iosGlassFallback: {
    backgroundColor: 'rgba(18, 22, 32, 0.34)',
  },
  androidSurfaceBase: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.outlineVariant,
    elevation: 6,
  },
  m3SegContainer: {
    flexDirection: 'row',
    height: 38,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.outline,
    backgroundColor: THEME.surfaceContainerLow,
    overflow: 'hidden',
  },
  m3SegClip: {
    flex: 1,
    overflow: 'hidden',
  },
  m3SegFirst: {
    borderTopLeftRadius: 19,
    borderBottomLeftRadius: 19,
  },
  m3SegLast: {
    borderTopRightRadius: 19,
    borderBottomRightRadius: 19,
  },
  m3SegDividerRight: {
    borderRightWidth: 1,
    borderRightColor: THEME.outline,
  },
  m3SegBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  m3SegBtnSelected: {
    backgroundColor: THEME.secondaryContainer,
  },
  m3SegText: {
    color: THEME.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
  },
  m3SegTextSelected: {
    color: THEME.onSecondaryContainer,
    fontWeight: '700',
  },
});
