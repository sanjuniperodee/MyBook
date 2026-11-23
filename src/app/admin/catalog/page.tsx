import Link from "next/link";
import { Plus, ShoppingBag } from "lucide-react";
import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { DrawerButton } from "@/components/admin/Drawer";
import { Alert } from "@/components/ui/Alert";
import { catalogLink } from "@/modules/messaging";
import { ProductCard, ProductForm, SyncButton } from "./CatalogBoard";

export const metadata = { title: "Каталог WhatsApp" };

/**
 * Каталог товаров WhatsApp Business номера магазина (docs/whatsapp-catalog.md): товары живут в WhatsApp, здесь — их копия
 * с правкой. Открытие страницы забирает каталог из WhatsApp, если копия старше пяти минут (товары из приложения WhatsApp
 * Business и решения проверки WhatsApp тоже приходят сюда).
 */
export default async function AdminCatalog() {
  await requireStaff("catalog.manage");
  const catalog = container().messaging.catalog;
  const problem = await catalog.syncIfStale(5 * 60_000);
  const [products, settings, synced, status] = await Promise.all([catalog.list(), catalog.settings(), catalog.lastSyncedAt(), container().messaging.gowa.cachedStatus()]);
  const link = status.phone ? catalogLink(status.phone) : null;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Каталог WhatsApp"
        actions={
          <>
            <SyncButton />
            <DrawerButton variant="primary" lazy label="Добавить товар" icon={<Plus className="size-4" aria-hidden />} title="Новый товар" description="Товар появится в каталоге WhatsApp после проверки WhatsApp" testId="new-product">
              {(close) => <ProductForm currency={settings.currency} onDone={close} />}
            </DrawerButton>
          </>
        }
      >
        Товары каталога WhatsApp Business: клиент видит их в профиле магазина, менеджер отправляет из чата кнопкой «Товар из каталога».
        {link ? (
          <>
            {" "}
            Ссылка на весь каталог:{" "}
            <a href={link} target="_blank" rel="noreferrer" className="link">
              {link.replace("https://", "")}
            </a>
            .
          </>
        ) : null}{" "}
        <Link href="/admin/settings?tab=messengers#wa-catalog" className="link">
          Настройки каталога в чатах
        </Link>
      </PageHeader>

      {problem ? <Alert>Не удалось обновить каталог из WhatsApp: {problem}. Показана копия{synced ? ` от ${synced.toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}` : ""}.</Alert> : null}

      {products.length === 0 ? (
        <div className="panel">
          <EmptyState icon={ShoppingBag} title="В каталоге пока нет товаров">
            Нажмите «Добавить товар»: название, цена и хотя бы одно фото. После проверки WhatsApp товар увидят клиенты.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="catalog-products">
          {products.map((p) => (
            <ProductCard key={p.id} product={{ id: p.id, name: p.name, description: p.description, price: p.price, currency: p.currency, retailerId: p.retailerId, url: p.url, hidden: p.hidden, review: p.review, imageUrls: p.imageUrls, videos: p.videoUrls.length, hasImage: p.imageUrls.length > 0 }} />
          ))}
        </ul>
      )}
    </div>
  );
}
