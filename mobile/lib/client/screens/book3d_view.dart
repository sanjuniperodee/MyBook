import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:vector_math/vector_math_64.dart' show Vector3;

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';

/// Объёмная книга — как 3D-книга сайта. Всё про книгу приходит из API v1 bookModel и считается на сервере теми же
/// функциями, что у сайта (lib/book/book-model.ts, flipbook.ts, formats.ts): размеры крышек, корешка и блока по
/// печатным параметрам, лицо, оборот и корешок — вырезы одной картинки развёртки той же вёрстки, что cover.pdf, ракурсы,
/// свет, цвета бумаги, подписи разворотов и панели. Здесь — только сцена и жесты.
///
/// Книгу крутят пальцем, щипок — масштаб; нажатие открывает книгу и листает (справа — дальше, слева — назад).
/// Сцена — плоскости с 3D-преобразованием (как CSS-версия сайта): грани сортируются по глубине, отвёрнутые не рисуются.
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

double _rad(double deg) => deg * math.pi / 180;
double _clamp(double v, double lo, double hi) => math.min(hi, math.max(lo, v));
double _shortest(double from, double to) => ((((to - from) % 360) + 540) % 360) - 180;

/// Цвет CSS из ответа сервера: #rrggbb или rgba(r,g,b,a).
Color _css(String s) {
  final v = s.trim();
  if (v.startsWith('#')) return Color(int.parse('FF${v.substring(1)}', radix: 16));
  final m = RegExp(r'rgba?\(([^)]+)\)').firstMatch(v);
  if (m == null) return Colors.transparent;
  final p = m.group(1)!.split(',').map((e) => double.parse(e.trim())).toList();
  return Color.fromRGBO(p[0].round(), p[1].round(), p[2].round(), p.length > 3 ? p[3] : 1);
}

class _Face {
  _Face(this.w, this.h, this.m, this.child);
  final double w;
  final double h;

  /// Модель грани в мм: начало — левый верхний угол грани, x вправо, y вниз, нормаль — +z грани.
  final Matrix4 m;
  final Widget child;
  double depth = 0;
  double shade = 0;
  Matrix4? screen;

  /// Углы и плоскость грани в системе зрителя (до перспективы): для порядка рисования.
  List<Vector3> corners = const [];
  Vector3 normal = Vector3.zero();
  Vector3 point = Vector3.zero();
}

/// Грань a лежит за гранью b (рисовать раньше): a целиком по ту сторону плоскости b, где нет зрителя, или b целиком по
/// сторону зрителя от плоскости a. Для непересекающихся плоских граней этого достаточно (как в CSS 3D браузера).
bool _behind(_Face a, _Face b, Vector3 eye) {
  const eps = 1e-3;
  final eb = b.normal.dot(eye - b.point);
  if (a.corners.every((v) => b.normal.dot(v - b.point) * eb <= eps * eb.abs())) return true;
  final ea = a.normal.dot(eye - a.point);
  return b.corners.every((v) => a.normal.dot(v - a.point) * ea >= -eps * ea.abs());
}

/// Порядок рисования: от дальних к ближним по отношению «за» (сортировка Кана); где отношения нет или оно
/// зациклилось — по глубине середины.
List<_Face> _paintOrder(List<_Face> faces, Vector3 eye) {
  final n = faces.length;
  final after = List.generate(n, (_) => <int>[]);
  final indeg = List.filled(n, 0);
  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      final ij = _behind(faces[i], faces[j], eye);
      final ji = _behind(faces[j], faces[i], eye);
      if (ij == ji) continue;
      final (from, to) = ij ? (i, j) : (j, i);
      after[from].add(to);
      indeg[to]++;
    }
  }
  final done = List.filled(n, false);
  final out = <_Face>[];
  while (out.length < n) {
    var pick = -1;
    for (var i = 0; i < n; i++) {
      if (done[i] || indeg[i] > 0) continue;
      if (pick < 0 || faces[i].depth < faces[pick].depth) pick = i;
    }
    if (pick < 0) {
      // Зацикливание (бывает у граней, лежащих в одной плоскости): самую дальнюю из оставшихся.
      for (var i = 0; i < n; i++) {
        if (!done[i] && (pick < 0 || faces[i].depth < faces[pick].depth)) pick = i;
      }
    }
    done[pick] = true;
    out.add(faces[pick]);
    for (final k in after[pick]) {
      indeg[k]--;
    }
  }
  return out;
}

class _Book3DViewState extends State<Book3DView> with SingleTickerProviderStateMixin {
  late final ClientSession _session = context.read<ClientSession>();
  late final Ticker _ticker = createTicker(_tick);
  Duration _last = Duration.zero;
  v1api.BookModel? _model;
  String? _error;

  // Текущее и целевое: поворот, масштаб, позиция листания (число перевёрнутых листов; дробное — в движении).
  double _rx = 0, _ry = 0, _zoom = 1, _pos = 0;
  double _trx = 0, _try = 0, _tzoom = 1, _tpos = 0;
  bool _auto = false;
  String? _active;

  double _zoomAtStart = 1;
  Offset? _down;
  bool _moved = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(Book3DView old) {
    super.didUpdateWidget(old);
    if (old.pageCount != widget.pageCount) _load();
  }

  Future<void> _load() async {
    try {
      final m = await _session.backend.bookModel(widget.bookId, widget.pageCount);
      if (!mounted) return;
      final first = _model == null;
      setState(() {
        _model = m;
        _error = null;
        if (first) {
          _rx = _trx = m.views.initial.rx;
          _ry = _try = m.views.initial.ry;
        }
        _tpos = _clamp(_tpos, 0, (m.sheets - 1).toDouble());
      });
      if (!_ticker.isActive) _ticker.start();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  /// Плавное доведение к целям: экспонента по времени кадра.
  void _tick(Duration now) {
    final dt = _last == Duration.zero ? 0.016 : (now - _last).inMicroseconds / 1e6;
    _last = now;
    if (_auto) _try += dt * 24;
    final k = 1 - math.exp(-dt * 9);
    final kp = 1 - math.exp(-dt * 7);
    final nrx = _rx + (_trx - _rx) * k;
    final nry = _ry + _shortest(_ry, _try) * k;
    final nz = _zoom + (_tzoom - _zoom) * k;
    final np = _pos + (_tpos - _pos) * kp;
    final moving = (nrx - _rx).abs() > 0.01 || (nry - _ry).abs() > 0.01 || (nz - _zoom).abs() > 0.0005 || (np - _pos).abs() > 0.0005;
    if (!moving) {
      if (_rx != _trx || _pos != _tpos) {
        setState(() {
          _rx = _trx;
          _pos = _tpos;
        });
      }
      return;
    }
    setState(() {
      _rx = nrx;
      _ry = nry;
      _zoom = nz;
      _pos = (np - _tpos).abs() < 0.002 ? _tpos : np;
    });
  }

  // ── Управление ──

  void _view(v1api.BookModelViewsList v) => setState(() {
        _active = v.id;
        _auto = false;
        _tpos = 0;
        _trx = v.rx;
        _try = _ry + _shortest(_ry, v.ry);
        _tzoom = 1;
      });

  void _readMode() {
    final v = _model!.views;
    setState(() {
      _active = 'read';
      _auto = false;
      if (_tpos < 1) _tpos = 1;
      _trx = v.read.rx;
      _try = _ry + _shortest(_ry, v.read.ry);
      _tzoom = v.readZoom;
    });
  }

  void _seek(double p) {
    final to = _clamp(p.roundToDouble(), 0, (_model!.sheets - 1).toDouble());
    if (to == _tpos) return;
    if (_tpos == 0 && to > 0) {
      _readMode();
    } else if (to == 0) {
      _active = null;
    }
    setState(() => _tpos = to);
  }

  void _reset() {
    final v = _model!.views.initial;
    setState(() {
      _active = null;
      _auto = false;
      _trx = v.rx;
      _try = _ry + _shortest(_ry, v.ry);
      _tzoom = 1;
    });
  }

  void _zoomBy(double f) {
    final z = _model!.views.zoom;
    setState(() => _tzoom = _clamp(_tzoom * f, z.min, z.max));
  }

  /// Нажатие: закрытая книга открывается; открытая листается — справа от корешка дальше, слева назад.
  void _tapAt(Offset p, Size size) {
    if (_tpos == 0) {
      _readMode();
      return;
    }
    _seek(p.dx >= size.width / 2 ? _tpos + 1 : _tpos - 1);
  }

  // ── Сцена ──

  /// Сдвиг книги в долях ширины крышки: закрытая — по центру, открытая — корешок по центру (bookShift сайта).
  double _shift(v1api.BookModel m, double pos) {
    final opening = _clamp(pos, 0, 1);
    final closing = _clamp(pos - (m.sheets - 2), 0, 1);
    return -0.5 * (1 - opening) + 0.5 * closing;
  }

  /// Угол листа: при позиции pos перевёрнуты листы < pos (leafAngle сайта).
  double _leafAngle(int i) => _clamp(_pos - i, 0, 1) * 180;

  /// Лист вокруг корешка: петля на x = 0, высота z; угол — на сколько он уже перевёрнут.
  Matrix4 _leaf(double z, double angle) => Matrix4.identity()
    ..translateByDouble(0.0, 0.0, z, 1.0)
    ..rotateY(_rad(-angle));

  /// Лицо листа (смотрит на зрителя, пока лист справа) и оборот (смотрит на зрителя, когда перевёрнут).
  Matrix4 _front(Matrix4 leaf, double h, [double lift = 0]) => leaf.clone()..translateByDouble(0.0, -h / 2, lift, 1.0);
  Matrix4 _back(Matrix4 leaf, double w, double h, [double lift = 0]) => leaf.clone()
    ..translateByDouble(w, -h / 2, -lift, 1.0)
    ..rotateY(math.pi);

  List<_Face> _faces(v1api.BookModel m, double pxPerMm) {
    final backend = _session.backend;
    final headers = backend.imageHeaders;
    final d = m.dims;
    final w = d.w, h = d.h, depth = d.d, bw = d.block.w, bh = d.block.h, bd = d.block.d;
    final endpaper = DecoratedBox(
      decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [for (final c in m.paper.endpaper) _css(c)])),
    );
    final faces = <_Face>[];

    // Развёртка обложки — одна картинка; лицо, оборот и корешок — её прямоугольники (rects сервера). Ширина — по
    // размеру книги на экране (с запасом на приближение), из ширин, которые отдаёт сервер.
    final widths = [...m.spreadWidths]..sort();
    final need = d.rects.front.w * pxPerMm * 1.5;
    final sw = widths.firstWhere((x) => x >= need, orElse: () => widths.last);
    final spread = backend.url('${m.spreadUrl}&w=$sw');
    Widget crop(double x, double y) => ClipRect(
          child: OverflowBox(
            alignment: Alignment.topLeft,
            minWidth: d.spread.w,
            maxWidth: d.spread.w,
            minHeight: d.spread.h,
            maxHeight: d.spread.h,
            child: Transform.translate(
              offset: Offset(-x, -y),
              child: Image.network(spread, headers: headers, width: d.spread.w, height: d.spread.h, fit: BoxFit.fill, gaplessPlayback: true, errorBuilder: (_, _, _) => endpaper),
            ),
          ),
        );
    Widget page(int n) => n < 1 || n > m.pageCount
        ? const ColoredBox(color: Colors.white)
        : ColoredBox(
            color: Colors.white,
            child: Image.network(widget.pageUrl(n, bw * pxPerMm * 1.5), headers: headers, fit: BoxFit.fill, gaplessPlayback: true, errorBuilder: (_, _, _) => const SizedBox()),
          );

    // Обложка: лист 0 — петля на верхней крышке; лицо — лицо развёртки, оборот — форзац. Перевернувшись, лист
    // переходит из правой стопки в левую: обе лежат на «столе», поэтому петля опускается (pileState сайта).
    double lerp(double a, double b, double angle) => a + (b - a) * angle / 180;
    final coverAngle = _leafAngle(0);
    final coverLeaf = _leaf(lerp(depth / 2, -depth / 2, coverAngle), coverAngle);
    faces.add(_Face(w, h, _front(coverLeaf, h), crop(d.rects.front.x, d.rects.front.y)));
    faces.add(_Face(w, h, _back(coverLeaf, w, h, d.boardMm), endpaper));

    // Задняя крышка (последний лист не переворачивается): внутри — форзац, снаружи — оборот развёртки.
    final backLeaf = _leaf(-depth / 2, 0);
    faces.add(_Face(w, h, _front(backLeaf, h, d.boardMm), endpaper));
    faces.add(_Face(w, h, _back(backLeaf, w, h), crop(d.rects.back.x, d.rects.back.y)));

    // Корешок — стенка слева у закрытой книги: корешок развёртки (надписи — как в печати).
    faces.add(_Face(
      depth,
      h,
      Matrix4.identity()
        ..translateByDouble(0.0, -h / 2, -depth / 2, 1.0)
        ..rotateY(-math.pi / 2),
      crop(d.rects.spine.x, d.rects.spine.y),
    ));

    // Листы блока: рядом с позицией — по одному с полосами, остальные — стопками справа и слева.
    final leaves = m.leaves;
    final t = bd / leaves;
    // Высота петли листа i (с 1): справа первый — сверху, слева первый перевёрнутый — снизу.
    double leafZ(int i, double angle) => lerp(bd / 2 - (i - 0.5) * t, -bd / 2 + (i - 0.5) * t, angle);
    final int first = math.max(1, (_pos - m.window).ceil());
    final int last = math.min(leaves, (_pos + m.window).floor());
    for (var i = first; i <= last; i++) {
      final angle = _leafAngle(i);
      final leaf = _leaf(leafZ(i, angle), angle);
      faces.add(_Face(bw, bh, _front(leaf, bh), page(2 * i - 1)));
      faces.add(_Face(bw, bh, _back(leaf, bw, bh), page(2 * i)));
    }
    final int right = leaves - math.max(last, first - 1);
    if (right > 0) _pile(faces, m, -bd / 2, -bd / 2 + right * t, 0, page(2 * (leaves - right + 1) - 1));
    final int left = math.max(0, first - 1);
    if (left > 0 && _pos > 0) _pile(faces, m, bd / 2 - left * t, bd / 2, 180, page(2 * left));
    return faces;
  }

  /// Стопка листов — брусок блока от z0 до z1 у петли, повёрнутый вокруг корешка на angle: срез (обрез), верх и низ —
  /// бумагой со штрихами листов, лицо — полоса сверху стопки.
  void _pile(List<_Face> faces, v1api.BookModel m, double z0, double z1, double angle, Widget top) {
    final bw = m.dims.block.w, bh = m.dims.block.h;
    final depth = math.max(0.05, z1 - z0);
    final leaf = _leaf(0, angle);
    final edgeV = _PaperEdge(paper: m.paper, vertical: true);
    final edgeH = _PaperEdge(paper: m.paper, vertical: false);
    faces.add(angle < 90
        ? _Face(bw, bh, leaf.clone()..translateByDouble(0.0, -bh / 2, z1, 1.0), top)
        : _Face(
            bw,
            bh,
            leaf.clone()
              ..translateByDouble(bw, -bh / 2, z0, 1.0)
              ..rotateY(math.pi),
            top,
          ));
    faces.add(_Face(
      depth,
      bh,
      leaf.clone()
        ..translateByDouble(bw, -bh / 2, z1, 1.0)
        ..rotateY(math.pi / 2),
      edgeV,
    ));
    faces.add(_Face(
      bw,
      depth,
      leaf.clone()
        ..translateByDouble(0.0, -bh / 2, z0, 1.0)
        ..rotateX(math.pi / 2),
      edgeH,
    ));
    faces.add(_Face(
      bw,
      depth,
      leaf.clone()
        ..translateByDouble(0.0, bh / 2, z1, 1.0)
        ..rotateX(-math.pi / 2),
      edgeH,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final m = _model;
    if (m == null) {
      return _error == null ? const Center(child: CircularProgressIndicator()) : EmptyState(icon: LucideIcons.wifiOff, title: '3D-книга не открылась', hint: _error, action: 'Повторить', onAction: _load);
    }
    final slot = _tpos.round().clamp(0, m.sheets - 1);
    final l = m.labels;
    return Column(children: [
      Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: LayoutBuilder(builder: (context, box) {
            final size = Size(box.maxWidth, box.maxHeight);
            return GestureDetector(
              behavior: HitTestBehavior.opaque,
              onScaleStart: (d) {
                _zoomAtStart = _tzoom;
                _down = d.localFocalPoint;
                _moved = false;
              },
              onScaleUpdate: (d) {
                if (d.pointerCount > 1) {
                  _moved = true;
                  setState(() => _tzoom = _clamp(_zoomAtStart * d.scale, m.views.zoom.min, m.views.zoom.max));
                  return;
                }
                if (_down != null && (d.localFocalPoint - _down!).distance > 6) _moved = true;
                if (!_moved) return;
                setState(() {
                  _auto = false;
                  _active = null;
                  _try -= d.focalPointDelta.dx * 0.45;
                  _trx = _clamp(_trx + d.focalPointDelta.dy * 0.45, -m.views.tiltLimit, m.views.tiltLimit);
                  // Пальцем — сразу, без доводки: книга идёт за пальцем.
                  _ry = _try;
                  _rx = _trx;
                });
              },
              onScaleEnd: (_) {
                if (!_moved && _down != null) _tapAt(_down!, size);
                _down = null;
              },
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  gradient: RadialGradient(center: const Alignment(0, -0.3), radius: 0.9, colors: [for (final s in m.paper.stage) _css(s)]),
                ),
                child: ClipRRect(borderRadius: BorderRadius.circular(24), child: _scene(m, size, MediaQuery.devicePixelRatioOf(context))),
              ),
            );
          }),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
        child: Row(children: [
          IconButton(tooltip: l.prev, icon: const Icon(LucideIcons.chevronLeft), onPressed: slot <= 0 ? null : () => _seek(_tpos - 1)),
          Expanded(
            child: Slider(
              value: _tpos.clamp(0, (m.sheets - 1).toDouble()),
              max: (m.sheets - 1).toDouble(),
              divisions: m.sheets - 1,
              activeColor: c.brand,
              onChanged: _seek,
            ),
          ),
          IconButton(tooltip: l.next, icon: const Icon(LucideIcons.chevronRight), onPressed: slot >= m.sheets - 1 ? null : () => _seek(_tpos + 1)),
        ]),
      ),
      Text(m.spreads[slot], style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: c.textMuted)),
      const SizedBox(height: 10),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(children: [
          for (final v in m.views.list) _Pill(label: v.label, on: _active == v.id, onTap: () => _view(v)),
          _Pill(label: l.read, on: _active == 'read', onTap: _readMode),
        ]),
      ),
      const SizedBox(height: 8),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        _Round(icon: LucideIcons.minus, tip: l.zoomOut, onTap: () => _zoomBy(1 / m.views.zoom.step)),
        _Round(icon: LucideIcons.plus, tip: l.zoomIn, onTap: () => _zoomBy(m.views.zoom.step)),
        _Round(icon: _auto ? LucideIcons.pause : LucideIcons.play, tip: _auto ? l.autoOff : l.autoOn, on: _auto, onTap: () => setState(() => _auto = !_auto)),
        _Round(icon: LucideIcons.rotateCcw, tip: l.reset, onTap: _reset),
      ]),
      const SizedBox(height: 8),
      Text(l.dims, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.text)),
      Padding(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 14),
        child: Text('${l.hint} ${l.note}', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, height: 1.35, color: c.textMuted)),
      ),
    ]);
  }

  Widget _scene(v1api.BookModel m, Size size, double dpr) {
    final d = m.dims;
    final open = _clamp(_pos, 0, 1) * (1 - _clamp(_pos - (m.sheets - 2), 0, 1));
    // Масштаб: закрытая книга помещается в кадр при любом повороте, раскрытая — так же (fitScale сайта).
    final extent = math.sqrt(d.w * d.w + d.h * d.h + d.d * d.d);
    final openExtent = math.sqrt(4 * d.block.w * d.block.w + d.h * d.h + d.d * d.d);
    final fit = 1 + (extent / openExtent - 1) * open;
    final u = math.min(size.width, size.height) * 0.9 / extent * fit * _zoom;
    final persp = math.max(size.width, size.height) * 2.4;
    final world = Matrix4.identity()
      ..rotateX(_rad(_rx))
      ..rotateY(_rad(_ry))
      ..scaleByDouble(u, u, u, 1.0)
      ..translateByDouble(_shift(m, _pos) * d.w, 0.0, 0.0, 1.0);
    // Перспектива вокруг середины сцены: сначала деление на глубину, потом сдвиг в середину (порядок важен — в одной
    // матрице сдвиг с перспективой делили бы и сдвиг, и книга «скашивалась» к левому краю).
    final project = Matrix4.translationValues(size.width / 2, size.height / 2, 0) * (Matrix4.identity()..setEntry(3, 2, -1 / persp)) as Matrix4;
    final eye = Vector3(0, 0, persp);
    final light = Vector3(m.light.x, m.light.y, m.light.z);

    final visible = <_Face>[];
    for (final f in _faces(m, u * dpr)) {
      final mm = world * f.m as Matrix4;
      final center = mm.transform3(Vector3(f.w / 2, f.h / 2, 0));
      final normal = (mm.transform3(Vector3(f.w / 2, f.h / 2, 1)) - center)..normalize();
      if (normal.dot(eye - center) <= 0) continue;
      f.depth = center.z;
      f.normal = normal;
      f.point = center;
      f.corners = [mm.transform3(Vector3(0, 0, 0)), mm.transform3(Vector3(f.w, 0, 0)), mm.transform3(Vector3(f.w, f.h, 0)), mm.transform3(Vector3(0, f.h, 0))];
      final lit = m.light.ambient + (1 - m.light.ambient) * math.max(0, normal.dot(light));
      f.shade = (1 - lit) * m.light.shadeMax;
      f.screen = project * mm as Matrix4;
      visible.add(f);
    }
    final ordered = _paintOrder(visible, eye);

    return Stack(clipBehavior: Clip.none, children: [
      for (final f in ordered)
        Positioned(
          left: 0,
          top: 0,
          child: Transform(
            transform: f.screen!,
            child: SizedBox(
              width: f.w,
              height: f.h,
              child: Stack(fit: StackFit.expand, children: [
                f.child,
                if (f.shade > 0.005) IgnorePointer(child: ColoredBox(color: Colors.black.withValues(alpha: f.shade))),
              ]),
            ),
          ),
        ),
    ]);
  }
}

/// Срез блока: гладкая основа (цвета сервера) и еле заметные штрихи листов — как paperEdge сайта.
class _PaperEdge extends StatelessWidget {
  const _PaperEdge({required this.paper, required this.vertical});
  final v1api.BookModelPaper paper;
  final bool vertical;

  @override
  Widget build(BuildContext context) {
    final base = _css(paper.edge[0]), mid = _css(paper.edge[1]);
    return Stack(fit: StackFit.expand, children: [
      DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: vertical ? Alignment.topCenter : Alignment.centerLeft,
            end: vertical ? Alignment.bottomCenter : Alignment.centerRight,
            colors: [base, mid, base],
            stops: const [0, 0.4, 1],
          ),
        ),
      ),
      DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: vertical ? Alignment.centerLeft : Alignment.topCenter,
            end: vertical ? const Alignment(-0.6, 0) : const Alignment(0, -0.6),
            colors: [Colors.transparent, Colors.transparent, _css(paper.edgeLine)],
            stops: const [0, 0.66, 1],
            tileMode: TileMode.repeated,
          ),
        ),
      ),
    ]);
  }
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
