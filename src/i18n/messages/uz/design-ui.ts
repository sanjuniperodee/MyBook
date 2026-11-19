import type { Messages } from "..";

/** Kitob dizayneri — umumiy elementlar: shrift tanlash, qalinlik, asliga qaytarish. */
export const design_ui: Messages["design"]["ui"] = {
  fonts: {
    search: "Shrift qidirish",
    all: "Hammasi",
    categories: { book: "Kitob shriftlari", editorial: "Jurnal shriftlari", sans: "Serifsiz", script: "Qo‘lyozma", decorative: "Bezakli", kids: "Bolalar uchun" },
    sample: "Sen bor joy — mening uyim",
    letters: "Aa Oo‘ Gg‘ Sh Ch Ng",
    headingsOnly: "sarlavhalar uchun",
    empty: "Bunday shrift yo‘q",
    choose: "Shrift tanlash",
  },
  weights: { 300: "Yengil", 400: "Oddiy", 500: "O‘rta", 600: "Yarim qalin", 700: "Qalin", 800: "Juda qalin" } as Record<number, string>,
  weight: "Qalinlik",
  italic: "Kursiv",
  reset: "Uslubdagidek",
  none: "Yo‘q",
  /** Bezak studiyasi: ramka, panel yorliqlari va sahna ko‘rinishi (components/design/studio). */
  studio: {
    cover: {
      panelsAria: "Muqova asboblari",
      tabs: { designs: "Dizayn", photo: "Surat", text: "Matn", fill: "Fon", variant: "Variant", details: "Tafsilotlar" },
      view: { aria: "Muqova ko‘rinishi", flat: "Yassi", spread: "To‘liq", spatial: "Hajmli", spatialBack: "Hajmli ko‘rinish faqat old tomon uchun ko‘rsatiladi" },
      spreadHint: "Tahrirlash uchun tomonni bosing.",
      chosen: "Tanlangan dizayn",
      frameTitle: "Surat kadri",
      designsAll: "Barcha dizaynlar",
    },
    pages: {
      tabsAria: "Varaq bo‘limlari",
      tabs: { style: "Bezak", content: "Kitob tarkibi" },
      ribbonTitle: "Kitob tarkibi",
      start: "Boshi",
      end: "Oxiri",
      front: "Titul va bag‘ishlov",
      frontSet: "Bag‘ishlov bor",
      frontEmpty: "Bag‘ishlovsiz",
      tocOn: "Kitobda bor",
      tocOff: "O‘chirilgan",
      tocShow: "Yoyilmani ko‘rsatish",
      chapterOf: (n: number, total: number) => `${total} tadan ${n}-bob`,
      removed: "Olib tashlangan",
      needPhoto: "Surat kerak",
      photosRule: "Joyi yo‘q suratlar",
      spreadAria: "Yoyilmada nimani ko‘rsatish",
      collapse: "Yig‘ish",
      expand: "Yoyish",
    },
  },
};
