import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/chat.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Быстрые ответы: шаблоны CRM с уже подставленными именем клиента, менеджером и полями сделки.
Future<Template?> pickTemplate(BuildContext context, List<Template> templates) {
  return showAppSheet<Template>(context, title: 'Быстрые ответы', icon: LucideIcons.zap, builder: (_) => _TemplatesList(templates: templates));
}

class _TemplatesList extends StatefulWidget {
  const _TemplatesList({required this.templates});
  final List<Template> templates;

  @override
  State<_TemplatesList> createState() => _TemplatesListState();
}

class _TemplatesListState extends State<_TemplatesList> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final q = _q.toLowerCase();
    final list = widget.templates.where((t) => q.isEmpty || t.title.toLowerCase().contains(q) || t.text.toLowerCase().contains(q)).toList();
    return Column(mainAxisSize: MainAxisSize.min, children: [
      if (widget.templates.length > 5) Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 8), child: AppSearchField(hint: 'Найти шаблон', onChanged: (v) => setState(() => _q = v))),
      Flexible(
        child: list.isEmpty
            ? Padding(padding: const EdgeInsets.fromLTRB(24, 24, 24, 40), child: Text(widget.templates.isEmpty ? 'Шаблонов пока нет. Их добавляют в CRM → Интеграции → CRM.' : 'Ничего не нашлось', textAlign: TextAlign.center, style: AppText.sub(context)))
            : ListView.separated(
                shrinkWrap: true,
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, i) => Material(
                  color: c.surface,
                  borderRadius: BorderRadius.circular(14),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => Navigator.of(context).pop(list[i]),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(list[i].title, style: AppText.headline(context).copyWith(fontSize: 16)),
                        const SizedBox(height: 4),
                        Text(list[i].text, maxLines: 3, overflow: TextOverflow.ellipsis, style: AppText.sub(context)),
                      ]),
                    ),
                  ),
                ),
              ),
      ),
    ]);
  }
}
