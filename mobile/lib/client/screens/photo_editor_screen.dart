import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/cabinet.dart';

// ─── Чистая математика правки (один в один с src/lib/photo-edit/doc.ts и color.ts) ───────────────────────────────

double _round4(double v) => (v * 10000).roundToDouble() / 10000;
double _round2(double v) => (v * 100).roundToDouble() / 100;

double photoEditNormAngle(double deg) {
  final a = ((((deg + 180) % 360) + 360) % 360) - 180;
  return a == -180 ? 180 : _round2(a);
}

({int w, int h}) photoEditTurnedSize(int w, int h, int turns) => turns.isOdd ? (w: h, h: w) : (w: w, h: h);

double photoEditCoverScale(double w, double h, double deg) {
  if (deg == 0 || w <= 0 || h <= 0) return 1;
  final a = deg.abs() * math.pi / 180;
  final c = math.cos(a);
  final s = math.sin(a);
  return math.max((w * c + h * s) / w, (w * s + h * c) / h);
}

({int w, int h}) photoEditOutputSize(int origW, int origH, v1api.PhotoEditGeometry g) {
  final t = photoEditTurnedSize(origW, origH, g.turns);
  final c = g.crop;
  final cw = c?.w ?? 1.0;
  final ch = c?.h ?? 1.0;
  return (w: math.max(1, (t.w * cw).round()), h: math.max(1, (t.h * ch).round()));
}

int photoEditEffectiveDpi(int outW, int outH, v1api.PhotoEditorSlot slot) {
  final rx = outW / slot.widthMm;
  final ry = outH / slot.heightMm;
  return ((slot.mode == 'contain' ? math.max(rx, ry) : math.min(rx, ry)) * 25.4).round();
}

v1api.PhotoEditRect photoEditClampRect(v1api.PhotoEditRect r, double minFraction) {
  final w = r.w.clamp(minFraction, 1.0).toDouble();
  final h = r.h.clamp(minFraction, 1.0).toDouble();
  final x = r.x.clamp(0.0, 1.0 - w).toDouble();
  final y = r.y.clamp(0.0, 1.0 - h).toDouble();
  return v1api.PhotoEditRect(x: _round4(x), y: _round4(y), w: _round4(w), h: _round4(h));
}

v1api.PhotoEditRect photoEditCenteredCrop(double ratio, int turnedW, int turnedH, double minFraction) {
  final r = ratio / (turnedW / math.max(1, turnedH));
  if (r >= 1) {
    final h = 1 / r;
    return photoEditClampRect(v1api.PhotoEditRect(x: 0, y: (1 - h) / 2, w: 1, h: h), minFraction);
  }
  return photoEditClampRect(v1api.PhotoEditRect(x: (1 - r) / 2, y: 0, w: r, h: 1), minFraction);
}

String _flipAspect(String a) {
  final m = RegExp(r'^(\d+):(\d+)$').firstMatch(a);
  return m == null ? a : '${m.group(2)}:${m.group(1)}';
}

double? _parseAspect(String a) {
  final m = RegExp(r'^(\d+):(\d+)$').firstMatch(a);
  if (m == null) return null;
  final w = double.parse(m.group(1)!);
  final h = double.parse(m.group(2)!);
  return h == 0 ? null : w / h;
}

v1api.PhotoEditDoc photoEditEmptyDoc() => const v1api.PhotoEditDoc(
      v: 1,
      geometry: v1api.PhotoEditGeometry(turns: 0, flip: false, straighten: 0, crop: null, aspect: 'free'),
      adjust: {},
      levels: null,
      filter: v1api.PhotoEditFilter(id: 'none', strength: 100),
      layers: [],
    );

bool photoEditIsEmpty(v1api.PhotoEditDoc doc) {
  final g = doc.geometry;
  if (g.turns != 0 || g.flip || g.straighten != 0 || g.crop != null) return false;
  if (doc.levels != null || doc.filter.id != 'none' || doc.layers.isNotEmpty) return false;
  for (final v in doc.adjust.values) {
    if (v is num && v != 0) return false;
  }
  return true;
}

v1api.PhotoEditDoc photoEditRotateCW(v1api.PhotoEditDoc doc) {
  final g = doc.geometry;
  final crop = g.crop == null
      ? null
      : v1api.PhotoEditRect(
          x: _round4(1 - g.crop!.y - g.crop!.h),
          y: g.crop!.x,
          w: g.crop!.h,
          h: g.crop!.w,
        );
  final layers = [
    for (final l in doc.layers)
      {
        ...l,
        if (l['y'] is num) 'x': _round4(1 - (l['y'] as num).toDouble()),
        if (l['x'] is num) 'y': (l['x'] as num).toDouble(),
        if (l['rotation'] is num) 'rotation': photoEditNormAngle((l['rotation'] as num).toDouble() + 90),
      },
  ];
  return v1api.PhotoEditDoc(
    v: doc.v,
    geometry: v1api.PhotoEditGeometry(
      turns: (g.turns + 1) % 4,
      flip: g.flip,
      straighten: g.straighten,
      crop: crop,
      aspect: _flipAspect(g.aspect),
    ),
    adjust: Map<String, dynamic>.from(doc.adjust),
    levels: doc.levels,
    filter: doc.filter,
    layers: layers,
  );
}

v1api.PhotoEditDoc photoEditRotateCCW(v1api.PhotoEditDoc doc) => photoEditRotateCW(photoEditRotateCW(photoEditRotateCW(doc)));

v1api.PhotoEditDoc photoEditFlip(v1api.PhotoEditDoc doc) {
  final g = doc.geometry;
  final turns = g.turns.isOdd ? (g.turns + 2) % 4 : g.turns;
  final crop = g.crop == null
      ? null
      : v1api.PhotoEditRect(
          x: _round4(1 - g.crop!.x - g.crop!.w),
          y: g.crop!.y,
          w: g.crop!.w,
          h: g.crop!.h,
        );
  final layers = [
    for (final l in doc.layers)
      {
        ...l,
        if (l['x'] is num) 'x': _round4(1 - (l['x'] as num).toDouble()),
        if (l['rotation'] is num) 'rotation': photoEditNormAngle(-(l['rotation'] as num).toDouble()),
      },
  ];
  return v1api.PhotoEditDoc(
    v: doc.v,
    geometry: v1api.PhotoEditGeometry(
      turns: turns,
      flip: !g.flip,
      straighten: g.straighten == 0 ? 0 : -g.straighten,
      crop: crop,
      aspect: g.aspect,
    ),
    adjust: Map<String, dynamic>.from(doc.adjust),
    levels: doc.levels,
    filter: doc.filter,
    layers: layers,
  );
}

v1api.PhotoEditDoc photoEditResetGeometry(v1api.PhotoEditDoc doc) {
  var e = doc.geometry.flip ? photoEditFlip(doc) : doc;
  while (e.geometry.turns != 0) {
    e = photoEditRotateCW(e);
  }
  return v1api.PhotoEditDoc(
    v: e.v,
    geometry: v1api.PhotoEditGeometry(turns: 0, flip: false, straighten: 0, crop: null, aspect: 'free'),
    adjust: Map<String, dynamic>.from(e.adjust),
    levels: e.levels,
    filter: e.filter,
    layers: e.layers,
  );
}

// ─── Живой цвет (4×5 ColorFilter.matrix, один в один с порядком applyColor в color.ts) ──────────────────────────

const List<double> _identityMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/// Произведение двух 4×5 цветовых матриц: сначала применяется [a], затем [b].
List<double> _mulColorMatrix(List<double> b, List<double> a) {
  final out = List<double>.filled(20, 0);
  for (var r = 0; r < 4; r++) {
    for (var c = 0; c < 4; c++) {
      out[r * 5 + c] =
          b[r * 5 + 0] * a[0 * 5 + c] +
          b[r * 5 + 1] * a[1 * 5 + c] +
          b[r * 5 + 2] * a[2 * 5 + c] +
          b[r * 5 + 3] * a[3 * 5 + c];
    }
    out[r * 5 + 4] =
        b[r * 5 + 0] * a[0 * 5 + 4] +
        b[r * 5 + 1] * a[1 * 5 + 4] +
        b[r * 5 + 2] * a[2 * 5 + 4] +
        b[r * 5 + 3] * a[3 * 5 + 4] +
        b[r * 5 + 4];
  }
  return out;
}

Map<String, double> photoEditEffectiveAdjust(
  Map<String, dynamic> adjust,
  v1api.PhotoEditFilter filter,
  List<v1api.PhotoEditorAdjustControl> controls,
  List<v1api.PhotoEditorFilterPreset> presets,
) {
  final preset = presets.where((p) => p.id == filter.id).firstOrNull;
  final k = filter.strength / 100.0;
  final out = <String, double>{};
  for (final c in controls) {
    final userVal = (adjust[c.key] as num?)?.toDouble() ?? c.defaultValue;
    final extraVal = (preset?.adjust[c.key] as num?)?.toDouble() ?? 0.0;
    out[c.key] = (userVal + extraVal * k).clamp(c.min, c.max).toDouble();
  }
  return out;
}

List<double> buildPhotoEditColorMatrix(
  v1api.PhotoEditDoc doc,
  List<v1api.PhotoEditorAdjustControl> controls,
  List<v1api.PhotoEditorFilterPreset> presets, {
  v1api.PhotoEditFilter? overrideFilter,
}) {
  final filter = overrideFilter ?? doc.filter;
  final preset = presets.where((p) => p.id == filter.id).firstOrNull;
  final a = photoEditEffectiveAdjust(doc.adjust, filter, controls, presets);
  var m = List<double>.from(_identityMatrix);

  // 1. Уровни «Авто».
  final lv = doc.levels;
  if (lv != null) {
    final span = math.max(0.01, lv.white - lv.black);
    final s = 1.0 / span;
    final off = -lv.black * s * 255.0;
    m = _mulColorMatrix([
      s, 0, 0, 0, off,
      0, s, 0, 0, off,
      0, 0, s, 0, off,
      0, 0, 0, 1, 0,
    ], m);
    if ((lv.gamma - 1.0).abs() > 0.005) {
      final lift = (1.0 - (1.0 / lv.gamma)) * 38.0;
      m = _mulColorMatrix([
        1, 0, 0, 0, lift,
        0, 1, 0, 0, lift,
        0, 0, 1, 0, lift,
        0, 0, 0, 1, 0,
      ], m);
    }
  }

  // 2. Тепло и оттенок (точные коэффициенты color.ts).
  final warm = (a['warmth'] ?? 0) / 100.0;
  final tint = (a['tint'] ?? 0) / 100.0;
  if (warm != 0 || tint != 0) {
    final gr = 1 + 0.14 * warm + 0.04 * tint;
    final gg = 1 + 0.03 * warm - 0.09 * tint;
    final gb = 1 - 0.16 * warm + 0.04 * tint;
    m = _mulColorMatrix([
      gr, 0, 0, 0, 0,
      0, gg, 0, 0, 0,
      0, 0, gb, 0, 0,
      0, 0, 0, 1, 0,
    ], m);
  }

  // 3. Яркость, тени и света.
  final brightness = (a['brightness'] ?? 0) / 100.0;
  final shadows = (a['shadows'] ?? 0) / 100.0;
  final highlights = (a['highlights'] ?? 0) / 100.0;
  if (brightness != 0 || shadows != 0 || highlights != 0) {
    final gain = 1.0 + brightness * 0.25 + highlights * 0.18 - shadows * 0.12;
    final offset = (brightness * 0.28 + shadows * 0.22 + highlights * 0.08) * 255.0;
    m = _mulColorMatrix([
      gain, 0, 0, 0, offset,
      0, gain, 0, 0, offset,
      0, 0, gain, 0, offset,
      0, 0, 0, 1, 0,
    ], m);
  }

  // 4. Контраст (точные коэффициенты color.ts).
  final contrast = (a['contrast'] ?? 0) / 100.0;
  if (contrast != 0) {
    final k = contrast >= 0 ? 1 + contrast * 1.1 : 1 + contrast * 0.75;
    final t = 127.5 * (1 - k);
    m = _mulColorMatrix([
      k, 0, 0, 0, t,
      0, k, 0, 0, t,
      0, 0, k, 0, t,
      0, 0, 0, 1, 0,
    ], m);
  }

  // 5. Выцветание (точные коэффициенты color.ts).
  final fade = (a['fade'] ?? 0) / 100.0;
  if (fade != 0) {
    final s = 1 - 0.26 * fade;
    final off = 0.13 * fade * 255.0;
    m = _mulColorMatrix([
      s, 0, 0, 0, off,
      0, s, 0, 0, off,
      0, 0, s, 0, off,
      0, 0, 0, 1, 0,
    ], m);
  }

  // 6. Насыщенность (Rec.601 luma, как в color.ts).
  final sat = 1.0 + (a['saturation'] ?? 0) / 100.0;
  if (sat != 1.0) {
    final inv = 1.0 - sat;
    const lr = 0.299, lg = 0.587, lb = 0.114;
    m = _mulColorMatrix([
      lr * inv + sat, lg * inv, lb * inv, 0, 0,
      lr * inv, lg * inv + sat, lb * inv, 0, 0,
      lr * inv, lg * inv, lb * inv + sat, 0, 0,
      0, 0, 0, 1, 0,
    ], m);
  }

  // 7. Ч/Б, сепия и тонирование фильтра (параметры приходят с сервера в preset).
  final fk = filter.strength / 100.0;
  final mono = (preset?.mono ?? 0.0) * fk;
  if (mono > 0) {
    final keep = 1.0 - mono;
    const lr = 0.299, lg = 0.587, lb = 0.114;
    m = _mulColorMatrix([
      keep + lr * mono, lg * mono, lb * mono, 0, 0,
      lr * mono, keep + lg * mono, lb * mono, 0, 0,
      lr * mono, lg * mono, keep + lb * mono, 0, 0,
      0, 0, 0, 1, 0,
    ], m);
  }

  final sepia = (preset?.sepia ?? 0.0) * fk;
  if (sepia > 0) {
    final keep = 1.0 - sepia;
    m = _mulColorMatrix([
      keep + 0.393 * sepia, 0.769 * sepia, 0.189 * sepia, 0, 0,
      0.349 * sepia, keep + 0.686 * sepia, 0.168 * sepia, 0, 0,
      0.272 * sepia, 0.534 * sepia, keep + 0.131 * sepia, 0, 0,
      0, 0, 0, 1, 0,
    ], m);
  }

  if (preset?.splitShadows != null && preset?.splitHighlights != null && fk > 0) {
    final sh = preset!.splitShadows!;
    final hi = preset.splitHighlights!;
    if (sh.length >= 3 && hi.length >= 3) {
      final dr = (sh[0] + hi[0]) * 0.5 * 255.0 * fk;
      final dg = (sh[1] + hi[1]) * 0.5 * 255.0 * fk;
      final db = (sh[2] + hi[2]) * 0.5 * 255.0 * fk;
      m = _mulColorMatrix([
        1, 0, 0, 0, dr,
        0, 1, 0, 0, dg,
        0, 0, 1, 0, db,
        0, 0, 0, 1, 0,
      ], m);
    }
  }

  return m;
}

// ─── Экран редактора фото ──────────────────────────────────────────────────────────────────────────────────────

/// Нативный редактор фото — один в один с кабинетом сайта (PhotoEditor.tsx):
/// верхняя полоса (закрыть, отменить/вернуть, «До», ещё, «Сохранить»), живая сцена (кадрирование в пропорциях
/// слота или свободно, поворот 90°, отражение, выпрямление, живые фильтры и ползунки света/цвета, виньетка,
/// предупреждение о малом размере и низком DPI). Все надписи, диапазоны и пресеты приходят с сервера (photoEditorGet).
class PhotoEditorScreen extends StatefulWidget {
  const PhotoEditorScreen({
    super.key,
    required this.bookId,
    required this.photoId,
    this.initialState,
    this.imageBuilder,
  });

  final String bookId;
  final String photoId;
  /// Необязательное предзагруженное состояние (для виджет-тестов).
  final v1api.PhotoEditorState? initialState;
  /// Необязательный билдер картинки (для виджет-тестов без сети).
  final Widget Function(BuildContext context, String url, Map<String, String> headers)? imageBuilder;

  @override
  State<PhotoEditorScreen> createState() => _PhotoEditorScreenState();
}

class _PhotoEditorScreenState extends State<PhotoEditorScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.PhotoEditorState? _state;
  String? _loadError;

  final List<v1api.PhotoEditDoc> _history = [];
  int _histIndex = 0;
  String? _lastKey;
  bool _inGesture = false;

  late String _initialJson = '';
  String _tool = 'crop';
  String? _activeAdjustKey;
  bool _comparing = false;
  bool _saving = false;

  v1api.MybookApi get _api => _session.backend.contract;
  v1api.PhotoEditDoc get _doc => _history[_histIndex];
  bool get _canUndo => _histIndex > 0;
  bool get _canRedo => _histIndex < _history.length - 1;
  bool get _dirty => _state != null && jsonEncode(_doc.toJson()) != _initialJson;

  @override
  void initState() {
    super.initState();
    if (widget.initialState != null) {
      _applyLoaded(widget.initialState!);
    } else {
      _load();
    }
  }

  void _applyLoaded(v1api.PhotoEditorState s) {
    _state = s;
    _loadError = null;
    _history
      ..clear()
      ..add(s.edit);
    _histIndex = 0;
    _lastKey = null;
    _initialJson = jsonEncode(s.edit.toJson());
    _activeAdjustKey = s.adjustControls.isNotEmpty ? s.adjustControls.first.key : null;
  }

  Future<void> _load() async {
    setState(() {
      _state = null;
      _loadError = null;
    });
    try {
      final s = await _session.backend.call(() => _api.photoEditorGet(bookId: widget.bookId, photoId: widget.photoId));
      if (!mounted) return;
      setState(() => _applyLoaded(s));
    } on ApiException catch (e) {
      if (mounted) setState(() => _loadError = e.message);
    }
  }

  void _commit(v1api.PhotoEditDoc next, {String? coalesceKey}) {
    setState(() {
      if (_inGesture || (coalesceKey != null && _lastKey == coalesceKey && _histIndex > 0)) {
        _history[_histIndex] = next;
      } else {
        if (_histIndex < _history.length - 1) {
          _history.removeRange(_histIndex + 1, _history.length);
        }
        _history.add(next);
        if (_history.length > 60) {
          _history.removeAt(0);
        }
        _histIndex = _history.length - 1;
        _lastKey = coalesceKey;
      }
    });
  }

  void _beginGesture() {
    if (_histIndex < _history.length - 1) {
      _history.removeRange(_histIndex + 1, _history.length);
    }
    _history.add(_doc);
    if (_history.length > 60) _history.removeAt(0);
    _histIndex = _history.length - 1;
    _inGesture = true;
    _lastKey = null;
  }

  void _endGesture() {
    if (!_inGesture) return;
    _inGesture = false;
    if (_histIndex > 0 && jsonEncode(_history[_histIndex].toJson()) == jsonEncode(_history[_histIndex - 1].toJson())) {
      _history.removeAt(_histIndex);
      _histIndex--;
    }
  }

  void _undo() {
    if (!_canUndo) return;
    setState(() {
      _histIndex--;
      _lastKey = null;
    });
  }

  void _redo() {
    if (!_canRedo) return;
    setState(() {
      _histIndex++;
      _lastKey = null;
    });
  }

  Future<bool> _confirmDiscard() async {
    final s = _state;
    if (s == null || !_dirty || _saving) return true;
    final t = s.labels;
    final c = context.c;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(t.discardTitle),
        content: Text(t.discardText),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(t.discardNo)),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(t.discardYes, style: TextStyle(color: c.danger))),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _close() async {
    if (_saving) return;
    if (await _confirmDiscard() && mounted) Navigator.of(context).pop();
  }

  Future<void> _save() async {
    final s = _state;
    if (s == null || _saving) return;
    if (!_dirty) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _saving = true);
    try {
      final v1api.PhotoEditorResult res;
      if (photoEditIsEmpty(_doc)) {
        if (!s.edited) {
          if (mounted) Navigator.of(context).pop();
          return;
        }
        res = await _session.backend.call(() => _api.photoEditorRevert(bookId: widget.bookId, photoId: widget.photoId));
      } else {
        res = await _session.backend.call(
          () => _api.photoEditorSave(
            bookId: widget.bookId,
            photoId: widget.photoId,
            body: v1api.PhotoEditorSaveBody(version: s.version, edit: _doc),
          ),
        );
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.edited ? s.labels.saved : s.labels.reverted)));
      Navigator.of(context).pop(res);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _revert() async {
    final s = _state;
    if (s == null || _saving || !s.edited) return;
    final t = s.labels;
    final c = context.c;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(t.revertTitle),
        content: Text(t.revertText),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(t.cancel)),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(t.revertYes, style: TextStyle(color: c.danger))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _saving = true);
    try {
      final res = await _session.backend.call(() => _api.photoEditorRevert(bookId: widget.bookId, photoId: widget.photoId));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t.reverted)));
      Navigator.of(context).pop(res);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  void _pickAspect(v1api.PhotoEditorAspect a) {
    final s = _state!;
    final g = _doc.geometry;
    final turned = photoEditTurnedSize(s.originalWidth, s.originalHeight, g.turns);
    v1api.PhotoEditRect? nextCrop = g.crop;
    if (a.key == 'original') {
      nextCrop = null;
    } else if (a.key != 'free') {
      final ratio = a.ratio ?? _parseAspect(a.key) ?? (turned.w / math.max(1, turned.h));
      nextCrop = photoEditCenteredCrop(ratio, turned.w, turned.h, s.limits.minCropFraction);
    }
    _commit(
      v1api.PhotoEditDoc(
        v: _doc.v,
        geometry: v1api.PhotoEditGeometry(turns: g.turns, flip: g.flip, straighten: g.straighten, crop: nextCrop, aspect: a.key),
        adjust: Map<String, dynamic>.from(_doc.adjust),
        levels: _doc.levels,
        filter: _doc.filter,
        layers: _doc.layers,
      ),
      coalesceKey: 'aspect',
    );
  }

  double? _lockedRatio(v1api.PhotoEditorState s) {
    final key = _doc.geometry.aspect;
    if (key == 'free') return null;
    final turned = photoEditTurnedSize(s.originalWidth, s.originalHeight, _doc.geometry.turns);
    if (key == 'original') return turned.w / math.max(1, turned.h);
    final found = s.aspects.where((a) => a.key == key).firstOrNull;
    if (found?.ratio != null) return found!.ratio;
    return _parseAspect(key);
  }

  Widget _buildRawImage(v1api.PhotoEditorState s, {BoxFit fit = BoxFit.fill}) {
    final backend = _session.backend;
    final url = backend.url(s.originalUrl);
    final headers = backend.imageHeaders;
    if (widget.imageBuilder != null) return widget.imageBuilder!(context, url, headers);
    return Image.network(
      url,
      headers: headers,
      fit: fit,
      gaplessPlayback: true,
      errorBuilder: (_, _, _) => ColoredBox(color: context.c.surface),
    );
  }

  String? _resolutionWarning(v1api.PhotoEditorState s) {
    final out = photoEditOutputSize(s.originalWidth, s.originalHeight, _doc.geometry);
    final longSide = math.max(out.w, out.h);
    if (longSide < s.limits.smallLongSidePx) {
      return s.labels.cropSmallTemplate.replaceAll('{px}', '$longSide');
    }
    final slot = s.slot;
    if (slot != null) {
      final dpi = photoEditEffectiveDpi(out.w, out.h, slot);
      if (dpi < s.limits.minDpi) {
        return s.labels.lowDpiTemplate.replaceAll('{dpi}', '$dpi');
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final s = _state;
    if (s == null) {
      return Scaffold(
        backgroundColor: c.bg,
        appBar: AppBar(
          backgroundColor: c.surfaceRaised,
          foregroundColor: c.text,
          elevation: 0,
          leading: IconButton(icon: const Icon(LucideIcons.x), onPressed: () => Navigator.of(context).pop()),
        ),
        body: Center(
          child: _loadError == null
              ? CircularProgressIndicator(color: c.brand)
              : Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(LucideIcons.triangleAlert, size: 32, color: c.warn),
                      const SizedBox(height: 12),
                      Text(_loadError!, textAlign: TextAlign.center, style: TextStyle(fontSize: 15, color: c.textMuted)),
                      const SizedBox(height: 16),
                      IconButton.filled(
                        style: IconButton.styleFrom(backgroundColor: c.text, foregroundColor: c.bg),
                        onPressed: _load,
                        icon: const Icon(LucideIcons.refreshCw),
                      ),
                    ],
                  ),
                ),
        ),
      );
    }

    final t = s.labels;
    final effective = photoEditEffectiveAdjust(_doc.adjust, _doc.filter, s.adjustControls, s.filters);
    final colorMatrix = buildPhotoEditColorMatrix(_doc, s.adjustControls, s.filters);
    final vignette = effective['vignette'] ?? 0.0;
    final warnText = _resolutionWarning(s);

    return PopScope(
      canPop: !_dirty && !_saving,
      onPopInvokedWithResult: (didPop, _) async {
        if (!didPop) await _close();
      },
      child: Scaffold(
        backgroundColor: c.bg,
        body: Stack(
          children: [
            Column(
              children: [
                // Верхняя полоса (как PhotoEditor.tsx header).
                Container(
                  decoration: BoxDecoration(color: c.surfaceRaised, border: Border(bottom: BorderSide(color: c.border))),
                  child: SafeArea(
                    bottom: false,
                    child: SizedBox(
                      height: 54,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        child: Row(
                          children: [
                            IconButton(icon: const Icon(LucideIcons.x, size: 21), tooltip: t.close, onPressed: _close),
                            const Spacer(),
                            IconButton(icon: const Icon(LucideIcons.undo2, size: 20), tooltip: t.undo, onPressed: _canUndo ? _undo : null),
                            IconButton(icon: const Icon(LucideIcons.redo2, size: 20), tooltip: t.redo, onPressed: _canRedo ? _redo : null),
                            // Кнопка «До» — удерживать для сравнения с оригиналом.
                            Tooltip(
                              message: t.compare,
                              child: GestureDetector(
                                onTapDown: (_dirty || s.edited) ? (_) => setState(() => _comparing = true) : null,
                                onTapUp: (_) => setState(() => _comparing = false),
                                onTapCancel: () => setState(() => _comparing = false),
                                child: Container(
                                  height: 36,
                                  padding: const EdgeInsets.symmetric(horizontal: 10),
                                  decoration: BoxDecoration(
                                    color: _comparing ? c.text : Colors.transparent,
                                    borderRadius: BorderRadius.circular(Cab.ctl),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        LucideIcons.eye,
                                        size: 19,
                                        color: _comparing
                                            ? c.bg
                                            : (_dirty || s.edited ? c.text : c.textFaint),
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        t.compareShort,
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500,
                                          color: _comparing
                                              ? c.bg
                                              : (_dirty || s.edited ? c.text : c.textFaint),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            PopupMenuButton<String>(
                              tooltip: t.more,
                              icon: const Icon(LucideIcons.ellipsis, size: 20),
                              onSelected: (v) {
                                if (v == 'resetAll') {
                                  _commit(photoEditEmptyDoc());
                                } else if (v == 'revert') {
                                  _revert();
                                }
                              },
                              itemBuilder: (_) => [
                                PopupMenuItem<String>(
                                  value: 'resetAll',
                                  enabled: !photoEditIsEmpty(_doc),
                                  child: Text(t.resetAll),
                                ),
                                if (s.edited)
                                  PopupMenuItem<String>(
                                    value: 'revert',
                                    child: Text(t.revert, style: TextStyle(color: c.danger)),
                                  ),
                              ],
                            ),
                            const SizedBox(width: 4),
                            FilledButton(
                              style: FilledButton.styleFrom(
                                backgroundColor: c.brand,
                                foregroundColor: c.onBrand,
                                minimumSize: const Size(0, 38),
                                padding: const EdgeInsets.symmetric(horizontal: 16),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl)),
                              ),
                              onPressed: _saving ? null : _save,
                              child: Text(t.save, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                            ),
                            const SizedBox(width: 6),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),

                // Сцена живого превью.
                Expanded(
                  child: Container(
                    color: c.surface,
                    width: double.infinity,
                    child: _PhotoStage(
                      state: s,
                      doc: _doc,
                      cropping: _tool == 'crop',
                      comparing: _comparing,
                      colorMatrix: colorMatrix,
                      vignette: vignette,
                      lockedRatio: _lockedRatio(s),
                      image: _buildRawImage(s),
                      onCropStart: _beginGesture,
                      onCropChange: (rect) {
                        final g = _doc.geometry;
                        _commit(
                          v1api.PhotoEditDoc(
                            v: _doc.v,
                            geometry: v1api.PhotoEditGeometry(
                              turns: g.turns,
                              flip: g.flip,
                              straighten: g.straighten,
                              crop: rect,
                              aspect: g.aspect,
                            ),
                            adjust: Map<String, dynamic>.from(_doc.adjust),
                            levels: _doc.levels,
                            filter: _doc.filter,
                            layers: _doc.layers,
                          ),
                        );
                      },
                      onCropEnd: _endGesture,
                    ),
                  ),
                ),

                // Лента инструментов (Кадр / Свет / Фильтры — как на телефоне в PhotoEditor.tsx).
                Container(
                  decoration: BoxDecoration(color: c.surfaceRaised, border: Border(top: BorderSide(color: c.border))),
                  child: Row(
                    children: [
                      _ToolTab(id: 'crop', label: t.toolCrop, icon: LucideIcons.crop, active: _tool == 'crop', onTap: () => setState(() => _tool = 'crop')),
                      _ToolTab(id: 'adjust', label: t.toolAdjust, icon: LucideIcons.sunMedium, active: _tool == 'adjust', onTap: () => setState(() => _tool = 'adjust')),
                      _ToolTab(id: 'filters', label: t.toolFilters, icon: LucideIcons.image, active: _tool == 'filters', onTap: () => setState(() => _tool = 'filters')),
                    ],
                  ),
                ),

                // Панель выбранного инструмента фиксированной доли экрана — снимок не прыгает.
                Container(
                  height: (MediaQuery.sizeOf(context).height * 0.34).clamp(210.0, 310.0),
                  decoration: BoxDecoration(color: c.surfaceRaised, border: Border(top: BorderSide(color: c.border))),
                  child: SafeArea(
                    top: false,
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                      child: switch (_tool) {
                        'crop' => _buildCropPanel(s, warnText),
                        'adjust' => _buildAdjustPanel(s),
                        _ => _buildFiltersPanel(s),
                      },
                    ),
                  ),
                ),
              ],
            ),

            // Оверлей сохранения.
            if (_saving)
              Positioned.fill(
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.35),
                  child: Center(
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 32),
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: c.surfaceRaised,
                        borderRadius: BorderRadius.circular(Cab.panel),
                        border: Border.all(color: c.border),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircularProgressIndicator(color: c.brand),
                          const SizedBox(height: 14),
                          Text(t.saving, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                          const SizedBox(height: 6),
                          Text(t.savingHint, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: c.textMuted)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCropPanel(v1api.PhotoEditorState s, String? warnText) {
    final c = context.c;
    final t = s.labels;
    final g = _doc.geometry;
    final lim = s.limits;
    final hasGeom = g.crop != null || g.straighten != 0 || g.turns != 0 || g.flip;
    final divisions = ((lim.straightenMax - lim.straightenMin) / lim.straightenStep).round();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(t.cropAspect, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.textMuted)),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final a in s.aspects)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _ChoicePill(
                    label: a.label,
                    selected: g.aspect == a.key,
                    leading: a.ratio != null && a.key != 'original' ? _AspectGlyph(ratio: a.ratio!) : null,
                    onTap: () => _pickAspect(a),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _ActionTile(
                icon: LucideIcons.rotateCcw,
                label: t.cropRotateLeft,
                onTap: () => _commit(photoEditRotateCCW(_doc)),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _ActionTile(
                icon: LucideIcons.rotateCw,
                label: t.cropRotateRight,
                onTap: () => _commit(photoEditRotateCW(_doc)),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _ActionTile(
                icon: LucideIcons.flipHorizontal2,
                label: t.cropFlip,
                active: g.flip,
                onTap: () => _commit(photoEditFlip(_doc)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _EditorSlider(
          label: t.cropStraighten,
          value: g.straighten.clamp(lim.straightenMin, lim.straightenMax).toDouble(),
          min: lim.straightenMin,
          max: lim.straightenMax,
          divisions: divisions > 0 ? divisions : null,
          valueText: '${g.straighten > 0 ? '+' : ''}${g.straighten.toStringAsFixed(1)}°',
          resetLabel: g.straighten != 0 ? t.adjustReset : null,
          onReset: () => _commit(
            v1api.PhotoEditDoc(
              v: _doc.v,
              geometry: v1api.PhotoEditGeometry(turns: g.turns, flip: g.flip, straighten: 0, crop: g.crop, aspect: g.aspect),
              adjust: Map<String, dynamic>.from(_doc.adjust),
              levels: _doc.levels,
              filter: _doc.filter,
              layers: _doc.layers,
            ),
          ),
          onChanged: (v) => _commit(
            v1api.PhotoEditDoc(
              v: _doc.v,
              geometry: v1api.PhotoEditGeometry(turns: g.turns, flip: g.flip, straighten: _round2(v), crop: g.crop, aspect: g.aspect),
              adjust: Map<String, dynamic>.from(_doc.adjust),
              levels: _doc.levels,
              filter: _doc.filter,
              layers: _doc.layers,
            ),
            coalesceKey: 'straighten',
          ),
        ),
        if (hasGeom) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: c.text,
              side: BorderSide(color: c.border),
              minimumSize: const Size.fromHeight(42),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl)),
            ),
            onPressed: () => _commit(photoEditResetGeometry(_doc)),
            icon: const Icon(LucideIcons.rotateCcw, size: 16),
            label: Text(t.cropReset),
          ),
        ],
        if (warnText != null) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(Cab.ctl)),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(LucideIcons.triangleAlert, size: 16, color: c.warn),
                const SizedBox(width: 8),
                Expanded(child: Text(warnText, style: TextStyle(fontSize: 12.5, height: 1.35, color: c.warn))),
              ],
            ),
          ),
        ],
        const SizedBox(height: 8),
        Text(t.cropHint, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
      ],
    );
  }

  Widget _buildAdjustPanel(v1api.PhotoEditorState s) {
    final c = context.c;
    final t = s.labels;
    final controls = s.adjustControls;
    if (controls.isEmpty) return const SizedBox.shrink();
    final active = controls.where((x) => x.key == _activeAdjustKey).firstOrNull ?? controls.first;

    double valOf(v1api.PhotoEditorAdjustControl ctrl) => (_doc.adjust[ctrl.key] as num?)?.toDouble() ?? ctrl.defaultValue;

    void setVal(v1api.PhotoEditorAdjustControl ctrl, double v) {
      final nextAdjust = Map<String, dynamic>.from(_doc.adjust);
      final rounded = (v / ctrl.step).round() * ctrl.step;
      if (rounded == ctrl.defaultValue) {
        nextAdjust.remove(ctrl.key);
      } else {
        nextAdjust[ctrl.key] = rounded;
      }
      _commit(
        v1api.PhotoEditDoc(
          v: _doc.v,
          geometry: _doc.geometry,
          adjust: nextAdjust,
          levels: _doc.levels,
          filter: _doc.filter,
          layers: _doc.layers,
        ),
        coalesceKey: 'adjust:${ctrl.key}',
      );
    }

    final anyAdjust = _doc.levels != null || controls.any((ctrl) => valOf(ctrl) != ctrl.defaultValue);
    final activeVal = valOf(active).clamp(active.min, active.max).toDouble();
    final divisions = ((active.max - active.min) / active.step).round();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Кнопка «Авто» (уровни гистограммы с сервера).
        Material(
          color: _doc.levels != null ? c.bubbleOut : c.surfaceRaised,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(Cab.ctl),
            side: BorderSide(color: _doc.levels != null ? c.brand : c.border),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(Cab.ctl),
            onTap: () => _commit(
              v1api.PhotoEditDoc(
                v: _doc.v,
                geometry: _doc.geometry,
                adjust: Map<String, dynamic>.from(_doc.adjust),
                levels: _doc.levels != null ? null : s.suggestedLevels,
                filter: _doc.filter,
                layers: _doc.layers,
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(LucideIcons.wandSparkles, size: 18, color: _doc.levels != null ? c.brand : c.text),
                  const SizedBox(width: 8),
                  Text(t.adjustAuto, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: _doc.levels != null ? c.brand : c.text)),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(t.adjustAutoHint, style: TextStyle(fontSize: 12, color: c.textMuted)),
        const SizedBox(height: 12),

        // Ряд кружков-параметров (как на телефоне в AdjustPanel panels.tsx).
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final ctrl in controls)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: GestureDetector(
                    onTap: () => setState(() => _activeAdjustKey = ctrl.key),
                    child: SizedBox(
                      width: 68,
                      child: Column(
                        children: [
                          Container(
                            width: 42,
                            height: 42,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: active.key == ctrl.key
                                  ? c.brand
                                  : (valOf(ctrl) != ctrl.defaultValue ? c.bubbleOut : Colors.transparent),
                              border: Border.all(
                                color: active.key == ctrl.key || valOf(ctrl) != ctrl.defaultValue ? c.brand : c.border,
                              ),
                            ),
                            child: Text(
                              valOf(ctrl) != ctrl.defaultValue ? '${valOf(ctrl).round()}' : '·',
                              style: TextStyle(
                                fontSize: 12,
                                fontFeatures: const [FontFeature.tabularFigures()],
                                color: active.key == ctrl.key
                                    ? c.onBrand
                                    : (valOf(ctrl) != ctrl.defaultValue ? c.brand : c.textMuted),
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            ctrl.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: active.key == ctrl.key ? FontWeight.w600 : FontWeight.w400,
                              color: active.key == ctrl.key ? c.text : c.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),

        _EditorSlider(
          label: active.label,
          value: activeVal,
          min: active.min,
          max: active.max,
          divisions: divisions > 0 ? divisions : null,
          valueText: activeVal > 0 && active.centered ? '+${activeVal.round()}' : '${activeVal.round()}',
          resetLabel: activeVal != active.defaultValue ? t.adjustReset : null,
          onReset: () => setVal(active, active.defaultValue),
          onChanged: (v) => setVal(active, v),
        ),

        if (anyAdjust) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: c.text,
              side: BorderSide(color: c.border),
              minimumSize: const Size.fromHeight(42),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl)),
            ),
            onPressed: () => _commit(
              v1api.PhotoEditDoc(
                v: _doc.v,
                geometry: _doc.geometry,
                adjust: const {},
                levels: null,
                filter: _doc.filter,
                layers: _doc.layers,
              ),
            ),
            icon: const Icon(LucideIcons.rotateCcw, size: 16),
            label: Text(t.adjustResetAll),
          ),
        ],
      ],
    );
  }

  Widget _buildFiltersPanel(v1api.PhotoEditorState s) {
    final c = context.c;
    final t = s.labels;
    final lim = s.limits;
    final strengthDivisions = ((lim.filterStrengthMax - lim.filterStrengthMin) / lim.filterStrengthStep).round();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final preset in s.filters)
                Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: GestureDetector(
                    onTap: () => _commit(
                      v1api.PhotoEditDoc(
                        v: _doc.v,
                        geometry: _doc.geometry,
                        adjust: Map<String, dynamic>.from(_doc.adjust),
                        levels: _doc.levels,
                        filter: v1api.PhotoEditFilter(
                          id: preset.id,
                          strength: _doc.filter.id == preset.id ? _doc.filter.strength : lim.filterStrengthDefault,
                        ),
                        layers: _doc.layers,
                      ),
                      coalesceKey: 'filter',
                    ),
                    child: SizedBox(
                      width: 74,
                      child: Column(
                        children: [
                          Container(
                            width: 74,
                            height: 74,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(Cab.ctl),
                              border: Border.all(
                                color: _doc.filter.id == preset.id ? c.brand : Colors.transparent,
                                width: 2,
                              ),
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(Cab.ctl - 2),
                              child: ColorFiltered(
                                colorFilter: ColorFilter.matrix(
                                  buildPhotoEditColorMatrix(
                                    _doc,
                                    s.adjustControls,
                                    s.filters,
                                    overrideFilter: v1api.PhotoEditFilter(id: preset.id, strength: lim.filterStrengthDefault),
                                  ),
                                ),
                                child: _buildRawImage(s, fit: BoxFit.cover),
                              ),
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            preset.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: _doc.filter.id == preset.id ? FontWeight.w600 : FontWeight.w400,
                              color: _doc.filter.id == preset.id ? c.brand : c.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (_doc.filter.id != 'none') ...[
          const SizedBox(height: 14),
          _EditorSlider(
            label: t.filterStrength,
            value: _doc.filter.strength.clamp(lim.filterStrengthMin, lim.filterStrengthMax).toDouble(),
            min: lim.filterStrengthMin,
            max: lim.filterStrengthMax,
            divisions: strengthDivisions > 0 ? strengthDivisions : null,
            valueText: '${_doc.filter.strength.round()}%',
            onChanged: (v) => _commit(
              v1api.PhotoEditDoc(
                v: _doc.v,
                geometry: _doc.geometry,
                adjust: Map<String, dynamic>.from(_doc.adjust),
                levels: _doc.levels,
                filter: v1api.PhotoEditFilter(id: _doc.filter.id, strength: v.roundToDouble()),
                layers: _doc.layers,
              ),
              coalesceKey: 'strength',
            ),
          ),
        ],
      ],
    );
  }
}

// ─── Сцена с живым превью, матрицей трансформации, виньеткой и интерактивной рамкой кадра ──────────────────────

class _PhotoStage extends StatelessWidget {
  const _PhotoStage({
    required this.state,
    required this.doc,
    required this.cropping,
    required this.comparing,
    required this.colorMatrix,
    required this.vignette,
    required this.lockedRatio,
    required this.image,
    required this.onCropStart,
    required this.onCropChange,
    required this.onCropEnd,
  });

  final v1api.PhotoEditorState state;
  final v1api.PhotoEditDoc doc;
  final bool cropping;
  final bool comparing;
  final List<double> colorMatrix;
  final double vignette;
  final double? lockedRatio;
  final Widget image;
  final VoidCallback onCropStart;
  final ValueChanged<v1api.PhotoEditRect?> onCropChange;
  final VoidCallback onCropEnd;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final areaW = constraints.maxWidth;
        final areaH = constraints.maxHeight;
        if (areaW <= 0 || areaH <= 0) return const SizedBox.shrink();

        if (comparing) {
          final pad = 12.0;
          final fit = math.min((areaW - pad * 2) / math.max(1, state.originalWidth), (areaH - pad * 2) / math.max(1, state.originalHeight));
          final w = math.max(1.0, state.originalWidth * fit);
          final h = math.max(1.0, state.originalHeight * fit);
          return Center(child: SizedBox(width: w, height: h, child: image));
        }

        final g = doc.geometry;
        final turned = photoEditTurnedSize(state.originalWidth, state.originalHeight, g.turns);
        final crop = g.crop ?? const v1api.PhotoEditRect(x: 0, y: 0, w: 1, h: 1);
        final pad = cropping ? 24.0 : 12.0;
        final srcW = cropping ? turned.w.toDouble() : turned.w * crop.w;
        final srcH = cropping ? turned.h.toDouble() : turned.h * crop.h;
        final fit = math.min((areaW - pad * 2) / math.max(1.0, srcW), (areaH - pad * 2) / math.max(1.0, srcH));
        final dw = math.max(1.0, srcW * fit);
        final dh = math.max(1.0, srcH * fit);

        Widget buildGeoImage(double geoW, double geoH) {
          final cover = photoEditCoverScale(geoW, geoH, g.straighten);
          Widget child = Transform.flip(flipX: g.flip, child: image);
          child = RotatedBox(quarterTurns: g.turns, child: child);
          if (g.straighten != 0) {
            child = Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..rotateZ(g.straighten * math.pi / 180)
                ..scaleByDouble(cover, cover, 1, 1),
              child: child,
            );
          }
          return ClipRect(
            child: SizedBox(
              width: geoW,
              height: geoH,
              child: ColorFiltered(colorFilter: ColorFilter.matrix(colorMatrix), child: child),
            ),
          );
        }

        if (cropping) {
          return Center(
            child: SizedBox(
              width: dw,
              height: dh,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  buildGeoImage(dw, dh),
                  _CropOverlay(
                    rect: crop,
                    dw: dw,
                    dh: dh,
                    lockedRatio: lockedRatio,
                    minFraction: state.limits.minCropFraction,
                    mask: g.aspect == 'slot' ? state.slot?.mask : null,
                    onStart: onCropStart,
                    onChange: onCropChange,
                    onEnd: onCropEnd,
                  ),
                ],
              ),
            ),
          );
        }

        final fullW = dw / math.max(0.01, crop.w);
        final fullH = dh / math.max(0.01, crop.h);
        return Center(
          child: SizedBox(
            width: dw,
            height: dh,
            child: ClipRect(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  OverflowBox(
                    alignment: Alignment.topLeft,
                    minWidth: fullW,
                    maxWidth: fullW,
                    minHeight: fullH,
                    maxHeight: fullH,
                    child: Transform.translate(
                      offset: Offset(-crop.x * fullW, -crop.y * fullH),
                      child: buildGeoImage(fullW, fullH),
                    ),
                  ),
                  if (vignette > 0)
                    IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: RadialGradient(
                            radius: math.sqrt(dw * dw + dh * dh) / (2 * math.min(dw, dh)),
                            stops: const [0.38, 1.0],
                            colors: [
                              Colors.transparent,
                              Colors.black.withValues(alpha: (0.78 * (vignette / 100)).clamp(0.0, 1.0)),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

enum _CropHandle { move, nw, ne, sw, se, n, s, e, w }

class _CropOverlay extends StatefulWidget {
  const _CropOverlay({
    required this.rect,
    required this.dw,
    required this.dh,
    required this.lockedRatio,
    required this.minFraction,
    required this.mask,
    required this.onStart,
    required this.onChange,
    required this.onEnd,
  });

  final v1api.PhotoEditRect rect;
  final double dw;
  final double dh;
  final double? lockedRatio;
  final double minFraction;
  final String? mask;
  final VoidCallback onStart;
  final ValueChanged<v1api.PhotoEditRect?> onChange;
  final VoidCallback onEnd;

  @override
  State<_CropOverlay> createState() => _CropOverlayState();
}

class _CropOverlayState extends State<_CropOverlay> {
  _CropHandle? _active;
  Offset? _startPos;
  v1api.PhotoEditRect? _startRect;

  void _begin(_CropHandle h, Offset globalPos) {
    _active = h;
    _startPos = globalPos;
    _startRect = widget.rect;
    widget.onStart();
    setState(() {});
  }

  void _updateScale(Offset globalFocalPoint, double scale) {
    final startPos = _startPos;
    final sr = _startRect;
    if (_active != _CropHandle.move || startPos == null || sr == null) return;
    final dw = widget.dw;
    final dh = widget.dh;
    final minW = math.max(40.0 / dw, widget.minFraction);
    final minH = math.max(40.0 / dh, widget.minFraction);
    // При щипке (scale > 1) рамка сужается (приближение снимка), при сведении — расширяется.
    var nw = sr.w / scale.clamp(0.25, 4.0);
    var nh = sr.h / scale.clamp(0.25, 4.0);
    if (nw > 1.0 || nh > 1.0) {
      final k = math.min(1.0 / nw, 1.0 / nh);
      nw *= k;
      nh *= k;
    }
    if (nw < minW || nh < minH) {
      final k = math.max(minW / nw, minH / nh);
      nw = math.min(1.0, nw * k);
      nh = math.min(1.0, nh * k);
    }
    final cx = sr.x + sr.w / 2 + (globalFocalPoint.dx - startPos.dx) / dw;
    final cy = sr.y + sr.h / 2 + (globalFocalPoint.dy - startPos.dy) / dh;
    final next = photoEditClampRect(v1api.PhotoEditRect(x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh), widget.minFraction);
    final isFull = next.x <= 0.001 && next.y <= 0.001 && next.w >= 0.999 && next.h >= 0.999;
    widget.onChange(isFull ? null : next);
  }

  void _update(Offset globalPos) {
    final h = _active;
    final startPos = _startPos;
    final sr = _startRect;
    if (h == null || startPos == null || sr == null) return;
    final dw = widget.dw;
    final dh = widget.dh;
    final minPx = math.max(40.0, math.min(dw, dh) * widget.minFraction);
    final dx = globalPos.dx - startPos.dx;
    final dy = globalPos.dy - startPos.dy;
    var x = sr.x * dw;
    var y = sr.y * dh;
    var w = sr.w * dw;
    var height = sr.h * dh;

    if (h == _CropHandle.move) {
      x = (x + dx).clamp(0.0, dw - w).toDouble();
      y = (y + dy).clamp(0.0, dh - height).toDouble();
    } else {
      var x1 = x + w;
      var y1 = y + height;
      final isW = h == _CropHandle.w || h == _CropHandle.nw || h == _CropHandle.sw;
      final isE = h == _CropHandle.e || h == _CropHandle.ne || h == _CropHandle.se;
      final isN = h == _CropHandle.n || h == _CropHandle.nw || h == _CropHandle.ne;
      final isS = h == _CropHandle.s || h == _CropHandle.sw || h == _CropHandle.se;
      if (isW) x = (x + dx).clamp(0.0, x1 - minPx).toDouble();
      if (isE) x1 = (x1 + dx).clamp(x + minPx, dw).toDouble();
      if (isN) y = (y + dy).clamp(0.0, y1 - minPx).toDouble();
      if (isS) y1 = (y1 + dy).clamp(y + minPx, dh).toDouble();
      w = x1 - x;
      height = y1 - y;

      final ratio = widget.lockedRatio;
      if (ratio != null && ratio > 0) {
        final corner = (isW || isE) && (isN || isS);
        final byWidth = h == _CropHandle.e || h == _CropHandle.w || (corner && dx.abs() >= dy.abs());
        if (byWidth) {
          height = w / ratio;
        } else {
          w = height * ratio;
        }
        final cx = sr.x * dw + sr.w * dw / 2;
        final cy = sr.y * dh + sr.h * dh / 2;
        if (h == _CropHandle.n || h == _CropHandle.s) x = cx - w / 2;
        if (h == _CropHandle.e || h == _CropHandle.w) y = cy - height / 2;
        if (isN) y = sr.y * dh + sr.h * dh - height;
        if (isW) x = sr.x * dw + sr.w * dw - w;

        var k = 1.0;
        if (w > 0 && x < 0) k = math.min(k, (w + x) / w);
        if (w > 0 && x + w > dw) k = math.min(k, (dw - x) / w);
        if (height > 0 && y < 0) k = math.min(k, (height + y) / height);
        if (height > 0 && y + height > dh) k = math.min(k, (dh - y) / height);
        if (k < 1.0 && k > 0) {
          final nw = w * k;
          final nh = height * k;
          if (isW) x += w - nw;
          if (isN) y += height - nh;
          w = nw;
          height = nh;
        }
        x = x.clamp(0.0, math.max(0.0, dw - w)).toDouble();
        y = y.clamp(0.0, math.max(0.0, dh - height)).toDouble();
      }
    }

    final next = photoEditClampRect(v1api.PhotoEditRect(x: x / dw, y: y / dh, w: w / dw, h: height / dh), widget.minFraction);
    final isFull = next.x <= 0.001 && next.y <= 0.001 && next.w >= 0.999 && next.h >= 0.999;
    widget.onChange(isFull ? null : next);
  }

  void _end() {
    if (_active == null) return;
    _active = null;
    _startPos = null;
    _startRect = null;
    widget.onEnd();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final px = Rect.fromLTWH(widget.rect.x * widget.dw, widget.rect.y * widget.dh, widget.rect.w * widget.dw, widget.rect.h * widget.dh);
    const hit = 36.0;

    Widget handle(_CropHandle h, double left, double top, {double width = hit, double height = hit}) => Positioned(
          left: left,
          top: top,
          width: width,
          height: height,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onPanStart: (d) => _begin(h, d.globalPosition),
            onPanUpdate: (d) => _update(d.globalPosition),
            onPanEnd: (_) => _end(),
            onPanCancel: _end,
            child: const SizedBox.expand(),
          ),
        );

    return Stack(
      clipBehavior: Clip.none,
      children: [
        IgnorePointer(
          child: CustomPaint(
            size: Size(widget.dw, widget.dh),
            painter: _CropPainter(crop: px, active: _active != null, mask: widget.mask),
          ),
        ),
        // Перемещение рамки целиком и зум двумя пальцами.
        Positioned.fromRect(
          rect: px,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onScaleStart: (d) => _begin(_CropHandle.move, d.focalPoint),
            onScaleUpdate: (d) => _updateScale(d.focalPoint, d.scale),
            onScaleEnd: (_) => _end(),
            child: const SizedBox.expand(),
          ),
        ),
        // Стороны.
        if (px.width > hit) handle(_CropHandle.n, px.left + hit / 2, px.top - hit / 2, width: px.width - hit, height: hit),
        if (px.width > hit) handle(_CropHandle.s, px.left + hit / 2, px.bottom - hit / 2, width: px.width - hit, height: hit),
        if (px.height > hit) handle(_CropHandle.w, px.left - hit / 2, px.top + hit / 2, width: hit, height: px.height - hit),
        if (px.height > hit) handle(_CropHandle.e, px.right - hit / 2, px.top + hit / 2, width: hit, height: px.height - hit),
        // Углы.
        handle(_CropHandle.nw, px.left - hit / 2, px.top - hit / 2),
        handle(_CropHandle.ne, px.right - hit / 2, px.top - hit / 2),
        handle(_CropHandle.sw, px.left - hit / 2, px.bottom - hit / 2),
        handle(_CropHandle.se, px.right - hit / 2, px.bottom - hit / 2),
      ],
    );
  }
}

class _CropPainter extends CustomPainter {
  const _CropPainter({required this.crop, required this.active, this.mask});
  final Rect crop;
  final bool active;
  final String? mask;

  @override
  void paint(Canvas canvas, Size size) {
    final scrim = Paint()..color = const Color.fromRGBO(10, 8, 7, 0.62);
    final outer = Path()..addRect(Offset.zero & size);
    final hole = Path()..addRect(crop);
    canvas.drawPath(Path.combine(PathOperation.difference, outer, hole), scrim);

    // Сетка третей.
    final grid = Paint()
      ..color = Colors.white.withValues(alpha: active ? 0.65 : 0.35)
      ..strokeWidth = 0.8;
    for (var i = 1; i <= 2; i++) {
      final x = crop.left + crop.width * i / 3;
      final y = crop.top + crop.height * i / 3;
      canvas.drawLine(Offset(x, crop.top), Offset(x, crop.bottom), grid);
      canvas.drawLine(Offset(crop.left, y), Offset(crop.right, y), grid);
    }

    // Контур маски слота (круг / арка), если выбран слот.
    if (mask == 'circle') {
      canvas.drawOval(
        crop,
        Paint()
          ..color = Colors.white.withValues(alpha: 0.7)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2,
      );
    } else if (mask == 'arch') {
      final r = crop.width / 2;
      final arch = Path()
        ..moveTo(crop.left, crop.bottom)
        ..lineTo(crop.left, crop.top + r)
        ..arcToPoint(Offset(crop.right, crop.top + r), radius: Radius.circular(r))
        ..lineTo(crop.right, crop.bottom)
        ..close();
      canvas.drawPath(
        arch,
        Paint()
          ..color = Colors.white.withValues(alpha: 0.7)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2,
      );
    }

    // Белая рамка и угловые скобки.
    canvas.drawRect(
      crop,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.3,
    );
    final corner = Paint()
      ..color = Colors.white
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.square;
    const len = 18.0;
    // NW
    canvas.drawLine(crop.topLeft, crop.topLeft + const Offset(len, 0), corner);
    canvas.drawLine(crop.topLeft, crop.topLeft + const Offset(0, len), corner);
    // NE
    canvas.drawLine(crop.topRight, crop.topRight + const Offset(-len, 0), corner);
    canvas.drawLine(crop.topRight, crop.topRight + const Offset(0, len), corner);
    // SW
    canvas.drawLine(crop.bottomLeft, crop.bottomLeft + const Offset(len, 0), corner);
    canvas.drawLine(crop.bottomLeft, crop.bottomLeft + const Offset(0, -len), corner);
    // SE
    canvas.drawLine(crop.bottomRight, crop.bottomRight + const Offset(-len, 0), corner);
    canvas.drawLine(crop.bottomRight, crop.bottomRight + const Offset(0, -len), corner);
  }

  @override
  bool shouldRepaint(covariant _CropPainter old) => old.crop != crop || old.active != active || old.mask != mask;
}

// ─── Элементы управления панелей ───────────────────────────────────────────────────────────────────────────────

class _ToolTab extends StatelessWidget {
  const _ToolTab({required this.id, required this.label, required this.icon, required this.active, required this.onTap});
  final String id;
  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          height: 54,
          child: Stack(
            alignment: Alignment.center,
            children: [
              if (active)
                Positioned(
                  top: 0,
                  left: 16,
                  right: 16,
                  child: Container(
                    height: 2,
                    decoration: BoxDecoration(color: c.brand, borderRadius: const BorderRadius.vertical(bottom: Radius.circular(2))),
                  ),
                ),
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 20, color: active ? c.brand : c.textMuted),
                  const SizedBox(height: 3),
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: active ? c.brand : c.textMuted)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChoicePill extends StatelessWidget {
  const _ChoicePill({required this.label, required this.selected, this.leading, required this.onTap});
  final String label;
  final bool selected;
  final Widget? leading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: selected ? c.bubbleOut : c.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Cab.ctl),
        side: BorderSide(color: selected ? c.brand : Colors.transparent),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(Cab.ctl),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: 6)],
              Text(label, style: TextStyle(fontSize: 13, fontWeight: selected ? FontWeight.w600 : FontWeight.w400, color: selected ? c.brand : c.text)),
            ],
          ),
        ),
      ),
    );
  }
}

class _AspectGlyph extends StatelessWidget {
  const _AspectGlyph({required this.ratio});
  final double ratio;

  @override
  Widget build(BuildContext context) {
    final w = ratio >= 1 ? 13.0 : 13.0 * ratio;
    final h = ratio >= 1 ? 13.0 / ratio : 13.0;
    return Container(
      width: w.clamp(6.0, 14.0),
      height: h.clamp(6.0, 14.0),
      decoration: BoxDecoration(
        border: Border.all(color: context.c.textMuted, width: 1.4),
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.icon, required this.label, this.active = false, required this.onTap});
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: active ? c.bubbleOut : c.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Cab.ctl),
        side: BorderSide(color: active ? c.brand : c.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(Cab.ctl),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
          child: Column(
            children: [
              Icon(icon, size: 18, color: active ? c.brand : c.text),
              const SizedBox(height: 4),
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: active ? c.brand : c.textMuted)),
            ],
          ),
        ),
      ),
    );
  }
}

class _EditorSlider extends StatelessWidget {
  const _EditorSlider({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    this.divisions,
    required this.valueText,
    this.resetLabel,
    this.onReset,
    required this.onChanged,
  });

  final String label;
  final double value;
  final double min;
  final double max;
  final int? divisions;
  final String valueText;
  final String? resetLabel;
  final VoidCallback? onReset;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.text))),
            Text(valueText, style: TextStyle(fontSize: 13, color: c.textMuted, fontFeatures: const [FontFeature.tabularFigures()])),
            if (resetLabel != null && onReset != null) ...[
              const SizedBox(width: 4),
              IconButton(
                visualDensity: VisualDensity.compact,
                constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                padding: EdgeInsets.zero,
                tooltip: resetLabel,
                icon: Icon(LucideIcons.rotateCcw, size: 14, color: c.textMuted),
                onPressed: onReset,
              ),
            ],
          ],
        ),
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            activeTrackColor: c.brand,
            inactiveTrackColor: c.border,
            thumbColor: c.brand,
            overlayColor: c.brand.withValues(alpha: 0.14),
            trackHeight: 3,
          ),
          child: Slider(
            value: value.clamp(min, max).toDouble(),
            min: min,
            max: max,
            divisions: divisions,
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }
}
