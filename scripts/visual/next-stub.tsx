/**
 * Заглушка next/link и next/navigation для стенда html-snapshot: i18n/client импортирует их, но развороты
 * и превью ссылок и роутера не используют. Вне Next настоящие модули требуют контекста App Router.
 */
import type { ComponentProps } from "react";

export default function Link({ href, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  return <a href={href} {...props} />;
}

export const usePathname = () => "/";

export const useRouter = () => ({ push: () => undefined, replace: () => undefined });
