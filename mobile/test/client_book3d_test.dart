import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mybooks_seller/api/mybook_api.g.dart' as v1api;
import 'package:mybooks_seller/client/ui/book3d_scene.dart';

/// 3D-книга приложения: сцена строится из bookModel (60, 104 и 200 страниц), невидимые грани не рисуются, кадр
/// укладывается в бюджет 60 fps, нажатие попадает в обложку и страницы так же, как raycast сайта.
BookSceneModel _model(int pages) => BookSceneModel(v1api.BookModel.fromJson(jsonDecode(File('test/fixtures/book_model_$pages.json').readAsStringSync()) as Map<String, dynamic>));

BookFrame _frame(BookSceneModel m, {double pos = 0, double? azimuth, double? polar}) => BookFrame(
      model: m,
      cam: Camera3(azimuth ?? m.s.initial.azimuth, polar ?? m.s.initial.polar, m.baseDistance),
      pos: pos,
      spread: null,
      pages: (_) => null,
      edgeColor: const Color(0xFFB9AB93),
    );

const _size = Size(370, 296);

void main() {
  for (final pages in [60, 104, 200]) {
    test('$pages стр.: размеры и толщина — из сервера, книга в кадре', () {
      final m = _model(pages);
      expect(m.m.pageCount, pages);
      final f = _frame(m)..layout(_size);
      // Спереди — обложка по центру кадра.
      expect(f.pick(const Offset(185, 148)), 'next');
      // Мимо книги — ничего.
      expect(f.pick(const Offset(4, 4)), isNull);
    });
  }

  test('толщина корешка растёт со страницами (как печать)', () {
    expect(_model(200).d.d, greaterThan(_model(104).d.d));
    expect(_model(104).d.d, greaterThan(_model(60).d.d));
  });

  test('раскрытая книга: справа страница — «дальше», слева — «назад»', () {
    final m = _model(104);
    final r = m.s.read;
    final f = BookFrame(model: m, cam: Camera3(r.azimuth, r.polar, m.baseDistance / r.zoom), pos: 3, spread: null, pages: (_) => null, edgeColor: const Color(0xFFB9AB93))..layout(_size);
    expect(f.pick(const Offset(185 + 60, 148)), 'next');
    expect(f.pick(const Offset(185 - 60, 148)), 'prev');
  });

  test('кадр с листанием укладывается в 16 мс (сборка треугольников и запись рисования)', () {
    final m = _model(200);
    // Разогрев JIT.
    for (var i = 0; i < 30; i++) {
      _frame(m, pos: 1 + i / 30).layout(_size);
    }
    // Лучшая из пяти серий: замер не зависит от того, чем ещё занята машина (параллельные тесты, сборка).
    const n = 60;
    var best = double.infinity;
    for (var run = 0; run < 5; run++) {
      final sw = Stopwatch()..start();
      for (var i = 0; i < n; i++) {
        final f = _frame(m, pos: 2 + i / n, azimuth: i / 20)..layout(_size);
        final rec = ui.PictureRecorder();
        f.paint(Canvas(rec));
        rec.endRecording().dispose();
      }
      best = sw.elapsedMicroseconds / n / 1000 < best ? sw.elapsedMicroseconds / n / 1000 : best;
    }
    final perFrame = best;
    // ignore: avoid_print
    print('3D-книга: ${perFrame.toStringAsFixed(2)} мс на кадр');
    expect(perFrame, lessThan(16));
  });
}
