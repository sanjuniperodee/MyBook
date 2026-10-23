import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../models/chat.dart';
import '../ui/tokens.dart';
import 'voice_player.dart';

/// Контур пузыря с «хвостиком» у первого сообщения серии, как в WhatsApp.
class BubbleBorder extends ShapeBorder {
  const BubbleBorder({required this.outgoing, required this.tail});
  final bool outgoing;
  final bool tail;

  static const _r = 14.0;
  static const _small = 4.0;
  static const tailWidth = 8.0;

  @override
  EdgeInsetsGeometry get dimensions => EdgeInsets.zero;

  @override
  Path getInnerPath(Rect rect, {TextDirection? textDirection}) => getOuterPath(rect, textDirection: textDirection);

  @override
  Path getOuterPath(Rect rect, {TextDirection? textDirection}) {
    final topLeft = !outgoing && tail ? _small : _r;
    final topRight = outgoing && tail ? _small : _r;
    final base = Path()..addRRect(RRect.fromRectAndCorners(rect, topLeft: Radius.circular(topLeft), topRight: Radius.circular(topRight), bottomLeft: const Radius.circular(_r), bottomRight: const Radius.circular(_r)));
    if (!tail) return base;
    final t = Path();
    if (outgoing) {
      t
        ..moveTo(rect.right - 2, rect.top)
        ..lineTo(rect.right + tailWidth, rect.top)
        ..quadraticBezierTo(rect.right + 1.5, rect.top + 1.5, rect.right, rect.top + 11)
        ..close();
    } else {
      t
        ..moveTo(rect.left + 2, rect.top)
        ..lineTo(rect.left - tailWidth, rect.top)
        ..quadraticBezierTo(rect.left - 1.5, rect.top + 1.5, rect.left, rect.top + 11)
        ..close();
    }
    return Path.combine(PathOperation.union, base, t);
  }

  @override
  void paint(Canvas canvas, Rect rect, {TextDirection? textDirection}) {}

  @override
  ShapeBorder scale(double t) => this;
}

/// Пузырь сообщения: цитата, вложение, текст, время и галочки доставки.
class MessageBubble extends StatelessWidget {
  const MessageBubble({super.key, required this.message, required this.api, required this.tail, required this.onLongPress, required this.onRetry, required this.onQuoteTap});
  final Message message;
  final ApiClient api;
  final bool tail;
  final VoidCallback onLongPress;
  final VoidCallback onRetry;
  final void Function(String id) onQuoteTap;

  @override
  Widget build(BuildContext context) {
    final m = message;
    if (m.internal) return _Note(message: m, onLongPress: onLongPress);
    final c = context.c;
    final out = m.outgoing;
    final width = MediaQuery.of(context).size.width;
    final imageOnly = m.type == 'image' && m.text.isEmpty && m.replyTo == null;
    return Align(
      alignment: out ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: onLongPress,
        child: Container(
          constraints: BoxConstraints(maxWidth: width * 0.8),
          margin: EdgeInsets.only(left: out ? 56 : 14 + (tail ? 0 : BubbleBorder.tailWidth), right: out ? 14 + (tail ? 0 : BubbleBorder.tailWidth) : 56, top: tail ? 7 : 1.5, bottom: 1.5),
          decoration: ShapeDecoration(color: out ? c.bubbleOut : c.bubbleIn, shape: BubbleBorder(outgoing: out, tail: tail), shadows: [BoxShadow(color: Colors.black.withValues(alpha: 0.07), blurRadius: 0.8, offset: const Offset(0, 0.8))]),
          padding: EdgeInsets.fromLTRB(imageOnly ? 3 : 10, imageOnly ? 3 : 6, imageOnly ? 3 : 10, imageOnly ? 3 : 5),
          child: _content(context, imageOnly),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, bool imageOnly) {
    final m = message;
    final c = context.c;
    if (m.deleted) return _textMeta(context, 'Сообщение удалено', italic: true, icon: LucideIcons.ban);
    final children = <Widget>[];
    if (m.outgoing && m.author != null && m.author!.isNotEmpty) {
      children.add(Padding(padding: const EdgeInsets.only(bottom: 2), child: Text(m.author!, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: c.brandDeep))));
    }
    if (m.forwarded) children.add(Padding(padding: const EdgeInsets.only(bottom: 3), child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(LucideIcons.forward, size: 13, color: c.textFaint), const SizedBox(width: 4), Text('Пересланное', style: TextStyle(fontSize: 12.5, fontStyle: FontStyle.italic, color: c.textFaint))])));
    if (m.replyTo != null) children.add(_Quote(quote: m.replyTo!, onTap: () => onQuoteTap(m.replyTo!.id)));
    final attachment = _attachment(context, imageOnly);
    if (attachment != null) children.add(attachment);
    final hasText = m.type == 'text' ? m.text.isNotEmpty : (m.type == 'document' ? false : m.text.isNotEmpty && !_placeholder(m.text));
    if (hasText) {
      children.add(_textMeta(context, m.text));
    } else if (!imageOnly) {
      children.add(Align(alignment: Alignment.centerRight, child: _Meta(message: m)));
    }
    if (m.transcript != null && m.transcript!.isNotEmpty) {
      children.insert(children.length - 1, Padding(padding: const EdgeInsets.only(top: 4, bottom: 2), child: Text(m.transcript!, style: TextStyle(fontSize: 14.5, height: 1.3, fontStyle: FontStyle.italic, color: c.textMuted))));
    }
    if (m.isFailed && m.error != null) {
      children.add(Padding(
        padding: const EdgeInsets.only(top: 3),
        child: GestureDetector(onTap: onRetry, child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(LucideIcons.rotateCw, size: 13, color: c.danger), const SizedBox(width: 5), Flexible(child: Text('${m.error} · повторить', style: TextStyle(fontSize: 12.5, color: c.danger)))])),
      ));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: children);
  }

  /// Ширина картинки в пикселях экрана: фото из WhatsApp в 2–4 Мп декодируются сразу в размер пузыря, а не целиком.
  int _px(BuildContext context, double logical) => (logical * MediaQuery.devicePixelRatioOf(context)).round();

  bool _placeholder(String t) => RegExp(r'^[🎤🎬📷📎🖼️🎵\s]*(Голосовое|Видео|Фото|Файл|Аудио|Документ|Изображение)').hasMatch(t) && t.length < 24;

  Widget? _attachment(BuildContext context, bool imageOnly) {
    final m = message;
    final c = context.c;
    final url = api.mediaUrl(m.media);
    switch (m.type) {
      case 'image':
        final Widget? image = m.localPath != null
            ? Image.file(File(m.localPath!), width: 250, cacheWidth: _px(context, 250), fit: BoxFit.cover)
            : url == null
                ? null
                : Image.network(url, headers: api.headers, width: 250, cacheWidth: _px(context, 250), fit: BoxFit.cover, errorBuilder: (_, _, _) => _tile(context, LucideIcons.imageOff, 'Фото недоступно'), loadingBuilder: (_, child, p) => p == null ? child : SizedBox(width: 250, height: 170, child: Center(child: CircularProgressIndicator(strokeWidth: 2, color: c.brand))));
        if (image == null) return _tile(context, LucideIcons.image, 'Фото');
        return Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Stack(children: [
            GestureDetector(onTap: () => _viewImage(context, url, m.localPath), child: ClipRRect(borderRadius: BorderRadius.circular(imageOnly ? 12 : 9), child: image)),
            if (imageOnly)
              Positioned(
                right: 6,
                bottom: 6,
                child: Container(padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3), decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(10)), child: _Meta(message: m, onImage: true)),
              ),
          ]),
        );
      case 'audio':
        final audioUrl = m.localPath == null && !m.id.startsWith('local-') ? api.mediaUrl('/api/mobile/chats/messages/${m.id}/audio') : null;
        return Padding(padding: const EdgeInsets.only(bottom: 2), child: VoicePlayer(seed: m.id, url: audioUrl, file: m.localPath, headers: api.headers, knownDuration: m.durationMs == null ? null : Duration(milliseconds: m.durationMs!), outgoing: m.outgoing));
      case 'video':
        return _tile(context, LucideIcons.circlePlay, 'Видео', trailing: LucideIcons.download, onTap: url == null ? null : () => _openFile(context, url, 'video.mp4'));
      case 'document':
        final name = m.text.isNotEmpty ? m.text : 'Файл';
        return _tile(context, LucideIcons.fileText, name, trailing: LucideIcons.download, onTap: url == null ? null : () => _openFile(context, url, name));
      case 'text':
        return null;
      default:
        return _tile(context, LucideIcons.paperclip, m.text.isEmpty ? 'Вложение' : m.text, onTap: url == null ? null : () => _openFile(context, url, 'file'));
    }
  }

  Widget _tile(BuildContext context, IconData icon, String label, {IconData? trailing, VoidCallback? onTap}) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: Colors.black.withValues(alpha: context.isDark ? 0.22 : 0.05), borderRadius: BorderRadius.circular(10)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 38, height: 38, decoration: BoxDecoration(color: c.brand.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(10)), child: Icon(icon, size: 20, color: c.brandDeep)),
            const SizedBox(width: 10),
            Flexible(child: Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: c.text))),
            if (trailing != null) ...[const SizedBox(width: 10), Icon(trailing, size: 18, color: c.textFaint)],
          ]),
        ),
      ),
    );
  }

  /// Текст, а время и галочки — в правом нижнем углу: место под них резервируется в последней строке.
  Widget _textMeta(BuildContext context, String text, {bool italic = false, IconData? icon}) {
    final c = context.c;
    final style = TextStyle(fontSize: 16.5, height: 1.28, fontStyle: italic ? FontStyle.italic : FontStyle.normal, color: italic ? c.textMuted : c.text, letterSpacing: -0.15);
    final reserve = message.outgoing ? 76.0 : 44.0;
    return Stack(children: [
      Text.rich(TextSpan(children: [
        if (icon != null) WidgetSpan(alignment: PlaceholderAlignment.middle, child: Padding(padding: const EdgeInsets.only(right: 6), child: Icon(icon, size: 15, color: c.textFaint))),
        TextSpan(text: text, style: style),
        WidgetSpan(child: SizedBox(width: reserve, height: 14)),
      ])),
      Positioned(right: 0, bottom: 0, child: _Meta(message: message)),
    ]);
  }

  Future<void> _viewImage(BuildContext context, String? url, String? file) async {
    await Navigator.of(context).push(PageRouteBuilder<void>(
      opaque: false,
      barrierColor: Colors.black,
      pageBuilder: (_, _, _) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white, elevation: 0, leading: IconButton(icon: const Icon(LucideIcons.x), onPressed: () => Navigator.pop(context))),
        body: Center(child: InteractiveViewer(maxScale: 5, child: file != null ? Image.file(File(file)) : Image.network(url!, headers: api.headers))),
      ),
    ));
  }

  Future<void> _openFile(BuildContext context, String url, String name) async {
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(const SnackBar(content: Text('Скачиваем файл…'), duration: Duration(seconds: 2)));
    try {
      final bytes = await api.download(url);
      final dir = await getTemporaryDirectory();
      final safe = name.replaceAll(RegExp(r'[^\w.\-а-яА-Я ]'), '_');
      final f = File('${dir.path}/${DateTime.now().millisecondsSinceEpoch}_$safe');
      await f.writeAsBytes(bytes);
      if (context.mounted) await SharePlus.instance.share(ShareParams(files: [XFile(f.path)], sharePositionOrigin: const Rect.fromLTWH(0, 0, 1, 1)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.message, this.onImage = false});
  final Message message;
  final bool onImage;

  @override
  Widget build(BuildContext context) {
    final m = message;
    final c = context.c;
    final muted = onImage ? Colors.white : c.textFaint;
    Widget? tick;
    if (m.outgoing) {
      if (m.isPending) {
        tick = Icon(LucideIcons.clock, size: 12, color: muted);
      } else if (m.isFailed) {
        tick = Icon(LucideIcons.circleAlert, size: 14, color: c.danger);
      } else if (m.status == 'read') {
        tick = Icon(LucideIcons.checkCheck, size: 16, color: onImage ? const Color(0xFF7DD3FC) : c.tickRead);
      } else if (m.status == 'delivered') {
        tick = Icon(LucideIcons.checkCheck, size: 16, color: muted);
      } else {
        tick = Icon(LucideIcons.check, size: 15, color: muted);
      }
    }
    return Row(mainAxisSize: MainAxisSize.min, children: [
      if (m.edited) Text('изменено  ', style: TextStyle(fontSize: 11, color: muted)),
      Text(hhmm(m.at), style: TextStyle(fontSize: 11, color: muted, fontWeight: FontWeight.w500)),
      if (tick != null) ...[const SizedBox(width: 3), tick],
    ]);
  }
}

class _Quote extends StatelessWidget {
  const _Quote({required this.quote, required this.onTap});
  final ReplyQuote quote;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final label = quote.outgoing ? (quote.author ?? 'Вы') : 'Клиент';
    final accent = quote.outgoing ? c.brandDeep : c.violet;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 5),
        padding: const EdgeInsets.fromLTRB(9, 5, 9, 5),
        decoration: BoxDecoration(color: Colors.black.withValues(alpha: context.isDark ? 0.2 : 0.055), borderRadius: BorderRadius.circular(8), border: Border(left: BorderSide(color: accent, width: 3.5))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: accent)),
          Text(quote.text.isEmpty ? '[${quote.type}]' : quote.text, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, color: c.textMuted)),
        ]),
      ),
    );
  }
}

/// Внутренняя заметка сотрудника: по центру, жёлтая — клиент её не видит.
class _Note extends StatelessWidget {
  const _Note({required this.message, required this.onLongPress});
  final Message message;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Center(
      child: GestureDetector(
        onLongPress: onLongPress,
        child: Container(
          constraints: BoxConstraints(maxWidth: min(MediaQuery.of(context).size.width * 0.86, 420)),
          margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
          padding: const EdgeInsets.fromLTRB(12, 9, 12, 7),
          decoration: BoxDecoration(color: c.note, borderRadius: BorderRadius.circular(12), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 1, offset: const Offset(0, 1))]),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(LucideIcons.lock, size: 13, color: c.textMuted),
              const SizedBox(width: 5),
              Flexible(child: Text('Заметка для коллег${message.author != null && message.author != '—' ? ' · ${message.author}' : ''}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c.textMuted))),
            ]),
            const SizedBox(height: 4),
            Text(message.text, style: TextStyle(fontSize: 15.5, height: 1.3, color: c.text)),
            Align(alignment: Alignment.centerRight, child: Text(hhmm(message.at), style: TextStyle(fontSize: 11, color: c.textMuted))),
          ]),
        ),
      ),
    );
  }
}
