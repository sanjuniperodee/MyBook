import 'package:flutter/foundation.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../models/chat.dart';
import 'api.dart';
import 'v1.dart';

/// Шаблоны ответов сотрудника: свои (с порядком) и общие компании. Свои создаются, меняются и удаляются здесь же.
class TemplatesStore extends ChangeNotifier {
  TemplatesStore(this.api);
  final ApiClient api;

  List<Template> mine = [];
  List<Template> shared = [];
  bool loaded = false;
  String? error;
  String? _etag;

  Future<void> load() async {
    final hadError = error;
    var changed = !loaded;
    try {
      final r = await v1Cached(api, (c) => c.crmMyTemplates(), etag: loaded ? _etag : null);
      _etag = r.etag;
      if (!r.notModified && r.data != null) {
        mine = [for (final t in r.data!.mine) Template(id: t.id, title: t.title, text: t.text, own: true)];
        shared = [for (final t in r.data!.shared) Template(id: t.id, title: t.title, text: t.text)];
        changed = true;
      }
      error = null;
      loaded = true;
    } on ApiException catch (e) {
      error = e.message;
    }
    if (changed || hadError != error) notifyListeners();
  }

  /// Создать (id == null) или изменить свой шаблон. Возвращает текст ошибки.
  Future<String?> save({String? id, required String title, required String text}) async {
    try {
      await v1(api, (c) => c.crmMyTemplateSave(body: v1api.CrmMyTemplateBody(id: id, title: title, text: text)));
      await load();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> remove(Template t) async {
    mine = mine.where((x) => x.id != t.id).toList();
    notifyListeners();
    try {
      await v1(api, (c) => c.crmMyTemplateDelete(id: t.id));
      return null;
    } on ApiException catch (e) {
      await load();
      return e.message;
    }
  }

  Future<String?> duplicate(Template t) async {
    try {
      await v1(api, (c) => c.crmMyTemplateDuplicate(id: t.id));
      await load();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Перетащили: новый порядок сразу на экране, сервер запоминает следом.
  Future<void> reorder(int from, int to) async {
    final list = [...mine];
    final item = list.removeAt(from);
    list.insert(to, item);
    mine = list;
    notifyListeners();
    try {
      await v1(
        api,
        (c) => c.crmMyTemplatesReorder(body: v1api.CrmTemplatesReorderBody(ids: [for (final t in list) t.id])),
      );
    } on ApiException {
      await load();
    }
  }
}
