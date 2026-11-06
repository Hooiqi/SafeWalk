import 'package:flutter/material.dart';

/// SafeWalk palette ("Dark mode: orange & pink"). These seven values are
/// mandatory; everything else is derived from them.
class SwColors {
  const SwColors._();
  static const background = Color(0xFF120F11);
  static const surface = Color(0xFF1E191C);
  static const primary = Color(0xFFFF6B81);
  static const secondary = Color(0xFFFFA372);
  static const text = Color(0xFFFDF9FA);
  static const textMuted = Color(0xFFA89FA3);
  static const border = Color(0xFF322B2E);

  // Derived tints
  static const surfaceRaised = Color(0xFF262024);
  static const onAccent = background;
  static const gradient = LinearGradient(colors: [primary, secondary]);
}

ThemeData buildSafeWalkTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.dark,
    primary: SwColors.primary,
    onPrimary: SwColors.onAccent,
    secondary: SwColors.secondary,
    onSecondary: SwColors.onAccent,
    error: SwColors.primary,
    onError: SwColors.onAccent,
    surface: SwColors.surface,
    onSurface: SwColors.text,
    onSurfaceVariant: SwColors.textMuted,
    outline: SwColors.border,
    outlineVariant: SwColors.border,
    surfaceContainerHighest: SwColors.surfaceRaised,
  );

  final base = ThemeData(colorScheme: scheme, useMaterial3: true, brightness: Brightness.dark);
  final text = base.textTheme.apply(bodyColor: SwColors.text, displayColor: SwColors.text);
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(10));

  return base.copyWith(
    scaffoldBackgroundColor: SwColors.background,
    textTheme: text.copyWith(
      headlineSmall: text.headlineSmall?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.2),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w600),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
      bodySmall: text.bodySmall?.copyWith(color: SwColors.textMuted),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: SwColors.background,
      foregroundColor: SwColors.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: SwColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: SwColors.border),
      ),
    ),
    dividerTheme: const DividerThemeData(color: SwColors.border, thickness: 1, space: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        backgroundColor: SwColors.primary,
        foregroundColor: SwColors.onAccent,
        disabledBackgroundColor: SwColors.surfaceRaised,
        shape: shape,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: SwColors.text,
        side: const BorderSide(color: SwColors.border),
        shape: shape,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: SwColors.secondary)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: SwColors.background,
      labelStyle: const TextStyle(color: SwColors.textMuted),
      helperStyle: const TextStyle(color: SwColors.textMuted),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: SwColors.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: SwColors.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: SwColors.secondary, width: 1.5)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: SwColors.primary)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: SwColors.surface,
      indicatorColor: SwColors.surfaceRaised,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: states.contains(WidgetState.selected) ? SwColors.text : SwColors.textMuted,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(color: states.contains(WidgetState.selected) ? SwColors.primary : SwColors.textMuted),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: SwColors.surfaceRaised,
      contentTextStyle: TextStyle(color: SwColors.text),
      behavior: SnackBarBehavior.floating,
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? SwColors.primary : null),
      checkColor: const WidgetStatePropertyAll(SwColors.onAccent),
      side: const BorderSide(color: SwColors.textMuted, width: 1.5),
    ),
  );
}
