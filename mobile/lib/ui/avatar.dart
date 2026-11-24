import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'tokens.dart';

/// Тона инициалов — как у аватаров CRM (ChatAvatar.tsx): фон и цвет буквы из палитры (rose/wine, success, info, warning, sunken).
List<(Color, Color)> _tones(AppColors c) => [(c.bubbleOut, c.brand), (c.success.withValues(alpha: 0.16), c.success), (c.violetBg, c.violet), (c.warnBg, c.warn), (c.surface, c.textMuted)];

IconData channelIcon(String channel) => switch (channel) {
      'instagram' => LucideIcons.camera,
      'telegram' => LucideIcons.send,
      'email' => LucideIcons.mail,
      'site' => LucideIcons.globe,
      _ => LucideIcons.messageCircle,
    };

/// Круглый аватар: фото контакта или буква на тоне палитры CRM (тон зависит от имени); у не-WhatsApp каналов — значок канала.
class AppAvatar extends StatelessWidget {
  const AppAvatar({super.key, required this.name, this.url, this.size = 54, this.channel});
  final String name;
  final String? url;
  final double size;
  final String? channel;

  @override
  Widget build(BuildContext context) {
    final trimmed = name.trim();
    final letter = trimmed.isEmpty ? '?' : String.fromCharCode(trimmed.runes.first).toUpperCase();
    final tones = _tones(context.c);
    final (bg, fg) = tones[trimmed.runes.fold<int>(0, (a, b) => a + b) % tones.length];
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(shape: BoxShape.circle, color: bg),
      child: Text(letter, style: TextStyle(color: fg, fontSize: size * 0.4, fontWeight: FontWeight.w600)),
    );
    final face = url == null || url!.isEmpty
        ? fallback
        : ClipOval(child: Image.network(url!, width: size, height: size, fit: BoxFit.cover, errorBuilder: (_, _, _) => fallback, loadingBuilder: (_, child, p) => p == null ? child : fallback));
    if (channel == null || channel == 'whatsapp') return face;
    final c = context.c;
    return SizedBox(
      width: size,
      height: size,
      child: Stack(clipBehavior: Clip.none, children: [
        face,
        Positioned(
          right: -2,
          bottom: -2,
          child: Container(
            width: size * 0.36,
            height: size * 0.36,
            decoration: BoxDecoration(color: c.surfaceRaised, shape: BoxShape.circle, border: Border.all(color: c.bg, width: 2)),
            child: Icon(channelIcon(channel!), size: size * 0.2, color: c.brandDeep),
          ),
        ),
      ]),
    );
  }
}
