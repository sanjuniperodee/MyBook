import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// Палитра приложения: фирменный зелёный как у WhatsApp, спокойные нейтральные поверхности и отдельная тёмная тема.
/// Всё цветовое берётся отсюда (context.c), без «магических» значений в экранах.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.brand,
    required this.brandDeep,
    required this.onBrand,
    required this.bg,
    required this.surface,
    required this.surfaceRaised,
    required this.border,
    required this.text,
    required this.textMuted,
    required this.textFaint,
    required this.bubbleOut,
    required this.bubbleIn,
    required this.wallpaper,
    required this.wallpaperInk,
    required this.danger,
    required this.warn,
    required this.warnBg,
    required this.success,
    required this.tickRead,
    required this.note,
    required this.violet,
    required this.violetBg,
  });

  final Color brand;
  final Color brandDeep;
  final Color onBrand;
  final Color bg;
  final Color surface;
  final Color surfaceRaised;
  final Color border;
  final Color text;
  final Color textMuted;
  final Color textFaint;
  final Color bubbleOut;
  final Color bubbleIn;
  final Color wallpaper;
  final Color wallpaperInk;
  final Color danger;
  final Color warn;
  final Color warnBg;
  final Color success;
  final Color tickRead;
  final Color note;
  final Color violet;
  final Color violetBg;

  static const light = AppColors(
    brand: Color(0xFF00A884),
    brandDeep: Color(0xFF008069),
    onBrand: Colors.white,
    bg: Colors.white,
    surface: Color(0xFFF4F5F7),
    surfaceRaised: Colors.white,
    border: Color(0xFFE7EAEE),
    text: Color(0xFF111B21),
    textMuted: Color(0xFF667781),
    textFaint: Color(0xFF8696A0),
    bubbleOut: Color(0xFFD9FDD3),
    bubbleIn: Colors.white,
    wallpaper: Color(0xFFEFE9E0),
    wallpaperInk: Color(0xFF8C7F6B),
    danger: Color(0xFFE5484D),
    warn: Color(0xFFB45F06),
    warnBg: Color(0xFFFFF1DB),
    success: Color(0xFF1F9D66),
    tickRead: Color(0xFF34B7F1),
    note: Color(0xFFFFF4C2),
    violet: Color(0xFF6D4AFF),
    violetBg: Color(0xFFEFEBFF),
  );

  static const dark = AppColors(
    brand: Color(0xFF21C063),
    brandDeep: Color(0xFF00A884),
    onBrand: Color(0xFF06140D),
    bg: Color(0xFF0B141A),
    surface: Color(0xFF16222A),
    surfaceRaised: Color(0xFF1F2C34),
    border: Color(0xFF222D34),
    text: Color(0xFFE9EDEF),
    textMuted: Color(0xFF8696A0),
    textFaint: Color(0xFF667781),
    bubbleOut: Color(0xFF005C4B),
    bubbleIn: Color(0xFF1F2C34),
    wallpaper: Color(0xFF0B141A),
    wallpaperInk: Color(0xFF8FA3AD),
    danger: Color(0xFFFF6369),
    warn: Color(0xFFF5A524),
    warnBg: Color(0xFF3A2C10),
    success: Color(0xFF3DD68C),
    tickRead: Color(0xFF53BDEB),
    note: Color(0xFF4A4220),
    violet: Color(0xFFA78BFA),
    violetBg: Color(0xFF2A2250),
  );

  @override
  AppColors copyWith() => this;

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) => t < 0.5 ? this : (other as AppColors? ?? this);
}

extension AppTheme on BuildContext {
  AppColors get c => Theme.of(this).extension<AppColors>()!;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}

/// Отступы и радиусы: сетка в 4 пункта.
class Sp {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
}

class Rd {
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
}

/// Типографика: системный шрифт платформы (SF Pro на iPhone), чёткая иерархия размеров и насыщенности.
class AppText {
  static TextStyle largeTitle(BuildContext c) => TextStyle(fontSize: 32, height: 1.15, fontWeight: FontWeight.w800, letterSpacing: -0.6, color: c.c.text);
  static TextStyle title(BuildContext c) => TextStyle(fontSize: 20, height: 1.25, fontWeight: FontWeight.w700, letterSpacing: -0.3, color: c.c.text);
  static TextStyle headline(BuildContext c) => TextStyle(fontSize: 17, height: 1.3, fontWeight: FontWeight.w600, letterSpacing: -0.2, color: c.c.text);
  static TextStyle body(BuildContext c) => TextStyle(fontSize: 16, height: 1.35, color: c.c.text);
  static TextStyle sub(BuildContext c) => TextStyle(fontSize: 14.5, height: 1.3, color: c.c.textMuted);
  static TextStyle caption(BuildContext c) => TextStyle(fontSize: 12.5, height: 1.25, color: c.c.textMuted);
  static TextStyle label(BuildContext c) => TextStyle(fontSize: 12, height: 1.2, fontWeight: FontWeight.w700, letterSpacing: 0.4, color: c.c.textFaint);
}

ThemeData buildTheme(Brightness b) {
  final c = b == Brightness.dark ? AppColors.dark : AppColors.light;
  final scheme = ColorScheme.fromSeed(seedColor: c.brand, brightness: b).copyWith(primary: c.brand, onPrimary: c.onBrand, surface: c.bg, error: c.danger);
  return ThemeData(
    useMaterial3: true,
    brightness: b,
    colorScheme: scheme,
    extensions: [c],
    scaffoldBackgroundColor: c.bg,
    splashFactory: NoSplash.splashFactory,
    highlightColor: c.text.withValues(alpha: 0.05),
    dividerColor: c.border,
    dividerTheme: DividerThemeData(color: c.border, space: 1, thickness: 0.6),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: CupertinoPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
    }),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.text,
      contentTextStyle: TextStyle(color: c.bg, fontSize: 14.5, fontWeight: FontWeight.w500),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Rd.md)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(Rd.md), borderSide: BorderSide.none),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Rd.md), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Rd.md), borderSide: BorderSide(color: c.brand, width: 1.5)),
      hintStyle: TextStyle(color: c.textFaint),
      labelStyle: TextStyle(color: c.textMuted),
      floatingLabelStyle: TextStyle(color: c.brandDeep, fontWeight: FontWeight.w600),
    ),
    textSelectionTheme: TextSelectionThemeData(cursorColor: c.brand, selectionHandleColor: c.brand, selectionColor: c.brand.withValues(alpha: 0.25)),
    dialogTheme: DialogThemeData(backgroundColor: c.surfaceRaised, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Rd.xl))),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: c.surfaceRaised, surfaceTintColor: Colors.transparent, shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Rd.xl)))),
    popupMenuTheme: PopupMenuThemeData(color: c.surfaceRaised, surfaceTintColor: Colors.transparent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Rd.lg))),
    cupertinoOverrideTheme: CupertinoThemeData(brightness: b, primaryColor: c.brand),
  );
}
