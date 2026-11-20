import type { Messages } from "..";

/** Book designer — shared elements: font picker, weights, reset. */
export const design_ui: Messages["design"]["ui"] = {
  fonts: {
    search: "Find a font",
    all: "All",
    categories: { book: "Book", editorial: "Magazine", sans: "Sans serif", script: "Handwritten", decorative: "Decorative", kids: "Children’s" },
    sample: "Where you are, I am home",
    letters: "Aa Bb Cc 123",
    headingsOnly: "for headings",
    empty: "No such font",
    choose: "Choose a font",
  },
  weights: { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold" } as Record<number, string>,
  weight: "Weight",
  italic: "Italic",
  reset: "As in the style",
  none: "None",
  /** Design studio: frame, panel tabs and scene view (components/design/studio). */
  studio: {
    cover: {
      panelsAria: "Cover tools",
      tabs: { designs: "Design", photo: "Photo", text: "Text", fill: "Background", variant: "Variant", details: "Details" },
      view: { aria: "Cover view", flat: "Flat", spread: "Full", spatial: "3D", spatialBack: "The 3D view is shown for the front only" },
      spreadHint: "Tap a side to edit it.",
      chosen: "Chosen design",
      frameTitle: "Photo crop",
      designsAll: "All designs",
    },
    pages: {
      tabsAria: "Sheet sections",
      tabs: { style: "Design", content: "Book contents" },
      ribbonTitle: "Book contents",
      start: "Start",
      end: "End",
      front: "Title and dedication",
      frontSet: "Dedication added",
      frontEmpty: "No dedication",
      tocOn: "In the book",
      tocOff: "Turned off",
      tocShow: "Show spread",
      chapterOf: (n: number, total: number) => `Chapter ${n} of ${total}`,
      removed: "Removed",
      needPhoto: "Photo needed",
      photosRule: "Photos without a place",
      spreadAria: "What to show on the spread",
      collapse: "Collapse",
      expand: "Expand",
    },
  },
};
