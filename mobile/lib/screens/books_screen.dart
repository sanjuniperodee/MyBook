import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../widgets/crm_form.dart';
import 'client_screen.dart';
import 'deal_screen.dart';

/// «Книги» (API v1 crmBooks): книги клиентов по этапу — пишутся, заброшены, почти готовы, заказаны; поиск и тема; ход
/// работы и сколько дней без правок; «Напомнить всем» — авторам незаказанных черновиков (как на сайте).
class BooksScreen extends StatefulWidget {
  const BooksScreen({super.key});

  @override
  State<BooksScreen> createState() => _BooksScreenState();
}

class _BooksScreenState extends State<BooksScreen> {
  v1api.BooksList? _l;
  String? _error;
  String _f = 'all';
  String _q = '';
  String? _theme;
  bool _reminding = false;
  Timer? _debounce;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final l = await v1(_api, (c) => c.crmBooks(f: _f, q: _q.isEmpty ? null : _q, theme: _theme));
      if (mounted) setState(() => _l = l);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _remindAll(v1api.BooksList l) async {
    if (!await confirm(context, title: 'Напомнить ${l.remindable.length} авторам?', message: 'Каждому — письмо или WhatsApp, как «Напомнить всем» на сайте. Кому уже напоминали недавно — пропустим.', ok: 'Напомнить')) return;
    setState(() => _reminding = true);
    try {
      final r = await v1(_api, (c) => c.crmBooksRemind(body: v1api.RemindBody(clientIds: l.remindable)));
      HapticFeedback.mediumImpact();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Напомнили: ${r.sent}${r.skipped > 0 ? ', пропущено ${r.skipped}' : ''}')));
      _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _reminding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final l = _l;
    return Scaffold(
      backgroundColor: c.bg,
      body: RefreshIndicator(
        color: c.brand,
        onRefresh: _load,
        child: CustomScrollView(physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()), slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 10, 12, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text('Книги', style: AppText.largeTitle(context))),
                  if (l != null && l.canRemind && l.remindable.isNotEmpty)
                    TextButton.icon(
                      onPressed: _reminding ? null : () => _remindAll(l),
                      icon: _reminding ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(LucideIcons.bellRing, size: 18),
                      label: Text('Напомнить (${l.remindable.length})'),
                    ),
                ]),
                Padding(padding: const EdgeInsets.only(right: 8, top: 2), child: Text('Заброшенным и почти готовым книгам помогает напоминание автору', style: AppText.sub(context))),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: AppSearchField(
                    hint: 'Название, автор, клиент',
                    onChanged: (v) {
                      _q = v.trim();
                      _debounce?.cancel();
                      _debounce = Timer(const Duration(milliseconds: 400), _load);
                    },
                    onSubmitted: (_) => _load(),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 36,
                  child: ListView(scrollDirection: Axis.horizontal, clipBehavior: Clip.none, children: [
                    for (final f in l?.filters ?? const <v1api.Choice>[])
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterPill(label: f.label, selected: _f == f.id, onTap: () {
                          _f = f.id;
                          _load();
                        }),
                      ),
                    if (l != null)
                      FilterPill(
                        label: _theme == null ? 'Тема' : l.themes.where((t) => t.id == _theme).map((t) => t.label).firstOrNull ?? 'Тема',
                        selected: _theme != null,
                        onTap: () async {
                          final v = await pickChoice(context, title: 'Тема книги', options: [for (final t in l.themes) (t.id, t.label)], current: _theme, emptyLabel: 'Все темы');
                          if (v == null) return;
                          _theme = v.isEmpty ? null : v;
                          _load();
                        },
                      ),
                  ]),
                ),
                const SizedBox(height: 12),
              ]),
            ),
          ),
          if (l == null)
            SliverFillRemaining(child: _error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          else if (l.rows.isEmpty)
            SliverFillRemaining(child: EmptyState(icon: LucideIcons.bookOpen, title: _f == 'all' && _q.isEmpty && _theme == null ? 'Книг пока нет' : 'Книг по этому фильтру нет'))
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
              sliver: SliverList.separated(
                itemCount: l.rows.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, i) => _card(context, l.rows[i]),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _card(BuildContext context, v1api.BookRow r) {
    final c = context.c;
    return Material(
      color: c.surface,
      borderRadius: BorderRadius.circular(Rd.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(Rd.lg),
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ClientScreen(clientId: r.ownerId, title: r.owner))),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(r.title.isEmpty ? r.line : r.title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.text)),
            if (r.title.isNotEmpty) Text(r.line, style: AppText.caption(context)),
            const SizedBox(height: 6),
            ClipRRect(borderRadius: BorderRadius.circular(3), child: LinearProgressIndicator(value: r.progress.clamp(0, 1).toDouble(), minHeight: 5, backgroundColor: c.border.withValues(alpha: 0.5), color: r.status == 'draft' ? c.brand : c.success)),
            const SizedBox(height: 5),
            Text(
              [r.progressText, if (r.photos > 0) 'фото ${r.photos}', r.status == 'draft' ? (r.idleDays == 0 ? 'правил сегодня' : '${r.idleDays} дн. без правок') : 'заказана'].join(' · '),
              style: AppText.caption(context).copyWith(color: r.stale ? c.danger : null),
            ),
            Text([r.owner, if (r.occasion != null) r.occasion!, if (r.remindedLabel != null) 'напоминали ${r.remindedLabel}'].join(' · '), style: AppText.caption(context)),
            if (r.dealId != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: GestureDetector(
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DealScreen(dealId: r.dealId!))),
                  child: Text('Сделка Д${r.dealNumber}', style: AppText.caption(context).copyWith(color: c.brand, fontWeight: FontWeight.w600)),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}
