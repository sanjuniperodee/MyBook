import type { Messages } from "..";

/** Кітап дизайнері — ортақ элементтер: қаріп таңдау, сызба, қайтару. */
export const design_ui: Messages["design"]["ui"] = {
  fonts: {
    search: "Қаріпті іздеу",
    all: "Барлығы",
    categories: { book: "Кітаптық", editorial: "Журналдық", sans: "Серифсіз", script: "Қолжазба", decorative: "Сәндік", kids: "Балаларға" },
    sample: "Сен қайда болсаң — үйім сонда",
    letters: "Аа Әә Ғғ Ққ Ңң Өө Ұұ Үү Іі",
    headingsOnly: "тақырыптар үшін",
    empty: "Мұндай қаріп жоқ",
    choose: "Қаріпті таңдау",
  },
  weights: { 300: "Жіңішке", 400: "Қалыпты", 500: "Орташа", 600: "Жартылай қалың", 700: "Қалың", 800: "Өте қалың" },
  weight: "Қалыңдығы",
  italic: "Курсив",
  reset: "Стильдегідей",
  none: "Жоқ",
  studio: {
    cover: {
      panelsAria: "Мұқаба құралдары",
      tabs: { designs: "Дизайн", photo: "Фото", text: "Мәтін", fill: "Фон", variant: "Нұсқа", details: "Бөлшектер" },
      view: { aria: "Мұқаба көрінісі", flat: "Жазық", spread: "Тұтас", spatial: "Көлемді", spatialBack: "Көлемді көрініс тек алдыңғы жағында бар" },
      spreadHint: "Жағын өңдеу үшін оны басыңыз.",
      chosen: "Таңдалған дизайн",
      frameTitle: "Фото кадры",
      designsAll: "Барлық дизайн",
    },
    pages: {
      tabsAria: "Парақ бөлімдері",
      tabs: { style: "Безендіру", content: "Кітап құрамы" },
      ribbonTitle: "Кітап құрамы",
      start: "Басы",
      end: "Соңы",
      front: "Титул және арнау",
      frontSet: "Арнау бар",
      frontEmpty: "Арнаусыз",
      tocOn: "Кітапта бар",
      tocOff: "Өшірулі",
      tocShow: "Жайылманы көрсету",
      chapterOf: (n: number, total: number) => `${n}-тарау, барлығы ${total}`,
      removed: "Алынған",
      needPhoto: "Фото керек",
      photosRule: "Орнысыз фото",
      spreadAria: "Жайылмада нені көрсету",
      collapse: "Жию",
      expand: "Ашу",
    },
  },
};

