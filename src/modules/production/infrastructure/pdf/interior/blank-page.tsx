import "server-only";
import { Page } from "@react-pdf/renderer";
import { pageMark, type PdfKit } from "./kit";

/**
 * Пустая полоса перед начальной полосой главы (BookContent.openersLeft): та встаёт слева, а по счёту выпала бы справа.
 * Только бумага оформления — без колонтитула и колонцифры, как пустые полосы в книгах.
 */
export function BlankPage({ kit }: { kit: PdfKit }) {
  return <Page {...pageMark("blank")} size={kit.pageSize} style={kit.pagePadding} />;
}
