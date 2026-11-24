import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Сессия встроенного браузера: отдельный короткий токен (POST /api/mobile/web-session) — «Выйти» на сайте внутри
/// приложения не закрывает приложение. Один на запуск, пока не истёк.
class _WebSession {
  static String? token;
  static DateTime? until;
  static String? server;

  static Future<String> get(ApiClient api) async {
    if (token != null &&
        server == api.baseUrl &&
        until != null &&
        until!.isAfter(DateTime.now().add(const Duration(minutes: 5))))
      return token!;
    final r = await api.post('/api/mobile/web-session') as Map<String, dynamic>;
    token = r['token'] as String;
    until = DateTime.parse(r['expiresAt'] as String);
    server = api.baseUrl;
    return token!;
  }
}

/// Открыть страницу CRM внутри приложения (уже вошедшим): разделы, которых в приложении нет, и полные карточки
/// (правка сделки, деньги заказа, финансы, обращения, настройки). Права — те же, что на сайте.
Future<void> openCrm(BuildContext context, String path, {String? title}) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => CrmWebScreen(path: path, title: title),
    ),
  );
}

class CrmWebScreen extends StatefulWidget {
  const CrmWebScreen({super.key, required this.path, this.title});
  final String path;
  final String? title;

  @override
  State<CrmWebScreen> createState() => _CrmWebScreenState();
}

class _CrmWebScreenState extends State<CrmWebScreen> {
  WebViewController? _web;
  String? _error;
  int _progress = 0;
  String _title = '';
  bool _canBack = false;

  @override
  void initState() {
    super.initState();
    _title = widget.title ?? 'CRM';
    _open();
  }

  Future<void> _open() async {
    final api = context.read<AuthState>().api;
    try {
      final token = await _WebSession.get(api);
      final base = Uri.parse(api.baseUrl);
      await WebViewCookieManager().setCookie(
        WebViewCookie(
          name: 'mb_session',
          value: token,
          domain: base.host,
          path: '/',
        ),
      );
      // Звонки WhatsApp в CRM — микрофон и звук в странице: разрешение страницы CRM подтверждаем (система спросит сама),
      // на iPhone звук играет внутри страницы, без перехода в полноэкранный плеер.
      final params = WebViewPlatform.instance is WebKitWebViewPlatform
          ? WebKitWebViewControllerCreationParams(
              allowsInlineMediaPlayback: true,
              mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
            )
          : const PlatformWebViewControllerCreationParams();
      final ctl =
          WebViewController.fromPlatformCreationParams(
              params,
              onPermissionRequest: (r) => r.grant(),
            )
            ..setJavaScriptMode(JavaScriptMode.unrestricted)
            ..setBackgroundColor(Colors.transparent)
            ..setNavigationDelegate(
              NavigationDelegate(
                onProgress: (p) =>
                    mounted ? setState(() => _progress = p) : null,
                onPageFinished: (_) async {
                  final t = await _web?.getTitle();
                  final back = await _web?.canGoBack() ?? false;
                  if (mounted)
                    setState(() {
                      if (t != null && t.isNotEmpty)
                        _title = t.replaceAll(
                          RegExp(r'\s*[—|·-]\s*(MyBooks|CRM)\b.*$'),
                          '',
                        );
                      _canBack = back;
                    });
                },
                // Звонок, WhatsApp, почта, файлы и чужие сайты — системой; страницы CRM — здесь же.
                onNavigationRequest: (req) {
                  final u = Uri.tryParse(req.url);
                  if (u == null) return NavigationDecision.prevent;
                  if ((u.scheme == 'http' || u.scheme == 'https') &&
                      u.host == base.host)
                    return NavigationDecision.navigate;
                  launchUrl(u, mode: LaunchMode.externalApplication);
                  return NavigationDecision.prevent;
                },
              ),
            );
      // Метка приложения в User-Agent: CRM прячет свою нижнюю панель и подсказку «установите CRM» (data-inapp).
      final ua = await ctl.getUserAgent();
      await ctl.setUserAgent('${ua ?? ''} MyBooksCRMApp/1'.trim());
      await ctl.loadRequest(api.uri(widget.path));
      if (mounted) setState(() => _web = ctl);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return PopScope(
      canPop: !_canBack,
      onPopInvokedWithResult: (didPop, _) async {
        if (!didPop && await _web?.canGoBack() == true) {
          await _web!.goBack();
          final back = await _web?.canGoBack() ?? false;
          if (mounted) setState(() => _canBack = back);
        }
      },
      child: Scaffold(
        backgroundColor: c.bg,
        appBar: AppBar(
          backgroundColor: c.bg,
          surfaceTintColor: Colors.transparent,
          titleSpacing: 0,
          leading: IconButton(
            icon: const Icon(LucideIcons.x),
            tooltip: 'Закрыть',
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: Text(
            _title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.headline(context),
          ),
          actions: [
            if (_canBack)
              IconButton(
                icon: const Icon(LucideIcons.chevronLeft),
                tooltip: 'Назад',
                onPressed: () async {
                  await _web?.goBack();
                  final back = await _web?.canGoBack() ?? false;
                  if (mounted) setState(() => _canBack = back);
                },
              ),
            IconButton(
              icon: const Icon(LucideIcons.refreshCw, size: 20),
              tooltip: 'Обновить',
              onPressed: () => _web?.reload(),
            ),
          ],
          bottom: _progress > 0 && _progress < 100
              ? PreferredSize(
                  preferredSize: const Size.fromHeight(2),
                  child: LinearProgressIndicator(
                    value: _progress / 100,
                    minHeight: 2,
                    color: c.brand,
                    backgroundColor: Colors.transparent,
                  ),
                )
              : null,
        ),
        body: _error != null
            ? EmptyState(
                icon: LucideIcons.wifiOff,
                title: 'Не удалось открыть CRM',
                hint: _error,
                action: 'Повторить',
                onAction: () {
                  setState(() => _error = null);
                  _open();
                },
              )
            : _web == null
            ? const Center(child: CircularProgressIndicator())
            : WebViewWidget(controller: _web!),
      ),
    );
  }
}
