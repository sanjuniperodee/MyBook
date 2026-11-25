import 'dart:io';
import 'dart:math';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../api/mybook_api.g.dart' as v1api;
import '../core/auth.dart';
import '../core/v1.dart';
import '../core/chat_controller.dart';
import '../core/chats_store.dart';
import '../core/format.dart';
import '../core/live.dart';
import '../core/notifier.dart';
import '../core/template_text.dart';
import '../models/chat.dart';
import '../ui/avatar.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../ui/wallpaper.dart';
import '../widgets/composer.dart';
import '../widgets/message_bubble.dart';
import '../widgets/forward_sheet.dart';
import 'deal_screen.dart';
import 'invoice_sheet.dart';
import 'kp_sheet.dart';
import 'my_templates_screen.dart';
import 'support_screen.dart';
import 'template_editor_screen.dart';
import 'templates_sheet.dart';
import 'crm_web_screen.dart';

/// Переписка: обои, пузыри с хвостиками, голосовые с волной, файлы, ответы на сообщения. Сверху — сделка диалога и счета,
/// внизу — поле ответа с быстрыми ответами, счётом и записью голоса.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.chatId, this.title, this.avatarUrl, this.channel});
  final String chatId;
  final String? title;
  final String? avatarUrl;
  final String? channel;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  late final ChatController ctrl;
  late final Notifier _notifier;
  final _composer = GlobalKey<ComposerState>();
  final _scroll = ScrollController();
  final _keys = <String, GlobalKey>{};
  final _picker = ImagePicker();
  bool _showDown = false;
  double? _dragFrom;
  int _lastIncoming = 0;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthState>();
    _notifier = context.read<Notifier>()..openChatId = widget.chatId;
    ctrl = ChatController(api: auth.api, live: context.read<LiveService>(), chatId: widget.chatId, myId: auth.staff?.id);
    // Переписка — сразу из кэша телефона, свежая — следом; «прочитано» уходит, не дожидаясь загрузки.
    ctrl.open();
    ctrl.markRead();
    context.read<ChatsStore>().markRead(widget.chatId);
    _notifier.clearChat(widget.chatId);
    ctrl.addListener(_autoRead);
    _scroll.addListener(() {
      if (!_scroll.hasClients) return;
      final far = _scroll.offset > 420;
      if (far != _showDown) setState(() => _showDown = far);
      // Лента перевёрнута: верх истории — конец прокрутки. За экран до него догружаем старые сообщения.
      if (_scroll.position.extentAfter < 800) ctrl.loadOlder();
    });
  }

  /// Пока диалог открыт, новые входящие сразу считаются прочитанными.
  void _autoRead() {
    final n = ctrl.messages.where((m) => !m.outgoing && !m.internal).length;
    if (n > _lastIncoming && _lastIncoming != 0) {
      ctrl.markRead();
      if (mounted) context.read<ChatsStore>().markRead(widget.chatId);
      HapticFeedback.selectionClick();
    }
    _lastIncoming = n;
  }

  @override
  void dispose() {
    FocusManager.instance.primaryFocus?.unfocus();
    if (_notifier.openChatId == widget.chatId) _notifier.openChatId = null;
    ctrl.removeListener(_autoRead);
    ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _toast(String? text) {
    if (text == null || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  // ─── вложения ───────────────────────────────────────────────────────────────

  Future<void> _attach() async {
    final d = ctrl.detail;
    if (d == null) return;
    FocusScope.of(context).unfocus();
    final items = <_Pick>[
      _Pick(LucideIcons.fileText, 'Документ', const [Color(0xFF7C83FD), Color(0xFF5157AE)], _pickDocuments),
      _Pick(LucideIcons.image, 'Галерея', const [Color(0xFFD59BF6), Color(0xFFBF59CF)], _pickGallery),
      _Pick(LucideIcons.camera, 'Камера', const [Color(0xFFFF8FB1), Color(0xFFD3396D)], _camera),
      if (d.perms.canInvoice) _Pick(LucideIcons.receipt, 'Счёт', const [Color(0xFF34D399), Color(0xFF0F8F7E)], _invoice),
      if (d.perms.canReply) _Pick(LucideIcons.gift, 'Предложение', const [Color(0xFFA01F3A), Color(0xFF7D1730)], _offer),
      if (d.channel == 'whatsapp' && d.perms.canReply) _Pick(LucideIcons.shoppingBag, 'Товар', const [Color(0xFFF59E0B), Color(0xFFB45309)], _catalog),
      _Pick(LucideIcons.zap, 'Шаблон', const [Color(0xFFFFC857), Color(0xFFD99A00)], _templates),
      if (d.perms.canNote) _Pick(LucideIcons.stickyNote, 'Заметка', const [Color(0xFF9CA3AF), Color(0xFF6D7B83)], _note),
    ];
    await showAppSheet<void>(
      context,
      title: 'Прикрепить',
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: GridView.count(
            shrinkWrap: true,
            crossAxisCount: 3,
            mainAxisSpacing: 20,
            childAspectRatio: 1.05,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              for (final it in items)
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    Navigator.pop(sheet);
                    it.action();
                  },
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 62,
                        height: 62,
                        // Плитки — как кнопки CRM: подложка и значок тушью, без цветных градиентов.
                        decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), color: sheet.c.surface, border: Border.all(color: sheet.c.border)),
                        child: Icon(it.icon, color: sheet.c.text, size: 26),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        it.label,
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: context.c.text),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickDocuments() async {
    final picked = await FilePicker.pickFiles();
    final files = [
      for (final f in picked)
        if (f.path != null) File(f.path!),
    ];
    if (files.isEmpty) return;
    _toast(await ctrl.sendFiles(files));
  }

  Future<void> _pickGallery() async {
    final picked = await _picker.pickMultipleMedia(limit: 10);
    if (picked.isEmpty) return;
    _toast(await ctrl.sendFiles([for (final x in picked) File(x.path)]));
  }

  Future<void> _camera() async {
    final x = await _picker.pickImage(source: ImageSource.camera, imageQuality: 85);
    if (x == null) return;
    _toast(await ctrl.sendFiles([File(x.path)]));
  }

  // ─── быстрые ответы, счёт, заметка ──────────────────────────────────────────

  Future<void> _templates() async {
    final d = ctrl.detail;
    if (d == null) return;
    final t = await pickTemplate(context, d.templates, onManage: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const MyTemplatesScreen())));
    if (t != null) _composer.currentState?.insert(t.text);
  }

  Future<void> _invoice() async {
    final d = ctrl.detail;
    if (d == null) return;
    final api = context.read<AuthState>().api;
    final ok = await showInvoiceSheet(context, api: api, dealId: d.dealId, conversationId: d.id);
    if (ok) await ctrl.load(silent: true);
  }

  Future<void> _note() async {
    final text = await promptText(context, title: 'Заметка для коллег', hint: 'Клиент её не увидит. @имя — уведомить коллегу', lines: 4);
    if (text != null) _toast(await ctrl.addNote(text));
  }

  Future<String?> _askReason(String blocked) async {
    return promptText(context, title: 'Сообщение не отправлено', hint: '$blocked\n\nПричина, чтобы отправить всё равно', ok: 'Отправить', lines: 3);
  }

  // ─── действия над сообщением ────────────────────────────────────────────────

  Future<void> _messageMenu(Message m) async {
    HapticFeedback.mediumImpact();
    if (m.id.startsWith('local-')) {
      if (m.isFailed) {
        final r = await showAppSheet<String>(
          context,
          builder: (sheet) => GroupCard(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              GroupTile(title: 'Отправить ещё раз', icon: LucideIcons.rotateCw, onTap: () => Navigator.pop(sheet, 'retry')),
              GroupTile(title: 'Удалить', icon: LucideIcons.trash2, destructive: true, onTap: () => Navigator.pop(sheet, 'drop')),
            ],
          ),
        );
        if (r == 'retry') _retry(m);
        if (r == 'drop') ctrl.discard(m);
      }
      return;
    }
    final d = ctrl.detail!;
    final mine = m.outgoing && m.authorId == context.read<AuthState>().staff?.id;
    final recent = DateTime.now().difference(m.at) < const Duration(minutes: 15);
    final action = await showAppSheet<String>(
      context,
      builder: (sheet) => SingleChildScrollView(
        child: GroupCard(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            if (d.perms.canReply && m.outgoing && m.isFailed && !m.internal && m.type == 'text' && !m.deleted)
              GroupTile(title: 'Повторить отправку', icon: LucideIcons.rotateCw, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'resend')),
            if (m.editHistory.isNotEmpty) GroupTile(title: m.outgoing ? 'Как было до правки в WhatsApp' : 'Как было до правки клиентом', icon: LucideIcons.history, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'history')),
            if (d.perms.canReply && !m.deleted && !m.internal) GroupTile(title: 'Ответить', icon: LucideIcons.reply, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'reply')),
            if (ctrl.canForward(m)) GroupTile(title: 'Переслать', icon: LucideIcons.forward, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'forward')),
            if (m.text.isNotEmpty) GroupTile(title: 'Копировать', icon: LucideIcons.copy, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'copy')),
            // След хода AI-продажника у его ответа — как «Почему так?» под сообщением в CRM.
            if (m.isBot && m.hasTrace && !m.deleted) GroupTile(title: 'Почему так?', subtitle: 'что решил бот и почему', icon: LucideIcons.bot, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'trace')),
            if (!m.deleted && !m.internal && m.type == 'text' && m.text.trim().isNotEmpty)
              GroupTile(title: 'Создать шаблон (/)', icon: LucideIcons.zap, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'template')),
            if (m.type == 'audio' && !m.deleted)
              GroupTile(
                title: m.transcript == null ? 'Расшифровать голосовое' : 'Обновить расшифровку',
                icon: LucideIcons.captions,
                trailing: const SizedBox.shrink(),
                onTap: () => Navigator.pop(sheet, 'transcribe'),
              ),
            if (mine && m.type == 'text' && recent && !m.deleted) GroupTile(title: 'Изменить', icon: LucideIcons.pencil, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'edit')),
            if (ctrl.canRemove(m)) GroupTile(title: m.internal || m.isFailed ? 'Удалить' : 'Удалить у всех', icon: LucideIcons.trash2, destructive: true, onTap: () => Navigator.pop(sheet, 'delete')),
            if (ctrl.isSelectable(m)) GroupTile(title: 'Выбрать', icon: LucideIcons.squareCheck, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'select')),
          ],
        ),
      ),
    );
    switch (action) {
      case 'resend':
        _toast(await ctrl.resend(m));
      case 'history':
        if (mounted) await _showHistory(m);
      case 'reply':
        ctrl.setReply(m);
      case 'copy':
        await Clipboard.setData(ClipboardData(text: m.text));
        _toast('Скопировано');
      case 'transcribe':
        _toast(await ctrl.transcribe(m));
      case 'edit':
        if (!mounted) return;
        final text = await promptText(context, title: 'Изменить сообщение', initial: m.text, lines: 4);
        if (text != null && text != m.text) _toast(await ctrl.edit(m, text));
      case 'forward' || 'delete' || 'select':
        // Как в WhatsApp: «Переслать» и «Удалить» включают выбор — можно отметить ещё сообщения и нажать кнопку сверху.
        ctrl.startSelect(m);
      case 'template':
        await _templateFromMessage(m);
      case 'trace':
        await _botTrace(m);
    }
  }

  /// «Почему так?»: что решила модель, что сделал код, уроки, токены (API v1 crmChatBotTrace).
  Future<void> _botTrace(Message m) async {
    try {
      final t = await v1(context.read<AuthState>().api, (c) => c.crmChatBotTrace(chatId: widget.chatId, messageId: m.id));
      if (!mounted) return;
      await showBotTraceSheet(context, rows: t.rows);
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  /// Последние ходы бота в диалоге («Почему так?» для ответов и молчания, API v1 crmChatBotTraces).
  Future<void> _botTraces() async {
    try {
      final t = await v1(context.read<AuthState>().api, (c) => c.crmChatBotTraces(chatId: widget.chatId));
      if (!mounted) return;
      await showBotTracesSheet(context, items: t.items);
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  /// Коммерческое предложение (КП) клиенту из чата: оплата заказа, книга или персональная скидка (API v1).
  Future<void> _offer() async {
    final sent = await showKpSheet(context, chatId: widget.chatId);
    if (sent && mounted) await ctrl.load(silent: true);
  }

  /// Прежние версии сообщения, изменённого в WhatsApp не из CRM.
  Future<void> _showHistory(Message m) async {
    await showAppSheet<void>(
      context,
      title: m.outgoing ? 'Изменено в WhatsApp' : 'Клиент изменил сообщение',
      icon: LucideIcons.history,
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final (i, t) in m.editHistory.indexed) ...[
                Text('Версия ${i + 1}', style: AppText.label(sheet)),
                const SizedBox(height: 4),
                Text(t, style: AppText.body(sheet).copyWith(color: sheet.c.textMuted, decoration: TextDecoration.lineThrough)),
                const SizedBox(height: 14),
              ],
              Text('Сейчас', style: AppText.label(sheet)),
              const SizedBox(height: 4),
              Text(m.text, style: AppText.body(sheet)),
            ],
          ),
        ),
      ),
    );
  }

  // ─── каталог WhatsApp ───────────────────────────────────────────────────────

  /// «Товар из каталога»: товары каталога WhatsApp с фото и ценой — нажатие отправляет клиенту карточку; «Весь каталог» — ссылку.
  Future<void> _catalog() async {
    final api = context.read<AuthState>().api;
    final picked = await showAppSheet<String>(
      context,
      title: 'Каталог WhatsApp',
      icon: LucideIcons.store,
      builder: (sheet) => _CatalogPicker(ctrl: ctrl, api: api),
    );
    if (picked == null) return;
    _toast(await ctrl.sendCatalog(picked.isEmpty ? null : picked) ?? (picked.isEmpty ? 'Ссылка на каталог отправлена' : 'Товар отправлен'));
  }

  // ─── выбор нескольких сообщений ─────────────────────────────────────────────

  Future<void> _forward() async {
    final list = ctrl.picked;
    if (list.isEmpty) return;
    final preview = list.length == 1 ? (list.first.text.isEmpty ? '[${list.first.type}]' : list.first.text) : 'Сообщений: ${list.length}';
    final targets = await pickForwardTargets(context, ctrl, preview: preview);
    if (targets == null || targets.isEmpty || !mounted) return;
    final (ok, text) = await ctrl.forwardPicked(targets);
    _toast(text);
    if (!ok) return;
  }

  Future<void> _deletePicked() async {
    final list = ctrl.picked;
    if (list.isEmpty) return;
    final one = list.length == 1 ? list.first : null;
    final title = one == null
        ? 'Удалить сообщения (${list.length})?'
        : (one.internal
              ? 'Удалить заметку?'
              : one.isFailed
              ? 'Удалить неотправленное сообщение?'
              : 'Удалить сообщение у всех?');
    final yes = await confirm(context, title: title, message: one != null && (one.internal || one.isFailed) ? null : 'Клиент увидит «Сообщение удалено».', ok: 'Удалить', destructive: true);
    if (yes) _toast(await ctrl.removePicked());
  }

  /// Шаблон из выбранных сообщений: тексты склеиваются в черновик.
  Future<void> _templateFromPicked() async {
    final text = ctrl.pickedText;
    if (text.isEmpty) return;
    final list = ctrl.picked.where((m) => !m.internal && m.type == 'text').toList();
    if (list.length == 1) return _templateFromMessage(list.first);
    ctrl.clearSelect();
    await Navigator.of(context).push(
      CupertinoPageRoute<bool>(
        fullscreenDialog: true,
        builder: (_) => TemplateEditorScreen(initialTitle: titleFromText(text), initialText: text.length > 2000 ? text.substring(0, 2000) : text),
      ),
    );
  }

  /// «Создать шаблон (/)» из сообщения: сервер (код и ИИ) заменяет данные клиента подстановками — открывается редактор.
  Future<void> _templateFromMessage(Message m) async {
    ctrl.clearSelect();
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );
    final (draft, err) = await ctrl.draftTemplate(m);
    if (!mounted) return;
    Navigator.of(context, rootNavigator: true).pop();
    if (draft == null) return _toast(err);
    await Navigator.of(context).push(
      CupertinoPageRoute<bool>(
        fullscreenDialog: true,
        builder: (_) => TemplateEditorScreen(initialTitle: draft.title, initialText: draft.text, replaced: draft.replaced),
      ),
    );
  }

  Future<void> _retry(Message m) async {
    // Запись в CRM есть, шлюз её не принял — повторяем ту же запись (как «Повторить отправку» в CRM).
    if (!m.id.startsWith('local-')) {
      _toast(await ctrl.resend(m));
      return;
    }
    if (m.type == 'text') {
      ctrl.discard(m);
      await ctrl.sendText(m.text);
    } else if (m.localPath != null) {
      ctrl.discard(m);
      if (m.type == 'audio') {
        _toast(await ctrl.sendVoice(File(m.localPath!), Duration(milliseconds: m.durationMs ?? 0)));
      } else {
        _toast(await ctrl.sendFiles([File(m.localPath!)], caption: m.type == 'document' ? '' : m.text));
      }
    }
  }

  /// К цитируемому сообщению: если его нет в загруженной ленте — догружаем историю (до пяти страниц).
  Future<void> _scrollTo(String id) async {
    for (var i = 0; i < 5 && !ctrl.messages.any((m) => m.id == id) && ctrl.more; i++) {
      await ctrl.loadOlder();
    }
    if (!ctrl.messages.any((m) => m.id == id)) return _toast('Исходное сообщение не найдено');
    // Строка могла ещё не построиться (далеко за экраном) — прокручиваем к её месту по индексу и уточняем.
    for (var i = 0; i < 12; i++) {
      final ctx = _keys[id]?.currentContext;
      if (ctx != null && ctx.mounted) {
        await Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 300), alignment: 0.5);
        return;
      }
      if (!_scroll.hasClients) return;
      await _scroll.animateTo(min(_scroll.offset + 900, _scroll.position.maxScrollExtent), duration: const Duration(milliseconds: 120), curve: Curves.linear);
    }
  }

  void _openDeal(ChatDetail d) {
    Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => DealScreen(dealId: d.deal!.id, fromChat: true)));
  }

  Future<void> _menu() async {
    final d = ctrl.detail;
    if (d == null) return;
    final r = await showAppSheet<String>(
      context,
      builder: (sheet) => SingleChildScrollView(
        child: GroupCard(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            if (d.dealId == null && d.perms.canCreateDeal) GroupTile(title: 'Завести сделку', icon: LucideIcons.handshake, onTap: () => Navigator.pop(sheet, 'deal')),
            if (d.perms.canNote) GroupTile(title: 'Заметка для коллег', icon: LucideIcons.stickyNote, onTap: () => Navigator.pop(sheet, 'note')),
            if (d.status == 'open' && d.perms.canReply) GroupTile(title: 'Закрыть диалог', icon: LucideIcons.circleCheck, onTap: () => Navigator.pop(sheet, 'close')),
            if (d.status == 'closed' && d.perms.canReply) GroupTile(title: 'Открыть снова', icon: LucideIcons.rotateCcw, onTap: () => Navigator.pop(sheet, 'open')),
            if (d.perms.canReply) GroupTile(title: 'Передать коллеге', icon: LucideIcons.userRoundPlus, onTap: () => Navigator.pop(sheet, 'assign')),
            GroupTile(title: d.pinned ? 'Открепить чат' : 'Закрепить чат', icon: d.pinned ? LucideIcons.pinOff : LucideIcons.pin, onTap: () => Navigator.pop(sheet, d.pinned ? 'unpin' : 'pin')),
            if (d.channel == 'whatsapp' && d.perms.canReply) GroupTile(title: 'Позвонить в WhatsApp', icon: LucideIcons.phone, onTap: () => Navigator.pop(sheet, 'web')),
            if (d.perms.canReply && d.botCanStop) GroupTile(title: 'Остановить бота', subtitle: d.botLabel, icon: LucideIcons.botOff, onTap: () => Navigator.pop(sheet, 'botStop')),
            if (d.perms.canReply && d.botCanStart && d.dealId != null) GroupTile(title: 'Запустить бота', subtitle: 'поздоровается и спросит, чего нет в сделке', icon: LucideIcons.bot, onTap: () => Navigator.pop(sheet, 'botStart')),
            if (d.botLabel != null && d.botLabel!.isNotEmpty) GroupTile(title: 'Ходы бота («Почему так?»)', subtitle: 'ответы, молчание, стадия и правила', icon: LucideIcons.circleHelp, onTap: () => Navigator.pop(sheet, 'botTraces')),
            if (d.perms.canReply) GroupTile(title: 'Коммерческое предложение (КП)', subtitle: 'оплата заказа, книга, персональная скидка', icon: LucideIcons.gift, onTap: () => Navigator.pop(sheet, 'offer')),
            GroupTile(title: 'Обращение в поддержку', icon: LucideIcons.lifeBuoy, onTap: () => Navigator.pop(sheet, 'support')),
            GroupTile(title: 'Обновить', icon: LucideIcons.refreshCw, onTap: () => Navigator.pop(sheet, 'refresh')),
          ],
        ),
      ),
    );
    switch (r) {
      case 'deal':
        _toast(await ctrl.createDeal());
      case 'note':
        await _note();
      case 'close':
        _toast(await ctrl.setStatus('closed'));
      case 'open':
        _toast(await ctrl.setStatus('open'));
      case 'assign':
        await _assign();
      case 'pin' || 'unpin':
        _toast(await ctrl.setPinned(r == 'pin') ?? (r == 'pin' ? 'Чат закреплён вверху списка' : 'Чат откреплён'));
        if (mounted) context.read<ChatsStore>().load();
      case 'support':
        // К обращению — последние 30 сообщений переписки (или выбранные), чтобы не пересказывать.
        final ids = ctrl.messages.where((m) => !m.id.startsWith('local-')).map((m) => m.id).toList();
        if (!mounted) return;
        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SupportScreen(conversationId: widget.chatId, chatTitle: d.title, messageIds: ids.length > 30 ? ids.sublist(ids.length - 30) : ids)));
      case 'offer':
        await _offer();
      case 'botTraces':
        await _botTraces();
      case 'web':
        // Звонок WhatsApp — чат CRM внутри приложения (нативный звонок — план в PARITY.md).
        if (!mounted) return;
        await openCrm(context, '/admin/chats?c=${widget.chatId}', title: d.title);
        await ctrl.load(silent: true);
      case 'botStart' || 'botStop':
        _toast(await ctrl.setBot(r == 'botStart'));
      case 'refresh':
        await ctrl.load();
    }
  }

  /// Передать диалог другому сотруднику (или снять ответственного): список сотрудников отдаёт сервер с учётом прав.
  Future<void> _assign() async {
    final api = context.read<AuthState>().api;
    List<Map<String, dynamic>> people;
    try {
      final r = await api.get('/api/mobile/staff') as Map<String, dynamic>;
      people = (r['staff'] as List).cast<Map<String, dynamic>>();
    } on ApiException catch (e) {
      _toast(e.message);
      return;
    }
    if (!mounted) return;
    final picked = await showAppSheet<String>(
      context,
      title: 'Передать диалог',
      icon: LucideIcons.userRoundPlus,
      builder: (sheet) => SingleChildScrollView(
        child: GroupCard(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            for (final p in people) GroupTile(title: p['name'] as String, icon: LucideIcons.user, onTap: () => Navigator.pop(sheet, p['id'] as String)),
            GroupTile(title: 'Снять ответственного', icon: LucideIcons.userX, iconColor: sheet.c.textMuted, onTap: () => Navigator.pop(sheet, '')),
          ],
        ),
      ),
    );
    if (picked == null) return;
    try {
      await api.post('/api/mobile/chats/${widget.chatId}/assign', body: {'userId': picked.isEmpty ? null : picked});
      _toast(picked.isEmpty ? 'Ответственный снят' : 'Диалог передан');
      await ctrl.load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  // ─── разметка ───────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthState>();
    final c = context.c;
    return ChangeNotifierProvider<ChatController>.value(
      value: ctrl,
      child: Consumer<ChatController>(
        builder: (context, ctl, _) {
          final d = ctl.detail;
          return PopScope(
            canPop: !ctl.selecting,
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop) ctl.clearSelect();
            },
            child: Scaffold(
              backgroundColor: c.bg,
              body: Column(
                children: [
                  ctl.selecting ? _selectHeader(context, ctl) : _header(context, d),
                  if (d != null) _topBars(context, d),
                  Expanded(
                    child: ChatWallpaper(
                      child: Stack(
                        children: [
                          // Как в WhatsApp: нажатие на ленту и движение пальцем вниз по ней закрывают клавиатуру — даже когда
                          // сообщений мало и лента не прокручивается (Listener не спорит с прокруткой и нажатиями пузырей).
                          Positioned.fill(
                            child: Listener(
                              onPointerDown: (e) => _dragFrom = e.position.dy,
                              onPointerMove: (e) {
                                if (_dragFrom != null && e.position.dy - _dragFrom! > 12) {
                                  _dragFrom = null;
                                  FocusManager.instance.primaryFocus?.unfocus();
                                }
                              },
                              child: GestureDetector(
                                behavior: HitTestBehavior.translucent,
                                onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
                                child: _messages(context, ctl, auth),
                              ),
                            ),
                          ),
                          Positioned(
                            right: 14,
                            bottom: 12,
                            child: AnimatedScale(
                              scale: _showDown ? 1 : 0,
                              duration: const Duration(milliseconds: 160),
                              child: _DownButton(
                                onTap: () => _scroll.animateTo(0, duration: const Duration(milliseconds: 320), curve: Curves.easeOutCubic),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (ctl.replyTo != null && !ctl.selecting) _replyBar(context, ctl),
                  if (d != null && !ctl.selecting) _bottom(context, ctl, d),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _header(BuildContext context, ChatDetail? d) {
    final c = context.c;
    final title = d?.title ?? widget.title ?? 'Чат';
    final parts = d == null ? <String>[] : [d.channelLabel, if (d.assignee != null) d.assignee!, if (d.status == 'closed') 'закрыт'];
    final subtitle = d?.botLabel != null && d!.botLabel!.contains('ведёт') ? 'бот ведёт диалог' : parts.join(' · ');
    return Container(
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(bottom: BorderSide(color: c.border, width: 0.6)),
      ),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 60,
          child: Row(
            children: [
              RoundIconButton(icon: LucideIcons.chevronLeft, size: 44, iconSize: 28, color: c.brandDeep, onTap: () => Navigator.of(context).maybePop()),
              AppAvatar(name: title, url: d?.avatarUrl ?? widget.avatarUrl, size: 38, channel: widget.channel),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headline(context)),
                    if (subtitle.isNotEmpty) Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption(context).copyWith(fontSize: 13)),
                  ],
                ),
              ),
              if (d?.deal != null) RoundIconButton(icon: LucideIcons.handshake, size: 42, color: c.text, tooltip: 'Сделка', onTap: () => _openDeal(d!)),
              RoundIconButton(icon: LucideIcons.ellipsis, size: 42, color: c.text, tooltip: 'Ещё', onTap: _menu),
              const SizedBox(width: 4),
            ],
          ),
        ),
      ),
    );
  }

  /// Шапка режима выбора: закрыть, сколько выбрано, «в шаблон», переслать, удалить.
  Widget _selectHeader(BuildContext context, ChatController ctl) {
    final c = context.c;
    final list = ctl.picked;
    final canForward = list.isNotEmpty && list.every(ctl.canForward);
    final canRemove = list.isNotEmpty && list.every(ctl.canRemove);
    return Container(
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(bottom: BorderSide(color: c.border, width: 0.6)),
      ),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 60,
          child: Row(
            children: [
              RoundIconButton(icon: LucideIcons.x, size: 44, iconSize: 24, color: c.text, tooltip: 'Отменить выбор', onTap: ctl.clearSelect),
              Expanded(child: Text(list.isEmpty ? 'Выберите сообщения' : 'Выбрано: ${list.length}', style: AppText.headline(context))),
              RoundIconButton(
                icon: LucideIcons.zap,
                size: 44,
                iconSize: 22,
                color: ctl.pickedText.isNotEmpty ? c.text : c.textFaint,
                tooltip: 'В шаблон',
                onTap: ctl.pickedText.isNotEmpty ? _templateFromPicked : () => _toast('В выбранных нет текста'),
              ),
              RoundIconButton(
                icon: LucideIcons.forward,
                size: 44,
                iconSize: 22,
                color: canForward ? c.text : c.textFaint,
                tooltip: 'Переслать',
                onTap: canForward ? _forward : () => _toast(list.isEmpty ? null : 'Заметки пересылать нельзя'),
              ),
              RoundIconButton(
                icon: LucideIcons.trash2,
                size: 44,
                iconSize: 22,
                color: canRemove ? c.danger : c.textFaint,
                tooltip: 'Удалить',
                onTap: canRemove ? _deletePicked : () => _toast(list.isEmpty ? null : 'Удалить можно только свои сообщения за последние двое суток'),
              ),
              const SizedBox(width: 4),
            ],
          ),
        ),
      ),
    );
  }

  /// Сделка диалога, полоса бота и открытые счета: на каком этапе клиент и что ждёт оплаты.
  Widget _topBars(BuildContext context, ChatDetail d) {
    final c = context.c;
    final payable = d.invoices.where((i) => i.payable).toList();
    final hasBot = d.botLabel != null && d.botLabel!.isNotEmpty;
    if (d.deal == null && payable.isEmpty && !hasBot) return const SizedBox.shrink();
    return Container(
      color: c.bg,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Column(
        children: [
          if (hasBot)
            Padding(
              padding: EdgeInsets.only(bottom: d.deal != null || payable.isNotEmpty ? 6 : 0),
              child: GestureDetector(
                onTap: _botTraces,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: c.bubbleBot, borderRadius: BorderRadius.circular(12)),
                  child: Row(
                    children: [
                      Icon(LucideIcons.bot, size: 16, color: c.violet),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          d.botLabel!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 13.5, color: c.violet, fontWeight: FontWeight.w600),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text('Почему так?', style: TextStyle(fontSize: 12.5, color: c.violet, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              ),
            ),
          if (d.deal != null)
            GestureDetector(
              onTap: () => _openDeal(d),
              child: Container(
                padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
                decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    Container(
                      width: 9,
                      height: 9,
                      decoration: BoxDecoration(color: _hex(d.deal!.stageColor), shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '№${d.deal!.number} · ${d.deal!.stageName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: c.text),
                      ),
                    ),
                    if (d.deal!.amount > 0)
                      Text(
                        money(d.deal!.amount),
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.text),
                      ),
                    const SizedBox(width: 4),
                    Icon(LucideIcons.chevronRight, size: 17, color: c.textFaint),
                  ],
                ),
              ),
            ),
          for (final i in payable)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    Icon(LucideIcons.receipt, size: 16, color: c.warn),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        'Счёт ${i.label} · ${money(i.amount)} — ждёт оплаты до ${i.expiresLabel}',
                        style: TextStyle(fontSize: 13.5, color: c.warn, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Color _hex(String s) {
    final h = s.replaceAll('#', '');
    final v = int.tryParse(h.length == 6 ? 'FF$h' : h, radix: 16);
    return v == null ? Colors.grey : Color(v);
  }

  Widget _messages(BuildContext context, ChatController c, AuthState auth) {
    if (c.loading && c.detail == null) return const _MessagesSkeleton();
    if (c.error != null && c.detail == null) return EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть чат', hint: c.error, action: 'Повторить', onAction: c.load);
    final list = c.messages;
    if (list.isEmpty) return EmptyState(icon: LucideIcons.messageCircle, title: 'Сообщений пока нет', hint: 'Напишите первым — клиент получит ответ в ${c.detail?.channelLabel ?? 'чат'}');
    final reversed = list.reversed.toList();
    // Как в WhatsApp: прокрутка ленты и нажатие на пустое место закрывают клавиатуру.
    return ListView.builder(
      controller: _scroll,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      reverse: true,
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: const EdgeInsets.symmetric(vertical: 10),
      itemCount: reversed.length + (c.loadingOlder ? 1 : 0),
      itemBuilder: (_, i) {
        if (i == reversed.length) return const Padding(padding: EdgeInsets.all(14), child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))));
        final m = reversed[i];
        final older = i + 1 < reversed.length ? reversed[i + 1] : null;
        final newDay = older == null || !sameDay(older.at, m.at);
        // «Хвостик» — у первого сообщения серии: сменился отправитель, день или прошло больше пяти минут.
        final tail = newDay || older.outgoing != m.outgoing || older.internal || m.internal || m.at.difference(older.at).inMinutes >= 5;
        final key = _keys.putIfAbsent(m.id, () => GlobalKey());
        Widget bubble = MessageBubble(message: m, api: auth.api, tail: tail, onLongPress: () => c.selecting ? c.toggleSelect(m) : _messageMenu(m), onRetry: () => _retry(m), onQuoteTap: _scrollTo, onCartItems: c.orderItems, onBotTrace: _botTrace, myId: auth.staff?.id);
        // Идёт выбор: тап по любому месту сообщения отмечает его, плеер и ссылки внутри не срабатывают.
        if (c.selecting && c.isSelectable(m))
          bubble = _SelectRow(
            selected: c.selected!.contains(m.id),
            onTap: () => c.toggleSelect(m),
            child: AbsorbPointer(child: bubble),
          );
        bubble = KeyedSubtree(key: key, child: bubble);
        return newDay
            ? Column(
                children: [
                  _DayChip(label: dayLabel(m.at)),
                  bubble,
                ],
              )
            : bubble;
      },
    );
  }

  Widget _replyBar(BuildContext context, ChatController c) {
    final r = c.replyTo!;
    final t = context.c;
    return Container(
      color: t.bg,
      padding: const EdgeInsets.fromLTRB(14, 8, 6, 0),
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 8, 4, 8),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border(left: BorderSide(color: t.brandDeep, width: 4)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    r.outgoing ? (r.author ?? 'Вы') : 'Клиент',
                    style: TextStyle(fontWeight: FontWeight.w700, color: t.brandDeep, fontSize: 13),
                  ),
                  Text(
                    r.text.isEmpty ? '[${r.type}]' : r.text,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: t.textMuted, fontSize: 14.5),
                  ),
                ],
              ),
            ),
            RoundIconButton(icon: LucideIcons.x, size: 36, iconSize: 18, color: t.textMuted, onTap: () => c.setReply(null)),
          ],
        ),
      ),
    );
  }

  Widget _bottom(BuildContext context, ChatController c, ChatDetail d) {
    final t = context.c;
    if (d.sendBlocker != null || !d.perms.canReply) {
      final text = d.sendBlocker ?? (d.perms.mine ? 'Ответ недоступен' : 'Заявку распределяет круг — ответит менеджер, которому она достанется.');
      return Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: t.warnBg,
          border: Border(top: BorderSide(color: t.border, width: 0.6)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(LucideIcons.info, size: 18, color: t.warn),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    text,
                    style: TextStyle(fontSize: 14, color: t.warn, height: 1.3, fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return Composer(key: _composer, controller: c, templates: d.templates, onTemplates: _templates, onAttach: _attach, onCamera: _camera, onBlocked: _askReason);
  }
}

/// Строка ленты в режиме выбора: кружок слева и подсветка отмеченного.
class _SelectRow extends StatelessWidget {
  const _SelectRow({required this.selected, required this.onTap, required this.child});
  final bool selected;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        color: selected ? c.brandDeep.withValues(alpha: 0.18) : Colors.transparent,
        child: Stack(
          alignment: Alignment.centerLeft,
          children: [
            Padding(padding: const EdgeInsets.only(left: 34), child: child),
            Positioned(
              left: 10,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 120),
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: selected ? c.brandDeep : c.bg.withValues(alpha: 0.85),
                  border: Border.all(color: selected ? c.brandDeep : c.textFaint, width: 1.6),
                ),
                child: selected ? const Icon(LucideIcons.check, size: 14, color: Colors.white) : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Pick {
  _Pick(this.icon, this.label, this.colors, this.action);
  final IconData icon;
  final String label;
  final List<Color> colors;
  final VoidCallback action;
}

class _DayChip extends StatelessWidget {
  const _DayChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: c.surfaceRaised.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(10),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 1, offset: const Offset(0, 1))],
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 12.5, color: c.textMuted, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

class _DownButton extends StatelessWidget {
  const _DownButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: c.surfaceRaised,
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 10, offset: const Offset(0, 3))],
        ),
        child: Icon(LucideIcons.chevronDown, size: 22, color: c.textMuted),
      ),
    );
  }
}

class _MessagesSkeleton extends StatelessWidget {
  const _MessagesSkeleton();

  @override
  Widget build(BuildContext context) {
    final rows = [(false, 190.0), (false, 120.0), (true, 160.0), (false, 220.0), (true, 100.0), (true, 200.0)];
    return Shimmer(
      child: ListView(
        reverse: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(14),
        children: [
          for (final r in rows)
            Align(
              alignment: r.$1 ? Alignment.centerRight : Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: SkeletonBox(width: r.$2, height: 38, radius: 14),
              ),
            ),
        ],
      ),
    );
  }
}

/// Выбор товара каталога WhatsApp: поиск, фото, цена; «Весь каталог» — ссылка на каталог магазина.
class _CatalogPicker extends StatefulWidget {
  const _CatalogPicker({required this.ctrl, required this.api});
  final ChatController ctrl;
  final ApiClient api;

  @override
  State<_CatalogPicker> createState() => _CatalogPickerState();
}

class _CatalogPickerState extends State<_CatalogPicker> {
  List<CatalogItem>? _items;
  String? _error;
  String _q = '';

  @override
  void initState() {
    super.initState();
    widget.ctrl.catalog().then((r) {
      if (!mounted) return;
      setState(() {
        if (!r.enabled) {
          _error = 'Каталог в чатах выключен: CRM → «Интеграции» → «Мессенджеры» → «Каталог WhatsApp»';
        } else {
          _items = r.items;
        }
      });
    }, onError: (Object e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'Не удалось загрузить каталог');
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final t = _q.trim().toLowerCase();
    final shown = (_items ?? const <CatalogItem>[]).where((i) => t.isEmpty || i.name.toLowerCase().contains(t)).toList();
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.72,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: AppSearchField(hint: 'Название товара', onChanged: (v) => setState(() => _q = v)),
          ),
          GroupCard(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [GroupTile(title: 'Весь каталог — ссылкой', icon: LucideIcons.store, onTap: () => Navigator.pop(context, ''))],
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _error != null
                ? EmptyState(icon: LucideIcons.shoppingBag, title: 'Каталог недоступен', hint: _error)
                : _items == null
                ? const Center(child: CircularProgressIndicator())
                : shown.isEmpty
                ? EmptyState(icon: LucideIcons.searchX, title: _items!.isEmpty ? 'В каталоге нет товаров' : 'Ничего не нашлось')
                : GridView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.78),
                    itemCount: shown.length,
                    itemBuilder: (_, i) {
                      final p = shown[i];
                      final price = catalogPrice(p.price, p.currency);
                      return GestureDetector(
                        onTap: () => Navigator.pop(context, p.id),
                        child: Container(
                          clipBehavior: Clip.antiAlias,
                          decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Rd.md), border: Border.all(color: c.border)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: p.image
                                    ? Image.network(
                                        widget.api.mediaUrl('/api/admin/catalog/${p.id}/image')!,
                                        headers: widget.api.headers,
                                        width: double.infinity,
                                        fit: BoxFit.cover,
                                        cacheWidth: 400,
                                        errorBuilder: (_, _, _) => Center(child: Icon(LucideIcons.shoppingBag, color: c.textFaint, size: 30)),
                                      )
                                    : Container(color: c.surface, child: Center(child: Icon(LucideIcons.shoppingBag, color: c.textFaint, size: 30))),
                              ),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.text, height: 1.25)),
                                    if (price.isNotEmpty) Text(price, style: TextStyle(fontSize: 13, color: c.textMuted)),
                                    if (p.hidden) Text('скрыт в каталоге', style: TextStyle(fontSize: 11.5, color: c.warn)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

/// Лист «Почему так?» для одного ответа бота: что решила модель, что сделал код, уроки, база знаний, токены.
Future<void> showBotTraceSheet(BuildContext context, {required List<v1api.BotTraceRow> rows}) {
  return showAppSheet<void>(
    context,
    title: 'Почему так?',
    icon: LucideIcons.bot,
    full: true,
    builder: (sheet) => ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      children: [BotTraceRowsView(rows: rows)],
    ),
  );
}

/// Лист «Ходы бота («Почему так?»)» по диалогу: все недавние ходы, включая молчание и передачу менеджеру.
Future<void> showBotTracesSheet(BuildContext context, {required List<v1api.BotTraceItem> items}) {
  return showAppSheet<void>(
    context,
    title: 'Ходы бота («Почему так?»)',
    icon: LucideIcons.bot,
    full: true,
    builder: (sheet) {
      final c = sheet.c;
      if (items.isEmpty) {
        return const EmptyState(
          icon: LucideIcons.bot,
          title: 'Следов ходов пока нет',
          hint: 'Когда AI-продажник ответит или решит промолчать, здесь появится разбор его решения.',
        );
      }
      return ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          final item = items[i];
          final at = DateTime.tryParse(item.at)?.toLocal();
          return Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: c.surfaceRaised,
              borderRadius: BorderRadius.circular(Rd.md),
              border: Border.all(color: c.border, width: 0.7),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (item.silent)
                      Tag('Бот промолчал', fg: c.warn, bg: c.warnBg, icon: LucideIcons.volumeOff)
                    else
                      Tag('Ответ бота', fg: c.violet, bg: c.bubbleBot, icon: LucideIcons.bot),
                    const Spacer(),
                    if (at != null) Text('${dayLabel(at)} · ${hhmm(at)}', style: AppText.caption(context)),
                  ],
                ),
                const SizedBox(height: 10),
                BotTraceRowsView(rows: item.rows, flat: true),
              ],
            ),
          );
        },
      );
    },
  );
}

/// Строки следа хода AI-продажника (как BotTraceView на сайте): подпись, значения, выделение предупреждений.
class BotTraceRowsView extends StatelessWidget {
  const BotTraceRowsView({super.key, required this.rows, this.flat = false});
  final List<v1api.BotTraceRow> rows;
  final bool flat;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    if (rows.isEmpty) {
      return Text('Подробностей хода нет', style: AppText.sub(context));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final r in rows)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: flat ? EdgeInsets.zero : const EdgeInsets.all(12),
            decoration: flat
                ? null
                : BoxDecoration(
                    color: r.warn ? c.warnBg.withValues(alpha: 0.55) : c.surfaceRaised,
                    borderRadius: BorderRadius.circular(Rd.sm + 2),
                    border: Border.all(color: r.warn ? c.warn.withValues(alpha: 0.35) : c.border, width: 0.7),
                  ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (r.warn) ...[
                      Icon(LucideIcons.triangleAlert, size: 13.5, color: c.warn),
                      const SizedBox(width: 5),
                    ],
                    Expanded(
                      child: Text(
                        r.label,
                        style: AppText.caption(context).copyWith(fontWeight: FontWeight.w700, color: r.warn ? c.warn : c.textMuted),
                      ),
                    ),
                  ],
                ),
                for (final line in r.lines)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: SelectableText(
                      line,
                      style: TextStyle(fontSize: 14, height: 1.38, color: r.warn ? c.warn : c.text),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
