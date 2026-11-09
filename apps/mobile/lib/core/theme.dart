import 'package:flutter/material.dart';

/// SafeWalk colours: the Hallmark "Dusk" theme, adopted 9 Nov 2026 (replacing
/// the original orange and pink palette at the team's request). Values are the
/// web tokens in packages/shared/styles/tokens.css converted from OKLCH to sRGB;
/// change both together.
///
/// Dusk has two signals with two jobs: periwinkle is done, safe, on and
/// selected; apricot is open, waiting and needs attention (an SOS, an overdue
/// check-in). There is no third signal colour.
class SwColors {
  const SwColors._();

  // Slate surfaces
  static const background = Color(0xFF0E1017); // --color-paper
  static const surface = Color(0xFF151820); // --color-paper-2
  static const surfaceRaised = Color(0xFF1E212A); // --color-paper-3
  static const border = Color(0xFF2A2E36); // --color-rule

  // Ink
  static const text = Color(0xFFF4F1ED); // --color-ink
  static const text2 = Color(0xFFCACED4); // --color-ink-2
  static const textMuted = Color(0xFF999FA9); // --color-muted

  // Signals
  static const primary = Color(0xFFA0B0F4); // --color-accent (periwinkle): actions, done, safe
  static const primaryHi = Color(0xFFB9C7FF); // --color-accent-hi
  static const onAccent = Color(0xFF0F1223); // --color-accent-ink
  static const secondary = Color(0xFFF4BA87); // --color-accent-2 (apricot): open, waiting
  static const alert = secondary; // SOS and emergencies use the open signal, always with words and an icon
  static const error = Color(0xFFF47C70); // --color-error: form and request errors

  // Module 3 severity on the safety map: the proposal asks for colour-coded
  // pins, so severity takes a third colour. Always shown with its icon and word.
  static const severityLow = text2;
  static const severityMedium = secondary;
  static const severityHigh = error;
  static const focus = Color(0xFFA9B9FF); // --color-focus
}

/// Dusk shapes: 18 px cards, 10 px inner parts, pill controls.
class SwRadius {
  const SwRadius._();
  static const card = 18.0;
  static const inner = 10.0;
  static const pill = 999.0;
}

const _display = 'WixMadeforDisplay';
const _body = 'WixMadeforText';

ThemeData buildSafeWalkTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.dark,
    primary: SwColors.primary,
    onPrimary: SwColors.onAccent,
    secondary: SwColors.secondary,
    onSecondary: SwColors.onAccent,
    error: SwColors.error,
    onError: SwColors.onAccent,
    surface: SwColors.surface,
    onSurface: SwColors.text,
    onSurfaceVariant: SwColors.textMuted,
    outline: SwColors.textMuted,
    outlineVariant: SwColors.border,
    surfaceContainerHighest: SwColors.surfaceRaised,
  );

  final base = ThemeData(colorScheme: scheme, useMaterial3: true, brightness: Brightness.dark, fontFamily: _body);
  final t = base.textTheme.apply(bodyColor: SwColors.text, displayColor: SwColors.text, fontFamily: _body);
  TextStyle? display(TextStyle? s) => s?.copyWith(fontFamily: _display, fontWeight: FontWeight.w500, letterSpacing: -0.4, height: 1.1);
  final pill = RoundedRectangleBorder(borderRadius: BorderRadius.circular(SwRadius.pill));

  return base.copyWith(
    scaffoldBackgroundColor: SwColors.background,
    textTheme: t.copyWith(
      displaySmall: display(t.displaySmall),
      headlineMedium: display(t.headlineMedium),
      headlineSmall: display(t.headlineSmall),
      titleLarge: display(t.titleLarge),
      titleMedium: t.titleMedium?.copyWith(fontWeight: FontWeight.w600),
      titleSmall: t.titleSmall?.copyWith(fontWeight: FontWeight.w600, color: SwColors.text2),
      bodyLarge: t.bodyLarge?.copyWith(height: 1.5),
      bodyMedium: t.bodyMedium?.copyWith(fontSize: 15, height: 1.5),
      bodySmall: t.bodySmall?.copyWith(fontSize: 13, color: SwColors.textMuted, height: 1.4),
      labelLarge: t.labelLarge?.copyWith(fontWeight: FontWeight.w600),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: SwColors.background,
      foregroundColor: SwColors.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: display(t.titleLarge)?.copyWith(fontSize: 22),
    ),
    cardTheme: CardThemeData(
      color: SwColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SwRadius.card),
        side: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
      ),
    ),
    dividerTheme: const DividerThemeData(color: SwColors.border, thickness: 1, space: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        backgroundColor: SwColors.primary,
        foregroundColor: SwColors.onAccent,
        disabledBackgroundColor: SwColors.surfaceRaised,
        disabledForegroundColor: SwColors.textMuted,
        shape: pill,
        textStyle: const TextStyle(fontFamily: _body, fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: SwColors.text,
        backgroundColor: Colors.white.withValues(alpha: 0.04),
        side: BorderSide.none,
        shape: pill,
        textStyle: const TextStyle(fontFamily: _body, fontSize: 16, fontWeight: FontWeight.w500),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: SwColors.primary, shape: pill)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: SwColors.surface,
      labelStyle: const TextStyle(color: SwColors.textMuted),
      helperStyle: const TextStyle(color: SwColors.textMuted),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(SwRadius.inner), borderSide: const BorderSide(color: SwColors.textMuted)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(SwRadius.inner), borderSide: const BorderSide(color: SwColors.textMuted)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(SwRadius.inner), borderSide: const BorderSide(color: SwColors.focus, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(SwRadius.inner), borderSide: const BorderSide(color: SwColors.error)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: SwColors.surface,
      indicatorColor: Colors.white.withValues(alpha: 0.08),
      indicatorShape: pill,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontFamily: _body,
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: states.contains(WidgetState.selected) ? SwColors.text : SwColors.textMuted,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(color: states.contains(WidgetState.selected) ? SwColors.primary : SwColors.textMuted),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: SwColors.surfaceRaised,
      contentTextStyle: const TextStyle(fontFamily: _body, color: SwColors.text),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(SwRadius.inner)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: SwColors.surfaceRaised,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(SwRadius.card)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: SwColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(SwRadius.card))),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: SwColors.primary,
      foregroundColor: SwColors.onAccent,
      shape: pill,
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? SwColors.primary : null),
      checkColor: const WidgetStatePropertyAll(SwColors.onAccent),
      side: const BorderSide(color: SwColors.textMuted, width: 1.5),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? SwColors.onAccent : SwColors.textMuted),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? SwColors.primary : SwColors.surfaceRaised),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
  );
}
