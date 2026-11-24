import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../api/mybook_api.g.dart';
import 'api.dart';

final _clients = Expando<MybookApi>();

/// Клиент контракта API v1 (сгенерированный, lib/api/mybook_api.g.dart) поверх ApiClient приложения: тот же сервер и
/// токен; ошибки — в ApiException, как у остальных экранов (401 — выход, 0 — нет связи, refused — текст отказа CRM).
Future<T> v1<T>(ApiClient api, Future<T> Function(MybookApi v1) run) async {
  final client = _clients[api] ??= MybookApi(baseUrl: api.baseUrl);
  if (client.baseUrl != api.baseUrl) _clients[api] = MybookApi(baseUrl: api.baseUrl);
  final c = _clients[api]!..token = api.token;
  try {
    return await run(c).timeout(const Duration(seconds: 30));
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
