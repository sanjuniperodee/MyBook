import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'tokens.dart';

const _gradients = [
  [Color(0xFFFF8A65), Color(0xFFE5484D)],
  [Color(0xFFB794F4), Color(0xFF6D4AFF)],
  [Color(0xFF63B3ED), Color(0xFF2B6CB0)],
  [Color(0xFF4FD1C5), Color(0xFF0F8F7E)],
  [Color(0xFFF6AD55), Color(0xFFC05621)],
  [Color(0xFFF687B3), Color(0xFFB83280)],
  [Color(0xFF9AE6B4), Color(0xFF2F855A)],
  [Color(0xFFA0AEC0), Color(0xFF4A5568)],
];

IconData channelIcon(String channel) => switch (channel) {
      'instagram' => LucideIcons.camera,
      'telegram' => LucideIcons.send,
      'email' => LucideIcons.mail,
      'site' => LucideIcons.globe,
      _ => LucideIcons.messageCircle,
    };

/// Круглый аватар: фото контакта или буква на градиенте (цвет зависит от имени); у не-WhatsApp каналов — значок канала.
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
    final g = _gradients[trimmed.runes.fold<int>(0, (a, b) => a + b) % _gradients.length];
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: g, begin: Alignment.topLeft, end: Alignment.bottomRight)),
      child: Text(letter, style: TextStyle(color: Colors.white, fontSize: size * 0.4, fontWeight: FontWeight.w600)),
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
