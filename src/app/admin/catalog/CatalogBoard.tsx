"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ImagePlus, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { DrawerButton } from "@/components/admin/Drawer";
import { confirmDialog, toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { formatPrice, reviewLabel } from "@/modules/messaging/domain/catalog";
import { createProductAction, deleteProductAction, setProductHiddenAction, syncCatalogAction, updateProductAction } from "./actions";

export interface ProductView {
  id: string;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  retailerId: string;
  url: string;
  hidden: boolean;
  review: string;
  imageUrls: string[];
  /** Сколько видео у товара в WhatsApp: из CRM их не добавить, при правке они сохраняются. */
  videos: number;
  hasImage: boolean;
}

const TONE: Record<string, string> = { ok: "bg-success-bg text-success", wait: "bg-warning-bg text-warning", bad: "bg-danger-bg text-danger", none: "bg-sunken text-muted" };

/** «Добавить товар»: форма в боковой панели (функция-содержимое панели живёт на клиенте, со страницы её не передать). */
export function NewProductButton({ currency }: { currency: string }) {
  return (
    <DrawerButton variant="primary" lazy label="Добавить товар" icon={<Plus className="size-4" aria-hidden />} title="Новый товар" description="Товар появится в каталоге WhatsApp после проверки WhatsApp" testId="new-product">
      {(close) => <ProductForm currency={currency} onDone={close} />}
    </DrawerButton>
  );
}

/** «Обновить из WhatsApp»: забрать каталог (товары из приложения, решения проверки). */
export function SyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await syncCatalogAction();
          if (!r.ok) return toast(r.error, "error");
          toast(`Каталог обновлён: ${r.total} товаров${r.removed ? `, убрано ${r.removed}` : ""}`, "success");
          router.refresh();
        })
      }
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Обновить из WhatsApp
    </button>
  );
}

/** Товар в списке: обложка, цена, статус проверки WhatsApp, «скрыт»; правка в боковой панели, скрыть/показать, удалить. */
export function ProductCard({ product: p }: { product: ProductView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const review = reviewLabel(p.review);
  const price = formatPrice(p.price, p.currency);
  const toggle = () =>
    start(async () => {
      const r = await setProductHiddenAction(p.id, !p.hidden);
      if (!r.ok) return toast(r.error, "error");
      toast(p.hidden ? "Товар снова виден клиентам" : "Товар скрыт из каталога", "success");
      router.refresh();
    });
  const remove = () =>
    start(async () => {
      const yes = await confirmDialog({ title: `Удалить «${p.name}»?`, text: "Товар исчезнет из каталога WhatsApp. Уже отправленные клиентам карточки перестанут открываться.", confirmLabel: "Удалить", danger: true });
      if (!yes) return;
      const r = await deleteProductAction(p.id);
      if (!r.ok) return toast(r.error, "error");
      toast("Товар удалён", "success");
      router.refresh();
    });
  return (
    <li className={cn("panel flex gap-3 p-3", p.hidden && "opacity-75")} data-testid="catalog-product">
      <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-sunken">
        {p.hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- обложка из нашей копии каталога, размер задан рамкой
          <img src={`/api/admin/catalog/${p.id}/image`} alt="" className="size-full object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="font-medium leading-snug text-ink">{p.name}</div>
        <div className="text-sm text-ink-soft">{price || "Без цены"}</div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {review.label ? <span className={cn("rounded-full px-2 py-0.5", TONE[review.tone])}>{review.label}</span> : null}
          {p.hidden ? <span className="rounded-full bg-sunken px-2 py-0.5 text-muted">Скрыт</span> : null}
          {p.retailerId ? <span className="rounded-full bg-sunken px-2 py-0.5 text-muted">арт. {p.retailerId}</span> : null}
          {p.videos ? <span className="rounded-full bg-sunken px-2 py-0.5 text-muted">видео: {p.videos}</span> : null}
        </div>
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          <DrawerButton variant="ghost" lazy className="btn-sm" label="Изменить" icon={<Pencil className="size-3.5" aria-hidden />} title="Товар каталога" description={p.name}>
            {(close) => <ProductForm product={p} currency={p.currency} onDone={close} />}
          </DrawerButton>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={toggle}>
            {p.hidden ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />} {p.hidden ? "Показать" : "Скрыть"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={pending} onClick={remove}>
            <Trash2 className="size-3.5" aria-hidden /> Удалить
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Новый товар или правка. Фото: уже загруженные в WhatsApp можно убрать, новые — добавить (первое — обложка). WhatsApp
 * заменяет товар целиком и заново проверяет его, поэтому сохранение может занять до минуты.
 */
export function ProductForm({ product, currency, onDone }: { product?: ProductView; currency: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [keep, setKeep] = useState<string[]>(product?.imageUrls ?? []);
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const total = keep.length + files.length;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...list].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type)).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setFiles((prev) => [...prev, ...next].slice(0, Math.max(0, 10 - keep.length)));
  };

  const submit = (form: FormData) =>
    start(async () => {
      setError(null);
      form.delete("image");
      for (const f of files) form.append("image", f.file, f.file.name);
      if (product) {
        form.set("keepSet", "1");
        for (const u of keep) form.append("keep", u);
      }
      if (!total) return setError("Добавьте хотя бы одно фото — без фото WhatsApp товар не примет");
      const r = product ? await updateProductAction(product.id, form) : await createProductAction(form);
      if (!r.ok) return setError(r.error);
      toast(product ? "Товар сохранён — WhatsApp проверит изменения" : "Товар добавлен — он появится у клиентов после проверки WhatsApp", "success");
      onDone();
      router.refresh();
    });

  return (
    <form action={submit} className="grid grid-cols-2 gap-4" data-testid="product-form">
      <Field label="Название" className="col-span-2">
        <input name="name" className="input" required maxLength={150} defaultValue={product?.name} placeholder="Книга-история о маме" />
      </Field>
      <Field label="Цена" hint="Пусто — без цены">
        <input name="price" className="input" inputMode="decimal" defaultValue={product?.price ?? ""} placeholder="25000" />
      </Field>
      <Field label="Валюта">
        <input name="currency" className="input uppercase" maxLength={3} defaultValue={product?.currency || currency} required />
      </Field>
      <Field label="Описание" optional className="col-span-2">
        <textarea name="description" className="input min-h-28" maxLength={5000} defaultValue={product?.description} />
      </Field>
      <Field label="Ссылка" optional hint="Например, страница товара на сайте">
        <input name="url" className="input" type="url" maxLength={2000} defaultValue={product?.url} placeholder="https://mybooks.kz/…" />
      </Field>
      <Field label="Артикул" optional>
        <input name="retailerId" className="input" maxLength={100} defaultValue={product?.retailerId} />
      </Field>
      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" name="hidden" defaultChecked={product?.hidden ?? false} /> Скрыть от клиентов (товар останется в каталоге, но его не будет видно)
      </label>

      <div className="col-span-2 space-y-2">
        <div className="text-sm font-medium">Фото {total ? `(${total} из 10, первое — обложка)` : ""}</div>
        <div className="flex flex-wrap gap-2">
          {keep.map((u) => (
            <Thumb key={u} src={`/api/admin/catalog/photo?u=${encodeURIComponent(u)}`} onRemove={() => setKeep((k) => k.filter((x) => x !== u))} />
          ))}
          {files.map((f) => (
            <Thumb key={f.url} src={f.url} onRemove={() => setFiles((list) => list.filter((x) => x !== f))} />
          ))}
          {total < 10 ? (
            <button type="button" className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-xs text-muted hover:text-ink" onClick={() => input.current?.click()}>
              <ImagePlus className="size-5" aria-hidden /> Добавить
            </button>
          ) : null}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
        {product?.videos ? <p className="text-xs text-muted">Видео товара ({product.videos}) сохранятся — их добавляют и меняют в приложении WhatsApp Business. После правки WhatsApp заново проверит товар, пока идёт проверка, клиенты его не видят.</p> : <p className="text-xs text-muted">JPEG, PNG или WebP до 8 МБ. После сохранения WhatsApp проверяет товар, обычно это минуты.</p>}
      </div>

      <button className="btn btn-dark col-span-2 w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} {product ? "Сохранить в WhatsApp" : "Добавить в каталог"}
      </button>
      {error ? <Alert className="col-span-2">{error}</Alert> : null}
    </form>
  );
}

function Thumb({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative size-20 overflow-hidden rounded-lg bg-sunken">
      {/* eslint-disable-next-line @next/next/no-img-element -- превью фото товара (blob: или из WhatsApp через наш адрес) */}
      <img src={src} alt="" className="size-full object-cover" />
      <button type="button" onClick={onRemove} className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-ink/70 text-white" aria-label="Убрать фото">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
