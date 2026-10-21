import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/chat.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Быстрые ответы: шаблоны CRM с уже подставленными именем клиента, менеджером и полями сделки.
Future<Template?> pickTemplate(BuildContext context, List<Template> templates, {VoidCallback? onManage}) {
  return showAppSheet<Template>(
    context,
    title: 'Быстрые ответы',
    icon: LucideIcons.zap,
    builder: (sheet) => _TemplatesList(
      templates: templates,
      onManage: onManage == null
          ? null
          : () {
              Navigator.pop(sheet);
              onManage();
            },
    ),
  );
}

class _TemplatesList extends StatefulWidget {
  const _TemplatesList({required this.templates, this.onManage});
  final List<Template> templates;
  final VoidCallback? onManage;

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
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.templates.length > 5)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: AppSearchField(hint: 'Найти шаблон', onChanged: (v) => setState(() => _q = v)),
          ),
        Flexible(
          child: list.isEmpty
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
                  child: Text(widget.templates.isEmpty ? 'Шаблонов пока нет — создайте свой кнопкой ниже' : 'Ничего не нашлось', textAlign: TextAlign.center, style: AppText.sub(context)),
                )
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
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(list[i].title, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headline(context).copyWith(fontSize: 16)),
                                ),
                                if (list[i].own)
                                  Container(
                                    margin: const EdgeInsets.only(left: 8),
                                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1.5),
                                    decoration: BoxDecoration(color: c.brandDeep.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(8)),
                                    child: Text(
                                      'мой',
                                      style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: c.brandDeep),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(list[i].text, maxLines: 3, overflow: TextOverflow.ellipsis, style: AppText.sub(context)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
        ),
        if (widget.onManage != null)
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: TextButton.icon(onPressed: widget.onManage, icon: const Icon(LucideIcons.pencil, size: 17), label: const Text('Мои шаблоны — создать и изменить')),
            ),
          ),
      ],
    );
  }
}
