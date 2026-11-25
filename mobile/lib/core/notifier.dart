import 'dart:async';
import 'dart:io';

import 'package:app_badge_plus/app_badge_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../api/mybook_api.g.dart' as v1api;
import '../ui/tokens.dart';
import 'api.dart';
import 'live.dart';
import 'v1.dart';

/// Среда APNs этого запуска: из Xcode/flutter run — sandbox, из TestFlight и App Store — production.
const apnsEnvironment = String.fromEnvironment('APNS_ENV', defaultValue: kReleaseMode ? 'production' : 'sandbox');

/// Ссылка уведомления CRM → что открыть: диалог (/admin/chats?c=…), сделку, клиента или вкладку («Задачи», «Сделки»).
class NotificationTarget {
  NotificationTarget({this.chatId, this.dealId, this.clientId, this.orderId, this.tab, this.web});
  final String? chatId;
  final String? dealId;
  final String? clientId;
  final String? orderId;
  final String? tab;

  /// Раздел, которого нет в приложении (обращения, финансы, настройки): открывается CRM на сайте.
  final String? web;

  bool get isEmpty => chatId == null && dealId == null && clientId == null && orderId == null && tab == null && web == null;

  static NotificationTarget parse(String? link) {
    if (link == null || link.isEmpty) return NotificationTarget();
    final chat = RegExp(r'[?&]c=([0-9a-f-]{36})').firstMatch(link);
    if (chat != null) return NotificationTarget(chatId: chat.group(1));
    final deal = RegExp(r'/admin/deals/([0-9a-f-]{36})').firstMatch(link);
    if (deal != null) return NotificationTarget(dealId: deal.group(1));
    final client = RegExp(r'/admin/clients/([0-9a-f-]{36})').firstMatch(link);
    if (client != null) return NotificationTarget(clientId: client.group(1));
    final order = RegExp(r'/admin/orders/([0-9a-f-]{36})').firstMatch(link);
    if (order != null) return NotificationTarget(orderId: order.group(1));
    if (link.startsWith('/admin/tasks') || link.startsWith('/admin/today') || link == '/admin') return NotificationTarget(tab: 'tasks');
    if (link.startsWith('/admin/deals')) return NotificationTarget(tab: 'deals');
    if (link.startsWith('/admin/chats')) return NotificationTarget(tab: 'chats');
    if (link.startsWith('/admin/orders') || link.startsWith('/admin/board')) return NotificationTarget(tab: 'orders');
    if (link.startsWith('/admin/')) return NotificationTarget(web: link);
    return NotificationTarget();
  }
}

/// Уведомления: пока приложение открыто — плашка сверху со звуком и вибрацией, в фоне (пока процесс жив) — системное
/// уведомление; число непрочитанных — на значке приложения. События берутся из того же потока CRM, что и список чатов.
/// Push при полностью закрытом приложении требует Firebase/APNs — см. mobile/README.md.
class Notifier with WidgetsBindingObserver {
  Notifier({required this.api, required this.live, required this.navigatorKey, required this.onOpen});

  final ApiClient api;
  final LiveService live;
  final GlobalKey<NavigatorState> navigatorKey;
  final void Function(NotificationTarget target) onOpen;

  final _plugin = FlutterLocalNotificationsPlugin();
  final _seen = <String>{};
  StreamSubscription<LiveEvent>? _sub;
  Timer? _debounce;
  bool _seeded = false;
  bool _foreground = true;
  bool enabled = true;

  /// Сервер умеет слать push на этот телефон (ключ APNs задан) — тогда напоминания по задачам приходят с сервера, а не из расписания на телефоне.
  bool serverPush = false;

  /// Диалог, открытый на экране прямо сейчас: сообщения из него не показываем — они и так на виду.
  String? openChatId;
  int unread = 0;
  final unreadListenable = ValueNotifier<int>(0);

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    enabled = prefs.getBool('notifications') ?? true;
    await _plugin.initialize(
      settings: const InitializationSettings(
        iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
      onDidReceiveNotificationResponse: (r) {
        open(NotificationTarget.parse(r.payload));
      },
    );
    tzdata.initializeTimeZones();
    WidgetsBinding.instance.addObserver(this);
    // Колокольчик и плашки — по событию «уведомление» (сервер шлёт его сотруднику адресно), а не по каждому сообщению.
    _sub = live.events.listen((e) {
      if (e.type == 'notify' || e.type == 'tick' || e.type == 'resume') _soon();
    });
    await requestPermission();
    await _openLaunchTarget();
    await _registerForPush();
    await poll();
  }

  static const _pushChannel = MethodChannel('kz.mybooks.mybooksSeller/push');

  /// Push при свёрнутом и закрытом приложении: iPhone — токен APNs от системы, Android — токен FCM (данные проекта Firebase
  /// приходят с сервера CRM, без них push на Android не включается). Токен уходит серверу CRM.
  Future<void> _registerForPush() async {
    _pushChannel.setMethodCallHandler((call) async {
      if (call.method == 'token') await _sendToken(call.arguments as String);
      // Android: нажали на уведомление, когда приложение уже было открыто или свёрнуто.
      if (call.method == 'open') open(NotificationTarget.parse(call.arguments as String?));
    });
    try {
      if (Platform.isIOS) {
        await _pushChannel.invokeMethod<void>('register');
      } else if (Platform.isAndroid) {
        final r = await v1(api, (c) => c.crmPushConfig());
        final android = r.android;
        if (android != null) {
          await _pushChannel.invokeMethod<void>('registerAndroid', {
            'apiKey': android.apiKey,
            'appId': android.appId,
            'projectId': android.projectId,
            'senderId': android.senderId,
          });
        }
      }
    } on PlatformException {
      // Без разрешения или на устройстве без APNs/Google Play — остаются уведомления при открытом приложении.
    } on ApiException {
      // Сервер недоступен — зарегистрируемся при следующем открытии.
    }
  }

  /// Приложение запустили нажатием на уведомление (было закрыто): открыть нужный экран, когда интерфейс готов.
  Future<void> _openLaunchTarget() async {
    String? link;
    try {
      final details = await _plugin.getNotificationAppLaunchDetails();
      if (details?.didNotificationLaunchApp == true) link = details!.notificationResponse?.payload;
      if (link == null && Platform.isAndroid) link = await _pushChannel.invokeMethod<String>('initialLink');
    } catch (_) {}
    if (link == null || link.isEmpty) return;
    final target = NotificationTarget.parse(link);
    WidgetsBinding.instance.addPostFrameCallback((_) => open(target));
  }

  /// Диалог открыт: его уведомления убираются из шторки телефона (и сервер снимает их в колокольчике и на значке).
  Future<void> clearChat(String chatId) async {
    try {
      await _pushChannel.invokeMethod<void>('clear', Platform.isAndroid ? '/admin/chats?c=$chatId' : 'c=$chatId');
    } catch (_) {}
    try {
      await _plugin.cancel(id: '/admin/chats?c=$chatId'.hashCode & 0x7fffffff);
    } catch (_) {}
  }

  Future<void> _sendToken(String token) async {
    try {
      final platform = Platform.isAndroid ? 'android' : 'ios';
      final r = await v1(api, (c) => c.crmDevicePut(body: v1api.DeviceBody(token: token, platform: platform, environment: apnsEnvironment)));
      serverPush = r.serverReady;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('push_token', token);
    } on ApiException {
      // Сервер недоступен — токен уйдёт при следующем входе.
    }
  }

  /// Перед выходом: сервер перестаёт слать push на этот телефон.
  static Future<void> forgetDevice(ApiClient api) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('push_token');
    if (token == null) return;
    try {
      await v1(api, (c) => c.crmDeviceDelete(body: v1api.DeviceForgetBody(token: token)));
      await prefs.remove('push_token');
    } on ApiException {
      // Не удалось — сервер сам уберёт токен, когда Apple его отвергнет.
    }
  }

  Future<bool> requestPermission() async {
    final ios = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    final iosOk = await ios?.requestPermissions(alert: true, badge: true, sound: true);
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    final androidOk = await android?.requestNotificationsPermission();
    return (iosOk ?? androidOk) ?? true;
  }

  Future<void> setEnabled(bool v) async {
    enabled = v;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('notifications', v);
    if (v) await requestPermission();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground) live.resume();
  }

  void _soon() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), poll);
  }

  /// Забирает состояние CRM и показывает только свежие непрочитанные уведомления.
  Future<void> poll() async {
    try {
      final r = await api.get('/api/admin/live') as Map<String, dynamic>;
      unread = (r['unread'] as num?)?.toInt() ?? 0;
      unreadListenable.value = unread;
      _setBadge(unread);
      final list = (r['notifications'] as List? ?? const []).cast<Map<String, dynamic>>();
      final fresh = [for (final n in list) if (n['read'] != true && !_seen.contains(n['id'])) n];
      for (final n in list) {
        _seen.add(n['id'] as String);
      }
      // Первый опрос только запоминает уже существующие — иначе при входе пришёл бы залп старых уведомлений.
      if (!_seeded) {
        _seeded = true;
        return;
      }
      if (!enabled) return;
      for (final n in fresh) {
        // Плашка — на всё, что CRM сочла нужным сообщить (сообщения, назначения, задачи, оплаты, заказы, обращения).
        // Напоминания о сроках задач без push с сервера ставятся на телефоне заранее (TasksStore) — второй раз не показываем.
        if (n['kind'] == 'reminder' && !serverPush) continue;
        final target = NotificationTarget.parse(n['link'] as String?);
        if (target.chatId != null && target.chatId == openChatId && _foreground) continue;
        await _show(n['title'] as String? ?? 'MyBooks', (n['body'] as String?) ?? '', n['link'] as String?, n['kind'] as String? ?? 'message');
      }
    } on ApiException {
      // Нет сети — следующее событие повторит.
    }
  }

  Future<void> _show(String title, String body, String? link, String kind) async {
    // В фоне при работающих push системное уведомление уже пришло с сервера — второе не нужно.
    if (!_foreground && serverPush) return;
    if (_foreground) {
      HapticFeedback.mediumImpact();
      SystemSound.play(SystemSoundType.alert);
      _banner(title, body, link, kind);
      return;
    }
    await _plugin.show(
      id: link.hashCode & 0x7fffffff,
      title: title,
      body: body.isEmpty ? null : body,
      notificationDetails: NotificationDetails(
        iOS: const DarwinNotificationDetails(presentAlert: true, presentBadge: true, presentSound: true),
        android: AndroidNotificationDetails('crm', 'CRM', channelDescription: 'Сообщения клиентов, задачи и напоминания', importance: Importance.high, priority: Priority.high),
      ),
      payload: link,
    );
  }

  void open(NotificationTarget target) {
    if (!target.isEmpty) onOpen(target);
  }

  /// Напоминание на телефоне на конкретное время: сработает и при закрытом приложении, без сервера и push.
  Future<void> scheduleReminder({required int id, required DateTime at, required String title, required String body, String? payload}) async {
    if (!enabled || at.isBefore(DateTime.now().add(const Duration(seconds: 5)))) return;
    try {
      await _plugin.zonedSchedule(
        id: id,
        title: title,
        body: body.isEmpty ? null : body,
        scheduledDate: tz.TZDateTime.from(at, tz.UTC),
        notificationDetails: NotificationDetails(
          iOS: const DarwinNotificationDetails(presentAlert: true, presentBadge: false, presentSound: true),
          android: AndroidNotificationDetails('tasks', 'Задачи', channelDescription: 'Напоминания о сроках задач', importance: Importance.high, priority: Priority.high),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        payload: payload,
      );
    } catch (_) {
      // Платформа не дала запланировать — напоминание придёт с сервера.
    }
  }

  Future<void> cancelReminder(int id) async {
    try {
      await _plugin.cancel(id: id);
    } catch (_) {}
  }

  void _setBadge(int n) {
    try {
      AppBadgePlus.updateBadge(n);
    } catch (_) {
      // Платформа без значка — не страшно.
    }
  }

  OverlayEntry? _entry;

  /// Плашка сверху, как у системных уведомлений: заголовок, текст, тап — открыть, смахивание вверх — убрать.
  void _banner(String title, String body, String? link, String kind) {
    final overlay = navigatorKey.currentState?.overlay;
    if (overlay == null) return;
    _entry?.remove();
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (ctx) => _Banner(
        title: title,
        body: body,
        kind: kind,
        onTap: () {
          entry.remove();
          _entry = null;
          open(NotificationTarget.parse(link));
        },
        onDismiss: () {
          if (_entry == entry) {
            entry.remove();
            _entry = null;
          }
        },
      ),
    );
    _entry = entry;
    overlay.insert(entry);
  }

  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sub?.cancel();
    _debounce?.cancel();
    _entry?.remove();
    _setBadge(0);
  }
}

class _Banner extends StatefulWidget {
  const _Banner({required this.title, required this.body, required this.kind, required this.onTap, required this.onDismiss});
  final String title;
  final String body;
  final String kind;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  State<_Banner> createState() => _BannerState();
}

class _BannerState extends State<_Banner> with SingleTickerProviderStateMixin {
  late final AnimationController _a = AnimationController(vsync: this, duration: const Duration(milliseconds: 320));
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _a.forward();
    _timer = Timer(const Duration(seconds: 5), _close);
  }

  Future<void> _close() async {
    if (!mounted) return;
    await _a.reverse();
    widget.onDismiss();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _a.dispose();
    super.dispose();
  }

  IconData get _icon => switch (widget.kind) {
        'reminder' || 'task' => LucideIcons.alarmClock,
        'call' => LucideIcons.phone,
        'deal' || 'deal_after_order' || 'deal_lost' => LucideIcons.handshake,
        'deal_invoice' || 'payment' => LucideIcons.receipt,
        'order' || 'order_cancelled' => LucideIcons.package,
        'mention' => LucideIcons.atSign,
        'system' => LucideIcons.settings,
        'sla' => LucideIcons.triangleAlert,
        _ => LucideIcons.messageCircle,
      };

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, -1.2), end: Offset.zero).animate(CurvedAnimation(parent: _a, curve: Curves.easeOutCubic)),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
            child: GestureDetector(
              onTap: widget.onTap,
              onVerticalDragEnd: (d) {
                if ((d.primaryVelocity ?? 0) < 0) _close();
              },
              child: Material(
                color: Colors.transparent,
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(20), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 24, offset: const Offset(0, 8))], border: Border.all(color: c.border, width: 0.6)),
                  child: Row(children: [
                    Container(width: 40, height: 40, decoration: BoxDecoration(color: c.brand.withValues(alpha: 0.15), shape: BoxShape.circle), child: Icon(_icon, size: 20, color: c.brandDeep)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                        Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, letterSpacing: -0.2).copyWith(color: c.text)),
                        if (widget.body.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(widget.body, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, color: c.textMuted))),
                      ]),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
