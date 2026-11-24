import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/models.dart';
import '../data/session.dart';
import '../data/stores.dart';

/// Фото книги: сетка снимков и загрузка из галереи или с камеры (как «Фото» в кабинете). Места и редактор — следующим
/// выпуском, пока — на сайте.
class PhotosScreen extends StatefulWidget {
  const PhotosScreen({
    super.key,
    required this.store,
    this.inBook = 0,
    this.hub,
  });
  final BookStore store;
  final v1api.CabinetBook? hub;

  /// Сколько фото уже в книге по данным полки — пока модель книги в API их не отдаёт (тогда сетка пуста).
  final int inBook;

  @override
  State<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends State<PhotosScreen> {
  final _picker = ImagePicker();
  int _uploading = 0;

  Future<void> _add(ImageSource source) async {
    final book = widget.store.book!;
    final left = book.maxPhotos - book.photos.length;
    if (left <= 0)
      return _say('В книге уже ${book.maxPhotos} фото — больше не поместится');
    final picked = source == ImageSource.camera
        ? [?await _picker.pickImage(source: source, imageQuality: 92)]
        : await _picker.pickMultiImage(
            imageQuality: 92,
            limit: left.clamp(2, 50),
          );
    if (picked.isEmpty) return;
    setState(() => _uploading += picked.length);
    // По 5 за раз: большой выбор с телефона не упирается в лимит запроса и показывает ход.
    final errors = <String>[];
    try {
      for (var i = 0; i < picked.length; i += 5) {
        final part = picked.skip(i).take(5).map((x) => File(x.path)).toList();
        errors.addAll(await widget.store.upload(part));
        if (mounted) setState(() => _uploading -= part.length);
      }
    } on ApiException catch (e) {
      errors.add(e.message);
    } finally {
      if (mounted) setState(() => _uploading = 0);
    }
    if (errors.isNotEmpty) _say(errors.join('\n'));
  }

  void _say(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  void _choose() => showAppSheet<void>(
    context,
    title: 'Добавить фото',
    icon: LucideIcons.imagePlus,
    builder: (ctx) {
      return GroupCard(
        padding: EdgeInsets.zero,
        children: [
          GroupTile(
            title: 'Из галереи',
            icon: LucideIcons.images,
            onTap: () {
              Navigator.of(ctx).pop();
              _add(ImageSource.gallery);
            },
          ),
          GroupTile(
            title: 'Снять камерой',
            icon: LucideIcons.camera,
            onTap: () {
              Navigator.of(ctx).pop();
              _add(ImageSource.camera);
            },
          ),
        ],
      );
    },
  );

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return ListenableBuilder(
      listenable: widget.store,
      builder: (context, _) {
        final book = widget.store.book!;
        return Scaffold(
          backgroundColor: c.bg,
          appBar: AppBar(
            backgroundColor: c.bg,
            surfaceTintColor: Colors.transparent,
            title: Text('Фото', style: AppText.headline(context)),
            actions: [
              if (book.photos.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(right: 16),
                  child: Center(
                    child: Text(
                      '${book.photos.length} / ${book.maxPhotos}',
                      style: AppText.caption(context),
                    ),
                  ),
                ),
            ],
          ),
          floatingActionButton: book.editable
              ? FloatingActionButton.extended(
                  onPressed: _uploading > 0 ? null : _choose,
                  backgroundColor: c.brand,
                  foregroundColor: c.onBrand,
                  icon: _uploading > 0
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(LucideIcons.plus),
                  label: Text(
                    _uploading > 0 ? 'Загружаем $_uploading…' : 'Добавить фото',
                  ),
                )
              : null,
          body: book.photos.isEmpty
              ? widget.inBook > 0
                    ? EmptyState(
                        icon: LucideIcons.images,
                        title: 'В книге ${widget.inBook} фото',
                        hint:
                            'Добавьте новые с телефона. Уже загруженные, их места и подписи — в кабинете на сайте.',
                      )
                    : const EmptyState(
                        icon: LucideIcons.images,
                        title: 'Фото пока нет',
                        hint:
                            'Старые снимки, свадьба, дети, путешествия — фото встанут рядом с ответами и в альбом в конце книги.',
                      )
              : GridView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 100),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 6,
                    crossAxisSpacing: 6,
                  ),
                  itemCount: book.photos.length,
                  itemBuilder: (context, i) =>
                      PhotoThumb(photo: book.photos[i]),
                ),
        );
      },
    );
  }
}

/// Миниатюра фото книги: с сервера по токену автора (или локальный файл в отладке).
class PhotoThumb extends StatelessWidget {
  const PhotoThumb({super.key, required this.photo});
  final BookPhoto photo;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final src = context.read<ClientSession>().backend.photo(photo.id);
    final placeholder = Container(
      color: c.surface,
      child: Icon(LucideIcons.image, color: c.textFaint),
    );
    final image = src.url.startsWith('file:')
        ? Image.file(
            File.fromUri(Uri.parse(src.url)),
            fit: BoxFit.cover,
            cacheWidth: 360,
          )
        : Image.network(
            src.url,
            headers: src.headers,
            fit: BoxFit.cover,
            cacheWidth: 360,
            errorBuilder: (_, _, _) => placeholder,
          );
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Stack(
        fit: StackFit.expand,
        children: [
          image,
          if (photo.questionId != null)
            Positioned(
              right: 5,
              bottom: 5,
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  borderRadius: BorderRadius.circular(5),
                ),
                child: const Icon(
                  LucideIcons.messageSquareText,
                  size: 12,
                  color: Colors.white,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
