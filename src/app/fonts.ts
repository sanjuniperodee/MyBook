/** Сайт грузит WOFF2-подмножества из assets/fonts/web (scripts/web-fonts.sh) — в 5–7 раз легче TTF; PDF берёт полные TTF. */
import localFont from "next/font/local";

export const onest = localFont({
  src: [
    { path: "../../assets/fonts/web/Onest-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Onest-500.woff2", weight: "500" },
    { path: "../../assets/fonts/web/Onest-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Onest-700.woff2", weight: "700" },
  ],
  variable: "--font-onest",
  display: "swap",
});

export const cormorant = localFont({
  src: [
    { path: "../../assets/fonts/web/Cormorant-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Cormorant-500.woff2", weight: "500" },
    { path: "../../assets/fonts/web/Cormorant-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Cormorant-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../../assets/fonts/web/Cormorant-500-italic.woff2", weight: "500", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

export const playfair = localFont({
  src: [
    { path: "../../assets/fonts/web/Playfair-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Playfair-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Playfair-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-playfair",
  display: "swap",
  preload: false,
});

export const lora = localFont({
  src: [
    { path: "../../assets/fonts/web/Lora-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Lora-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Lora-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-lora",
  display: "swap",
  preload: false,
});

export const ptserif = localFont({
  src: [
    { path: "../../assets/fonts/web/PTSerif-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/PTSerif-700.woff2", weight: "700" },
    { path: "../../assets/fonts/web/PTSerif-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-ptserif",
  display: "swap",
  preload: false,
});

export const montserrat = localFont({
  src: [
    { path: "../../assets/fonts/web/Montserrat-400.woff2", weight: "400" },
    { path: "../../assets/fonts/web/Montserrat-500.woff2", weight: "500" },
    { path: "../../assets/fonts/web/Montserrat-600.woff2", weight: "600" },
    { path: "../../assets/fonts/web/Montserrat-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-montserrat",
  display: "swap",
  preload: false,
});

export const badscript = localFont({
  src: [{ path: "../../assets/fonts/web/BadScript-400.woff2", weight: "400" }],
  variable: "--font-badscript",
  display: "swap",
  preload: false,
});

export const caveat = localFont({
  src: [{ path: "../../assets/fonts/web/Caveat-500.woff2", weight: "500" }],
  variable: "--font-caveat",
  display: "swap",
  preload: false,
});

export const fontVariables = [onest, cormorant, playfair, lora, ptserif, montserrat, badscript, caveat]
  .map((f) => f.variable)
  .join(" ");
