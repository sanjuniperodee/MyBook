import 'dart:math';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'tokens.dart';

/// Обои переписки: спокойный фон с едва заметным узором из книжных значков — вместо плоской заливки.
class ChatWallpaper extends StatelessWidget {
  const ChatWallpaper({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return ColoredBox(
      color: c.wallpaper,
      child: CustomPaint(
        painter: _PatternPainter(ink: c.wallpaperInk.withValues(alpha: context.isDark ? 0.07 : 0.11)),
        child: child,
      ),
    );
  }
}

const _glyphs = [LucideIcons.bookOpen, LucideIcons.heart, LucideIcons.star, LucideIcons.coffee, LucideIcons.gift, LucideIcons.feather, LucideIcons.sparkles, LucideIcons.bookmark, LucideIcons.penLine, LucideIcons.flower2, LucideIcons.cake, LucideIcons.camera];

class _PatternPainter extends CustomPainter {
  _PatternPainter({required this.ink});
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    const cell = 74.0;
    final rnd = Random(7);
    var row = 0;
    for (double y = 18; y < size.height + cell; y += cell) {
      for (double x = (row.isEven ? 10 : 10 + cell / 2); x < size.width + cell; x += cell) {
        final icon = _glyphs[rnd.nextInt(_glyphs.length)];
        final tp = TextPainter(
          text: TextSpan(text: String.fromCharCode(icon.codePoint), style: TextStyle(fontFamily: icon.fontFamily, package: icon.fontPackage, fontSize: 22 + rnd.nextInt(6).toDouble(), color: ink)),
          textDirection: TextDirection.ltr,
        )..layout();
        canvas.save();
        canvas.translate(x + rnd.nextInt(12), y + rnd.nextInt(12));
        canvas.rotate((rnd.nextDouble() - 0.5) * 0.7);
        tp.paint(canvas, Offset.zero);
        canvas.restore();
      }
      row++;
    }
  }

  @override
  bool shouldRepaint(_PatternPainter old) => old.ink != ink;
}
