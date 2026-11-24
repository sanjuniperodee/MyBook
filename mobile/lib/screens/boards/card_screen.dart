import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mime/mime.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/format.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../chat_screen.dart';
import '../client_screen.dart';
import '../crm_web_screen.dart';
import '../deal_screen.dart';
import '../order_screen.dart';
import 'board_common.dart';

/// Карточка задачи — как карточка на доске CRM: колонка, срок, приоритет, исполнители, метки, связи (сделка, заказ,
/// клиент, чат), описание, чек-листы, вложения, комментарии и журнал; «Выполнено», архив, удаление.
/// Данные — API v1 (cardDetail и действия); после каждого действия карточка перечитывается.
class CardScreen extends StatefulWidget {
  const CardScreen({super.key, required this.cardId, this.staff});
  final String cardId;

  /// Сотрудники доски (имена исполнителей и авторов); нет — берутся из доски карточки.
  final List<v1api.StaffRef>? staff;

  @override
  State<CardScreen> createState() => _CardScreenState();
}

class _CardScreenState extends State<CardScreen> {
  v1api.CardDetail? _d;
  List<v1api.StaffRef> _staff = const [];
  String? _error;
  bool _sending = false;
  final _comment = TextEditingController();

  ApiClient get _api => context.read<AuthState>().api;
  String get _me => context.read<AuthState>().staff!.id;
  Map<String, String> get _names => {for (final s in _staff) s.id: s.label};

  @override
  void initState() {
    super.initState();
    _staff = widget.staff ?? const [];
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await v1(_api, (c) => c.cardDetail(cardId: widget.cardId));
      // Имена исполнителей и авторов — из доски карточки (из календаря список сотрудников не приходит); не вышло — без имён.
      if (_staff.isEmpty && d.card.boardId != null) {
        try {
          _staff = (await v1(_api, (c) => c.boardDetail(boardId: d.card.boardId!))).staff;
        } on ApiException {
          // карточка важнее имён
        }
      }
      if (mounted) setState(() { _d = d; _error = null; });
    } on ApiException catch (e) {
      if (mounted && _d == null) setState(() => _error = e.message.isEmpty ? 'Нет связи' : e.message);
    }
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  /// Действие с карточкой: ошибка сервера — плашкой, успех — перечитать.
  Future<void> _act(Future<Object?> Function(v1api.MybookApi c) call, {String? done}) async {
    try {
      await v1(_api, call);
      HapticFeedback.selectionClick();
      if (done != null) _toast(done);
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _rename() async {
    final t = await promptText(context, title: 'Название', initial: _d!.card.title);
    if (t != null && t != _d!.card.title) await _act((c) => c.cardUpdate(cardId: widget.cardId, body: v1api.CardPatch(title: t)));
  }

  Future<void> _description() async {
    final t = await promptText(context, title: 'Описание', initial: _d!.description, lines: 6, ok: 'Сохранить');
    if (t != null) await _act((c) => c.cardUpdate(cardId: widget.cardId, body: v1api.CardPatch(description: t)));
  }

  Future<void> _column() async {
    final d = _d!;
    final v = await showAppSheet<String>(context, title: 'Колонка', builder: (sheet) {
      return GroupCard(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        for (final col in d.columns)
          GroupTile(title: col.name, subtitle: col.done ? 'выполненные' : null, trailing: col.id == d.card.columnId ? Icon(LucideIcons.check, color: sheet.c.brand) : const SizedBox(width: 20), onTap: () => Navigator.pop(sheet, col.id)),
      ]);
    });
    if (v == null || v == d.card.columnId) return;
    await _act((c) => c.cardMove(cardId: widget.cardId, body: v1api.CardMove(columnId: v)));
  }

  Future<void> _due() async {
    final r = await pickDue(context, _d!.card.dueAt);
    if (r == null) return;
    await _act((c) => c.cardUpdate(cardId: widget.cardId, body: r.cleared ? const v1api.CardPatch(nulls: {'dueAt'}) : v1api.CardPatch(dueAt: isoWithOffset(r.at!))));
  }

  Future<void> _priority() async {
    final v = await showAppSheet<String>(context, title: 'Приоритет', builder: (sheet) {
      return GroupCard(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        for (final e in [...priorityLabels.entries, const MapEntry('', 'Без приоритета')])
          GroupTile(
            title: e.value,
            icon: LucideIcons.flag,
            iconColor: priorityColor(sheet, e.key),
            trailing: (_d!.card.priority ?? '') == e.key ? Icon(LucideIcons.check, color: sheet.c.brand) : const SizedBox(width: 20),
            onTap: () => Navigator.pop(sheet, e.key),
          ),
      ]);
    });
    if (v == null) return;
    await _act((c) => c.cardUpdate(cardId: widget.cardId, body: v.isEmpty ? const v1api.CardPatch(nulls: {'priority'}) : v1api.CardPatch(priority: v)));
  }

  Future<void> _kind() async {
    final v = await showAppSheet<String>(context, title: 'Вид', builder: (sheet) {
      return GroupCard(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        for (final e in kindLabels.entries)
          GroupTile(title: e.value, icon: kindIcon(e.key), trailing: _d!.card.kind == e.key ? Icon(LucideIcons.check, color: sheet.c.brand) : const SizedBox(width: 20), onTap: () => Navigator.pop(sheet, e.key)),
      ]);
    });
    if (v != null && v != _d!.card.kind) await _act((c) => c.cardUpdate(cardId: widget.cardId, body: v1api.CardPatch(kind: v)));
  }

  Future<void> _assignees() async {
    final chosen = [..._d!.card.assigneeIds];
    final ok = await showAppSheet<bool>(context, title: 'Исполнители', full: true, builder: (sheet) {
      return StatefulBuilder(builder: (sheet, set) {
        return Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text('Первый — главный: ему напоминания и «Мой день»', style: AppText.caption(sheet))),
          Flexible(
            child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), children: [
              GroupCard(padding: EdgeInsets.zero, children: [
                for (final s in _staff)
                  GroupTile(
                    title: s.label,
                    subtitle: chosen.isNotEmpty && chosen.first == s.id ? 'главный' : null,
                    trailing: Icon(chosen.contains(s.id) ? LucideIcons.squareCheck : LucideIcons.square, color: chosen.contains(s.id) ? sheet.c.brand : sheet.c.textFaint),
                    onTap: () => set(() => chosen.contains(s.id) ? chosen.remove(s.id) : chosen.add(s.id)),
                  ),
              ]),
            ]),
          ),
          Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 16), child: PrimaryButton(label: 'Сохранить', onPressed: () => Navigator.pop(sheet, true))),
        ]);
      });
    });
    if (ok == true) await _act((c) => c.cardAssignees(cardId: widget.cardId, body: v1api.CardAssignees(userIds: chosen)));
  }

  Future<void> _labels() async {
    final d = _d!;
    await showAppSheet<void>(context, title: 'Метки', builder: (sheet) {
      final on = {...d.card.labelIds};
      return StatefulBuilder(builder: (sheet, set) {
        return SingleChildScrollView(
          child: GroupCard(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
            if (d.labels.isEmpty) GroupTile(title: 'У доски нет меток', subtitle: 'метки заводят в CRM на сайте'),
            for (final l in d.labels)
              GroupTile(
                title: l.name,
                icon: LucideIcons.tag,
                iconColor: tokenColor(sheet, l.color),
                trailing: Icon(on.contains(l.id) ? LucideIcons.squareCheck : LucideIcons.square, color: on.contains(l.id) ? sheet.c.brand : sheet.c.textFaint),
                onTap: () async {
                  final next = !on.contains(l.id);
                  set(() => next ? on.add(l.id) : on.remove(l.id));
                  try {
                    await v1(_api, (c) => c.cardLabel(cardId: widget.cardId, labelId: l.id, body: v1api.CardLabelToggle(on: next)));
                  } on ApiException catch (e) {
                    set(() => next ? on.remove(l.id) : on.add(l.id));
                    _toast(e.message);
                  }
                },
              ),
          ]),
        );
      });
    });
    await _load();
  }

  Future<void> _openLink(v1api.CardLink l) async {
    final Widget? page = switch (l.type) {
      'deal' => DealScreen(dealId: l.id),
      'order' => OrderScreen(orderId: l.id),
      'client' => ClientScreen(clientId: l.id, title: l.label),
      'chat' => ChatScreen(chatId: l.id, title: l.label),
      _ => null,
    };
    if (page != null) {
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));
    } else {
      await openCrm(context, l.href, title: l.label);
    }
  }

  Future<void> _attach() async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (x == null) return;
    final f = await http.MultipartFile.fromPath('file', x.path, filename: x.name, contentType: MediaType.parse(lookupMimeType(x.path) ?? 'image/jpeg'));
    await _act((c) => c.cardFileUpload(cardId: widget.cardId, files: [f]), done: 'Файл прикреплён');
  }

  Future<void> _addChecklist() async {
    final t = await promptText(context, title: 'Новый чек-лист', hint: 'например: Подготовить к печати', ok: 'Добавить');
    if (t != null) await _act((c) => c.cardChecklistCreate(cardId: widget.cardId, body: v1api.ChecklistCreate(title: t)));
  }

  Future<void> _addItem(v1api.Checklist list) async {
    final t = await promptText(context, title: list.title, hint: 'пункт', ok: 'Добавить');
    if (t != null) await _act((c) => c.checklistItemCreate(checklistId: list.id, body: v1api.ChecklistItemCreate(text: t)));
  }

  Future<void> _send() async {
    final text = _comment.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await v1(_api, (c) => c.cardCommentCreate(cardId: widget.cardId, body: v1api.CommentCreate(text: text)));
      _comment.clear();
      FocusManager.instance.primaryFocus?.unfocus();
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
    if (mounted) setState(() => _sending = false);
  }

  Future<void> _more() async {
    final d = _d!;
    final watching = d.card.watcherIds.contains(_me);
    final r = await showAppSheet<String>(context, builder: (sheet) {
      return GroupCard(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        GroupTile(title: watching ? 'Не следить' : 'Следить', subtitle: 'уведомления о комментариях и переносах', icon: watching ? LucideIcons.eyeOff : LucideIcons.eye, onTap: () => Navigator.pop(sheet, 'watch')),
        GroupTile(title: 'Прикрепить фото', icon: LucideIcons.imagePlus, onTap: () => Navigator.pop(sheet, 'file')),
        GroupTile(title: 'Добавить чек-лист', icon: LucideIcons.listChecks, onTap: () => Navigator.pop(sheet, 'checklist')),
        GroupTile(title: d.card.archived ? 'Вернуть из архива' : 'В архив', icon: LucideIcons.archive, onTap: () => Navigator.pop(sheet, 'archive')),
        GroupTile(title: 'Удалить карточку', icon: LucideIcons.trash2, destructive: true, onTap: () => Navigator.pop(sheet, 'delete')),
      ]);
    });
    if (!mounted) return;
    switch (r) {
      case 'watch':
        await _act((c) => c.cardWatch(cardId: widget.cardId, body: v1api.CardWatch(on: !watching)), done: watching ? 'Больше не следите' : 'Следите за карточкой');
      case 'file':
        await _attach();
      case 'checklist':
        await _addChecklist();
      case 'archive':
        await _act((c) => c.cardArchive(cardId: widget.cardId, body: v1api.CardArchive(archived: !d.card.archived)), done: d.card.archived ? 'Карточка вернулась на доску' : 'Карточка в архиве');
      case 'delete':
        if (await confirm(context, title: 'Удалить карточку?', message: 'Чек-листы, комментарии и вложения удалятся вместе с ней.', ok: 'Удалить', destructive: true)) {
          try {
            await v1(_api, (c) => c.cardDelete(cardId: widget.cardId));
            if (mounted) Navigator.of(context).pop();
          } on ApiException catch (e) {
            _toast(e.message);
          }
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final d = _d;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        title: Text(d?.board?.name ?? 'Карточка', style: AppText.headline(context)),
        actions: [if (d != null && d.card.editable) RoundIconButton(icon: LucideIcons.ellipsis, size: 44, onTap: _more), const SizedBox(width: 6)],
      ),
      body: d == null
          ? (_error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть карточку', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          : Column(children: [
              Expanded(
                child: RefreshIndicator(
                  color: c.brand,
                  onRefresh: _load,
                  child: ListView(
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    children: _body(context, d),
                  ),
                ),
              ),
              if (d.card.editable) _composer(context),
            ]),
    );
  }

  List<Widget> _body(BuildContext context, v1api.CardDetail d) {
    final c = context.c;
    final card = d.card;
    final editable = card.editable;
    final done = card.doneAt != null;
    final due = dueLabel(context, card.dueAt, done: done);
    final names = _names;
    final colName = d.columns.where((x) => x.id == card.columnId).map((x) => x.name).firstOrNull ?? '—';
    return [
      if (card.coverColor != null) Container(height: 8, margin: const EdgeInsets.only(bottom: 12), decoration: BoxDecoration(color: tokenColor(context, card.coverColor), borderRadius: BorderRadius.circular(4))),
      InkWell(
        onTap: editable ? _rename : null,
        child: Text(card.title, style: AppText.title(context).copyWith(fontSize: 22, decoration: done ? TextDecoration.lineThrough : null, color: done ? c.textMuted : null)),
      ),
      if (card.archived) Padding(padding: const EdgeInsets.only(top: 6), child: Text('В архиве', style: AppText.caption(context).copyWith(color: c.warn))),
      const SizedBox(height: 14),
      if (editable)
        PrimaryButton(
          label: done ? 'Вернуть в работу' : 'Выполнено',
          icon: done ? LucideIcons.rotateCcw : LucideIcons.check,
          onPressed: () => _act((x) => x.cardDone(cardId: widget.cardId, body: v1api.CardDone(done: !done)), done: done ? 'Карточка снова в работе' : 'Выполнено'),
        ),
      const SizedBox(height: 16),
      GroupCard(padding: const EdgeInsets.only(bottom: 16), children: [
        _row(context, LucideIcons.columns3, 'Колонка', colName, editable ? _column : null),
        _row(context, LucideIcons.clock, 'Срок', due.text.isEmpty ? 'без срока' : due.text, editable ? _due : null, color: due.text.isEmpty ? null : due.color),
        _row(context, LucideIcons.flag, 'Приоритет', priorityLabels[card.priority] ?? 'без приоритета', editable ? _priority : null, color: card.priority == null ? null : priorityColor(context, card.priority)),
        _row(context, kindIcon(card.kind), 'Вид', kindLabels[card.kind] ?? card.kind, editable ? _kind : null),
        _row(context, LucideIcons.users, 'Исполнители', card.assigneeIds.isEmpty ? 'не назначены' : card.assigneeIds.map((id) => names[id] ?? '—').join(', '), editable ? _assignees : null),
        _row(context, LucideIcons.tag, 'Метки', card.labelIds.isEmpty ? 'нет' : card.labelIds.map((id) => d.labels.where((l) => l.id == id).map((l) => l.name).firstOrNull ?? '').where((s) => s.isNotEmpty).join(', '), editable ? _labels : null),
      ]),
      if (card.links.isNotEmpty)
        GroupCard(title: 'Связано', padding: const EdgeInsets.only(bottom: 16), children: [
          for (final l in card.links)
            GroupTile(
              title: l.label,
              icon: switch (l.type) { 'deal' => LucideIcons.handshake, 'order' => LucideIcons.package, 'client' => LucideIcons.user, 'chat' => LucideIcons.messageCircle, _ => LucideIcons.bookOpen },
              onTap: () => _openLink(l),
            ),
        ]),
      GroupCard(title: 'Описание', padding: const EdgeInsets.only(bottom: 16), children: [
        InkWell(
          onTap: editable ? _description : null,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            child: Text(d.description.trim().isEmpty ? (editable ? 'Добавить описание' : 'Без описания') : d.description, style: d.description.trim().isEmpty ? AppText.sub(context) : AppText.body(context).copyWith(height: 1.4)),
          ),
        ),
      ]),
      for (final list in d.checklists)
        GroupCard(title: '${list.title} · ${list.items.where((i) => i.done).length}/${list.items.length}', padding: const EdgeInsets.only(bottom: 16), children: [
          for (final item in list.items)
            CheckboxListTile(
              value: item.done,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: c.brand,
              dense: true,
              title: Text(item.text, style: TextStyle(fontSize: 15, color: item.done ? c.textMuted : c.text, decoration: item.done ? TextDecoration.lineThrough : null)),
              subtitle: item.assigneeId == null && item.dueAt == null ? null : Text([if (item.assigneeId != null) names[item.assigneeId] ?? '', if (item.dueAt != null) dueLabel(context, item.dueAt).text].where((s) => s.isNotEmpty).join(' · '), style: AppText.caption(context)),
              onChanged: editable ? (v) => _act((x) => x.checklistItemUpdate(itemId: item.id, body: v1api.ChecklistItemPatch(done: v ?? false))) : null,
            ),
          if (editable) GroupTile(title: 'Пункт', icon: LucideIcons.plus, onTap: () => _addItem(list)),
        ]),
      if (d.files.isNotEmpty)
        GroupCard(title: 'Вложения', padding: const EdgeInsets.only(bottom: 16), children: [
          for (final f in d.files)
            GroupTile(
              title: f.name,
              subtitle: '${(f.size / 1024).ceil()} КБ',
              icon: f.isImage ? LucideIcons.image : LucideIcons.fileText,
              onTap: () => openCrm(context, f.url, title: f.name),
            ),
        ]),
      if (d.comments.isNotEmpty)
        GroupCard(title: 'Комментарии', padding: const EdgeInsets.only(bottom: 16), children: [
          for (final m in d.comments)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${m.mine ? 'Вы' : (names[m.authorId] ?? 'Сотрудник')} · ${_when(m.createdAt)}', style: AppText.caption(context).copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 3),
                Text(m.text, style: AppText.body(context).copyWith(fontSize: 15, height: 1.35)),
              ]),
            ),
        ]),
      if (d.activity.isNotEmpty)
        GroupCard(title: 'Журнал', padding: EdgeInsets.zero, children: [
          for (final a in d.activity.take(12))
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              child: Text('${_when(a.createdAt)} · ${a.actorId == null ? '' : '${names[a.actorId] ?? ''}: '}${a.text}', style: AppText.caption(context)),
            ),
        ]),
    ];
  }

  static String _when(String iso) {
    final d = DateTime.tryParse(iso)?.toLocal();
    return d == null ? '' : '${two(d.day)}.${two(d.month)} ${hhmm(d)}';
  }

  Widget _row(BuildContext context, IconData icon, String label, String value, VoidCallback? onTap, {Color? color}) {
    final c = context.c;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          Icon(icon, size: 18, color: c.textMuted),
          const SizedBox(width: 10),
          SizedBox(width: 112, child: Text(label, style: AppText.sub(context))),
          Expanded(child: Text(value, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w500, color: color ?? c.text))),
          if (onTap != null) Icon(LucideIcons.chevronRight, size: 17, color: c.textFaint),
        ]),
      ),
    );
  }

  Widget _composer(BuildContext context) {
    final c = context.c;
    return Container(
      decoration: BoxDecoration(color: c.bg, border: Border(top: BorderSide(color: c.border, width: 0.6))),
      padding: EdgeInsets.fromLTRB(12, 8, 8, 8 + MediaQuery.of(context).padding.bottom),
      child: Row(children: [
        Expanded(
          child: TextField(
            controller: _comment,
            minLines: 1,
            maxLines: 5,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(hintText: 'Комментарий (@Имя — уведомить коллегу)', isDense: true),
          ),
        ),
        const SizedBox(width: 6),
        RoundIconButton(icon: _sending ? LucideIcons.loader : LucideIcons.send, color: c.brand, onTap: _sending ? null : _send),
      ]),
    );
  }
}
