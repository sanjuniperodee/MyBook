import "server-only";
import { Link, Text, View } from "@react-pdf/renderer";
import { mediaCardBox, mediaIcon, mediaSource, qrDrawing, qrInk, type AnswerMedia } from "@/lib/book/answer-media";
import { MEDIA_CARD } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { PdfDrawing } from "@/modules/production/infrastructure/pdf/art";
import { labelStyle, mark, noHyphens, type PdfKit } from "./kit";

/**
 * Карточка видео или музыки в ответе: QR-код и подпись — вид и площадка («Видео · YouTube»), название, подсказка
 * «наведите камеру». Карточка не делится между полосами; высота известна заранее (mediaCardBox), поэтому оценка
 * объёма с вёрсткой не расходятся. В электронной версии (options.links) карточка — ещё и ссылка.
 */
function MediaCard({ kit, media, id }: { kit: PdfKit; media: AnswerMedia; id: string }) {
  const { design, sizes: S, scale, textWidthPt, t } = kit;
  const { palette: P, type: typo } = design;
  const box = mediaCardBox(textWidthPt, scale);
  const source = mediaSource(media.url);
  const icon = S.label * MEDIA_CARD.icon;
  const card = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        width: box.width,
        height: box.height,
        padding: box.pad,
        borderWidth: box.border,
        borderStyle: "solid",
        borderColor: P.rule,
        borderRadius: box.radius,
      }}
    >
      <PdfDrawing drawing={qrDrawing(media.url, box.qr, qrInk(P.ink))} />
      <View style={{ width: box.textWidth, marginLeft: box.gap, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <PdfDrawing drawing={mediaIcon(media.kind, icon, P.accent)} />
          <Text hyphenationCallback={noHyphens} style={{ ...labelStyle(kit, P.accent), marginLeft: 4 * scale, maxLines: 1 }}>
            {source ? `${t.media[media.kind]} · ${source}` : t.media[media.kind]}
          </Text>
        </View>
        {media.title ? (
          <Text
            hyphenationCallback={noHyphens}
            style={{
              ...face(typo.heading, typo.headingWeight, typo.headingItalic),
              fontSize: S.body * MEDIA_CARD.title.size,
              lineHeight: MEDIA_CARD.title.lineHeight,
              color: P.ink,
              marginTop: MEDIA_CARD.labelGap * scale,
              maxLines: MEDIA_CARD.title.maxLines,
              textOverflow: "ellipsis",
            }}
          >
            {media.title}
          </Text>
        ) : null}
        <Text hyphenationCallback={noHyphens} style={{ ...kit.italicBody, fontSize: S.caption, lineHeight: 1.3, color: P.muted, marginTop: MEDIA_CARD.noteGap * scale, maxLines: 2 }}>
          {t.media.scan[media.kind]}
        </Text>
      </View>
    </View>
  );
  return (
    // Пометка «b» — для доводки это неделимый блок ответа: заголовок не останется внизу полосы над карточкой.
    <View {...mark(id)} wrap={false} style={{ marginTop: S.body * MEDIA_CARD.before, marginBottom: S.body * MEDIA_CARD.after }}>
      {kit.options.links ? (
        <Link src={media.url} style={{ textDecoration: "none" }}>
          {card}
        </Link>
      ) : (
        card
      )}
    </View>
  );
}

/** Карточки QR-кодов в одном месте ответа (at — как у рядов фото: −1, номер блока, Infinity). */
export function MediaCards({ kit, itemId, at, media }: { kit: PdfKit; itemId: string; at: number; media: AnswerMedia[] | undefined }) {
  return (
    <>
      {(media ?? []).map((m) => (
        <MediaCard key={m.id} kit={kit} media={m} id={`b:${itemId}:m${at}:${m.id}`} />
      ))}
    </>
  );
}
