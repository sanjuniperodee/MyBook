import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/format.dart';
import '../ui/tokens.dart';

/// Одновременно играет одно голосовое: запуск нового останавливает прежнее, как в WhatsApp.
class _Single {
  static AudioPlayer? current;
}

/// Голосовое сообщение: кнопка «играть», полоса прогресса со смещением, длительность и скорость 1×/1.5×/2×.
class VoicePlayer extends StatefulWidget {
  const VoicePlayer({super.key, required this.seed, this.url, this.headers, this.file, this.knownDuration, required this.outgoing});
  final String seed;
  final String? url;
  final Map<String, String>? headers;
  final String? file;
  final Duration? knownDuration;
  final bool outgoing;

  @override
  State<VoicePlayer> createState() => _VoicePlayerState();
}

class _VoicePlayerState extends State<VoicePlayer> {
  AudioPlayer? _player;
  StreamSubscription<PlayerState>? _stateSub;
  bool _loading = false;
  bool _failed = false;
  double _speed = 1;

  Future<AudioPlayer> _ensure() async {
    if (_player != null) return _player!;
    final p = AudioPlayer();
    _player = p;
    _stateSub = p.playerStateStream.listen((s) {
      if (s.processingState == ProcessingState.completed) {
        p.pause();
        p.seek(Duration.zero);
      }
      if (mounted) setState(() {});
    });
    final source = widget.file != null ? AudioSource.file(widget.file!) : AudioSource.uri(Uri.parse(widget.url!), headers: widget.headers);
    await p.setAudioSource(source);
    return p;
  }

  Future<void> _toggle() async {
    if (_loading) return;
    try {
      setState(() {
        _loading = true;
        _failed = false;
      });
      final p = await _ensure();
      if (!mounted) return;
      setState(() => _loading = false);
      if (p.playing) {
        await p.pause();
      } else {
        if (_Single.current != null && _Single.current != p) await _Single.current!.pause();
        _Single.current = p;
        await p.setSpeed(_speed);
        // play() завершается, когда проигрыш закончен, — не ждём.
        unawaited(p.play());
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _failed = true;
        });
      }
      _player?.dispose();
      _player = null;
    }
  }

  Future<void> _cycleSpeed() async {
    _speed = _speed == 1 ? 1.5 : (_speed == 1.5 ? 2 : 1);
    await _player?.setSpeed(_speed);
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _stateSub?.cancel();
    if (_Single.current == _player) _Single.current = null;
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = _player;
    final playing = p?.playing ?? false;
    final c = context.c;
    final accent = widget.outgoing ? c.brandDeep : c.textMuted;
    final bars = _bars(widget.seed);
    return SizedBox(
      width: 236,
      child: Row(children: [
        GestureDetector(
          onTap: _toggle,
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: _failed ? c.danger : accent, shape: BoxShape.circle),
            child: _loading
                ? const Padding(padding: EdgeInsets.all(11), child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                : Icon(_failed ? LucideIcons.refreshCw : (playing ? LucideIcons.pause : LucideIcons.play), size: 18, color: Colors.white),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: StreamBuilder<Duration>(
            stream: p?.positionStream,
            builder: (_, snap) {
              final total = p?.duration ?? widget.knownDuration ?? Duration.zero;
              final pos = snap.data ?? Duration.zero;
              final value = total.inMilliseconds == 0 ? 0.0 : (pos.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);
              return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onHorizontalDragUpdate: p == null || total == Duration.zero ? null : (d) => _seekBy(d.localPosition.dx, total),
                  onTapDown: p == null || total == Duration.zero ? null : (d) => _seekBy(d.localPosition.dx, total),
                  child: LayoutBuilder(
                    builder: (_, box) {
                      _barsWidth = box.maxWidth;
                      return SizedBox(
                        height: 28,
                        child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                          for (var i = 0; i < bars.length; i++)
                            Expanded(
                              child: Center(
                                child: Container(
                                  width: 2.4,
                                  height: 5 + bars[i] * 20,
                                  decoration: BoxDecoration(color: i / bars.length <= value ? accent : c.textFaint.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(2)),
                                ),
                              ),
                            ),
                        ]),
                      );
                    },
                  ),
                ),
                Row(children: [
                  Text(total == Duration.zero && pos == Duration.zero ? 'Голосовое' : duration(playing || pos > Duration.zero ? pos : total), style: TextStyle(fontSize: 11.5, color: c.textFaint, fontWeight: FontWeight.w500)),
                  const Spacer(),
                  if (playing)
                    GestureDetector(
                      onTap: _cycleSpeed,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(color: accent.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(9)),
                        child: Text('${_speed == _speed.roundToDouble() ? _speed.toInt() : _speed}×', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: accent)),
                      ),
                    ),
                ]),
              ]);
            },
          ),
        ),
      ]),
    );
  }

  double _barsWidth = 150;

  void _seekBy(double dx, Duration total) {
    final f = (dx / _barsWidth).clamp(0.0, 1.0);
    _player?.seek(Duration(milliseconds: (f * total.inMilliseconds).round()));
  }

  /// Форма волны: одна и та же для одного сообщения (от его id), без разбора звука.
  List<double> _bars(String seed) {
    final r = Random(seed.hashCode);
    return List.generate(34, (i) {
      final env = 0.35 + 0.65 * sin(pi * (i + 1) / 35);
      return (0.25 + r.nextDouble() * 0.75) * env;
    });
  }
}
