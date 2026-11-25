import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/book3d_scene.dart';

/// 3D-книга — как на сайте (BookViewerGL): книга в студии, камера облетает её пальцем (с инерцией), щипок — масштаб,
/// нажатие на обложку или страницу открывает и листает, ракурсы, «Читать», масштаб кнопками, автоповорот, исходный
/// ракурс, ползунок и подпись разворота. Сцена — ui/book3d_scene.dart; все числа — API v1 bookModel.
class Book3DView extends StatefulWidget {
  const Book3DView({super.key, required this.bookId, required this.pageCount, required this.pageUrl});
  final String bookId;

  /// Страниц в сборке, которую показывает экран: от них толщина корешка и листание.
  final int pageCount;

  /// Адрес полосы n (с 1) нужной ширины в пикселях.
  final String Function(int n, double px) pageUrl;

  @override
  State<Book3DView> createState() => _Book3DViewState();
}

double _clamp(double v, double lo, double hi) => math.min(hi, math.max(lo, v));
double _shortest(double from, double to) => ((((to - from) % (2 * math.pi)) + 3 * math.pi) % (2 * math.pi)) - math.pi;
double _ease(double k) => k < 0.5 ? 4 * k * k * k : 1 - math.pow(-2 * k + 2, 3) / 2;

class _Tween {
  _Tween(this.from, this.to, this.t0, this.ms);
  final (double, double, double) from;
  final (double, double, double) to;
  final Duration t0;
  final double ms;
}

class _Book3DViewState extends State<Book3DView> with SingleTickerProviderStateMixin {
  late final ClientSession _session = context.read<ClientSession>();
  late final Ticker _ticker = createTicker(_tick);
  v1api.BookModel? _model;
  BookSceneModel? _scene;
  String? _error;
  ui.FragmentShader? _studio;

  // Камера (как OrbitControls): углы, расстояние, остаток вращения от пальца (инерция).
  Camera3? _cam;
  double _dTheta = 0, _dPhi = 0;
  _Tween? _view;
  // Свои часы: время тикера начинается с нуля при каждом запуске, а анимации переживают паузы цикла.
  final Stopwatch _clock = Stopwatch()..start();
  Duration get _now => _clock.elapsed;
  Duration _last = Duration.zero;

  // Листание: позиция 0 — закрыта, 1 — обложка откинута, дальше — по листу.
  double _pos = 0;
  int _target = 0;
  ({double from, double to, Duration t0, double ms})? _flip;

  bool _auto = true;
  String? _active = 'front';

  // Картинки: развёртка обложки, полосы у разворота, цвет кромки крышек — средний цвет лица (как на сайте).
  ui.Image? _spread;
  Color? _edge;
  final Map<int, ui.Image> _pages = {};
  final Set<int> _loading = {};

  BookFrame? _frame;
  double _pinchStart = 1;
  Offset? _down;
  bool _moved = false;

  @override
  void initState() {
    super.initState();
    _load();
    ui.FragmentProgram.fromAsset('shaders/studio.frag').then((p) {
      if (mounted) setState(() => _studio = p.fragmentShader());
    });
  }

  @override
  void didUpdateWidget(Book3DView old) {
    super.didUpdateWidget(old);
    if (old.pageCount != widget.pageCount) _load();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _spread?.dispose();
    for (final i in _pages.values) {
      i.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final m = await _session.backend.bookModel(widget.bookId, widget.pageCount);
      if (!mounted) return;
      final scene = BookSceneModel(m);
      setState(() {
        _model = m;
        _scene = scene;
        _error = null;
        _cam ??= Camera3(m.scene.initial.azimuth, m.scene.initial.polar, scene.baseDistance);
      });
      _loadSpread(m);
      _kick();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<ui.Image> _image(String url) {
    final c = Completer<ui.Image>();
    final stream = NetworkImage(url, headers: _session.backend.imageHeaders).resolve(ImageConfiguration.empty);
    late ImageStreamListener l;
    l = ImageStreamListener((info, _) {
      stream.removeListener(l);
      c.complete(info.image.clone());
      info.dispose();
    }, onError: (e, _) {
      stream.removeListener(l);
      c.completeError(e);
    });
    stream.addListener(l);
    return c.future;
  }

  Future<void> _loadSpread(v1api.BookModel m) async {
    final widths = [...m.spreadWidths]..sort();
    // Ширина лица в картинке — по экрану (с запасом на приближение).
    final need = MediaQuery.devicePixelRatioOf(context) * 320;
    final w = widths.firstWhere((x) => x >= need, orElse: () => widths.last);
    try {
      final img = await _image(_session.backend.url('${m.spreadUrl}&w=$w'));
      if (!mounted) return img.dispose();
      final edge = await _average(img, m);
      setState(() {
        _spread?.dispose();
        _spread = img;
        _edge = edge;
      });
      _kick();
    } catch (_) {}
  }

  /// Средний цвет лица обложки — цвет кромки картона (averageColor сайта).
  Future<Color?> _average(ui.Image img, v1api.BookModel m) async {
    final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (data == null) return null;
    final k = img.width / m.dims.spread.w;
    final r = m.dims.rects.front;
    var rs = 0, gs = 0, bs = 0, n = 0;
    for (var j = 0; j < 24; j++) {
      for (var i = 0; i < 24; i++) {
        final x = ((r.x + r.w * (i + 0.5) / 24) * k).floor().clamp(0, img.width - 1);
        final y = ((r.y + r.h * (j + 0.5) / 24) * k).floor().clamp(0, img.height - 1);
        final o = (y * img.width + x) * 4;
        rs += data.getUint8(o);
        gs += data.getUint8(o + 1);
        bs += data.getUint8(o + 2);
        n++;
      }
    }
    return Color.fromARGB(255, rs ~/ n, gs ~/ n, bs ~/ n);
  }

  /// Полосы у разворота цели и у начала листания (как окно загрузки сайта); дальние освобождаются.
  void _wantPages() {
    final m = _model;
    if (m == null) return;
    final win = m.window;
    final leaves = <int>{};
    for (final p in [_pos, _target.toDouble()]) {
      for (var i = math.max(1, (p - win).ceil()); i <= math.min(m.leaves, (p + win).floor()); i++) {
        leaves.add(i);
      }
    }
    final want = {for (final i in leaves) ...[2 * i - 1, 2 * i]}..removeWhere((n) => n < 1 || n > m.pageCount);
    for (final n in [..._pages.keys]) {
      if (!want.contains(n)) _pages.remove(n)?.dispose();
    }
    final px = MediaQuery.devicePixelRatioOf(context) * 360;
    for (final n in want) {
      if (_pages.containsKey(n) || _loading.contains(n)) continue;
      _loading.add(n);
      _image(widget.pageUrl(n, px)).then((img) {
        _loading.remove(n);
        if (!mounted) return img.dispose();
        _pages[n]?.dispose();
        _pages[n] = img;
        _kick();
        setState(() {});
      }).catchError((_) {
        _loading.remove(n);
      });
    }
  }

  // ── движение ──

  void _kick() {
    if (!_ticker.isActive) {
      _last = Duration.zero;
      _ticker.start();
    }
  }

  void _tick(Duration _) {
    final m = _model, cam = _cam;
    if (m == null || cam == null) return;
    final now = _now;
    final dt = _last == Duration.zero ? 1 / 60 : math.min(0.1, (now - _last).inMicroseconds / 1e6);
    _last = now;
    final s = m.scene;
    var busy = false;
    final v = _view;
    if (v != null) {
      final k = _clamp((now - v.t0).inMicroseconds / 1000 / v.ms, 0, 1);
      final e = _ease(k);
      cam
        ..azimuth = v.from.$1 + (v.to.$1 - v.from.$1) * e
        ..polar = v.from.$2 + (v.to.$2 - v.from.$2) * e
        ..distance = v.from.$3 + (v.to.$3 - v.from.$3) * e;
      if (k >= 1) _view = null;
      busy = true;
    }
    final f = _flip;
    if (f != null) {
      final k = _clamp((now - f.t0).inMicroseconds / 1000 / f.ms, 0, 1);
      _pos = f.from + (f.to - f.from) * _ease(k);
      if (k >= 1) _flip = null;
      busy = true;
    }
    // Инерция вращения, как enableDamping у OrbitControls (затухание — доля за кадр 60 Гц).
    final damp = 1 - math.pow(1 - s.orbit.damping, dt * 60).toDouble();
    if (_dTheta.abs() > 1e-5 || _dPhi.abs() > 1e-5) {
      cam.azimuth += _dTheta * damp;
      cam.polar = _clamp(cam.polar + _dPhi * damp, s.camera.polarMin, math.pi - s.camera.polarMin);
      _dTheta *= 1 - damp;
      _dPhi *= 1 - damp;
      busy = true;
    }
    // Закрытая книга медленно поворачивается сама; открытую не трогаем — её читают.
    final auto = _auto && _pos < 0.001 && _view == null;
    if (auto) cam.azimuth -= 2 * math.pi / 60 * s.orbit.autoRotateSpeed * dt;
    setState(() {});
    if (busy) _wantPages();
    if (!busy && !auto) _ticker.stop();
  }

  void _setView(double azimuth, double polar, double distance, double ms) {
    final cam = _cam!, sc = _scene!;
    final to = (
      cam.azimuth + _shortest(cam.azimuth, azimuth),
      _clamp(polar, sc.s.camera.polarMin, math.pi - sc.s.camera.polarMin),
      _clamp(distance, sc.baseDistance * sc.s.camera.zoomMin, sc.baseDistance * sc.s.camera.zoomMax),
    );
    _dTheta = _dPhi = 0;
    _view = _Tween((cam.azimuth, cam.polar, cam.distance), to, _now, ms);
    _kick();
  }

  void _stopAuto() => setState(() => _auto = false);

  /// Листает к позиции n; открывая закрытую книгу, разворачивает её к читателю (goTo сайта).
  void _goTo(int n) {
    final m = _model!, cam = _cam!, s = m.scene;
    final to = n.clamp(0, m.sheets - 1);
    final from = _pos;
    _target = to;
    if (from < 0.5 && to >= 1) {
      final r = s.read;
      if (_shortest(0, cam.azimuth).abs() > r.turnIfAzimuthOver || cam.polar > r.turnIfPolarOver || cam.polar < r.turnIfPolarUnder) {
        _setView(r.azimuth, r.polar, _scene!.baseDistance / r.zoom, r.turnMs);
        _active = 'read';
      }
    }
    if (to != from) {
      final f = s.flip;
      _flip = (from: from, to: to.toDouble(), t0: _now, ms: math.min(f.maxMs, f.baseMs + f.perLeafMs * math.max(0, (to - from).abs() - 1)));
      _wantPages();
      _kick();
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final m = _model, sc = _scene, cam = _cam;
    if (m == null || sc == null || cam == null) {
      return _error == null ? const Center(child: CircularProgressIndicator()) : EmptyState(icon: LucideIcons.wifiOff, title: '3D-книга не открылась', hint: _error, action: 'Повторить', onAction: _load);
    }
    final s = m.scene;
    final l = m.labels;
    final slot = _target.clamp(0, m.sheets - 1);
    final angles = {for (final v in s.views) v.id: v};
    return LayoutBuilder(builder: (context, box) {
      return SingleChildScrollView(
        child: Column(children: [
          // Сцена — того же формата, что на сайте (5:4), со скруглением.
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: AspectRatio(
              aspectRatio: 5 / 4,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: LayoutBuilder(builder: (context, stage) {
                  final size = Size(stage.maxWidth, stage.maxHeight);
                  return GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    // Нажатие — как raycast сайта: обложка и правая страница листают вперёд, левая — назад.
                    onTapUp: (d) {
                      final hit = _frame?.pick(d.localPosition);
                      if (hit != null) _goTo(_target + (hit == 'next' ? 1 : -1));
                    },
                    onScaleStart: (d) {
                      _pinchStart = cam.distance;
                      _down = d.localFocalPoint;
                      _moved = false;
                    },
                    onScaleUpdate: (d) {
                      if (d.pointerCount > 1) {
                        _moved = true;
                        _view = null;
                        cam.distance = _clamp(_pinchStart / d.scale, sc.baseDistance * s.camera.zoomMin, sc.baseDistance * s.camera.zoomMax);
                        _kick();
                        return;
                      }
                      if (_down != null && (d.localFocalPoint - _down!).distance > 6) {
                        if (!_moved) {
                          _auto = false;
                          _active = null;
                          _view = null;
                        }
                        _moved = true;
                      }
                      if (!_moved) return;
                      // Поворот пальцем — как OrbitControls: доля полного оборота на высоту кадра.
                      final k = 2 * math.pi / size.height * s.orbit.rotateSpeed;
                      _dTheta -= d.focalPointDelta.dx * k;
                      _dPhi -= d.focalPointDelta.dy * k;
                      _kick();
                    },
                    onScaleEnd: (_) => _down = null,
                    child: CustomPaint(
                      size: size,
                      painter: _ScenePainter(
                        build: () => _frame = BookFrame(model: sc, cam: cam, pos: _pos, spread: _spread, pages: (n) => _pages[n], edgeColor: _edge ?? Color(int.parse('FF${s.materials.edge.substring(1)}', radix: 16))),
                        studio: _studio,
                        stage: [for (final x in m.paper.stage) Color(int.parse('FF${x.substring(1)}', radix: 16))],
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
            child: Row(children: [
              IconButton(tooltip: l.prev, icon: const Icon(LucideIcons.chevronLeft), onPressed: slot <= 0 ? null : () => _goTo(_target - 1)),
              Expanded(
                child: Slider(
                  value: slot.toDouble(),
                  max: (m.sheets - 1).toDouble(),
                  divisions: m.sheets - 1,
                  activeColor: c.brand,
                  onChanged: (v) => _goTo(v.round()),
                ),
              ),
              IconButton(tooltip: l.next, icon: const Icon(LucideIcons.chevronRight), onPressed: slot >= m.sheets - 1 ? null : () => _goTo(_target + 1)),
            ]),
          ),
          Text(m.spreads[slot], style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: c.textMuted)),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(children: [
              for (final v in m.views.list)
                _Pill(
                  label: v.label,
                  on: _active == v.id,
                  onTap: () {
                    final a = angles[v.id];
                    if (a == null) return;
                    _stopAuto();
                    _setView(a.azimuth, a.polar, sc.baseDistance, s.orbit.viewMs);
                    setState(() => _active = v.id);
                  },
                ),
              _Pill(
                label: l.read,
                on: _active == 'read',
                onTap: () {
                  _stopAuto();
                  if (_pos < 0.5) _goTo(1);
                  _setView(s.read.azimuth, s.read.polar, sc.baseDistance / s.read.zoom, s.read.turnMs);
                  setState(() => _active = 'read');
                },
              ),
            ]),
          ),
          const SizedBox(height: 8),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            _Round(icon: LucideIcons.minus, tip: l.zoomOut, onTap: () {
              _stopAuto();
              _setView(cam.azimuth, cam.polar, cam.distance * m.views.zoom.step, s.orbit.zoomMs);
            }),
            _Round(icon: LucideIcons.plus, tip: l.zoomIn, onTap: () {
              _stopAuto();
              _setView(cam.azimuth, cam.polar, cam.distance / m.views.zoom.step, s.orbit.zoomMs);
            }),
            _Round(icon: _auto ? LucideIcons.pause : LucideIcons.play, tip: _auto ? l.autoOff : l.autoOn, on: _auto, onTap: () {
              setState(() => _auto = !_auto);
              _kick();
            }),
            _Round(icon: LucideIcons.rotateCcw, tip: l.reset, onTap: () {
              _stopAuto();
              _setView(s.initial.azimuth, s.initial.polar, sc.baseDistance, s.orbit.viewMs);
              setState(() => _active = 'front');
            }),
          ]),
          const SizedBox(height: 8),
          Text(l.dims, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.text)),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 4, 24, 14),
            child: Text('${l.hint} ${l.note}', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, height: 1.35, color: c.textMuted)),
          ),
        ]),
      );
    });
  }
}

class _ScenePainter extends CustomPainter {
  _ScenePainter({required this.build, required this.studio, required this.stage});
  final BookFrame Function() build;
  final ui.FragmentShader? studio;
  final List<Color> stage;

  @override
  void paint(Canvas canvas, Size size) {
    final frame = build()..layout(size);
    final sh = studio;
    if (sh != null) {
      frame.paintStudio(canvas, size, sh);
    } else {
      canvas.drawRect(Offset.zero & size, Paint()..shader = RadialGradient(center: const Alignment(0, -0.3), colors: stage).createShader(Offset.zero & size));
    }
    frame.paint(canvas);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.on, required this.onTap});
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: Material(
        color: on ? c.brand : c.surfaceRaised,
        shape: StadiumBorder(side: BorderSide(color: on ? c.brand : c.border)),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
            child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: on ? Colors.white : c.text)),
          ),
        ),
      ),
    );
  }
}

class _Round extends StatelessWidget {
  const _Round({required this.icon, required this.tip, required this.onTap, this.on = false});
  final IconData icon;
  final String tip;
  final VoidCallback onTap;
  final bool on;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Tooltip(
        message: tip,
        child: Material(
          color: on ? c.bubbleOut : c.surfaceRaised,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: c.border)),
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: onTap,
            child: SizedBox(width: 44, height: 38, child: Icon(icon, size: 17, color: on ? c.brand : c.text)),
          ),
        ),
      ),
    );
  }
}
