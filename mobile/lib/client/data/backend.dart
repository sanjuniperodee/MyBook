import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import 'models.dart';

/// Откуда клиентское приложение берёт данные. Экраны знают только этот интерфейс; на сервере — контракт API v1.
abstract class ClientBackend {
  Future<({String token, ClientUser user})> login(String login, String password);
  Future<ClientUser> me();
  Future<void> logout();
  Future<List<BookSummary>> books();
  Future<BookModel> book(String id);

  /// Автосохранение ответа (как редактор кабинета: `PATCH /api/books/{id}/questions/{qid}`).
  Future<void> saveAnswer(String bookId, String questionId, String answer);

  /// Загрузка фото в книгу (`POST /api/books/{id}/photos`, поле files): новые фото и тексты ошибок по файлам.
  Future<({List<BookPhoto> photos, List<String> errors})> uploadPhotos(String bookId, List<File> files);

  /// Картинка фото: адрес и заголовки (фото книги — только автору, по токену).
  ({String url, Map<String, String> headers}) photo(String photoId, {bool full = false});
}

/// Сервер MyBooks: контракт API v1 (сгенерированный клиент lib/api/mybook_api.g.dart, ADR 0012); загрузка фото — пока
/// маршрутом кабинета (в контракте её ещё нет).
class ApiBackend implements ClientBackend {
  ApiBackend(this.api) : v1 = v1api.MybookApi(baseUrl: api.baseUrl);
  final ApiClient api;
  final v1api.MybookApi v1;

  Map<String, String> get _auth => api.token == null ? const {} : {'Authorization': 'Bearer ${api.token}'};

  /// Ошибки контракта — в те же ApiException, что ждут экраны (401 — выход, 0 — нет сети).
  Future<T> _call<T>(Future<T> Function() run) async {
    v1.token = api.token;
    try {
      return await run();
    } on v1api.MybookApiException catch (e) {
      if (e.status == 401 && api.token != null) api.onUnauthorized?.call();
      throw ApiException(e.status, e.message, e.code);
    } on SocketException {
      throw ApiException(0, 'Нет связи с сервером. Проверьте интернет.');
    } on http.ClientException {
      throw ApiException(0, 'Нет связи с сервером. Проверьте интернет.');
    }
  }

  static ClientUser _user(v1api.User u) => ClientUser(id: u.id, name: u.name, phone: u.phone ?? u.email);

  @override
  Future<({String token, ClientUser user})> login(String login, String password) => _call(() async {
        final r = await v1.authLogin(body: v1api.LoginBody(login: login, password: password));
        final s = r.session;
        if (s == null) throw ApiException(403, 'У аккаунта включён вход с кодом — войдите на сайте mybooks.kz');
        if (s.user.isStaff) throw ApiException(403, 'Это аккаунт сотрудника — для него приложение MyBooks CRM');
        return (token: s.token, user: _user(s.user));
      });

  @override
  Future<ClientUser> me() => _call(() async => _user(await v1.me()));

  @override
  Future<void> logout() => _call(() async {
        await v1.authLogout();
      });

  @override
  Future<List<BookSummary>> books() => _call(() async => [
        for (final b in (await v1.booksList()).books)
          BookSummary(id: b.id, title: b.title, status: b.status, answered: b.answered, questions: b.total, photos: b.photos, updatedAt: DateTime.tryParse(b.updatedAt)),
      ]);

  @override
  Future<BookModel> book(String id) => _call(() async {
        final e = await v1.bookEditor(bookId: id);
        return BookModel(
          id: e.book.id,
          title: e.book.title,
          // editable — право автора (черновик и его книга); экраны смотрят на status.
          status: e.editable ? 'draft' : (e.book.status == 'draft' ? 'readonly' : e.book.status),
          chapters: [for (final c in e.chapters) Chapter(key: c.key, title: c.title)],
          questions: [
            for (final q in e.questions)
              Question(id: q.id, chapter: q.chapter, prompt: q.prompt, hint: q.hint, title: q.defaultTitle, answer: q.answer),
          ],
          photos: <BookPhoto>[],
          maxPhotos: 100,
        );
      });

  @override
  Future<void> saveAnswer(String bookId, String questionId, String answer) => _call(() async {
        await v1.questionSave(bookId: bookId, questionId: questionId, body: v1api.QuestionPatch(answer: answer));
      });

  @override
  Future<({List<BookPhoto> photos, List<String> errors})> uploadPhotos(String bookId, List<File> files) async {
    final r = await api.multipart('/api/books/$bookId/photos', files: [
      for (final f in files) (field: 'files', file: f, filename: f.uri.pathSegments.last, contentType: _mime(f.path)),
    ]) as Map<String, dynamic>;
    return (
      photos: [for (final p in (r['photos'] as List? ?? const [])) BookPhoto.fromJson(p as Map<String, dynamic>)],
      errors: [for (final e in (r['errors'] as List? ?? const [])) e as String],
    );
  }

  @override
  ({String url, Map<String, String> headers}) photo(String photoId, {bool full = false}) =>
      (url: api.uri('/api/photos/$photoId', {'size': full ? 'view' : null}).toString(), headers: _auth);

  static String _mime(String path) {
    final p = path.toLowerCase();
    if (p.endsWith('.png')) return 'image/png';
    if (p.endsWith('.heic') || p.endsWith('.heif')) return 'image/heic';
    if (p.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
}

/// Только для отладки (--dart-define=CLIENT_FIXTURES=1, в релизе не включается): книга из фикстуры в памяти, чтобы
/// проверять экраны в симуляторе, пока контракта /api/v1 нет. Фото — локальные файлы.
class FixtureBackend implements ClientBackend {
  static const enabled = kDebugMode && bool.fromEnvironment('CLIENT_FIXTURES');

  final _user = const ClientUser(id: 'fixture-client', name: 'Айгерим', phone: '+7 700 000 00 00');
  final Map<String, File> _files = {};
  late final BookModel _book = BookModel(
    id: 'fixture-book',
    title: 'Книга для мамы',
    status: 'draft',
    maxPhotos: 100,
    chapters: const [Chapter(key: 'childhood', title: 'Детство'), Chapter(key: 'youth', title: 'Юность'), Chapter(key: 'family', title: 'Семья')],
    questions: [
      Question(id: 'q1', chapter: 'childhood', title: 'Где ты родилась', prompt: 'Где ты родилась и каким был дом твоего детства?', hint: 'Улица, двор, запахи, соседи — всё, что вспоминается.', answer: 'В Караганде, в доме на улице Ленина. У нас был большой двор с яблонями.'),
      Question(id: 'q2', chapter: 'childhood', title: 'Любимая игра', prompt: 'Во что ты любила играть в детстве?', answer: ''),
      Question(id: 'q3', chapter: 'youth', title: 'Первая работа', prompt: 'Кем ты работала впервые и чему это научило?', answer: ''),
      Question(id: 'q4', chapter: 'family', title: 'Как вы познакомились', prompt: 'Как вы познакомились с папой?', hint: 'Где, кто кого заметил первым, что было на первом свидании.', answer: ''),
    ],
    photos: <BookPhoto>[],
  );

  @override
  Future<({String token, ClientUser user})> login(String login, String password) async => (token: 'fixture', user: _user);
  @override
  Future<ClientUser> me() async => _user;
  @override
  Future<void> logout() async {}
  @override
  Future<List<BookSummary>> books() async => [
        BookSummary(id: _book.id, title: _book.title, status: _book.status, answered: _book.answered, questions: _book.questions.length, photos: _book.photos.length, updatedAt: DateTime.now()),
        BookSummary(id: 'fixture-old', title: 'Книга о бабушке', status: 'ordered', answered: 32, questions: 32, photos: 18, orderStatus: 'printing'),
      ];
  @override
  Future<BookModel> book(String id) async => BookModel.fromJson(_book.toJson());
  @override
  Future<void> saveAnswer(String bookId, String questionId, String answer) async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
    _book.questions.firstWhere((q) => q.id == questionId).answer = answer;
  }

  @override
  Future<({List<BookPhoto> photos, List<String> errors})> uploadPhotos(String bookId, List<File> files) async {
    final out = <BookPhoto>[];
    for (final f in files) {
      final id = 'local-${DateTime.now().microsecondsSinceEpoch}-${out.length}';
      _files[id] = f;
      out.add(BookPhoto(id: id, width: 1200, height: 900, caption: ''));
    }
    _book.photos.addAll(out);
    return (photos: out, errors: const <String>[]);
  }

  @override
  ({String url, Map<String, String> headers}) photo(String photoId, {bool full = false}) => (url: _files[photoId]?.uri.toString() ?? '', headers: const {});
}
