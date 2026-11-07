import { Logo } from "@/components/Logo";
import { FilmFrame, Flourish, frameGhostBtn } from "@/components/landing/FilmFrame";
import { Link } from "@/i18n/client";
import { getMessages } from "@/i18n/server";
import { site } from "@/config/site";

/** 404 — тот же «кадр», что на витрине: старые письма и открытки, тихий титр и два пути назад. */
export default async function NotFound() {
  const { common: m } = await getMessages();
  return (
    <main className="relative">
      <title>{`${m.notFound.title} · ${site.name}`}</title>
      <div className="container-x absolute inset-x-0 top-0 z-10 flex h-16 items-center sm:h-18">
        <Logo className="text-white" />
      </div>
      <FilmFrame photo="postcards" position="50% 50%" mobilePosition="50% 50%" priority>
        <p className="text-sm text-white/70">{m.notFound.code}</p>
        <h1 className="mt-3 max-w-[14ch] font-serif text-[44px] leading-[1.02] font-medium text-balance text-white sm:text-[64px]">{m.notFound.title}</h1>
        <Flourish className="mt-3 text-[rgb(255_255_255/0.55)]" />
        <p className="mt-5 max-w-md text-lg text-white/85">{m.notFound.text}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/" className="btn btn-primary btn-lg">
            {m.actions.toHome}
          </Link>
          <Link href="/books" className={frameGhostBtn}>
            {m.actions.toMyBooks}
          </Link>
        </div>
      </FilmFrame>
    </main>
  );
}
