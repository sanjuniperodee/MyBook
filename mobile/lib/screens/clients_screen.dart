import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../core/format.dart';
import '../models/work.dart';
import '../ui/avatar.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'client_screen.dart';

/// Клиенты: поиск по имени, e-mail и телефону, «Мои», сортировка. Нажатие открывает карточку клиента.
class ClientsScreen extends StatefulWidget {
  const ClientsScreen({super.key});

  @override
  State<ClientsScreen> createState() => _ClientsScreenState();
}

class _ClientsScreenState extends State<ClientsScreen> {
  final _scroll = ScrollController();
  final List<ClientRow> _rows = [];
  int _page = 1;
  int _total = 0;
  bool _loading = false;
  bool _loaded = false;
  String? _error;
  String _q = '';
  String _sort = 'new';
  bool _mine = false;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400 && _rows.length < _total) _load();
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading) return;
    _loading = true;
    final page = reset ? 1 : _page + 1;
    try {
      final r = await context.read<AuthState>().api.get('/api/mobile/clients', query: {'q': _q, 'sort': _sort, 'mine': _mine ? '1' : null, 'page': '$page'}) as Map<String, dynamic>;
      if (!mounted) return;
      final rows = [for (final c in (r['clients'] as List)) ClientRow.fromJson(c as Map<String, dynamic>)];
      setState(() {
        if (reset) _rows.clear();
        _rows.addAll(rows);
        _page = page;
        _total = (r['total'] as num).toInt();
        _loaded = true;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
    _loading = false;
  }

  void _reload() {
    setState(() {
      _loaded = false;
      _rows.clear();
    });
    _load(reset: true);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final top = MediaQuery.of(context).padding.top;
    Widget body;
    if (!_loaded && _error == null) {
      body = const SliverFillRemaining(hasScrollBody: false, child: SizedBox(height: 480, child: ChatListSkeleton(rows: 8)));
    } else if (_rows.isEmpty) {
      body = SliverFillRemaining(
        hasScrollBody: false,
        child: _error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: _error, action: 'Повторить', onAction: _reload) : EmptyState(icon: LucideIcons.users, title: 'Клиентов не найдено', hint: _q.isEmpty ? null : 'Попробуйте другой запрос'),
      );
    } else {
      body = SliverList.separated(
        itemCount: _rows.length,
        separatorBuilder: (_, _) => Divider(indent: 82, color: c.border),
        itemBuilder: (_, i) => _ClientTile(row: _rows[i]),
      );
    }
    return Scaffold(
      backgroundColor: c.bg,
      body: CustomScrollView(
        controller: _scroll,
        physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
        slivers: [
          CupertinoSliverRefreshControl(onRefresh: () => _load(reset: true)),
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(20, top + 10, 20, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text('Клиенты', style: AppText.largeTitle(context))),
                  if (_loaded) Text('$_total', style: AppText.sub(context)),
                ]),
                const SizedBox(height: 12),
                AppSearchField(
                  hint: 'Имя, телефон или e-mail',
                  onChanged: (v) {
                    _q = v;
                    _debounce?.cancel();
                    _debounce = Timer(const Duration(milliseconds: 450), _reload);
                  },
                  onSubmitted: (_) => _reload(),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 36,
                  child: ListView(scrollDirection: Axis.horizontal, clipBehavior: Clip.none, children: [
                    Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: 'Мои', selected: _mine, onTap: () {
                      _mine = !_mine;
                      _reload();
                    })),
                    for (final e in const {'new': 'Новые', 'ltv': 'По покупкам', 'active': 'Недавно были'}.entries)
                      Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: e.value, selected: _sort == e.key, onTap: () {
                        _sort = e.key;
                        _reload();
                      })),
                  ]),
                ),
                const SizedBox(height: 10),
              ]),
            ),
          ),
          body,
          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }
}

class _ClientTile extends StatelessWidget {
  const _ClientTile({required this.row});
  final ClientRow row;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: () => Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => ClientScreen(clientId: row.id, title: row.name))),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        child: Row(children: [
          AppAvatar(name: row.name, size: 54),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(row.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headline(context)),
              const SizedBox(height: 2),
              Text([if (row.phone != null) row.phone!, if (row.orders > 0) '${row.orders} зак.', if (row.books > 0) '${row.books} кн.'].join(' · '), maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.sub(context)),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            if (row.ltv > 0) Text(money(row.ltv), style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: c.text)),
            if (row.lastSeenAt != null) Padding(padding: const EdgeInsets.only(top: 3), child: Text(listTime(row.lastSeenAt), style: AppText.caption(context))),
          ]),
        ]),
      ),
    );
  }
}
