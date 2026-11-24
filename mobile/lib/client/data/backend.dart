import 'dart:io';

import 'package:http/http.dart' as http;

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import 'models.dart';

/// Откуда клиентское приложение берёт данные. Экраны знают только этот интерфейс; на сервере — контракт API v1.
abstract class ClientBackend {
  Future<({String token, ClientUser user})> login(
    String login,
    String password,
  );
  Future<ClientUser> me();
  Future<void> logout();
  Future<List<BookSummary>> books();

  /// Полка «Мои книги» — модель экрана сайта (подписи, сроки, заказ, обложки).
  Future<v1api.CabinetShelf> shelf();

  /// Штаб книги — модель страницы книги сайта.
  Future<v1api.CabinetBook> hub(String bookId);

  /// Полный адрес своего ресурса (обложка, фото) и заголовки для картинок (токен автора).
  String url(String path);
  Map<String, String> get imageHeaders;
  Future<BookModel> book(String id);

  /// Автосохранение ответа (как редактор кабинета: `PATCH /api/books/{id}/questions/{qid}`).
  Future<void> saveAnswer(String bookId, String questionId, String answer);

  /// Загрузка фото в книгу (`POST /api/books/{id}/photos`, поле files): новые фото и тексты ошибок по файлам.
  Future<({List<BookPhoto> photos, List<String> errors})> uploadPhotos(
    String bookId,
    List<File> files,
  );

  /// Картинка фото: адрес и заголовки (фото книги — только автору, по токену).
  ({String url, Map<String, String> headers}) photo(
    String photoId, {
    bool full = false,
  });
}

/// Сервер MyBooks: контракт API v1 (сгенерированный клиент lib/api/mybook_api.g.dart, ADR 0012); загрузка фото — пока
/// маршрутом кабинета (в контракте её ещё нет).
class ApiBackend implements ClientBackend {
  ApiBackend(this.api) : v1 = v1api.MybookApi(baseUrl: api.baseUrl);
  final ApiClient api;
  final v1api.MybookApi v1;

  Map<String, String> get _auth =>
      api.token == null ? const {} : {'Authorization': 'Bearer ${api.token}'};

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

  static ClientUser _user(v1api.User u) =>
      ClientUser(id: u.id, name: u.name, phone: u.phone ?? u.email);

  @override
  Future<({String token, ClientUser user})> login(
    String login,
    String password,
  ) => _call(() async {
    final r = await v1.authLogin(
      body: v1api.LoginBody(login: login, password: password),
    );
    final s = r.session;
    if (s == null)
      throw ApiException(
        403,
        'У аккаунта включён вход с кодом — войдите на сайте mybooks.kz',
      );
    if (s.user.isStaff)
      throw ApiException(
        403,
        'Это аккаунт сотрудника — для него приложение MyBooks CRM',
      );
    return (token: s.token, user: _user(s.user));
  });

  @override
  Future<ClientUser> me() => _call(() async => _user(await v1.me()));

  @override
  Future<void> logout() => _call(() async {
    await v1.authLogout();
  });

  @override
  Future<List<BookSummary>> books() => _call(
    () async => [
      for (final b in (await v1.booksList()).books)
        BookSummary(
          id: b.id,
          title: b.title,
          status: b.status,
          answered: b.answered,
          questions: b.total,
          photos: b.photos,
          updatedAt: DateTime.tryParse(b.updatedAt),
        ),
    ],
  );

  @override
  Future<v1api.CabinetShelf> shelf() => _call(() => v1.cabinetShelf());

  @override
  Future<v1api.CabinetBook> hub(String bookId) =>
      _call(() => v1.cabinetBook(bookId: bookId));

  @override
  String url(String path) => path.startsWith('http')
      ? path
      : '${api.baseUrl.replaceAll(RegExp(r'/+$'), '')}$path';

  @override
  Map<String, String> get imageHeaders => _auth;

  @override
  Future<BookModel> book(String id) => _call(() async {
    final e = await v1.bookEditor(bookId: id);
    return BookModel(
      id: e.book.id,
      title: e.book.title,
      // editable — право автора (черновик и его книга); экраны смотрят на status.
      status: e.editable
          ? 'draft'
          : (e.book.status == 'draft' ? 'readonly' : e.book.status),
      chapters: [
        for (final c in e.chapters) Chapter(key: c.key, title: c.title),
      ],
      questions: [
        for (final q in e.questions)
          Question(
            id: q.id,
            chapter: q.chapter,
            prompt: q.prompt,
            hint: q.hint,
            title: q.defaultTitle,
            answer: q.answer,
          ),
      ],
      photos: <BookPhoto>[],
      maxPhotos: 100,
    );
  });

  @override
  Future<void> saveAnswer(String bookId, String questionId, String answer) =>
      _call(() async {
        await v1.questionSave(
          bookId: bookId,
          questionId: questionId,
          body: v1api.QuestionPatch(answer: answer),
        );
      });

  @override
  Future<({List<BookPhoto> photos, List<String> errors})> uploadPhotos(
    String bookId,
    List<File> files,
  ) async {
    final r =
        await api.multipart(
              '/api/books/$bookId/photos',
              files: [
                for (final f in files)
                  (
                    field: 'files',
                    file: f,
                    filename: f.uri.pathSegments.last,
                    contentType: _mime(f.path),
                  ),
              ],
            )
            as Map<String, dynamic>;
    return (
      photos: [
        for (final p in (r['photos'] as List? ?? const []))
          BookPhoto.fromJson(p as Map<String, dynamic>),
      ],
      errors: [for (final e in (r['errors'] as List? ?? const [])) e as String],
    );
  }

  @override
  ({String url, Map<String, String> headers}) photo(
    String photoId, {
    bool full = false,
  }) => (
    url: api.uri('/api/photos/$photoId', {
      'size': full ? 'view' : null,
    }).toString(),
    headers: _auth,
  );

  static String _mime(String path) {
    final p = path.toLowerCase();
    if (p.endsWith('.png')) return 'image/png';
    if (p.endsWith('.heic') || p.endsWith('.heif')) return 'image/heic';
    if (p.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
}
