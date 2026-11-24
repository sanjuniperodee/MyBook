import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Книга и файлы для типографии в заказе — как лист «Книга» карточки заказа на сайте: открыта ли книга для правок клиентом
/// (переключатель), параметры печати и файлы (блок, обложка, каркас, техзадание, PDF для чтения, всё архивом). Файл
/// собирает сайт (как при скачивании из CRM), приложение ждёт готовности и открывает меню «Поделиться» — отправить в
/// типографию, сохранить в «Файлы».
class OrderFilesSection extends StatefulWidget {
  const OrderFilesSection({super.key, required this.orderId, required this.number});
  final String orderId;
  final int number;

  @override
  State<OrderFilesSection> createState() => _OrderFilesSectionState();
}

class _OrderFilesSectionState extends State<OrderFilesSection> {
  v1api.OrderFiles? _f;
  String? _busy;
  String? _stage;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final f = await v1(_api, (c) => c.crmOrderFiles(orderId: widget.orderId));
      if (mounted) setState(() => _f = f);
    } on ApiException {
      // Блок необязательный: без него остальная карточка заказа работает.
    }
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  /// Сначала просим сайт собрать файл (204, когда готов; ход — в progressUrl), потом качаем и отдаём «Поделиться».
  Future<void> _get(String key, String url, String filename) async {
    if (_busy != null) return;
    setState(() {
      _busy = key;
      _stage = 'Собираем файл…';
    });
    Timer? poll;
    try {
      if (!url.contains('/package')) {
        poll = Timer.periodic(const Duration(seconds: 2), (_) => _progress());
        final res = await _api.getRaw(url, query: {'prepare': '1'}, timeout: const Duration(minutes: 5));
        if (res.statusCode >= 400) throw ApiException(res.statusCode, _errorText(res.body));
      }
      poll?.cancel();
      if (mounted) setState(() => _stage = 'Скачиваем…');
      final bytes = await _api.download(_api.uri(url).toString());
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$filename');
      await file.writeAsBytes(bytes, flush: true);
      HapticFeedback.mediumImpact();
      if (!mounted) return;
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path)], sharePositionOrigin: const Rect.fromLTWH(0, 0, 1, 1)));
    } on ApiException catch (e) {
      _toast(e.message);
    } on TimeoutException {
      _toast('Файл собирается дольше обычного — попробуйте через минуту');
    } finally {
      poll?.cancel();
      if (mounted) {
        setState(() {
          _busy = null;
          _stage = null;
        });
      }
    }
  }

  static String _errorText(String body) {
    final m = RegExp(r'"error"\s*:\s*"([^"]+)"').firstMatch(body);
    return m?.group(1) ?? 'Не удалось собрать файл';
  }

  /// Ход сборки (тот же, что видит сайт): «Вёрстка блока», «Обложка»…
  Future<void> _progress() async {
    final f = _f;
    if (f == null) return;
    try {
      final r = await _api.get(f.progressUrl) as Map<String, dynamic>;
      final jobs = (r['jobs'] as List?) ?? const [];
      if (jobs.isEmpty || !mounted) return;
      final j = jobs.first as Map<String, dynamic>;
      const stages = {'images': 'Готовим фотографии', 'flow': 'Верстаем страницы', 'final': 'Собираем книгу', 'cover': 'Собираем обложку', 'finish': 'Упаковываем файлы'};
      final text = j['state'] == 'queued' ? 'В очереди на сборку${(j['ahead'] as num? ?? 0) > 0 ? ' (перед нами ${j['ahead']})' : ''}' : '${stages[j['stage']] ?? 'Собираем файл'} · ${(j['percent'] as num? ?? 0).round()}%';
      setState(() => _stage = text);
    } catch (_) {}
  }

  Future<void> _lock(bool locked) async {
    try {
      final r = await v1(_api, (c) => c.crmOrderBookLock(orderId: widget.orderId, body: v1api.BookLockBody(locked: locked)));
      _toast(r.message ?? 'Сохранено');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final f = _f;
    if (f == null) return const SizedBox.shrink();
    final ext = {'spec': 'txt', 'package': 'zip'};
    return GroupCard(title: 'Книга и файлы', padding: const EdgeInsets.only(bottom: 16), children: [
      SwitchListTile.adaptive(
        title: Text('Открыта для правок клиентом', style: AppText.body(context)),
        subtitle: Text(f.bookLocked ? 'закрыта — клиент не меняет текст и фото' : 'клиент может исправить книгу; не забудьте закрыть', style: AppText.caption(context)),
        value: !f.bookLocked,
        activeTrackColor: c.warn,
        onChanged: f.canLock ? (open) => _lock(!open) : null,
      ),
      if (f.spec != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
          child: Wrap(spacing: 14, runSpacing: 6, children: [
            _spec(context, 'Формат', f.spec!.format),
            _spec(context, 'Страниц', '${f.spec!.pages}'),
            _spec(context, 'Корешок', '${f.spec!.spineMm} мм'),
            _spec(context, 'Развёртка', '${f.spec!.coverWidthMm}×${f.spec!.coverHeightMm} мм'),
          ]),
        )
      else if (f.canFiles)
        Padding(padding: const EdgeInsets.fromLTRB(14, 6, 14, 10), child: Text('Файлы ещё не собирались — первый файл соберётся при скачивании', style: AppText.caption(context))),
      if (_stage != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
          child: Row(children: [
            const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 10),
            Expanded(child: Text(_stage!, style: AppText.caption(context))),
          ]),
        ),
      if (f.packageUrl != null)
        GroupTile(
          title: 'Всё для типографии (ZIP)',
          icon: LucideIcons.fileArchive,
          trailing: _busy == 'package' ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : null,
          onTap: () => _get('package', f.packageUrl!, 'order-${widget.number}.zip'),
        ),
      for (final file in f.files)
        GroupTile(
          title: file.label,
          icon: file.kind == 'spec' ? LucideIcons.fileText : LucideIcons.fileDown,
          trailing: _busy == file.kind ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : null,
          onTap: () => _get(file.kind, file.url, 'order-${widget.number}-${file.kind}.${ext[file.kind] ?? 'pdf'}'),
        ),
    ]);
  }

  Widget _spec(BuildContext context, String label, String value) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: AppText.caption(context)),
        Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: context.c.text)),
      ]);
}
