/**
 * Dart-клиент API v1 из OpenAPI (openapi.ts): классы моделей с fromJson/toJson и класс MybookApi с методом на каждый
 * маршрут. Без build_runner и сторонних генераторов — только package:http, который уже есть в mobile/pubspec.yaml.
 * Результат — mobile/lib/api/mybook_api.g.dart (scripts/contracts/generate.ts); руками не править.
 */
type Json = Record<string, unknown>;
type Schema = Json & { $ref?: string; type?: string | string[]; anyOf?: Schema[]; items?: Schema; properties?: Record<string, Schema>; required?: string[]; enum?: unknown[]; const?: unknown; description?: string };

interface DartType {
  type: string;
  from: (v: string) => string;
  to: (v: string) => string;
}

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const refName = (ref: string) => ref.split("/").pop()!;


/** Слова, которыми нельзя назвать поле класса Dart (поле «new» дало бы несобираемый клиент). */
const DART_RESERVED = new Set(["assert", "break", "case", "catch", "class", "const", "continue", "default", "do", "else", "enum", "extends", "false", "final", "finally", "for", "if", "in", "is", "new", "null", "rethrow", "return", "super", "switch", "this", "throw", "true", "try", "var", "void", "while", "with"]);

class DartWriter {
  private classes = new Map<string, string>();

  constructor(private readonly components: Record<string, Schema>) {}

  /** Тип Dart для схемы; вложенный объект без имени становится классом <Родитель><Поле>. */
  typeOf(s: Schema, hint: string): DartType {
    const nullable = (Array.isArray(s.type) && s.type.includes("null")) || s.anyOf?.some((x) => x.type === "null");
    const base = s.anyOf ? s.anyOf.find((x) => x.type !== "null")! : Array.isArray(s.type) ? { ...s, type: s.type.find((t) => t !== "null") } : s;
    const t = this.baseType(base, hint);
    if (!nullable) return t;
    // Простой тип (строка, число) пишется как есть, null тоже; класс и список — через проверку на null.
    const to = (v: string) => (t.to(`${v}!`) === `${v}!` ? v : `${v} == null ? null : ${t.to(`${v}!`)}`);
    return { type: `${t.type}?`, from: (v) => `${v} == null ? null : ${t.from(v)}`, to };
  }

  private baseType(s: Schema, hint: string): DartType {
    if (s.$ref) {
      const name = refName(s.$ref);
      this.model(name, this.components[name]);
      return { type: name, from: (v) => `${name}.fromJson(${v} as Map<String, dynamic>)`, to: (v) => `${v}.toJson()` };
    }
    switch (s.type) {
      case "string":
        return { type: "String", from: (v) => `${v} as String`, to: (v) => v };
      case "integer":
        return { type: "int", from: (v) => `(${v} as num).toInt()`, to: (v) => v };
      case "number":
        return { type: "double", from: (v) => `(${v} as num).toDouble()`, to: (v) => v };
      case "boolean":
        return { type: "bool", from: (v) => `${v} as bool`, to: (v) => v };
      case "array": {
        const item = this.typeOf(s.items ?? {}, hint);
        return { type: `List<${item.type}>`, from: (v) => `(${v} as List).map((e) => ${item.from("e")}).toList()`, to: (v) => `${v}.map((e) => ${item.to("e")}).toList()` };
      }
      case "object":
        if (s.properties) {
          this.model(hint, s);
          return { type: hint, from: (v) => `${hint}.fromJson(${v} as Map<String, dynamic>)`, to: (v) => `${v}.toJson()` };
        }
        return { type: "Map<String, dynamic>", from: (v) => `${v} as Map<String, dynamic>`, to: (v) => v };
      default:
        return { type: "Object", from: (v) => `${v} as Object`, to: (v) => v };
    }
  }

  /** Схема каждого класса: два разных объекта с одним именем (зарегистрированная схема и вложенный объект «Родитель+поле») дали бы один класс и падение разбора. */
  private shapes = new Map<string, string>();

  /** Класс модели (один раз на имя). */
  model(name: string, s: Schema) {
    const shape = JSON.stringify(s);
    if (this.classes.has(name)) {
      if (this.shapes.get(name) !== shape) throw new Error(`Dart: два разных объекта дают класс ${name} — дайте одной из схем другой id`);
      return;
    }
    this.shapes.set(name, shape);
    this.classes.set(name, "");
    const required = new Set(s.required ?? []);
    const fields = Object.entries(s.properties ?? {}).map(([key, p]) => {
      if (DART_RESERVED.has(key)) throw new Error(`Dart: поле ${name}.${key} — зарезервированное слово Dart, переименуйте его в контракте`);
      const t = this.typeOf(p, name + pascal(key));
      const valueNullable = t.type.endsWith("?");
      const requiredKey = required.has(key);
      // Необязательное поле — Dart-тип с «?»; «не задано» и null различаются набором nulls (см. ниже).
      const wrap = !requiredKey && !valueNullable;
      const type = wrap ? `${t.type}?` : t.type;
      const from = wrap ? (v: string) => `${v} == null ? null : ${t.from(v)}` : t.from;
      const value = wrap ? t.to(`${key}!`) : t.to(key);
      // Обязательное — всегда (и null, если схема его допускает); необязательное — если задано или явно null (nulls).
      const entry = requiredKey ? `'${key}': ${value}` : valueNullable ? `if (${key} != null || nulls.contains('${key}')) '${key}': ${value}` : `if (${key} != null) '${key}': ${value}`;
      const doc = p.enum ? `  /// ${p.enum.join(" | ")}\n` : p.description ? `  /// ${p.description}\n` : "";
      return { key, type, from, entry, doc, nullable: type.endsWith("?"), explicitNull: !requiredKey && valueNullable };
    });
    // Правка частями (PATCH): поле, которое надо обнулить, — в nulls (PhotoPatch(nulls: {'questionId'}) — убрать фото из ответа).
    const withNulls = fields.some((f) => f.explicitNull);
    const params = [...fields.map((f) => `${f.nullable ? "" : "required "}this.${f.key}`), ...(withNulls ? ["this.nulls = const {}"] : [])];
    const lines = [
      `class ${name} {`,
      ...fields.map((f) => `${f.doc}  final ${f.type} ${f.key};`),
      ...(withNulls ? ["  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).", "  final Set<String> nulls;"] : []),
      params.length ? `\n  const ${name}({${params.join(", ")}});` : `  const ${name}();`,
      "",
      `  factory ${name}.fromJson(Map<String, dynamic> json) => ${name}(${fields.map((f) => `${f.key}: ${f.from(`json['${f.key}']`)}`).join(", ")});`,
      "",
      `  Map<String, dynamic> toJson() => {${fields.map((f) => f.entry).join(", ")}};`,
      "}",
    ];
    this.classes.set(name, lines.join("\n"));
  }

  models(): string {
    return [...this.classes.values()].join("\n\n");
  }
}

interface Operation {
  operationId: string;
  summary?: string;
  parameters?: { name: string; in: "path" | "query"; required: boolean; schema: Schema }[];
  requestBody?: { content: { "application/json"?: { schema: Schema }; "multipart/form-data"?: { schema: Schema & { required?: string[] } } } };
  responses: { "200": { content: { "application/json": { schema: Schema } } } };
}

export function renderDart(spec: { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, Schema> } }): string {
  const w = new DartWriter(spec.components.schemas);
  for (const [name, s] of Object.entries(spec.components.schemas)) w.model(name, s);
  const methods: string[] = [];
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      const params = op.parameters ?? [];
      const out = w.typeOf(op.responses["200"].content["application/json"].schema, pascal(op.operationId) + "Result");
      const json = op.requestBody?.content["application/json"];
      const body = json ? w.typeOf(json.schema, pascal(op.operationId) + "Body") : null;
      // Загрузка файлов: поле multipart — список http.MultipartFile (имя поля подставляется при отправке).
      const filesField = op.requestBody?.content["multipart/form-data"]?.schema.required?.[0] ?? null;
      const args = [
        ...params.map((p) => `${p.required ? "required " : ""}${w.typeOf(p.schema, "").type}${p.required ? "" : "?"} ${p.name}`),
        ...(body ? [`required ${body.type} body`] : []),
        ...(filesField ? ["required List<http.MultipartFile> files"] : []),
      ];
      const url = path.replace(/\{(\w+)\}/g, (_, k: string) => `\${Uri.encodeComponent('\$${k}')}`);
      const query = params.filter((p) => p.in === "query");
      const queryArg = query.length ? `, query: {${query.map((p) => `${p.required ? "" : `if (${p.name} != null) `}'${p.name}': '\${${p.name}}'`).join(", ")}}` : "";
      methods.push(
        [
          `  /// ${op.summary ?? op.operationId}`,
          `  Future<${out.type}> ${op.operationId}(${args.length ? `{${args.join(", ")}}` : ""}) async {`,
          filesField
            ? `    final json = await _sendFiles('${method.toUpperCase()}', '${url}', '${filesField}', files${queryArg});`
            : `    final json = await _send('${method.toUpperCase()}', '${url}'${body ? ", body: body.toJson()" : ""}${queryArg});`,
          `    return ${out.from("json")};`,
          "  }",
        ].join("\n"),
      );
    }
  }
  return `// Сгенерировано scripts/contracts/generate.ts из packages/contracts (API v1, ADR 0012). Не править руками.
// ignore_for_file: type=lint
import 'dart:convert';

import 'package:http/http.dart' as http;

/// Ошибка API: статус, текст для экрана (на языке пользователя) и стабильный код.
class MybookApiException implements Exception {
  final int status;
  final String? code;
  final String message;
  const MybookApiException(this.status, this.code, this.message);
  @override
  String toString() => 'MybookApiException($status, $code): $message';
}

/// Клиент API v1. token — сессия из authLogin / authSecondFactor (Authorization: Bearer).
class MybookApi {
  final String baseUrl;
  String? token;
  final http.Client _http;

  MybookApi({required this.baseUrl, this.token, http.Client? client}) : _http = client ?? http.Client();

  Future<dynamic> _send(String method, String path, {Object? body, Map<String, String>? query}) async {
    final uri = Uri.parse(baseUrl + path).replace(queryParameters: query == null || query.isEmpty ? null : query);
    final request = http.Request(method, uri);
    request.headers['accept'] = 'application/json';
    if (token != null) request.headers['authorization'] = 'Bearer $token';
    if (body != null) {
      request.headers['content-type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    return _read(await http.Response.fromStream(await _http.send(request)));
  }

  /// Загрузка файлов (multipart/form-data): каждый файл — в поле [field]; filename у MultipartFile обязателен.
  /// Параметры запроса (query) — рядом с файлами: сумма и дата платежа к чеку и т. п.
  Future<dynamic> _sendFiles(String method, String path, String field, List<http.MultipartFile> files, {Map<String, String>? query}) async {
    final request = http.MultipartRequest(method, Uri.parse(baseUrl + path).replace(queryParameters: query == null || query.isEmpty ? null : query));
    request.headers['accept'] = 'application/json';
    if (token != null) request.headers['authorization'] = 'Bearer $token';
    for (final f in files) {
      request.files.add(f.field == field ? f : http.MultipartFile(field, f.finalize(), f.length, filename: f.filename, contentType: f.contentType));
    }
    return _read(await http.Response.fromStream(await _http.send(request)));
  }

  dynamic _read(http.Response res) {
    final text = utf8.decode(res.bodyBytes);
    final data = text.isEmpty ? null : jsonDecode(text);
    if (res.statusCode >= 400) {
      final map = data is Map<String, dynamic> ? data : const <String, dynamic>{};
      throw MybookApiException(res.statusCode, map['code'] as String?, (map['error'] as String?) ?? res.reasonPhrase ?? 'Ошибка');
    }
    return data;
  }

${methods.join("\n\n")}
}

${w.models()}
`;
}
