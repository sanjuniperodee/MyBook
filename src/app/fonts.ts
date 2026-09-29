import localFont from "next/font/local";

export const onest = localFont({
  src: [
    { path: "../../assets/fonts/Onest-400.ttf", weight: "400" },
    { path: "../../assets/fonts/Onest-500.ttf", weight: "500" },
    { path: "../../assets/fonts/Onest-600.ttf", weight: "600" },
    { path: "../../assets/fonts/Onest-700.ttf", weight: "700" },
  ],
  variable: "--font-onest",
  display: "swap",
});

export const cormorant = localFont({
  src: [
    { path: "../../assets/fonts/Cormorant-400.ttf", weight: "400" },
    { path: "../../assets/fonts/Cormorant-500.ttf", weight: "500" },
    { path: "../../assets/fonts/Cormorant-600.ttf", weight: "600" },
    { path: "../../assets/fonts/Cormorant-400-italic.ttf", weight: "400", style: "italic" },
    { path: "../../assets/fonts/Cormorant-500-italic.ttf", weight: "500", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

export const playfair = localFont({
  src: [
    { path: "../../assets/fonts/Playfair-400.ttf", weight: "400" },
    { path: "../../assets/fonts/Playfair-600.ttf", weight: "600" },
    { path: "../../assets/fonts/Playfair-400-italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-playfair",
  display: "swap",
  preload: false,
});

export const lora = localFont({
  src: [
    { path: "../../assets/fonts/Lora-400.ttf", weight: "400" },
    { path: "../../assets/fonts/Lora-600.ttf", weight: "600" },
    { path: "../../assets/fonts/Lora-400-italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-lora",
  display: "swap",
  preload: false,
});

export const ptserif = localFont({
  src: [
    { path: "../../assets/fonts/PTSerif-400.ttf", weight: "400" },
    { path: "../../assets/fonts/PTSerif-700.ttf", weight: "700" },
    { path: "../../assets/fonts/PTSerif-400-italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-ptserif",
  display: "swap",
  preload: false,
});

export const montserrat = localFont({
  src: [
    { path: "../../assets/fonts/Montserrat-400.ttf", weight: "400" },
    { path: "../../assets/fonts/Montserrat-500.ttf", weight: "500" },
    { path: "../../assets/fonts/Montserrat-600.ttf", weight: "600" },
    { path: "../../assets/fonts/Montserrat-400-italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-montserrat",
  display: "swap",
  preload: false,
});

export const badscript = localFont({
  src: [{ path: "../../assets/fonts/BadScript-400.ttf", weight: "400" }],
  variable: "--font-badscript",
  display: "swap",
  preload: false,
});

export const caveat = localFont({
  src: [{ path: "../../assets/fonts/Caveat-500.ttf", weight: "500" }],
  variable: "--font-caveat",
  display: "swap",
  preload: false,
});

export const fontVariables = [onest, cormorant, playfair, lora, ptserif, montserrat, badscript, caveat]
  .map((f) => f.variable)
  .join(" ");
