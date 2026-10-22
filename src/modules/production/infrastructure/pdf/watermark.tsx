import "server-only";
import { Document, Page, Text } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getFormat } from "@/lib/book/formats";
import { interiorMetrics } from "@/lib/book/page-geometry";
import { ensureFonts, face, renderPdf } from "./fonts";

/** Полоса-наклейка с надписью «Предпросмотр»: вид и место — как у прежнего водяного знака в вёрстке блока. */
function MarkDocument({ size, scale, label }: { size: { width: number; height: number }; scale: number; label: string }) {
  return (
    <Document>
      <Page size={size}>
        <Text
          fixed
          style={{
            position: "absolute",
            top: size.height / 2 - 30,
            left: -40,
            width: size.width + 80,
            textAlign: "center",
            fontSize: 44 * scale,
            color: "#000000",
            opacity: 0.05,
            transform: "rotate(-35deg)",
            ...face("montserrat", 600),
            letterSpacing: 6,
          }}
        >
          {label}
        </Text>
      </Page>
    </Document>
  );
}

/** Наклейки по языку, формату и размеру листа: их всего несколько, рисуются один раз за процесс. */
const stickers = new Map<string, Promise<Buffer>>();

function sticker(language: Locale, formatId: string, size: { width: number; height: number }) {
  const format = getFormat(formatId);
  const key = `${language}:${format.id}:${size.width}x${size.height}`;
  let pdf = stickers.get(key);
  if (!pdf) {
    ensureFonts();
    pdf = renderPdf(<MarkDocument size={size} scale={interiorMetrics[format.id].scale} label={messagesFor(language).book.previewMark} />);
    pdf.catch(() => stickers.delete(key));
    stickers.set(key, pdf);
  }
  return pdf;
}

/**
 * Водяной знак поверх готового PDF экранной сборки, пока книга не оплачена: наклейку рисует react-pdf (шрифт и вид
 * прежнего знака), pdf-lib ставит её поверх каждой полосы. Потоки содержимого полос не меняются (pdf-lib только
 * обрамляет их q … Q и дописывает наклейку после), поэтому вёрстка под знаком — та же, что на экране и в печати.
 */
export async function watermarkPdf(pdf: Uint8Array, language: Locale, formatId: string): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const pages = doc.getPages();
  if (!pages.length) return Buffer.from(pdf);
  const [mark] = await doc.embedPdf(await sticker(language, formatId, pages[0].getSize()), [0]);
  for (const page of pages) page.drawPage(mark, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  return Buffer.from(await doc.save());
}
