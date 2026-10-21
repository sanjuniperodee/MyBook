import 'package:flutter/foundation.dart';

/// Просьба переключить вкладку из любого места приложения (плитки «Моего дня», уведомление): chats | tasks | deals | clients | profile.
final tabRequest = ValueNotifier<String?>(null);
