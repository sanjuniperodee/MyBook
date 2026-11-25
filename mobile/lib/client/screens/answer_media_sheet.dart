import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:just_audio/just_audio.dart' as ja;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mime/mime.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';

/// Выбранный видео/аудио файл для чанковой загрузки (чтение по кускам без загрузки всего гигабайта в память).
class PickedMediaFile {
  const PickedMediaFile({
    required this.name,
    required this.size,
    required this.mime,
    required this.readChunk,
    this.durationSec,
  });

  final String name;
  final int size;
  final String mime;
  final double? durationSec;
  final Future<Uint8List> Function(int offset, int length) readChunk;

  static PickedMediaFile fromBytes({
    required String name,
    required Uint8List bytes,
    String mime = '',
    double? durationSec,
  }) =>
      PickedMediaFile(
        name: name,
        size: bytes.length,
        mime: mime.isNotEmpty ? mime : (lookupMimeType(name) ?? ''),
        durationSec: durationSec,
        readChunk: (offset, length) async {
          final end = math.min(bytes.length, offset + length);
          return Uint8List.sublistView(bytes, offset, end);
        },
      );

  static PickedMediaFile fromFile(File file, {String? name, String? mime, double? durationSec}) {
    final fileName = name ?? file.uri.pathSegments.last;
    final length = file.lengthSync();
    return PickedMediaFile(
      name: fileName,
      size: length,
      mime: (mime != null && mime.isNotEmpty) ? mime : (lookupMimeType(fileName) ?? ''),
      durationSec: durationSec,
      readChunk: (offset, chunkLength) async {
        final raf = await file.open();
        try {
          await raf.setPosition(offset);
          return await raf.read(chunkLength);
        } finally {
          await raf.close();
        }
      },
    );
  }
}

typedef MediaFilePicker = Future<PickedMediaFile?> Function(List<String> allowedExtensions);
typedef MediaUrlOpener = Future<void> Function(String url);

/// Интерфейс проигрывателя аудио — на телефоне работает поверх just_audio, в тестах подменяется.
abstract class MediaAudioPlayer {
  Stream<Duration> get positionStream;
  Stream<Duration?> get durationStream;
  Stream<bool> get playingStream;
  Future<void> setUrl(String url);
  Future<void> play();
  Future<void> pause();
  Future<void> seek(Duration position);
  Future<void> stop();
  Future<void> dispose();
}

class _JustAudioPlayer implements MediaAudioPlayer {
  final _player = ja.AudioPlayer();

  @override
  Stream<Duration> get positionStream => _player.positionStream;
  @override
  Stream<Duration?> get durationStream => _player.durationStream;
  @override
  Stream<bool> get playingStream => _player.playingStream;
  @override
  Future<void> setUrl(String url) async {
    await _player.setUrl(url);
  }

  @override
  Future<void> play() => _player.play();
  @override
  Future<void> pause() => _player.pause();
  @override
  Future<void> seek(Duration position) => _player.seek(position);
  @override
  Future<void> stop() => _player.stop();
  @override
  Future<void> dispose() => _player.dispose();
}

Future<PickedMediaFile?> _defaultPickMediaFile(List<String> allowedExtensions) async {
  final files = await FilePicker.pickFiles(
    type: allowedExtensions.isNotEmpty ? FileType.custom : FileType.media,
    allowedExtensions: allowedExtensions.isNotEmpty ? allowedExtensions : null,
  );
  if (files.isEmpty) return null;
  final picked = files.first;
  if (picked.path != null && picked.path!.isNotEmpty) {
    return PickedMediaFile.fromFile(File(picked.path!), name: picked.name);
  }
  return null;
}

Future<void> _defaultOpenUrl(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null) return;
  await launchUrl(uri, mode: LaunchMode.inAppBrowserView);
}

/// Открыть лист «Видео, аудио и музыка по QR-коду» для текущего ответа (возвращает свежее состояние).
Future<v1api.AnswerMediaState?> showAnswerMediaSheet(
  BuildContext context, {
  required String bookId,
  required String questionId,
  v1api.AnswerMediaState? initialState,
  MediaFilePicker? pickFile,
  MediaUrlOpener? openUrl,
  MediaAudioPlayer Function()? audioPlayerFactory,
}) {
  return showModalBottomSheet<v1api.AnswerMediaState>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.c.bg,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Cab.sheet))),
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.92,
      child: AnswerMediaSheet(
        bookId: bookId,
        questionId: questionId,
        initialState: initialState,
        pickFile: pickFile,
        openUrl: openUrl,
        audioPlayerFactory: audioPlayerFactory,
      ),
    ),
  );
}

/// Компактная секция QR-медиа прямо в редакторе ответа (1:1 с MediaStrip на сайте).
class AnswerMediaPreviewSection extends StatelessWidget {
  const AnswerMediaPreviewSection({
    super.key,
    required this.state,
    required this.onOpen,
  });

  final v1api.AnswerMediaState state;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final t = state.labels;
    if (state.media.isEmpty && !state.editable) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.only(top: 16),
      decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(LucideIcons.qrCode, size: 17, color: c.brand),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  state.media.isEmpty ? t.add : t.title,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                ),
              ),
              if (state.media.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(999)),
                  child: Text(
                    '${state.media.length}',
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: c.textMuted),
                  ),
                ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: onOpen,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 36),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  side: BorderSide(color: c.border),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl)),
                  backgroundColor: c.surfaceRaised,
                  foregroundColor: c.brand,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(state.editable ? LucideIcons.plus : LucideIcons.chevronRight, size: 15),
                    const SizedBox(width: 5),
                    Text(state.editable ? t.add : t.open, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
            ],
          ),
          if (state.media.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (final item in state.media)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: c.surfaceRaised,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(Cab.panel),
                    side: BorderSide(color: c.border),
                  ),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(Cab.panel),
                    onTap: onOpen,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            padding: const EdgeInsets.all(3),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: c.border),
                            ),
                            child: SvgPicture.string(item.qrSvg, width: 42, height: 42),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item.title.trim().isNotEmpty ? item.title : _kindLabel(item.kind, t.kinds),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500),
                                ),
                                const SizedBox(height: 3),
                                if (item.file != null)
                                  _CompactFileStatus(file: item.file!)
                                else
                                  Text(
                                    item.source,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 12.5, color: c.textMuted),
                                  ),
                              ],
                            ),
                          ),
                          Icon(LucideIcons.chevronRight, size: 17, color: c.textMuted),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            Text(t.printNote, style: TextStyle(fontSize: 12, height: 1.4, color: c.textMuted)),
          ],
        ],
      ),
    );
  }
}

class _CompactFileStatus extends StatelessWidget {
  const _CompactFileStatus({required this.file});
  final v1api.AnswerFileState file;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    if (file.status == 'ready') {
      return Row(
        children: [
          Icon(LucideIcons.check, size: 13, color: c.success),
          const SizedBox(width: 4),
          Expanded(child: Text(file.statusLabel, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: c.success))),
        ],
      );
    }
    if (file.status == 'failed' || file.status == 'gone') {
      return Row(
        children: [
          Icon(LucideIcons.triangleAlert, size: 13, color: c.danger),
          const SizedBox(width: 4),
          Expanded(child: Text(file.statusLabel, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: c.danger))),
        ],
      );
    }
    return Row(
      children: [
        SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.8, color: c.brand)),
        const SizedBox(width: 6),
        Expanded(child: Text(file.statusLabel, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: c.textMuted))),
      ],
    );
  }
}

/// Лист управления QR-медиа ответа — один в один с кабинетом сайта (MediaStrip + FileUpload + KaspiPay).
/// Все подписи, лимиты, статусы, цены пакетов и векторные QR-коды приходят с сервера.
class AnswerMediaSheet extends StatefulWidget {
  const AnswerMediaSheet({
    super.key,
    required this.bookId,
    required this.questionId,
    this.initialState,
    this.pickFile,
    this.openUrl,
    this.audioPlayerFactory,
  });

  final String bookId;
  final String questionId;
  final v1api.AnswerMediaState? initialState;
  final MediaFilePicker? pickFile;
  final MediaUrlOpener? openUrl;
  final MediaAudioPlayer Function()? audioPlayerFactory;

  @override
  State<AnswerMediaSheet> createState() => _AnswerMediaSheetState();
}

enum _UploadPhase { idle, reading, uploading, error }

class _AnswerMediaSheetState extends State<AnswerMediaSheet> {
  static const _uuid = Uuid();

  late final ClientSession _session = context.read<ClientSession>();
  v1api.AnswerMediaState? _state;
  String? _loadError;
  bool _loading = false;

  // Загрузка своего файла кусками.
  _UploadPhase _uploadPhase = _UploadPhase.idle;
  String? _uploadFileId;
  String _uploadName = '';
  int _uploadPct = 0;
  bool _uploadRetrying = false;
  bool _uploadCancelled = false;
  String? _uploadError;
  bool _quotaError = false;
  PickedMediaFile? _resumeFile;

  // Добавление ссылки.
  final _linkCtrl = TextEditingController();
  bool _addingLink = false;
  String? _linkError;

  // Покупка пакета минут.
  String? _openingPackId;

  // Подтверждение удаления своего файла.
  String? _confirmDeleteId;

  // Редактирование подписей с отложенным сохранением.
  final Map<String, TextEditingController> _captions = {};
  Timer? _saveTimer;
  Timer? _pollTimer;

  // Встроенный аудио-плеер для готовых голосовых/аудио.
  MediaAudioPlayer? _audioPlayer;
  String? _playingEntryId;

  MediaFilePicker get _picker => widget.pickFile ?? _defaultPickMediaFile;
  MediaUrlOpener get _opener => widget.openUrl ?? _defaultOpenUrl;

  @override
  void initState() {
    super.initState();
    _state = widget.initialState;
    if (_state != null) {
      _syncControllers(_state!);
      _schedulePoll();
    }
    _load();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _saveTimer?.cancel();
    _uploadCancelled = true;
    _linkCtrl.dispose();
    for (final ctrl in _captions.values) {
      ctrl.dispose();
    }
    _audioPlayer?.dispose();
    super.dispose();
  }

  void _syncControllers(v1api.AnswerMediaState state) {
    final ids = {for (final m in state.media) m.id};
    for (final dead in _captions.keys.where((k) => !ids.contains(k)).toList()) {
      _captions.remove(dead)?.dispose();
    }
    for (final m in state.media) {
      final ctrl = _captions[m.id];
      if (ctrl == null) {
        _captions[m.id] = TextEditingController(text: m.title);
      } else if (ctrl.text != m.title && !ctrl.selection.isValid) {
        ctrl.text = m.title;
      }
    }
  }

  Future<void> _load() async {
    if (_state == null) setState(() => _loading = true);
    try {
      final fresh = await _session.backend.call(
        () => _session.backend.contract.answerMediaGet(bookId: widget.bookId, questionId: widget.questionId),
      );
      if (!mounted) return;
      setState(() {
        _state = fresh;
        _loadError = null;
        _loading = false;
      });
      _syncControllers(fresh);
      _schedulePoll();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e.message;
        _loading = false;
      });
    }
  }

  bool _isPendingFile(v1api.AnswerFileState? f) =>
      f != null && (f.status == 'uploading' || f.status == 'queued' || f.status == 'processing');

  void _schedulePoll() {
    _pollTimer?.cancel();
    final st = _state;
    if (st == null) return;
    final pending = st.media.where((m) => _isPendingFile(m.file)).toList();
    if (pending.isEmpty) return;
    _pollTimer = Timer(Duration(milliseconds: st.limits.pollIntervalMs), _pollPending);
  }

  Future<void> _pollPending() async {
    final st = _state;
    if (st == null || !mounted) return;
    final pending = st.media.where((m) => _isPendingFile(m.file)).toList();
    if (pending.isEmpty) return;
    bool changed = false;
    v1api.AnswerFileQuota nextQuota = st.quota;
    final updated = Map<String, v1api.AnswerFileState>.fromEntries(
      st.media.where((m) => m.file != null).map((m) => MapEntry(m.file!.id, m.file!)),
    );
    for (final item in pending) {
      final fileId = item.fileId;
      if (fileId == null) continue;
      try {
        final res = await _session.backend.call(
          () => _session.backend.contract.answerFileStatus(bookId: widget.bookId, fileId: fileId),
        );
        if (!mounted) return;
        nextQuota = res.quota;
        if (res.file.status != item.file?.status || res.file.durationSec != item.file?.durationSec || res.file.kind != item.file?.kind) {
          changed = true;
        }
        updated[fileId] = res.file;
      } on ApiException catch (e) {
        if (e.status == 404) changed = true;
      }
    }
    if (!mounted) return;
    if (changed) {
      await _load();
      return;
    }
    setState(() {
      _state = v1api.AnswerMediaState(
        editable: st.editable,
        media: [
          for (final m in st.media)
            v1api.AnswerMediaEntry(
              id: m.id,
              kind: m.kind,
              url: m.url,
              fileId: m.fileId,
              title: m.title,
              anchor: m.anchor,
              source: m.source,
              qrSvg: m.qrSvg,
              thumbUrl: updated[m.fileId]?.poster ?? m.thumbUrl,
              playbackUrl: updated[m.fileId]?.playbackUrl ?? m.playbackUrl,
              file: m.fileId != null ? (updated[m.fileId] ?? m.file) : null,
            ),
        ],
        quota: nextQuota,
        packs: st.packs,
        positions: st.positions,
        limits: st.limits,
        labels: st.labels,
      );
    });
    _schedulePoll();
  }

  List<v1api.AnswerMedia> _toPatchList(List<v1api.AnswerMediaEntry> entries) => [
        for (final e in entries)
          v1api.AnswerMedia(
            id: e.id,
            kind: e.kind,
            url: e.url,
            fileId: e.fileId,
            title: _captions[e.id]?.text ?? e.title,
            anchor: e.anchor,
          ),
      ];

  Future<void> _saveEntries(List<v1api.AnswerMedia> media) async {
    try {
      final fresh = await _session.backend.call(
        () => _session.backend.contract.answerMediaSave(
          bookId: widget.bookId,
          questionId: widget.questionId,
          body: v1api.AnswerMediaSaveBody(media: media),
        ),
      );
      if (!mounted) return;
      setState(() => _state = fresh);
      _syncControllers(fresh);
      _schedulePoll();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  void _scheduleCaptionSave() {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 600), () {
      final st = _state;
      if (st == null || !st.editable) return;
      _saveEntries(_toPatchList(st.media));
    });
  }

  Future<void> _flushCaptionSave() async {
    if (_saveTimer?.isActive ?? false) {
      _saveTimer?.cancel();
      final st = _state;
      if (st != null && st.editable) {
        await _saveEntries(_toPatchList(st.media));
      }
    }
  }

  Future<void> _updateEntry(String id, {String? kind, int? anchor, bool setAnchor = false}) async {
    final st = _state;
    if (st == null || !st.editable) return;
    _saveTimer?.cancel();
    final next = [
      for (final e in st.media)
        v1api.AnswerMedia(
          id: e.id,
          kind: e.id == id && kind != null ? kind : e.kind,
          url: e.url,
          fileId: e.fileId,
          title: _captions[e.id]?.text ?? e.title,
          anchor: e.id == id && setAnchor ? anchor : e.anchor,
        ),
    ];
    await _saveEntries(next);
  }

  Future<void> _removeEntry(v1api.AnswerMediaEntry entry) async {
    final st = _state;
    if (st == null || !st.editable) return;
    _saveTimer?.cancel();
    if (_playingEntryId == entry.id) {
      await _audioPlayer?.stop();
      setState(() => _playingEntryId = null);
    }
    if (entry.fileId != null) {
      try {
        await _session.backend.call(
          () => _session.backend.contract.answerFileDelete(bookId: widget.bookId, fileId: entry.fileId!),
        );
      } on ApiException catch (e) {
        if (e.status != 404) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
          return;
        }
      }
    }
    final remaining = st.media.where((e) => e.id != entry.id).toList();
    setState(() => _confirmDeleteId = null);
    await _saveEntries(_toPatchList(remaining));
  }

  String? _fileKindOf(PickedMediaFile file, v1api.AnswerMediaLimits limits) {
    final type = file.mime.toLowerCase().split(';').first.trim();
    final dot = file.name.lastIndexOf('.');
    final ext = dot >= 0 ? file.name.substring(dot + 1).toLowerCase() : '';
    final isAudioExt = limits.audioExtensions.contains(ext);
    final isVideoExt = limits.videoExtensions.contains(ext);
    if (type.startsWith('audio/')) return 'audio';
    if (type.startsWith('video/')) return isAudioExt ? 'audio' : 'video';
    if (isVideoExt) return 'video';
    if (isAudioExt) return 'audio';
    return null;
  }

  Future<void> _pickAndUpload() async {
    final st = _state;
    if (st == null || !st.editable || st.quota.full) return;
    final allowed = [...st.limits.videoExtensions, ...st.limits.audioExtensions];
    setState(() {
      _uploadPhase = _UploadPhase.reading;
      _uploadError = null;
      _quotaError = false;
    });
    final picked = await _picker(allowed);
    if (!mounted) return;
    if (picked == null) {
      setState(() => _uploadPhase = _UploadPhase.idle);
      return;
    }
    final kind = _fileKindOf(picked, st.limits);
    if (kind == null) {
      setState(() {
        _uploadPhase = _UploadPhase.error;
        _uploadError = st.labels.upload.notMedia;
        _resumeFile = null;
        _uploadFileId = null;
      });
      return;
    }
    if (picked.size > st.limits.maxSourceBytes) {
      setState(() {
        _uploadPhase = _UploadPhase.error;
        _uploadError = st.labels.upload.tooBig;
        _resumeFile = null;
        _uploadFileId = null;
      });
      return;
    }
    final dur = picked.durationSec;
    final maxSec = kind == 'video' ? st.limits.maxVideoSec : st.limits.maxAudioSec;
    if (dur != null && dur > maxSec + 1) {
      setState(() {
        _uploadPhase = _UploadPhase.error;
        _uploadError = kind == 'video' ? st.labels.upload.tooLongVideo : st.labels.upload.tooLongAudio;
        _resumeFile = null;
        _uploadFileId = null;
      });
      return;
    }
    if (dur != null && dur > st.quota.leftSec + 1) {
      setState(() {
        _uploadPhase = _UploadPhase.error;
        _uploadError = st.labels.upload.needMinutes;
        _quotaError = true;
        _resumeFile = null;
        _uploadFileId = null;
      });
      return;
    }

    try {
      final started = await _session.backend.call(
        () => _session.backend.contract.answerFileStart(
          bookId: widget.bookId,
          body: v1api.AnswerFileStartBody(
            name: picked.name,
            size: picked.size,
            type: picked.mime,
            durationSec: picked.durationSec,
          ),
        ),
      );
      if (!mounted) return;
      await _uploadChunks(picked, started.file.id, 0, started.chunkBytes);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _uploadPhase = _UploadPhase.error;
        _uploadError = e.message;
        _quotaError = e.code == 'fileQuota';
        _resumeFile = null;
        _uploadFileId = null;
      });
    }
  }

  Future<void> _uploadChunks(PickedMediaFile file, String fileId, int startOffset, int chunkBytes) async {
    final st = _state;
    if (st == null) return;
    _uploadCancelled = false;
    var offset = startOffset;
    var failures = 0;
    setState(() {
      _uploadPhase = _UploadPhase.uploading;
      _uploadFileId = fileId;
      _uploadName = file.name;
      _uploadPct = file.size > 0 ? math.min(99, (offset * 100) ~/ file.size) : 0;
      _uploadRetrying = false;
      _uploadError = null;
      _resumeFile = file;
    });

    try {
      while (offset < file.size) {
        if (_uploadCancelled || !mounted) return;
        final length = math.min(chunkBytes, file.size - offset);
        final bytes = await file.readChunk(offset, length);
        if (_uploadCancelled || !mounted) return;
        try {
          final part = http.MultipartFile.fromBytes(
            'chunk',
            bytes,
            filename: file.name,
            contentType: MediaType.parse('application/octet-stream'),
          );
          final res = await _session.backend.call(
            () => _session.backend.contract.answerFileChunk(
              bookId: widget.bookId,
              fileId: fileId,
              offset: offset,
              files: [part],
            ),
          );
          if (_uploadCancelled || !mounted) return;
          offset = res.received;
          failures = 0;
          setState(() {
            _uploadPct = file.size > 0 ? math.min(99, (offset * 100) ~/ file.size) : 99;
            _uploadRetrying = false;
          });
        } on ApiException catch (e) {
          if (_uploadCancelled || !mounted) return;
          final retryable = e.status == 0 || e.status >= 500 || e.code == 'fileChunk';
          if (!retryable) rethrow;
          failures++;
          if (failures > st.limits.maxRetries) rethrow;
          setState(() => _uploadRetrying = true);
          final delayMs = math.min(30000, 2000 * (1 << (failures - 1)));
          await Future<void>.delayed(Duration(milliseconds: delayMs));
          if (_uploadCancelled || !mounted) return;
          try {
            final check = await _session.backend.call(
              () => _session.backend.contract.answerFileStatus(bookId: widget.bookId, fileId: fileId),
            );
            if (check.file.status == 'uploading') offset = check.file.receivedBytes;
          } on ApiException catch (_) {}
        }
      }
      if (_uploadCancelled || !mounted) return;
      final done = await _session.backend.call(
        () => _session.backend.contract.answerFileFinish(bookId: widget.bookId, fileId: fileId),
      );
      if (!mounted) return;
      setState(() {
        _uploadPhase = _UploadPhase.idle;
        _uploadFileId = null;
        _resumeFile = null;
        _uploadRetrying = false;
        _uploadError = null;
        _quotaError = false;
      });
      await _attachUploadedFile(done.file);
    } on ApiException catch (e) {
      if (_uploadCancelled || !mounted) return;
      setState(() {
        _uploadPhase = _UploadPhase.error;
        _uploadError = e.status == 0 ? st.labels.upload.networkError : e.message;
        _quotaError = e.code == 'fileQuota';
        _resumeFile = file;
        _uploadFileId = fileId;
      });
    }
  }

  Future<void> _attachUploadedFile(v1api.AnswerFileState file) async {
    final st = _state;
    if (st == null) return;
    if (st.media.length >= st.limits.maxMedia) {
      setState(() {
        _uploadPhase = _UploadPhase.error;
        _uploadError = st.labels.limitReached;
      });
      return;
    }
    final next = [
      ..._toPatchList(st.media),
      v1api.AnswerMedia(
        id: _uuid.v4(),
        kind: file.kind,
        url: file.url,
        fileId: file.id,
        title: '',
        anchor: null,
      ),
    ];
    await _saveEntries(next);
  }

  Future<void> _resumeUpload() async {
    final file = _resumeFile;
    final fileId = _uploadFileId;
    final st = _state;
    if (file == null || fileId == null || st == null) return;
    try {
      final check = await _session.backend.call(
        () => _session.backend.contract.answerFileStatus(bookId: widget.bookId, fileId: fileId),
      );
      if (!mounted) return;
      if (check.file.status != 'uploading') {
        setState(() {
          _uploadPhase = _UploadPhase.idle;
          _resumeFile = null;
          _uploadFileId = null;
        });
        await _attachUploadedFile(check.file);
        return;
      }
      await _uploadChunks(file, fileId, check.file.receivedBytes, st.limits.chunkBytes);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _uploadPhase = _UploadPhase.error;
        _uploadError = e.message;
        if (e.status == 404) {
          _resumeFile = null;
          _uploadFileId = null;
        }
      });
    }
  }

  void _stopUpload() {
    final id = _uploadFileId;
    _uploadCancelled = true;
    setState(() {
      _uploadPhase = _UploadPhase.idle;
      _uploadFileId = null;
      _resumeFile = null;
      _uploadRetrying = false;
      _uploadError = null;
    });
    if (id != null) {
      _session.backend
          .call(() => _session.backend.contract.answerFileDelete(bookId: widget.bookId, fileId: id))
          .ignore();
    }
  }

  Future<void> _submitLink() async {
    final raw = _linkCtrl.text.trim();
    if (raw.isEmpty || _addingLink) return;
    setState(() {
      _addingLink = true;
      _linkError = null;
    });
    try {
      final fresh = await _session.backend.call(
        () => _session.backend.contract.answerMediaAddLink(
          bookId: widget.bookId,
          questionId: widget.questionId,
          body: v1api.AnswerMediaLinkBody(url: raw),
        ),
      );
      if (!mounted) return;
      _linkCtrl.clear();
      setState(() {
        _state = fresh;
        _addingLink = false;
        _linkError = null;
      });
      _syncControllers(fresh);
      _schedulePoll();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _addingLink = false;
        _linkError = e.message;
      });
    }
  }

  Future<void> _buyPack(v1api.AnswerMediaPack pack) async {
    final st = _state;
    if (st == null || _openingPackId != null) return;
    setState(() => _openingPackId = pack.id);
    try {
      final purchase = await _session.backend.call(
        () => _session.backend.contract.answerFilePackBuy(
          bookId: widget.bookId,
          body: v1api.AnswerFilePackBuyBody(packId: pack.id),
        ),
      );
      if (!mounted) return;
      setState(() => _openingPackId = null);
      final paid = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: context.c.bg,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Cab.sheet))),
        builder: (_) => _MediaPackPaySheet(
          bookId: widget.bookId,
          purchase: purchase,
          labels: st.labels,
          kaspiPollIntervalMs: st.limits.kaspiPollIntervalMs,
          openUrl: _opener,
        ),
      );
      if (paid == true && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(purchase.purchase.paidToast)));
        setState(() {
          _uploadPhase = _UploadPhase.idle;
          _uploadError = null;
          _quotaError = false;
        });
        await _load();
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _openingPackId = null);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _toggleAudio(v1api.AnswerMediaEntry entry) async {
    final playbackUrl = entry.playbackUrl;
    if (playbackUrl == null) return;
    final player = _audioPlayer ??= (widget.audioPlayerFactory ?? () => _JustAudioPlayer())();
    if (_playingEntryId == entry.id) {
      await player.pause();
      if (mounted) setState(() => _playingEntryId = null);
      return;
    }
    await player.stop();
    await player.setUrl(_session.backend.url(playbackUrl));
    if (!mounted) return;
    setState(() => _playingEntryId = entry.id);
    await player.play();
  }

  Future<void> _close() async {
    await _flushCaptionSave();
    if (mounted) Navigator.of(context).pop(_state);
  }

  void _showQrModal(v1api.AnswerMediaEntry entry, v1api.AnswerMediaLabels t) {
    final c = context.c;
    final own = entry.fileId != null;
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: c.surfaceRaised,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.sheet)),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(Cab.panel),
                  border: Border.all(color: c.border),
                ),
                child: SvgPicture.string(entry.qrSvg, width: 220, height: 220),
              ),
              if (entry.title.trim().isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(
                  entry.title,
                  textAlign: TextAlign.center,
                  style: AppText.serif(context, size: 22, weight: FontWeight.w500),
                ),
              ],
              const SizedBox(height: 6),
              Text(
                entry.source.isNotEmpty ? entry.source : entry.url,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: c.textMuted),
              ),
              const SizedBox(height: 16),
              CabinetButton(
                label: own ? t.openFile : t.open,
                icon: LucideIcons.externalLink,
                large: false,
                onPressed: () {
                  Navigator.of(ctx).pop();
                  _opener(entry.url);
                },
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: Text(t.upload.close, style: TextStyle(color: c.textMuted)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final st = _state;
    if (st == null) {
      return SafeArea(
        top: false,
        child: Center(
          child: _loading || _loadError == null
              ? const CircularProgressIndicator()
              : Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(LucideIcons.wifiOff, size: 32, color: c.textMuted),
                      const SizedBox(height: 12),
                      Text(_loadError!, textAlign: TextAlign.center, style: TextStyle(color: c.textMuted)),
                      const SizedBox(height: 12),
                      IconButton(onPressed: _load, icon: Icon(LucideIcons.refreshCw, color: c.brand)),
                    ],
                  ),
                ),
        ),
      );
    }

    final t = st.labels;
    final q = st.quota;
    final showPacks = st.packs.isNotEmpty && q.files < q.maxFiles && (q.leftSec <= 0 || (_uploadPhase == _UploadPhase.error && _quotaError));

    return SafeArea(
      top: false,
      child: Column(
        children: [
          // Заголовок листа.
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 12, 12),
            child: Row(
              children: [
                Icon(LucideIcons.qrCode, size: 20, color: c.brand),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    t.title,
                    style: AppText.serif(context, size: 24, weight: FontWeight.w500).copyWith(height: 1.1),
                  ),
                ),
                IconButton(
                  tooltip: t.upload.close,
                  onPressed: _close,
                  icon: Icon(LucideIcons.x, size: 20, color: c.textMuted),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: c.border),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              children: [
                // Прикреплённые QR-карточки ответа.
                for (final entry in st.media)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: _MediaCard(
                      entry: entry,
                      editable: st.editable,
                      labels: t,
                      limits: st.limits,
                      positions: st.positions,
                      captionController: _captions[entry.id]!,
                      confirmingDelete: _confirmDeleteId == entry.id,
                      playingAudio: _playingEntryId == entry.id,
                      audioPlayer: _playingEntryId == entry.id ? _audioPlayer : null,
                      onTapQr: () => _showQrModal(entry, t),
                      onOpenUrl: () => _opener(entry.url),
                      onToggleAudio: () => _toggleAudio(entry),
                      onKindChanged: (kind) => _updateEntry(entry.id, kind: kind),
                      onCaptionChanged: (_) => _scheduleCaptionSave(),
                      onAnchorChanged: (anchor) => _updateEntry(entry.id, anchor: anchor, setAnchor: true),
                      onDeleteTap: () {
                        final own = entry.fileId != null && entry.file?.status != 'gone';
                        if (own) {
                          setState(() => _confirmDeleteId = entry.id);
                        } else {
                          _removeEntry(entry);
                        }
                      },
                      onDeleteConfirm: () => _removeEntry(entry),
                      onDeleteCancel: () => setState(() => _confirmDeleteId = null),
                    ),
                  ),

                // Форма добавления своего файла или ссылки (если редактируемо и не достигнут предел).
                if (st.editable && st.media.length < st.limits.maxMedia)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: c.surface,
                      borderRadius: BorderRadius.circular(Cab.panel),
                      border: Border.all(color: c.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t.intro, style: TextStyle(fontSize: 14.5, height: 1.45, color: c.text.withValues(alpha: 0.85))),
                        const SizedBox(height: 14),

                        // Блок загрузки своего видео/аудио (1:1 с FileUpload.tsx).
                        if (_uploadPhase == _UploadPhase.uploading)
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: c.surfaceRaised,
                              borderRadius: BorderRadius.circular(Cab.ctl),
                              border: Border.all(color: c.border),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: c.brand)),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        _uploadRetrying
                                            ? t.upload.retrying
                                            : t.upload.progressTemplate.replaceAll('{pct}', '$_uploadPct'),
                                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: _stopUpload,
                                      child: Text(t.upload.stop, style: TextStyle(color: c.textMuted)),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(4),
                                  child: LinearProgressIndicator(
                                    value: _uploadPct / 100.0,
                                    minHeight: 6,
                                    backgroundColor: c.surface,
                                    color: c.brand,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  '$_uploadName · ${t.upload.keepOpen}',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 12.5, color: c.textMuted),
                                ),
                              ],
                            ),
                          )
                        else
                          CabinetButton(
                            label: _uploadPhase == _UploadPhase.reading ? t.upload.reading : t.upload.button,
                            icon: LucideIcons.upload,
                            kind: CabBtn.outline,
                            large: false,
                            busy: _uploadPhase == _UploadPhase.reading,
                            onPressed: q.full ? null : _pickAndUpload,
                          ),

                        if (_uploadPhase == _UploadPhase.error && _uploadError != null) ...[
                          const SizedBox(height: 10),
                          Text(_uploadError!, style: TextStyle(fontSize: 13.5, color: c.danger)),
                          if (_resumeFile != null && _uploadFileId != null) ...[
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                FilledButton(
                                  onPressed: _resumeUpload,
                                  style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: Colors.white),
                                  child: Text(t.upload.retry),
                                ),
                                const SizedBox(width: 8),
                                TextButton(
                                  onPressed: _stopUpload,
                                  child: Text(t.upload.stop, style: TextStyle(color: c.textMuted)),
                                ),
                              ],
                            ),
                          ],
                        ],

                        const SizedBox(height: 10),
                        Text(t.upload.hint, style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textMuted)),
                        const SizedBox(height: 6),
                        Text(
                          q.statusText,
                          style: TextStyle(
                            fontSize: 12.5,
                            height: 1.4,
                            fontWeight: q.full ? FontWeight.w500 : FontWeight.w400,
                            color: q.full ? c.text : c.textMuted,
                          ),
                        ),

                        // Пакеты минут при исчерпании бесплатного лимита (1:1 с FileUpload.tsx).
                        if (showPacks) ...[
                          const SizedBox(height: 14),
                          Text(t.upload.more, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          for (final pack in st.packs)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: c.surfaceRaised,
                                  borderRadius: BorderRadius.circular(Cab.ctl),
                                  border: Border.all(color: pack.featured ? c.brand.withValues(alpha: 0.45) : c.border),
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Wrap(
                                            spacing: 8,
                                            crossAxisAlignment: WrapCrossAlignment.center,
                                            children: [
                                              Text(pack.minutesLabel, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
                                              if (pack.featured) StatusBadge(label: t.upload.featured, tone: 'info'),
                                            ],
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            '${pack.priceLabel} · ${pack.perMinuteLabel}',
                                            style: TextStyle(fontSize: 12.5, color: c.textMuted),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    pack.featured
                                        ? FilledButton(
                                            onPressed: _openingPackId != null ? null : () => _buyPack(pack),
                                            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: Colors.white),
                                            child: _openingPackId == pack.id
                                                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                                : Text(t.upload.buy),
                                          )
                                        : OutlinedButton(
                                            onPressed: _openingPackId != null ? null : () => _buyPack(pack),
                                            child: _openingPackId == pack.id
                                                ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: c.brand))
                                                : Text(t.upload.buy),
                                          ),
                                  ],
                                ),
                              ),
                            ),
                        ],

                        // Разделитель «или вставьте ссылку».
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          child: Row(
                            children: [
                              Expanded(child: Divider(color: c.border)),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 10),
                                child: Text(t.upload.orLink, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
                              ),
                              Expanded(child: Divider(color: c.border)),
                            ],
                          ),
                        ),

                        Text(t.howTo, style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textMuted)),
                        const SizedBox(height: 10),
                        Text(t.urlLabel, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: c.textMuted)),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _linkCtrl,
                          keyboardType: TextInputType.url,
                          textInputAction: TextInputAction.done,
                          onChanged: (_) {
                            if (_linkError != null) setState(() => _linkError = null);
                          },
                          onSubmitted: (_) => _submitLink(),
                          decoration: InputDecoration(
                            hintText: t.urlPlaceholder,
                            filled: true,
                            fillColor: c.surfaceRaised,
                          ),
                        ),
                        if (_linkError != null) ...[
                          const SizedBox(height: 6),
                          Text(_linkError!, style: TextStyle(fontSize: 13.5, color: c.danger)),
                        ],
                        const SizedBox(height: 10),
                        CabinetButton(
                          label: t.submit,
                          large: false,
                          busy: _addingLink,
                          onPressed: _submitLink,
                        ),
                      ],
                    ),
                  ),

                if (st.media.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(t.printNote, style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textMuted)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _kindLabel(String kind, v1api.AnswerMediaLabelsKinds kinds) => switch (kind) {
      'audio' => kinds.audio,
      'music' => kinds.music,
      _ => kinds.video,
    };

String _captionPlaceholder(String kind, v1api.AnswerMediaLabelsCaptionPlaceholder ph) => switch (kind) {
      'audio' => ph.audio,
      'music' => ph.music,
      _ => ph.video,
    };

class _MediaCard extends StatefulWidget {
  const _MediaCard({
    required this.entry,
    required this.editable,
    required this.labels,
    required this.limits,
    required this.positions,
    required this.captionController,
    required this.confirmingDelete,
    required this.playingAudio,
    required this.audioPlayer,
    required this.onTapQr,
    required this.onOpenUrl,
    required this.onToggleAudio,
    required this.onKindChanged,
    required this.onCaptionChanged,
    required this.onAnchorChanged,
    required this.onDeleteTap,
    required this.onDeleteConfirm,
    required this.onDeleteCancel,
  });

  final v1api.AnswerMediaEntry entry;
  final bool editable;
  final v1api.AnswerMediaLabels labels;
  final v1api.AnswerMediaLimits limits;
  final List<v1api.AnswerMediaPosition> positions;
  final TextEditingController captionController;
  final bool confirmingDelete;
  final bool playingAudio;
  final MediaAudioPlayer? audioPlayer;
  final VoidCallback onTapQr;
  final VoidCallback onOpenUrl;
  final VoidCallback onToggleAudio;
  final ValueChanged<String> onKindChanged;
  final ValueChanged<String> onCaptionChanged;
  final ValueChanged<int?> onAnchorChanged;
  final VoidCallback onDeleteTap;
  final VoidCallback onDeleteConfirm;
  final VoidCallback onDeleteCancel;

  @override
  State<_MediaCard> createState() => _MediaCardState();
}

class _MediaCardState extends State<_MediaCard> {
  bool _thumbFailed = false;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final entry = widget.entry;
    final t = widget.labels;
    final own = entry.fileId != null;
    final file = entry.file;
    final backend = context.read<ClientSession>().backend;
    final thumbUrl = entry.thumbUrl != null && !_thumbFailed ? backend.url(entry.thumbUrl!) : null;
    final kinds = own
        ? (entry.kind == 'video' ? const <String>[] : const ['audio', 'music'])
        : const ['video', 'music'];

    return Panel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Превью: кадр видео + QR в углу, либо крупный QR-код (1:1 с MediaItem сайта).
              GestureDetector(
                onTap: widget.onTapQr,
                child: thumbUrl != null
                    ? SizedBox(
                        width: 112,
                        height: 68,
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(Cab.ctl),
                              child: Image.network(
                                thumbUrl,
                                headers: entry.thumbUrl!.startsWith('/') ? backend.imageHeaders : null,
                                width: 104,
                                height: 60,
                                fit: BoxFit.cover,
                                errorBuilder: (_, _, _) {
                                  WidgetsBinding.instance.addPostFrameCallback((_) {
                                    if (mounted && !_thumbFailed) setState(() => _thumbFailed = true);
                                  });
                                  return ColoredBox(color: c.surface);
                                },
                              ),
                            ),
                            Positioned(
                              right: 0,
                              bottom: 0,
                              child: Container(
                                width: 38,
                                height: 38,
                                padding: const EdgeInsets.all(2),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(7),
                                  border: Border.all(color: c.border),
                                ),
                                child: SvgPicture.string(entry.qrSvg, width: 34, height: 34),
                              ),
                            ),
                          ],
                        ),
                      )
                    : Container(
                        width: 72,
                        height: 72,
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(Cab.ctl),
                          border: Border.all(color: c.border),
                        ),
                        child: SvgPicture.string(entry.qrSvg, width: 64, height: 64),
                      ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (kinds.isEmpty)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(LucideIcons.video, size: 16, color: c.brand),
                              const SizedBox(width: 6),
                              Text(t.kinds.video, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                            ],
                          )
                        else
                          Expanded(
                            child: Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                for (final k in kinds)
                                  ChoiceChip(
                                    label: Text(_kindLabel(k, t.kinds)),
                                    selected: entry.kind == k,
                                    onSelected: widget.editable ? (_) => widget.onKindChanged(k) : null,
                                    visualDensity: VisualDensity.compact,
                                  ),
                              ],
                            ),
                          ),
                        if (kinds.isEmpty) const Spacer(),
                        IconButton(
                          tooltip: own ? t.openFile : t.open,
                          onPressed: widget.onOpenUrl,
                          icon: Icon(LucideIcons.externalLink, size: 17, color: c.brand),
                        ),
                        if (widget.editable)
                          IconButton(
                            tooltip: t.remove,
                            onPressed: widget.onDeleteTap,
                            icon: Icon(LucideIcons.x, size: 17, color: c.textMuted),
                          ),
                      ],
                    ),
                    if (own && file != null) ...[
                      const SizedBox(height: 6),
                      _FileStatusBlock(file: file, waitText: t.file.wait),
                    ],
                  ],
                ),
              ),
            ],
          ),

          // Встроенный проигрыватель для готового своего аудио.
          if (own && file?.status == 'ready' && file?.kind == 'audio' && entry.playbackUrl != null) ...[
            const SizedBox(height: 10),
            _InlineAudioBar(
              playing: widget.playingAudio,
              durationLabel: file?.durationLabel ?? '',
              player: widget.audioPlayer,
              onToggle: widget.onToggleAudio,
            ),
          ],

          // Кнопка просмотра готового своего видео.
          if (own && file?.status == 'ready' && file?.kind == 'video') ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: widget.onOpenUrl,
              icon: Icon(LucideIcons.play, size: 15, color: c.brand),
              label: Text(t.openFile, style: TextStyle(color: c.brand)),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: c.border),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl)),
              ),
            ),
          ],

          // Подтверждение удаления своего файла (1:1 с MediaItem сайта).
          if (widget.confirmingDelete) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: c.dangerBg, borderRadius: BorderRadius.circular(Cab.ctl)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.file.removeConfirm, style: const TextStyle(fontSize: 13.5)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      FilledButton(
                        onPressed: widget.onDeleteConfirm,
                        style: FilledButton.styleFrom(backgroundColor: c.danger, foregroundColor: Colors.white),
                        child: Text(t.file.removeYes),
                      ),
                      const SizedBox(width: 8),
                      TextButton(
                        onPressed: widget.onDeleteCancel,
                        child: Text(t.file.removeNo, style: TextStyle(color: c.textMuted)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 12),
          Text(t.caption, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: c.textMuted)),
          const SizedBox(height: 5),
          TextField(
            controller: widget.captionController,
            readOnly: !widget.editable,
            maxLength: widget.limits.titleMax,
            onChanged: widget.onCaptionChanged,
            decoration: InputDecoration(
              hintText: _captionPlaceholder(entry.kind, t.captionPlaceholder),
              counterText: '',
            ),
          ),

          if (widget.positions.length > 1) ...[
            const SizedBox(height: 12),
            Text(t.place, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: c.textMuted)),
            const SizedBox(height: 5),
            DropdownButtonFormField<int>(
              initialValue: _positionIndex(entry.anchor, widget.positions),
              isExpanded: true,
              items: [
                for (var i = 0; i < widget.positions.length; i++)
                  DropdownMenuItem<int>(
                    value: i,
                    child: Text(widget.positions[i].label, maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: widget.editable
                  ? (idx) {
                      if (idx != null) widget.onAnchorChanged(widget.positions[idx].anchor);
                    }
                  : null,
            ),
          ],
        ],
      ),
    );
  }

  int _positionIndex(int? anchor, List<v1api.AnswerMediaPosition> positions) {
    final idx = positions.indexWhere((p) => p.anchor == anchor);
    return idx >= 0 ? idx : positions.length - 1;
  }
}

class _FileStatusBlock extends StatelessWidget {
  const _FileStatusBlock({required this.file, required this.waitText});
  final v1api.AnswerFileState file;
  final String waitText;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    if (file.status == 'failed' || file.status == 'gone') {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(LucideIcons.triangleAlert, size: 14, color: c.danger),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(file.errorText ?? file.statusLabel, style: TextStyle(fontSize: 12.5, height: 1.35, color: c.danger)),
          ),
        ],
      );
    }
    if (file.status == 'ready') {
      return Row(
        children: [
          Icon(LucideIcons.check, size: 14, color: c.success),
          const SizedBox(width: 6),
          Expanded(child: Text(file.statusLabel, style: TextStyle(fontSize: 12.5, color: c.success))),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            SizedBox(width: 13, height: 13, child: CircularProgressIndicator(strokeWidth: 2, color: c.brand)),
            const SizedBox(width: 6),
            Expanded(child: Text(file.statusLabel, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500))),
          ],
        ),
        const SizedBox(height: 3),
        Text(waitText, style: TextStyle(fontSize: 12, height: 1.35, color: c.textMuted)),
      ],
    );
  }
}

class _InlineAudioBar extends StatelessWidget {
  const _InlineAudioBar({
    required this.playing,
    required this.durationLabel,
    required this.player,
    required this.onToggle,
  });

  final bool playing;
  final String durationLabel;
  final MediaAudioPlayer? player;
  final VoidCallback onToggle;

  static String _fmt(Duration d) {
    final s = d.inSeconds;
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(Cab.ctl),
      ),
      child: Row(
        children: [
          InkWell(
            onTap: onToggle,
            borderRadius: BorderRadius.circular(999),
            child: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(color: c.brand, shape: BoxShape.circle),
              child: Icon(playing ? LucideIcons.pause : LucideIcons.play, size: 16, color: Colors.white),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: player == null
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(value: 0, minHeight: 4, backgroundColor: c.border, color: c.brand),
                  )
                : StreamBuilder<Duration>(
                    stream: player!.positionStream,
                    builder: (context, posSnap) => StreamBuilder<Duration?>(
                      stream: player!.durationStream,
                      builder: (context, durSnap) {
                        final pos = posSnap.data ?? Duration.zero;
                        final dur = durSnap.data ?? Duration.zero;
                        final ratio = dur.inMilliseconds > 0 ? (pos.inMilliseconds / dur.inMilliseconds).clamp(0.0, 1.0) : 0.0;
                        return Row(
                          children: [
                            Expanded(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(3),
                                child: LinearProgressIndicator(value: ratio, minHeight: 4, backgroundColor: c.border, color: c.brand),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _fmt(pos),
                              style: TextStyle(fontSize: 12, color: c.textMuted, fontFeatures: const [FontFeature.tabularFigures()]),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
          ),
          if (player == null && durationLabel.isNotEmpty) ...[
            const SizedBox(width: 8),
            Text(
              durationLabel,
              style: TextStyle(fontSize: 12, color: c.textMuted, fontFeatures: const [FontFeature.tabularFigures()]),
            ),
          ],
        ],
      ),
    );
  }
}

/// Лист оплаты пакета минут через Kaspi Pay (1:1 с PayDialog в FileUpload.tsx и _Payment в order_screen.dart).
class _MediaPackPaySheet extends StatefulWidget {
  const _MediaPackPaySheet({
    required this.bookId,
    required this.purchase,
    required this.labels,
    required this.kaspiPollIntervalMs,
    required this.openUrl,
  });

  final String bookId;
  final v1api.AnswerFilePackPurchase purchase;
  final v1api.AnswerMediaLabels labels;
  final int kaspiPollIntervalMs;
  final MediaUrlOpener openUrl;

  @override
  State<_MediaPackPaySheet> createState() => _MediaPackPaySheetState();
}

class _MediaPackPaySheetState extends State<_MediaPackPaySheet> {
  late final ClientSession _session = context.read<ClientSession>();
  late final TextEditingController _phone = TextEditingController(text: widget.purchase.kaspi?.defaultPhone ?? '');
  late v1api.KaspiInvoice? _invoice = widget.purchase.kaspi?.current;
  bool _busy = false;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    if (_invoice?.status == 'pending') _startPoll();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _phone.dispose();
    super.dispose();
  }

  void _startPoll() {
    _poll?.cancel();
    _poll = Timer.periodic(Duration(milliseconds: widget.kaspiPollIntervalMs), (_) async {
      final inv = _invoice;
      if (inv == null) return;
      try {
        final res = await _session.backend.call(
          () => _session.backend.contract.answerFilePackKaspiStatus(
            bookId: widget.bookId,
            purchaseId: widget.purchase.purchase.id,
            invoiceId: inv.id,
          ),
        );
        if (!mounted) return;
        setState(() => _invoice = res.invoice);
        if (res.invoice.status != 'pending') {
          _poll?.cancel();
          if (res.invoice.status == 'paid') {
            Navigator.of(context).pop(true);
          }
        }
      } on ApiException catch (_) {}
    });
  }

  Future<void> _issue(String method) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await _session.backend.call(
        () => _session.backend.contract.answerFilePackKaspi(
          bookId: widget.bookId,
          purchaseId: widget.purchase.purchase.id,
          body: v1api.KaspiPayBody(method: method, phone: _phone.text.trim()),
        ),
      );
      if (!mounted) return;
      setState(() => _invoice = res.invoice);
      _startPoll();
      if (method == 'invoice' && res.invoice.link != null) {
        widget.openUrl(res.invoice.link!);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final p = widget.purchase.purchase;
    final k = widget.labels.kaspi;
    final inv = _invoice;
    final closed = inv != null && inv.status != 'pending' && inv.status != 'paid'
        ? switch (inv.status) {
            'failed' => k.failed,
            'cancelled' => k.cancelled,
            _ => k.expired,
          }
        : null;

    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).viewInsets.bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.title, style: AppText.serif(context, size: 24, weight: FontWeight.w500)),
                      const SizedBox(height: 4),
                      Text(
                        p.amountLabel,
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()]),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: widget.labels.upload.close,
                  onPressed: () => Navigator.of(context).pop(false),
                  icon: Icon(LucideIcons.x, size: 20, color: c.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (widget.purchase.kaspi == null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Cab.ctl)),
                child: Text(widget.labels.upload.payUnavailable, style: TextStyle(fontSize: 14.5, height: 1.4, color: c.text)),
              )
            else ...[
              Row(
                children: [
                  Icon(LucideIcons.smartphone, size: 18, color: c.brand),
                  const SizedBox(width: 8),
                  Text(k.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                ],
              ),
              const SizedBox(height: 6),
              Text(p.note, style: TextStyle(fontSize: 13, color: c.textMuted)),
              const SizedBox(height: 12),
              if (inv?.status == 'paid')
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: c.success.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(Cab.ctl)),
                  child: Text(p.paidToast, style: TextStyle(color: c.success, fontSize: 14.5)),
                )
              else if (inv?.status == 'pending') ...[
                if (inv!.method == 'qr' && inv.qrSvg != null) ...[
                  Center(
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: c.border)),
                      child: SvgPicture.string(inv.qrSvg!, width: 200, height: 200),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(k.scanQr, style: TextStyle(fontSize: 14.5, height: 1.5, color: c.text.withValues(alpha: 0.85))),
                ] else
                  Text(k.sentSteps, style: TextStyle(fontSize: 14.5, height: 1.5, color: c.text.withValues(alpha: 0.85))),
                if (inv.link != null) ...[
                  const SizedBox(height: 12),
                  CabinetButton(label: k.openKaspi, icon: LucideIcons.externalLink, large: false, onPressed: () => widget.openUrl(inv.link!)),
                ],
                const SizedBox(height: 10),
                Row(
                  children: [
                    const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                    const SizedBox(width: 10),
                    Expanded(child: Text(k.waiting, style: TextStyle(fontSize: 14, color: c.textMuted))),
                  ],
                ),
              ] else ...[
                if (closed != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(Cab.ctl)),
                      child: Text(closed, style: TextStyle(color: c.warn, fontSize: 14)),
                    ),
                  ),
                Text(k.phoneLabel, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
                const SizedBox(height: 5),
                TextField(controller: _phone, keyboardType: TextInputType.phone),
                const SizedBox(height: 6),
                Text(k.invoiceNote, style: TextStyle(fontSize: 13, color: c.textMuted)),
                const SizedBox(height: 14),
                CabinetButton(label: closed != null ? k.again : k.sendInvoice, icon: LucideIcons.smartphone, busy: _busy, onPressed: () => _issue('invoice')),
                const SizedBox(height: 10),
                CabinetButton(label: k.payByQr, icon: LucideIcons.qrCode, kind: CabBtn.outline, onPressed: _busy ? null : () => _issue('qr')),
              ],
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(_error!, style: TextStyle(color: c.danger, fontSize: 14)),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
