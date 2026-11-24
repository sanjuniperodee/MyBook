import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../money/money_widgets.dart';
import '../order_screen.dart';

/// Отзывы (API v1 crmReviews): очередь модерации по статусам — новые, на сайте, скрытые, все; у отзыва — показать на
/// сайте, скрыть, закрепить на главной; фото, заказ, код благодарности.
class ReviewsScreen extends StatefulWidget {
  const ReviewsScreen({super.key});

  @override
  State<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends State<ReviewsScreen> {
  v1api.Reviews? _r;
  String? _error;
  bool _loading = false;
  String _filter = 'new';
  final _busy = <String>{};

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await v1(_api, (c) => c.crmReviews(s: _filter));
      if (mounted) setState(() => _r = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _moderate(v1api.ReviewRow r, String action) async {
    if (_busy.contains(r.id)) return;
    setState(() => _busy.add(r.id));
    try {
      final res = await v1(_api, (c) => c.crmReviewModerate(id: r.id, action: action));
      HapticFeedback.lightImpact();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.message ?? 'Готово')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy.remove(r.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _r;
    final c = context.c;
    final counts = r?.counts;
    final filters = [('new', 'Новые', counts?.waiting), ('published', 'На сайте', counts?.published), ('hidden', 'Скрытые', counts?.hidden), ('all', 'Все', null)];
    return MoneyPage(
      title: 'Отзывы',
      subtitle: r == null ? null : 'Средняя оценка ${r.average}',
      period: null,
      onPeriod: null,
      onRefresh: _load,
      loading: _loading,
      error: _error,
      children: r == null
          ? const []
          : [
              SizedBox(
                height: 36,
                child: ListView(scrollDirection: Axis.horizontal, children: [
                  for (final (key, label, n) in filters)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterPill(label: label, count: n, selected: _filter == key, onTap: () {
                        _filter = key;
                        _load();
                      }),
                    ),
                ]),
              ),
              const SizedBox(height: 12),
              if (r.rows.isEmpty)
                MoneyEmpty(_filter == 'new' ? 'Новых отзывов нет — они приходят после доставки книги' : 'Отзывов с этим статусом нет')
              else
                for (final x in r.rows)
                  Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
                    decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        for (var i = 1; i <= 5; i++) Icon(Icons.star_rounded, size: 18, color: i <= x.rating ? c.warn : c.border),
                        const SizedBox(width: 8),
                        Expanded(child: Text('${x.author}${x.city.isNotEmpty ? ', ${x.city}' : ''}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.text))),
                        if (x.featured) Tag('на главной', fg: c.brand, bg: c.brand.withValues(alpha: 0.1)),
                      ]),
                      const SizedBox(height: 8),
                      Text(x.text.isEmpty ? '— без текста —' : x.text, style: AppText.body(context)),
                      if (x.photoUrl != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(_api.uri(x.photoUrl!).toString(), headers: {'Authorization': 'Bearer ${_api.token}'}, height: 160, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink())),
                        ),
                      const SizedBox(height: 6),
                      Text([x.theme, x.createdLabel, if (x.locale == 'kk') 'на казахском', if (x.thankYouCode != null) 'код ${x.thankYouCode}'].join(' · '), style: AppText.caption(context)),
                      if (x.blocker != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(x.blocker!, style: AppText.caption(context).copyWith(color: c.warn))),
                      Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Wrap(spacing: 8, runSpacing: 6, children: [
                          if (x.status != 'published' && x.blocker == null) _chip(context, 'Показать на сайте', LucideIcons.eye, x, 'publish', primary: true),
                          if (x.status != 'hidden') _chip(context, 'Скрыть', LucideIcons.eyeOff, x, 'hide'),
                          if (x.status == 'published') _chip(context, x.featured ? 'Открепить' : 'Закрепить на главной', LucideIcons.pin, x, x.featured ? 'unfeature' : 'feature'),
                          if (x.orderId != null)
                            Material(
                              color: c.bg,
                              borderRadius: BorderRadius.circular(18),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(18),
                                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderScreen(orderId: x.orderId!, number: x.orderNumber ?? 0))),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                                    Icon(LucideIcons.package, size: 15, color: c.brand),
                                    const SizedBox(width: 6),
                                    Text('Заказ №${x.orderNumber}', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: c.brand)),
                                  ]),
                                ),
                              ),
                            ),
                        ]),
                      ),
                    ]),
                  ),
            ],
    );
  }

  Widget _chip(BuildContext context, String label, IconData icon, v1api.ReviewRow r, String action, {bool primary = false}) {
    final c = context.c;
    final busy = _busy.contains(r.id);
    return Material(
      color: primary ? c.brand : c.bg,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: busy ? null : () => _moderate(r, action),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 15, color: primary ? c.onBrand : c.brand),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: primary ? c.onBrand : c.brand)),
          ]),
        ),
      ),
    );
  }
}
