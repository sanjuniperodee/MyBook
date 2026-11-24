import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mime/mime.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Обращение в поддержку, как «Обращения → Новое» в CRM: что случилось, где, как должно быть, скриншоты. Из чата —
/// вместе с перепиской клиента (последние сообщения или выбранные), чтобы разработчику не пересказывать.
class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key, this.conversationId, this.messageIds = const [], this.chatTitle});
  final String? conversationId;
  final List<String> messageIds;
  final String? chatTitle;

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

const _kinds = {'bug': 'Что-то сломалось', 'change': 'Нужно изменить', 'question': 'Вопрос', 'other': 'Другое'};

class _SupportScreenState extends State<SupportScreen> {
  String _kind = 'bug';
  bool _urgent = false;
  final _what = TextEditingController();
  final _where = TextEditingController();
  final _expected = TextEditingController();
  final _files = <File>[];
  bool _busy = false;
  String? _error;

  Future<void> _addFiles() async {
    final picked = await ImagePicker().pickMultipleMedia(limit: 10);
    if (picked.isNotEmpty) setState(() => _files.addAll(picked.map((x) => File(x.path))));
  }

  Future<void> _send() async {
    if (_what.text.trim().length < 5) return setState(() => _error = 'Опишите, что случилось');
    setState(() {
      _busy = true;
      _error = null;
    });
    final api = context.read<AuthState>().api;
    try {
      final r = await api.multipart(
        '/api/admin/support',
        fields: {
          'kind': _kind,
          'urgency': _urgent ? 'urgent' : 'normal',
          'description': _what.text.trim(),
          'place': _where.text.trim().isEmpty ? (widget.chatTitle != null ? 'Приложение CRM, чат «${widget.chatTitle}»' : 'Приложение CRM') : _where.text.trim(),
          'expected': _expected.text.trim(),
          'device': 'Приложение MyBooks CRM, ${Platform.isIOS ? 'iPhone' : 'Android'} ${Platform.operatingSystemVersion}',
          if (widget.conversationId != null) 'conversationId': widget.conversationId!,
          if (widget.conversationId != null) 'messageIds': '[${widget.messageIds.map((id) => '"$id"').join(',')}]',
        },
        files: [for (final f in _files) (field: 'files', file: f, filename: f.uri.pathSegments.last, contentType: lookupMimeType(f.path) ?? 'application/octet-stream')],
      ) as Map<String, dynamic>;
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (d) => AlertDialog(
          title: Text('Обращение №${r['number']} отправлено'),
          content: Text(r['phone'] != null && '${r['phone']}'.isNotEmpty ? 'Когда исправят — придёт сообщение в WhatsApp на ${r['phone']}.' : 'Когда исправят — вам сообщат.'),
          actions: [TextButton(onPressed: () => Navigator.pop(d), child: const Text('Хорошо'))],
        ),
      );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(backgroundColor: c.bg, surfaceTintColor: Colors.transparent, title: Text('Обращение', style: AppText.headline(context))),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
          if (widget.conversationId != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: c.violetBg, borderRadius: BorderRadius.circular(Rd.md)),
                child: Row(children: [
                  Icon(LucideIcons.messagesSquare, size: 18, color: c.violet),
                  const SizedBox(width: 10),
                  Expanded(child: Text('Приложим переписку «${widget.chatTitle ?? 'чат'}»: сообщений — ${widget.messageIds.length}', style: TextStyle(color: c.violet, fontSize: 14))),
                ]),
              ),
            ),
          Text('ЧТО ЭТО', style: AppText.label(context)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [for (final e in _kinds.entries) FilterPill(label: e.value, selected: _kind == e.key, onTap: () => setState(() => _kind = e.key))]),
          const SizedBox(height: 16),
          TextField(controller: _what, minLines: 3, maxLines: 8, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Что случилось или что нужно')),
          const SizedBox(height: 12),
          TextField(controller: _where, decoration: const InputDecoration(labelText: 'Где (экран, заказ, клиент) — необязательно')),
          const SizedBox(height: 12),
          TextField(controller: _expected, minLines: 1, maxLines: 4, decoration: const InputDecoration(labelText: 'Как должно быть — необязательно')),
          const SizedBox(height: 12),
          SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: _urgent, onChanged: (v) => setState(() => _urgent = v), title: const Text('Срочно — мешает работать')),
          const SizedBox(height: 6),
          GroupCard(padding: EdgeInsets.zero, children: [
            for (final f in _files) GroupTile(title: f.uri.pathSegments.last, icon: LucideIcons.image, trailing: Icon(LucideIcons.x, size: 18, color: c.textFaint), onTap: () => setState(() => _files.remove(f))),
            GroupTile(title: 'Скриншоты или видео', icon: LucideIcons.paperclip, iconColor: c.brand, onTap: _addFiles),
          ]),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: c.danger))),
          const SizedBox(height: 18),
          PrimaryButton(label: _busy ? 'Отправляем…' : 'Отправить', icon: LucideIcons.send, onPressed: _busy ? null : _send),
        ]),
      ),
    );
  }
}
