import 'dart:io';

import 'package:flutter/foundation.dart';

import '../../core/api.dart';
import 'models.dart';

/// Откуда клиентское приложение берёт данные. Экраны знают только этот интерфейс: сейчас запись идёт в те же маршруты,
/// что у кабинета сайта (/api/books/*, Bearer-токен), а чтение подключается к контракту /api/v1 (сессия «Ресурсы»,
/// Dart-клиент из /api/v1/openapi.json) — тогда меняется только ApiBackend.
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

/// Сервер MyBooks.
class ApiBackend implements ClientBackend {
  ApiBackend(this.api);
  final ApiClient api;

  Map<String, String> get _auth => api.token == null ? const {} : {'Authorization': 'Bearer ${api.token}'};

  // ── Чтение и вход — маршруты контракта /api/v1 (появятся у сессии «Ресурсы»; пути сверить с openapi.json). ──

  @override
  Future<({String token, ClientUser user})> login(String login, String password) async {
    final r = await api.post('/api/v1/auth/login', body: {'login': login, 'password': password}) as Map<String, dynamic>;
    return (token: r['token'] as String, user: ClientUser.fromJson(r['user'] as Map<String, dynamic>));
  }

  @override
  Future<ClientUser> me() async => ClientUser.fromJson(await api.get('/api/v1/me') as Map<String, dynamic>);

  @override
  Future<void> logout() async {
    await api.post('/api/v1/auth/logout');
  }

  @override
  Future<List<BookSummary>> books() async {
    final r = await api.get('/api/v1/books') as Map<String, dynamic>;
    return [for (final b in r['books'] as List) BookSummary.fromJson(b as Map<String, dynamic>)];
  }

  @override
  Future<BookModel> book(String id) async => BookModel.fromJson(await api.get('/api/v1/books/$id/editor') as Map<String, dynamic>);

  // ── Запись — маршруты кабинета сайта, они уже принимают Bearer. ──

  @override
  Future<void> saveAnswer(String bookId, String questionId, String answer) async {
    await api.patch('/api/books/$bookId/questions/$questionId', body: {'answer': answer});
  }

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
