import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Тема приложения: светлая, тёмная или как в телефоне. Выбор помнится на устройстве (как в CRM на сайте).
class ThemeController extends ChangeNotifier {
  static const _key = 'theme_mode';
  ThemeMode mode = ThemeMode.system;

  Future<void> restore() async {
    final v = (await SharedPreferences.getInstance()).getString(_key);
    mode = switch (v) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  Future<void> set(ThemeMode m) async {
    mode = m;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setString(
      _key,
      m == ThemeMode.light
          ? 'light'
          : m == ThemeMode.dark
          ? 'dark'
          : 'system',
    );
  }
}
