import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/cache.dart';
import 'backend.dart';
import 'models.dart';

/// Полка: из кэша сразу, с сервера следом.
class ShelfStore extends ChangeNotifier {
  ShelfStore(this.backend);
  final ClientBackend backend;
  v1api.CabinetShelf? shelf;
  String? error;
  bool loading = false;

  Future<void> load() async {
    if (shelf == null) {
      final cached = await LocalCache.read('shelf');
      if (cached != null && shelf == null) {
        try {
          shelf = v1api.CabinetShelf.fromJson(cached);
          notifyListeners();
        } catch (_) {}
      }
    }
    await refresh();
  }

  Future<void> refresh() async {
    loading = true;
    notifyListeners();
    try {
      shelf = await backend.shelf();
      error = null;
      LocalCache.write('shelf', shelf!.toJson());
    } on ApiException catch (e) {
      error = e.status == 0 && shelf != null
          ? 'Нет связи — показано сохранённое на телефоне'
          : e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}

enum SaveState { saved, saving, offline, failed }

/// Работа над одной книгой: модель редактора и автосохранение ответов. Ответ сохраняется через секунду после того, как
/// автор перестал печатать; без сети — остаётся в очереди на телефоне (кэш) и уходит, как только сеть появится.
class BookStore extends ChangeNotifier {
  BookStore(this.backend, this.bookId);
  final ClientBackend backend;
  final String bookId;

  BookModel? book;
  String? error;
  SaveState save = SaveState.saved;

  /// Несохранённые ответы: вопрос → текст.
  final Map<String, String> _pending = {};
  Timer? _timer;
  bool _flushing = false;
  bool _disposed = false;

  String get _cacheKey => 'book-$bookId';
  Future<void>? _loading;

  /// Загрузка (повторный вызов во время загрузки ждёт ту же).
  Future<void> load() =>
      _loading ??= _load().whenComplete(() => _loading = null);

  Future<void> _load() async {
    final cached = await LocalCache.read(_cacheKey);
    if (cached != null && book == null) {
      book = BookModel.fromJson(cached['book'] as Map<String, dynamic>);
      for (final e in ((cached['pending'] as Map?) ?? const {}).entries) {
        _pending[e.key as String] = e.value as String;
      }
      _applyPending();
      notifyListeners();
    }
    try {
      book = await backend.book(bookId);
      _applyPending();
      error = null;
      _persist();
    } on ApiException catch (e) {
      // Без сети с книгой из кэша работаем молча; ответы сохранятся, когда сеть появится.
      if (!(e.status == 0 && book != null)) error = e.message;
    } on SocketException {
      if (book == null)
        error = 'Нет связи. Книга откроется, когда телефон будет в сети.';
    }
    if (!_disposed) notifyListeners();
    if (_pending.isNotEmpty) _flush();
  }

  void _applyPending() {
    for (final q in book?.questions ?? const <Question>[]) {
      final p = _pending[q.id];
      if (p != null) q.answer = p;
    }
  }

  void _persist() {
    if (book != null)
      LocalCache.write(_cacheKey, {
        'book': book!.toJson(),
        'pending': _pending,
      });
  }

  /// Автор печатает: запоминаем текст и откладываем сохранение.
  void edit(Question q, String text) {
    q.answer = text;
    _pending[q.id] = text;
    save = SaveState.saving;
    _persist();
    notifyListeners();
    _timer?.cancel();
    _timer = Timer(const Duration(milliseconds: 900), _flush);
  }

  /// Сохранить сейчас (уход с экрана ответа).
  Future<void> flush() async {
    _timer?.cancel();
    await _flush();
  }

  Future<void> _flush() async {
    if (_flushing || _pending.isEmpty) return;
    _flushing = true;
    try {
      while (_pending.isNotEmpty) {
        final id = _pending.keys.first;
        final text = _pending[id]!;
        await backend.saveAnswer(bookId, id, text);
        // Пока сохраняли, автор мог дописать — тогда этот ответ уйдёт следующим кругом.
        if (_pending[id] == text) _pending.remove(id);
      }
      save = SaveState.saved;
    } on SocketException {
      save = SaveState.offline;
      _retryLater();
    } on ApiException catch (e) {
      save = e.status == 0 ? SaveState.offline : SaveState.failed;
      if (save == SaveState.offline) _retryLater();
    } finally {
      _flushing = false;
      _persist();
      if (!_disposed) notifyListeners();
    }
  }

  void _retryLater() {
    _timer?.cancel();
    _timer = Timer(const Duration(seconds: 10), _flush);
  }

  /// Загрузка фото: новые — сразу в книгу; ошибки по файлам — для показа автору.
  Future<List<String>> upload(List<File> files) async {
    final r = await backend.uploadPhotos(bookId, files);
    book?.photos.addAll(r.photos);
    _persist();
    notifyListeners();
    return r.errors;
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    // Несохранённое уходит в фоне (и уже лежит в кэше на случай, если приложение закроют).
    if (_pending.isNotEmpty) _flush();
    super.dispose();
  }
}
