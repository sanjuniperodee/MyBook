import "server-only";
import { Document, Page, Svg, Path, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { mm } from "../book/formats";
import { ensureFonts, face } from "./fonts";
import { formatPrice, getPlan, site } from "@/config/site";
import { env } from "../env";

const WINE = "#7A1F2B";
const INK = "#1F1A17";
const MUTED = "#7A7068";
const PAPER = "#FBF7F1";

export interface GiftPdfData {
  number: number;
  code: string;
  plan: string;
  amount: number;
  buyerName: string;
  recipientName: string;
  message: string;
  validUntil: Date;
}

const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** Сертификат A5 альбомной ориентации — удобно распечатать или отправить файлом. */
function GiftDocument({ d }: { d: GiftPdfData }) {
  const W = mm(210);
  const H = mm(148);
  const plan = getPlan(d.plan);
  const host = env.appUrl.replace(/^https?:\/\//, "");
  return (
    <Document title={`Подарочный сертификат ${site.name}`} author={site.name}>
      <Page size={{ width: W, height: H }} style={{ backgroundColor: PAPER, padding: mm(9) }}>
        <View style={{ flex: 1, borderWidth: 0.8, borderColor: WINE, borderStyle: "solid", padding: mm(3) }}>
          <View style={{ flex: 1, borderWidth: 0.4, borderColor: "#D9C9BC", borderStyle: "solid", paddingHorizontal: mm(12), paddingVertical: mm(9), flexDirection: "row" }}>
            <View style={{ flex: 1, paddingRight: mm(8) }}>
              <Text style={{ ...face("montserrat", 500), fontSize: 7.5, letterSpacing: 2.2, color: WINE, textTransform: "uppercase" }}>{site.name} · подарочный сертификат</Text>
              <Text style={{ ...face("cormorant", 500), fontSize: 30, lineHeight: 1.05, color: INK, marginTop: mm(5) }}>Книга о самом важном</Text>
              <Text style={{ ...face("montserrat", 500), fontSize: 6.5, letterSpacing: 1.6, color: MUTED, marginTop: mm(4), textTransform: "uppercase" }}>Получатель</Text>
              <Text style={{ ...face("cormorant", 500, true), fontSize: 17, color: INK, marginTop: 1 }}>{d.recipientName}</Text>
              {d.message ? (
                <Text style={{ ...face("lora", 400, true), fontSize: 10, lineHeight: 1.5, color: "#3B332E", marginTop: mm(6), maxLines: 5, textOverflow: "ellipsis" }}>
                  «{d.message}»
                </Text>
              ) : null}
              <Text style={{ ...face("caveat", 500), fontSize: 15, color: WINE, marginTop: mm(4) }}>— {d.buyerName}</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ ...face("onest", 400), fontSize: 7.5, lineHeight: 1.5, color: MUTED }}>
                Как воспользоваться: откройте {host}/redeem, введите код и напишите книгу — ответьте на вопросы, добавьте фотографии и выберите обложку. Сертификат применяется при оформлении заказа.
              </Text>
            </View>
            <View style={{ width: mm(58), borderLeftWidth: 0.4, borderLeftColor: "#D9C9BC", borderLeftStyle: "solid", paddingLeft: mm(8), alignItems: "center", justifyContent: "center" }}>
              <Svg width={mm(16)} height={mm(16)} viewBox="0 0 24 24">
                <Path d="M12 21s-7.5-4.6-9.6-9.3C.8 8.1 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.8 3.6 4.2 7.2C19.5 16.4 12 21 12 21z" fill={WINE} />
              </Svg>
              <Text style={{ ...face("onest", 400), fontSize: 8, color: MUTED, marginTop: mm(5) }}>Книга</Text>
              <Text style={{ ...face("cormorant", 600), fontSize: 15, color: INK, marginTop: 2, textAlign: "center" }}>«{plan?.name ?? d.plan}»</Text>
              <Text style={{ ...face("onest", 400), fontSize: 8, color: MUTED, marginTop: 2 }}>на сумму {formatPrice(d.amount)}</Text>
              <View style={{ marginTop: mm(7), backgroundColor: "#FFFFFF", borderWidth: 0.6, borderColor: WINE, borderStyle: "dashed", borderRadius: 4, paddingVertical: mm(3), paddingHorizontal: mm(3), width: "100%" }}>
                <Text style={{ ...face("onest", 400), fontSize: 6.5, color: MUTED, textAlign: "center", letterSpacing: 1 }}>КОД</Text>
                <Text style={{ ...face("montserrat", 600), fontSize: 12.5, color: INK, textAlign: "center", letterSpacing: 1.2, marginTop: 2 }}>{d.code}</Text>
              </View>
              <Text style={{ ...face("onest", 400), fontSize: 6.5, color: MUTED, marginTop: mm(4), textAlign: "center" }}>
                № {d.number} · действует до {d.validUntil.getDate()} {months[d.validUntil.getMonth()]} {d.validUntil.getFullYear()}
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderGiftPdf(d: GiftPdfData): Promise<Buffer> {
  ensureFonts();
  return renderToBuffer(<GiftDocument d={d} />);
}
