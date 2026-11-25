import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

/// Ошибка запроса к серверу: текст — для экрана (сервер отвечает по-русски), статус — для логики (401 — выйти).
class ApiException implements Exception {
  ApiException(this.status, this.message, [this.code]);
  final int status;
  final String message;

  /// Машинный код ошибки, если сервер его дал (например invoiceChoice — «оплата по счёту или другая?»).
  final String? code;

  bool get unauthorized => status == 401;

  @override
  String toString() => message;
}

/// Клиент API CRM: адрес сервера, токен сессии (Authorization: Bearer) и разбор ответов.
class ApiClient {
  ApiClient({required this.baseUrl, this.token, http.Client? client}) : _http = client ?? http.Client();

  String baseUrl;
  String? token;

  /// Вызывается, когда сервер отвечает 401 на запрос с токеном: сессия закрыта, нужен новый вход.
  void Function()? onUnauthorized;

  final http.Client _http;

  /// Общий HTTP-клиент (keep-alive и подмена в тестах): используется и для API v1.
  http.Client get httpClient => _http;

  Map<String, String> get headers => {
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Uri uri(String path, [Map<String, String?>? query]) {
    final base = baseUrl.replaceAll(RegExp(r'/+$'), '');
    final q = <String, String>{
      for (final e in (query ?? {}).entries)
        if (e.value != null && e.value!.isNotEmpty) e.key: e.value!,
    };
    return Uri.parse('$base$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  /// Полный адрес вложения: сервер отдаёт путь (/api/admin/...) или готовую ссылку.
  String? mediaUrl(String? pathOrUrl) {
    if (pathOrUrl == null || pathOrUrl.isEmpty) return null;
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
    if (!pathOrUrl.startsWith('/')) return null;
    return uri(pathOrUrl).toString();
  }

  Future<dynamic> get(String path, {Map<String, String?>? query}) => _send('GET', path, query: query);

  /// GET с ETag: сервер ответил 304 (ничего не изменилось) — data == null, прежний ответ остаётся в силе.
  Future<({dynamic data, String? etag})> getCached(String path, {Map<String, String?>? query, String? etag}) async {
    final req = http.Request('GET', uri(path, query))..headers.addAll(headers);
    if (etag != null) req.headers['If-None-Match'] = etag;
    final res = await _raw(_http.send(req));
    if (res.statusCode == 304) return (data: null, etag: etag);
    return (data: _decode(res), etag: res.headers['etag']);
  }

  /// GET без разбора ответа и с долгим ожиданием: сборка файла на сервере (?prepare=1 отвечает 204, когда файл готов).
  Future<http.Response> getRaw(String path, {Map<String, String?>? query, Duration timeout = const Duration(seconds: 30)}) {
    final req = http.Request('GET', uri(path, query))..headers.addAll(headers);
    return _raw(_http.send(req), timeout: timeout);
  }

  Future<dynamic> post(String path, {Object? body, Map<String, String?>? query}) => _send('POST', path, body: body, query: query);

  Future<dynamic> patch(String path, {Object? body}) => _send('PATCH', path, body: body);

  Future<dynamic> delete(String path, {Object? body}) => _send('DELETE', path, body: body);

  Future<dynamic> _send(String method, String path, {Object? body, Map<String, String?>? query}) async {
    final req = http.Request(method, uri(path, query))..headers.addAll(headers);
    if (body != null) {
      req.headers['Content-Type'] = 'application/json; charset=utf-8';
      req.body = jsonEncode(body);
    }
    return _finish(_http.send(req));
  }

  /// Файлы в multipart (голосовое, фото, документы).
  Future<dynamic> upload(String path, {required String field, required File file, required String filename, String? contentType, Map<String, String> fields = const {}}) async {
    final req = http.MultipartRequest('POST', uri(path))
      ..headers.addAll(headers)
      ..fields.addAll(fields)
      ..files.add(await http.MultipartFile.fromPath(field, file.path, filename: filename, contentType: contentType == null ? null : _mediaType(contentType)));
    return _finish(_http.send(req), timeout: const Duration(minutes: 3));
  }

  /// Форма с несколькими файлами (обращение в поддержку: скриншоты, видео).
  Future<dynamic> multipart(String path, {Map<String, String> fields = const {}, List<({String field, File file, String filename, String contentType})> files = const []}) async {
    final req = http.MultipartRequest('POST', uri(path))
      ..headers.addAll(headers)
      ..fields.addAll(fields);
    for (final f in files) {
      req.files.add(await http.MultipartFile.fromPath(f.field, f.file.path, filename: f.filename, contentType: _mediaType(f.contentType)));
    }
    return _finish(_http.send(req), timeout: const Duration(minutes: 5));
  }

  static MediaType _mediaType(String value) => MediaType.parse(value);

  Future<dynamic> _finish(Future<http.StreamedResponse> sending, {Duration timeout = const Duration(seconds: 30)}) async => _decode(await _raw(sending, timeout: timeout));

  Future<http.Response> _raw(Future<http.StreamedResponse> sending, {Duration timeout = const Duration(seconds: 30)}) async {
    try {
      return await http.Response.fromStream(await sending.timeout(timeout));
    } on TimeoutException {
      throw ApiException(0, 'Сервер не отвечает. Проверьте интернет.');
    } on SocketException {
      throw ApiException(0, 'Нет связи с сервером. Проверьте интернет и адрес сервера.');
    } on http.ClientException {
      throw ApiException(0, 'Нет связи с сервером. Проверьте интернет и адрес сервера.');
    }
  }

  dynamic _decode(http.Response res) {
    dynamic data;
    if (res.body.isNotEmpty) {
      try {
        data = jsonDecode(utf8.decode(res.bodyBytes));
      } catch (_) {
        data = null;
      }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    if (res.statusCode == 401 && token != null) onUnauthorized?.call();
    final message = data is Map && data['error'] is String
        ? data['error'] as String
        : data is Map && data['message'] is String
            ? data['message'] as String
            : 'Ошибка ${res.statusCode}';
    throw ApiException(res.statusCode, message, data is Map && data['code'] is String ? data['code'] as String : null);
  }

  /// Скачать файл с токеном (документы, видео): возвращает байты.
  Future<List<int>> download(String url) async {
    final res = await _http.get(Uri.parse(url), headers: headers).timeout(const Duration(minutes: 3));
    if (res.statusCode != 200) throw ApiException(res.statusCode, 'Не удалось скачать файл');
    return res.bodyBytes;
  }

  void close() => _http.close();
}
