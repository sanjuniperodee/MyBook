import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../api/mybook_api.g.dart';
import 'api.dart';
import 'cache.dart';

final _clients = Expando<MybookApi>();

String _normalizedBase(String url) => url.replaceAll(RegExp(r'/+$'), '');

/// Результат GET-запроса API v1 с ETag: при 304 [notModified] == true и [data] == null, прежний ответ остаётся в силе.
class V1Cached<T> {
  const V1Cached({this.data, this.etag, required this.notModified});
  final T? data;
  final String? etag;
  final bool notModified;
}

class _V1NotModified implements Exception {
  const _V1NotModified(this.etag);
  final String? etag;
}

/// Тонкая обёртка над общим http.Client: добавляет If-None-Match на GET, запоминает ETag из ответа и перехватывает 304
/// до разбора пустого тела в сгенерированном MybookApi. Общий inner-клиент не закрывает.
class _EtagClient extends http.BaseClient {
  _EtagClient(this._inner, {this.ifNoneMatch});

  final http.Client _inner;
  final String? ifNoneMatch;
  String? lastEtag;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (request.method == 'GET' && ifNoneMatch != null && ifNoneMatch!.isNotEmpty) {
      request.headers['if-none-match'] = ifNoneMatch!;
    }
    final res = await _inner.send(request);
    if (res.statusCode == 304) {
      await res.stream.drain<void>();
      throw _V1NotModified(res.headers['etag'] ?? ifNoneMatch);
    }
    lastEtag = res.headers['etag'];
    return res;
  }
}

/// Клиент контракта API v1 (сгенерированный, lib/api/mybook_api.g.dart) поверх ApiClient приложения: тот же сервер,
/// HTTP-клиент и токен; ошибки — в ApiException, как у остальных экранов (401 — выход, 0 — нет связи, refused — текст отказа CRM).
Future<T> v1<T>(ApiClient api, Future<T> Function(MybookApi v1) run, {Duration timeout = const Duration(seconds: 30)}) async {
  final base = _normalizedBase(api.baseUrl);
  final client = _clients[api] ??= MybookApi(baseUrl: base, client: api.httpClient);
  if (client.baseUrl != base) _clients[api] = MybookApi(baseUrl: base, client: api.httpClient);
  final c = _clients[api]!..token = api.token;
  return _guard(api, () => run(c).timeout(timeout));
}

/// GET API v1 с поддержкой ETag / If-None-Match → 304 Not Modified и опциональным сохранением в [LocalCache].
/// На сервере все GET v1 отдают ETag и 304 при неизменном теле. Если переданы [cacheKey] и [toJson], свежий 200-ответ
/// записывается на диск вместе с `_etag` — после перезапуска экран откроется мгновенно и сразу сможет получить 304.
Future<V1Cached<T>> v1Cached<T>(
  ApiClient api,
  Future<T> Function(MybookApi v1) run, {
  String? etag,
  String? cacheKey,
  Map<String, dynamic> Function(T data)? toJson,
}) async {
  final base = _normalizedBase(api.baseUrl);
  final etagClient = _EtagClient(api.httpClient, ifNoneMatch: etag);
  final c = MybookApi(baseUrl: base, token: api.token, client: etagClient);
  try {
    final data = await _guard(api, () => run(c).timeout(const Duration(seconds: 30)));
    final nextEtag = etagClient.lastEtag;
    if (cacheKey != null && toJson != null) {
      unawaited(v1WriteCache(cacheKey, toJson(data), etag: nextEtag));
    }
    return V1Cached<T>(data: data, etag: nextEtag, notModified: false);
  } on _V1NotModified catch (e) {
    return V1Cached<T>(data: null, etag: e.etag, notModified: true);
  }
}

/// Прочитать кэшированный ответ v1 и его ETag (если был сохранён) из [LocalCache].
Future<({T data, String? etag})?> v1ReadCache<T>(String key, T Function(Map<String, dynamic> json) fromJson) async {
  final raw = await LocalCache.read(key);
  if (raw == null) return null;
  try {
    final etag = raw['_etag'] as String?;
    return (data: fromJson(raw), etag: etag);
  } catch (_) {
    return null;
  }
}

/// Записать JSON-снимок ответа v1 в [LocalCache] вместе с ETag (если сервер его отдал).
Future<void> v1WriteCache(String key, Map<String, dynamic> json, {String? etag}) {
  return LocalCache.write(key, etag == null ? json : {...json, '_etag': etag});
}

Future<T> _guard<T>(ApiClient api, Future<T> Function() run) async {
  try {
    return await run();
  } on MybookApiException catch (e) {
    if (e.status == 401 && api.token != null) api.onUnauthorized?.call();
    throw ApiException(e.status, e.message, e.code);
  } on SocketException {
    throw ApiException(0, 'Нет связи с сервером. Проверьте интернет.');
  } on http.ClientException {
    throw ApiException(0, 'Нет связи с сервером. Проверьте интернет.');
  } on TimeoutException {
    throw ApiException(0, 'Сервер не отвечает. Проверьте интернет.');
  }
}
