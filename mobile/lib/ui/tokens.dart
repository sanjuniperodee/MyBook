import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// Палитра приложения — та же, что у CRM на сайте (холодная палитра html.crm, DESIGN.md): тушь, холодные серые
/// поверхности, винный акцент, свои сообщения — розовые (rose), ответы бота — голубые (info), и тёмная тема CRM.
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
    required this.dangerBg,
    required this.bubbleBot,
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
  final Color dangerBg;
  final Color bubbleBot;

  // html.crm:not(.dark) в src/app/globals.css.
  static const light = AppColors(
    brand: Color(0xFFA01F3A), // wine
    brandDeep: Color(0xFF7D1730), // wine-dark
    onBrand: Colors.white,
    bg: Colors.white,
    surface: Color(0xFFF3F4F7), // canvas
    surfaceRaised: Colors.white,
    border: Color(0xFFE1E4EA), // line
    text: Color(0xFF0F131A), // ink
    textMuted: Color(0xFF596273), // muted
    textFaint: Color(0xFF8A92A1),
    bubbleOut: Color(0xFFFBE8EC), // rose
    bubbleIn: Colors.white,
    wallpaper: Color(0xFFF3F4F7), // canvas
    wallpaperInk: Color(0xFFC8CDD7), // line-strong
    danger: Color(0xFFB3261E),
    warn: Color(0xFF8C5700),
    warnBg: Color(0xFFFCF0D6),
    success: Color(0xFF13703F),
    tickRead: Color(0xFF1B5FA7), // info
    note: Color(0xFFFCF0D6), // warning-bg: заметка для коллег
    violet: Color(0xFF1B5FA7),
    violetBg: Color(0xFFE5EEFA),
    dangerBg: Color(0xFFFDEAE8),
    bubbleBot: Color(0xFFE5EEFA), // info-bg: ответ бота
  );

  // html.crm.dark в src/app/globals.css.
  static const dark = AppColors(
    brand: Color(0xFFD4506D),
    brandDeep: Color(0xFFE47D95),
    onBrand: Colors.white,
    bg: Color(0xFF0E1117), // paper
    surface: Color(0xFF1C212B), // sunken
    surfaceRaised: Color(0xFF151922), // white (тёмный лист)
    border: Color(0xFF272D38),
    text: Color(0xFFEEF1F6),
    textMuted: Color(0xFF97A0B0),
    textFaint: Color(0xFF6E7787),
    bubbleOut: Color(0xFF3A1F29), // rose
    bubbleIn: Color(0xFF1D222C), // cream
    wallpaper: Color(0xFF0E1117),
    wallpaperInk: Color(0xFF394150),
    danger: Color(0xFFF3A199),
    warn: Color(0xFFEFC376),
    warnBg: Color(0xFF2F2410),
    success: Color(0xFF84D3A6),
    tickRead: Color(0xFF9BC3EE),
    note: Color(0xFF2F2410),
    violet: Color(0xFF9BC3EE),
    violetBg: Color(0xFF14263A),
    dangerBg: Color(0xFF361A18),
    bubbleBot: Color(0xFF14263A),
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
