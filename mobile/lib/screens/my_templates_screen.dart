import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/templates_store.dart';
import '../models/chat.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'template_editor_screen.dart';

/// «Шаблоны ответов»: свои быстрые ответы (создать, изменить, копия, удалить, порядок перетаскиванием) и общие компании —
/// их можно скопировать себе. Свои видны только их владельцу и стоят первыми в чате.
class MyTemplatesScreen extends StatefulWidget {
  const MyTemplatesScreen({super.key});

  @override
  State<MyTemplatesScreen> createState() => _MyTemplatesScreenState();
}

class _MyTemplatesScreenState extends State<MyTemplatesScreen> {
  String _q = '';

  @override
  void initState() {
    super.initState();
    context.read<TemplatesStore>().load();
  }

  Future<void> _edit([Template? t]) async {
    await Navigator.of(context).push(CupertinoPageRoute<bool>(fullscreenDialog: true, builder: (_) => TemplateEditorScreen(template: t)));
  }

  void _toast(String? text) {
    if (text != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _menu(Template t) async {
    final store = context.read<TemplatesStore>();
    final r = await showAppSheet<String>(
      context,
      title: t.title,
      builder: (sheet) => GroupCard(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          GroupTile(title: 'Изменить', icon: LucideIcons.pencil, onTap: () => Navigator.pop(sheet, 'edit')),
          GroupTile(title: 'Сделать копию', icon: LucideIcons.copy, onTap: () => Navigator.pop(sheet, 'copy')),
          GroupTile(title: 'Удалить', icon: LucideIcons.trash2, destructive: true, onTap: () => Navigator.pop(sheet, 'delete')),
        ],
      ),
    );
    if (!mounted) return;
    switch (r) {
      case 'edit':
        await _edit(t);
      case 'copy':
        _toast(await store.duplicate(t) ?? 'Копия создана');
      case 'delete':
        if (await confirm(context, title: 'Удалить шаблон «${t.title}»?', ok: 'Удалить', destructive: true)) _toast(await store.remove(t) ?? 'Шаблон удалён');
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<TemplatesStore>();
    final c = context.c;
    final q = _q.toLowerCase();
    bool hit(Template t) => q.isEmpty || t.title.toLowerCase().contains(q) || t.text.toLowerCase().contains(q);
    final mine = store.mine.where(hit).toList();
    final shared = store.shared.where(hit).toList();
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        title: Text('Шаблоны ответов', style: AppText.headline(context)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: RoundIconButton(icon: LucideIcons.plus, color: c.brandDeep, tooltip: 'Новый шаблон', onTap: _edit),
          ),
        ],
      ),
      body: !store.loaded && store.error == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: store.load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(2, 0, 2, 12),
                    child: Text('Ваши быстрые ответы видны только вам и стоят первыми в списке шаблонов в чате. Там же их можно вызвать, набрав «/».', style: AppText.sub(context)),
                  ),
                  if (store.mine.length + store.shared.length > 5)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: AppSearchField(hint: 'Поиск по названию и тексту', onChanged: (v) => setState(() => _q = v)),
                    ),
                  _section(context, 'Мои шаблоны', store.mine.length),
                  if (store.mine.isEmpty)
                    _EmptyMine(onCreate: _edit)
                  else if (mine.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Center(child: Text('По запросу ничего не нашлось', style: AppText.sub(context))),
                    )
                  else if (q.isNotEmpty)
                    for (final t in mine) _Card(template: t, onTap: () => _edit(t), onMore: () => _menu(t))
                  else
                    ReorderableListView(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      buildDefaultDragHandles: false,
                      onReorderItem: store.reorder,
                      proxyDecorator: (child, _, _) => Material(color: Colors.transparent, child: child),
                      children: [
                        for (var i = 0; i < mine.length; i++)
                          ReorderableDelayedDragStartListener(
                            key: ValueKey(mine[i].id),
                            index: i,
                            child: _Card(template: mine[i], onTap: () => _edit(mine[i]), onMore: () => _menu(mine[i])),
                          ),
                      ],
                    ),
                  if (store.shared.isNotEmpty) ...[
                    const SizedBox(height: 22),
                    _section(context, 'Общие шаблоны компании', null),
                    for (final t in shared)
                      _Card(
                        template: t,
                        shared: true,
                        onTap: () async => _toast(await store.duplicate(t) ?? 'Копия создана в «Моих шаблонах»'),
                        onMore: () async => _toast(await store.duplicate(t) ?? 'Копия создана в «Моих шаблонах»'),
                      ),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _section(BuildContext context, String title, int? n) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
    child: Row(
      children: [
        Text(title.toUpperCase(), style: AppText.label(context)),
        if (n != null) ...[const SizedBox(width: 8), Text('$n', style: AppText.label(context))],
      ],
    ),
  );
}

class _Card extends StatelessWidget {
  const _Card({required this.template, required this.onTap, required this.onMore, this.shared = false});
  final Template template;
  final VoidCallback onTap;
  final VoidCallback onMore;
  final bool shared;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: shared ? c.surfaceRaised.withValues(alpha: 0.6) : c.surfaceRaised,
        borderRadius: BorderRadius.circular(Rd.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(Rd.lg),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 6, 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(Rd.lg),
              border: Border.all(color: c.border, width: 0.6),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(template.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headline(context).copyWith(fontSize: 16.5)),
                      const SizedBox(height: 5),
                      Text(template.text, maxLines: 3, overflow: TextOverflow.ellipsis, style: AppText.sub(context)),
                      if (shared)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            'Нажмите, чтобы скопировать себе',
                            style: TextStyle(fontSize: 12.5, color: c.brandDeep, fontWeight: FontWeight.w600),
                          ),
                        ),
                    ],
                  ),
                ),
                if (!shared)
                  IconButton(
                    onPressed: onMore,
                    icon: Icon(LucideIcons.ellipsis, color: c.textMuted),
                    tooltip: 'Действия',
                  ),
                if (shared)
                  IconButton(
                    onPressed: onMore,
                    icon: Icon(LucideIcons.copy, size: 19, color: c.textMuted),
                    tooltip: 'Скопировать себе',
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyMine extends StatelessWidget {
  const _EmptyMine({required this.onCreate});
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
      decoration: BoxDecoration(
        color: c.surfaceRaised,
        borderRadius: BorderRadius.circular(Rd.lg),
        border: Border.all(color: c.border, width: 0.6),
      ),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: c.brandDeep.withValues(alpha: 0.12), shape: BoxShape.circle),
            child: Icon(LucideIcons.zap, color: c.brandDeep, size: 26),
          ),
          const SizedBox(height: 14),
          Text('Здесь будут ваши быстрые ответы', style: AppText.headline(context)),
          const SizedBox(height: 6),
          Text(
            'Приветствие, реквизиты, «как оплатить» — один раз написали, дальше вставляете в чат одним нажатием. Можно выбрать сообщения в чате и нажать «В шаблон».',
            textAlign: TextAlign.center,
            style: AppText.sub(context),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(onPressed: onCreate, icon: const Icon(LucideIcons.plus, size: 18), label: const Text('Создать первый шаблон')),
        ],
      ),
    );
  }
}
