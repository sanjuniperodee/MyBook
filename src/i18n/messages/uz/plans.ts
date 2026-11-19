import type { Messages } from "..";

/** Тарифы: названия, значки и что входит — в общем словаре и на сертификате (на языке сертификата). */
export const plans: Messages["common"]["plans"] = {
  digital: {
    name: "Elektron",
    features: ["Yuqori sifatli PDF kitob", "Fayl istalgan bosmaxonada chop etishga tayyor", "Barcha boblar, suratlar va mundarija", "To‘lovdan so‘ng darhol mavjud"],
  },
  hardcover: {
    name: "Qattiq muqova",
    badge: "Eng ko‘p tanlanadigan",
    features: ["Qattiq muqova, tikilgan blok", "Zich qog‘oz, 150 g/m²", "Suratlar to‘liq rangli bosiladi", "PDF nusxasi sovg‘a"],
  },
  premium: {
    name: "Premium",
    features: ["«Qattiq muqova» tarifidagi hamma narsa", "Dizayner qog‘ozi, 170 g/m²", "Sovg‘a qutisi va tabrik kartasi", "Ustuvor tayyorlash"],
  },
};
