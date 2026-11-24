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

  // Клиентское приложение «MyBooks» — кабинет автора на сайте: тёплая бумага (@theme в globals.css), тёмная — dark.css.
  static const paper = AppColors(
    brand: Color(0xFF7A1F2B), // wine
    brandDeep: Color(0xFF5C1520), // wine-dark
    onBrand: Colors.white,
    bg: Color(0xFFFAF7F2), // paper — фон кабинета на телефоне
    surface: Color(0xFFF0ECE6), // sunken
    surfaceRaised: Colors.white,
    border: Color(0xFFE6E0D7), // line
    text: Color(0xFF1E1916), // ink
    textMuted: Color(0xFF6B625A), // muted
    textFaint: Color(0xFF948A80),
    bubbleOut: Color(0xFFF4E4DF), // rose
    bubbleIn: Colors.white,
    wallpaper: Color(0xFFFAF7F2), // paper
    wallpaperInk: Color(0xFFD3C9BC), // line-strong
    danger: Color(0xFFB42318),
    warn: Color(0xFF8A5300),
    warnBg: Color(0xFFFBF0DA),
    success: Color(0xFF1D6B45),
    tickRead: Color(0xFF1D5A94),
    note: Color(0xFFFBF0DA),
    violet: Color(0xFF1D5A94),
    violetBg: Color(0xFFE8F0F8),
    dangerBg: Color(0xFFFCEBE9),
    bubbleBot: Color(0xFFE8F0F8),
  );

  static const paperDark = AppColors(
    brand: Color(0xFFC94B5F),
    brandDeep: Color(0xFFE07A8B),
    onBrand: Colors.white,
    bg: Color(0xFF14110F), // canvas
    surface: Color(0xFF28221D), // sunken
    surfaceRaised: Color(0xFF1E1A17), // white
    border: Color(0xFF3A322B),
    text: Color(0xFFF2ECE4),
    textMuted: Color(0xFFA2978C),
    textFaint: Color(0xFF7A7067),
    bubbleOut: Color(0xFF3B2228),
    bubbleIn: Color(0xFF28221D),
    wallpaper: Color(0xFF14110F),
    wallpaperInk: Color(0xFF4A4037),
    danger: Color(0xFFF4A39B),
    warn: Color(0xFFF0C47A),
    warnBg: Color(0xFF33270F),
    success: Color(0xFF8FD3AE),
    tickRead: Color(0xFF9CC4EE),
    note: Color(0xFF33270F),
    violet: Color(0xFF9CC4EE),
    violetBg: Color(0xFF14263A),
    dangerBg: Color(0xFF3A1A17),
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
  /// Текст книги и заголовки витрины — засечки, как на сайте (Cormorant).
  static TextStyle serif(BuildContext c, {double size = 20, FontWeight weight = FontWeight.w500}) => TextStyle(fontFamily: 'Cormorant', fontSize: size, height: 1.3, fontWeight: weight, color: c.c.text);
  static TextStyle label(BuildContext c) => TextStyle(fontSize: 12, height: 1.2, fontWeight: FontWeight.w700, letterSpacing: 0.4, color: c.c.textFaint);
}

/// Тема приложения. CRM — палитра html.crm и системный шрифт; клиентское — тёплая бумага кабинета и Onest (client: true).
ThemeData buildTheme(Brightness b, {bool client = false}) {
  final c = client ? (b == Brightness.dark ? AppColors.paperDark : AppColors.paper) : (b == Brightness.dark ? AppColors.dark : AppColors.light);
  final scheme = ColorScheme.fromSeed(seedColor: c.brand, brightness: b).copyWith(primary: c.brand, onPrimary: c.onBrand, surface: c.bg, error: c.danger);
  return ThemeData(
    useMaterial3: true,
    brightness: b,
    fontFamily: client ? 'Onest' : null,
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
