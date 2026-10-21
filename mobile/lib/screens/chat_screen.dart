import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/auth.dart';
import '../core/chat_controller.dart';
import '../core/chats_store.dart';
import '../core/format.dart';
import '../core/live.dart';
import '../core/notifier.dart';
import '../models/chat.dart';
import '../ui/avatar.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../ui/wallpaper.dart';
import '../widgets/composer.dart';
import '../widgets/message_bubble.dart';
import 'deal_screen.dart';
import 'invoice_sheet.dart';
import 'templates_sheet.dart';

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
  int _lastIncoming = 0;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthState>();
    _notifier = context.read<Notifier>()..openChatId = widget.chatId;
    ctrl = ChatController(api: auth.api, live: context.read<LiveService>(), chatId: widget.chatId);
    ctrl.load().then((_) async {
      await ctrl.markRead();
      if (mounted) context.read<ChatsStore>().markRead(widget.chatId);
    });
    ctrl.addListener(_autoRead);
    _scroll.addListener(() {
      final far = _scroll.hasClients && _scroll.offset > 420;
      if (far != _showDown) setState(() => _showDown = far);
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
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Container(
                      width: 62,
                      height: 62,
                      decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), gradient: LinearGradient(colors: it.colors, begin: Alignment.topLeft, end: Alignment.bottomRight)),
                      child: Icon(it.icon, color: Colors.white, size: 28),
                    ),
                    const SizedBox(height: 8),
                    Text(it.label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: context.c.text)),
                  ]),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickDocuments() async {
    final picked = await FilePicker.pickFiles();
    final files = [for (final f in picked) if (f.path != null) File(f.path!)];
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
    final t = await pickTemplate(context, d.templates);
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
          builder: (sheet) => GroupCard(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            GroupTile(title: 'Отправить ещё раз', icon: LucideIcons.rotateCw, onTap: () => Navigator.pop(sheet, 'retry')),
            GroupTile(title: 'Удалить', icon: LucideIcons.trash2, destructive: true, onTap: () => Navigator.pop(sheet, 'drop')),
          ]),
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
        child: GroupCard(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
          if (d.perms.canReply && !m.deleted && !m.internal) GroupTile(title: 'Ответить', icon: LucideIcons.reply, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'reply')),
          if (m.text.isNotEmpty) GroupTile(title: 'Копировать', icon: LucideIcons.copy, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'copy')),
          if (m.type == 'audio' && !m.deleted) GroupTile(title: m.transcript == null ? 'Расшифровать голосовое' : 'Обновить расшифровку', icon: LucideIcons.captions, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'transcribe')),
          if (mine && m.type == 'text' && recent && !m.deleted) GroupTile(title: 'Изменить', icon: LucideIcons.pencil, trailing: const SizedBox.shrink(), onTap: () => Navigator.pop(sheet, 'edit')),
          if (mine && !m.deleted) GroupTile(title: 'Удалить у всех', icon: LucideIcons.trash2, destructive: true, onTap: () => Navigator.pop(sheet, 'delete')),
        ]),
      ),
    );
    switch (action) {
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
      case 'delete':
        if (!mounted) return;
        final yes = await confirm(context, title: 'Удалить у всех?', message: 'Клиент увидит «Сообщение удалено».', ok: 'Удалить', destructive: true);
        if (yes) _toast(await ctrl.remove(m));
    }
  }

  Future<void> _retry(Message m) async {
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

  void _scrollTo(String id) {
    final ctx = _keys[id]?.currentContext;
    if (ctx != null) Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 300), alignment: 0.5);
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
        child: GroupCard(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
          if (d.dealId == null && d.perms.canCreateDeal) GroupTile(title: 'Завести сделку', icon: LucideIcons.handshake, onTap: () => Navigator.pop(sheet, 'deal')),
          if (d.perms.canNote) GroupTile(title: 'Заметка для коллег', icon: LucideIcons.stickyNote, onTap: () => Navigator.pop(sheet, 'note')),
          if (d.status == 'open' && d.perms.canReply) GroupTile(title: 'Закрыть диалог', icon: LucideIcons.circleCheck, onTap: () => Navigator.pop(sheet, 'close')),
          if (d.status == 'closed' && d.perms.canReply) GroupTile(title: 'Открыть снова', icon: LucideIcons.rotateCcw, onTap: () => Navigator.pop(sheet, 'open')),
          GroupTile(title: 'Обновить', icon: LucideIcons.refreshCw, onTap: () => Navigator.pop(sheet, 'refresh')),
        ]),
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
      case 'refresh':
        await ctrl.load();
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
          return Scaffold(
            backgroundColor: c.bg,
            body: Column(children: [
              _header(context, d),
              if (d != null) _topBars(context, d),
              Expanded(
                child: ChatWallpaper(
                  child: Stack(children: [
                    Positioned.fill(child: _messages(context, ctl, auth)),
                    Positioned(right: 14, bottom: 12, child: AnimatedScale(scale: _showDown ? 1 : 0, duration: const Duration(milliseconds: 160), child: _DownButton(onTap: () => _scroll.animateTo(0, duration: const Duration(milliseconds: 320), curve: Curves.easeOutCubic)))),
                  ]),
                ),
              ),
              if (ctl.replyTo != null) _replyBar(context, ctl),
              if (d != null) _bottom(context, ctl, d),
            ]),
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
      decoration: BoxDecoration(color: c.bg, border: Border(bottom: BorderSide(color: c.border, width: 0.6))),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 60,
          child: Row(children: [
            RoundIconButton(icon: LucideIcons.chevronLeft, size: 44, iconSize: 28, color: c.brandDeep, onTap: () => Navigator.of(context).maybePop()),
            AppAvatar(name: title, url: d?.avatarUrl ?? widget.avatarUrl, size: 38, channel: widget.channel),
            const SizedBox(width: 10),
            Expanded(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headline(context)),
                if (subtitle.isNotEmpty) Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption(context).copyWith(fontSize: 13)),
              ]),
            ),
            if (d?.deal != null) RoundIconButton(icon: LucideIcons.handshake, size: 42, color: c.text, tooltip: 'Сделка', onTap: () => _openDeal(d!)),
            RoundIconButton(icon: LucideIcons.ellipsis, size: 42, color: c.text, tooltip: 'Ещё', onTap: _menu),
            const SizedBox(width: 4),
          ]),
        ),
      ),
    );
  }

  /// Сделка диалога и открытые счета: на каком этапе клиент и что ждёт оплаты.
  Widget _topBars(BuildContext context, ChatDetail d) {
    final c = context.c;
    final payable = d.invoices.where((i) => i.payable).toList();
    if (d.deal == null && payable.isEmpty) return const SizedBox.shrink();
    return Container(
      color: c.bg,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Column(children: [
        if (d.deal != null)
          GestureDetector(
            onTap: () => _openDeal(d),
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
              decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                Container(width: 9, height: 9, decoration: BoxDecoration(color: _hex(d.deal!.stageColor), shape: BoxShape.circle)),
                const SizedBox(width: 10),
                Expanded(child: Text('№${d.deal!.number} · ${d.deal!.stageName}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: c.text))),
                if (d.deal!.amount > 0) Text(money(d.deal!.amount), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.text)),
                const SizedBox(width: 4),
                Icon(LucideIcons.chevronRight, size: 17, color: c.textFaint),
              ]),
            ),
          ),
        for (final i in payable)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                Icon(LucideIcons.receipt, size: 16, color: c.warn),
                const SizedBox(width: 9),
                Expanded(child: Text('Счёт ${i.label} · ${money(i.amount)} — ждёт оплаты до ${i.expiresLabel}', style: TextStyle(fontSize: 13.5, color: c.warn, fontWeight: FontWeight.w600))),
              ]),
            ),
          ),
      ]),
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
    return ListView.builder(
      controller: _scroll,
      reverse: true,
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(vertical: 10),
      itemCount: reversed.length,
      itemBuilder: (_, i) {
        final m = reversed[i];
        final older = i + 1 < reversed.length ? reversed[i + 1] : null;
        final newDay = older == null || !sameDay(older.at, m.at);
        // «Хвостик» — у первого сообщения серии: сменился отправитель, день или прошло больше пяти минут.
        final tail = newDay || older.outgoing != m.outgoing || older.internal || m.internal || m.at.difference(older.at).inMinutes >= 5;
        final key = _keys.putIfAbsent(m.id, () => GlobalKey());
        final bubble = KeyedSubtree(key: key, child: MessageBubble(message: m, api: auth.api, tail: tail, onLongPress: () => _messageMenu(m), onRetry: () => _retry(m), onQuoteTap: _scrollTo));
        return newDay ? Column(children: [_DayChip(label: dayLabel(m.at)), bubble]) : bubble;
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
        decoration: BoxDecoration(color: t.surface, borderRadius: BorderRadius.circular(12), border: Border(left: BorderSide(color: t.brandDeep, width: 4))),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.outgoing ? (r.author ?? 'Вы') : 'Клиент', style: TextStyle(fontWeight: FontWeight.w700, color: t.brandDeep, fontSize: 13)),
              Text(r.text.isEmpty ? '[${r.type}]' : r.text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.textMuted, fontSize: 14.5)),
            ]),
          ),
          RoundIconButton(icon: LucideIcons.x, size: 36, iconSize: 18, color: t.textMuted, onTap: () => c.setReply(null)),
        ]),
      ),
    );
  }

  Widget _bottom(BuildContext context, ChatController c, ChatDetail d) {
    final t = context.c;
    if (d.sendBlocker != null || !d.perms.canReply) {
      final text = d.sendBlocker ?? (d.perms.mine ? 'Ответ недоступен' : 'Заявку распределяет круг — ответит менеджер, которому она достанется.');
      return Container(
        width: double.infinity,
        decoration: BoxDecoration(color: t.warnBg, border: Border(top: BorderSide(color: t.border, width: 0.6))),
        child: SafeArea(
          top: false,
          child: Padding(padding: const EdgeInsets.all(14), child: Row(children: [Icon(LucideIcons.info, size: 18, color: t.warn), const SizedBox(width: 10), Expanded(child: Text(text, style: TextStyle(fontSize: 14, color: t.warn, height: 1.3, fontWeight: FontWeight.w500)))])),
        ),
      );
    }
    return Composer(key: _composer, controller: c, onTemplates: _templates, onAttach: _attach, onCamera: _camera, onBlocked: _askReason);
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
        decoration: BoxDecoration(color: c.surfaceRaised.withValues(alpha: 0.92), borderRadius: BorderRadius.circular(10), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 1, offset: const Offset(0, 1))]),
        child: Text(label, style: TextStyle(fontSize: 12.5, color: c.textMuted, fontWeight: FontWeight.w600)),
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
        decoration: BoxDecoration(color: c.surfaceRaised, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 10, offset: const Offset(0, 3))]),
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
            Align(alignment: r.$1 ? Alignment.centerRight : Alignment.centerLeft, child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: SkeletonBox(width: r.$2, height: 38, radius: 14))),
        ],
      ),
    );
  }
}
