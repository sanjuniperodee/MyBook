"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics-client";

export interface AnalyticsIds {
  ym?: string;
  ga?: string;
  pixel?: string;
}

/** Счётчики подключаются, только если заданы их ID (YANDEX_METRIKA_ID, GA_MEASUREMENT_ID, META_PIXEL_ID). */
export function Analytics({ ids }: { ids: AnalyticsIds }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const first = useRef(true);

  // Просмотры при переходах внутри приложения (первый просмотр отправляют сами счётчики).
  useEffect(() => {
    if (first.current) {
      first.current = false;
    } else {
      const url = window.location.href;
      if (window.ym && window.__mbYm) window.ym(window.__mbYm, "hit", url);
      window.fbq?.("track", "PageView");
    }
    flushQueuedEvents();
  }, [pathname, search]);

  return (
    <>
      {ids.ym ? (
        <Script id="ym" strategy="afterInteractive">{`
          (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
          (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
          window.__mbYm = ${Number(ids.ym)};
          ym(${Number(ids.ym)}, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
        `}</Script>
      ) : null}
      {ids.ga ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.ga)}`} strategy="afterInteractive" />
          <Script id="ga" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', ${JSON.stringify(ids.ga)});
          `}</Script>
        </>
      ) : null}
      {ids.pixel ? (
        <Script id="fb" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', ${JSON.stringify(ids.pixel)});
          fbq('track', 'PageView');
        `}</Script>
      ) : null}
    </>
  );
}

/** События, которые поставил сервер (регистрация, создание книги, заказ). */
function flushQueuedEvents() {
  const m = document.cookie.match(/(?:^|; )mb_ev=([^;]*)/);
  if (!m) return;
  document.cookie = "mb_ev=; Max-Age=0; path=/";
  try {
    const list = JSON.parse(decodeURIComponent(m[1])) as { name: string; value?: number }[];
    // Счётчики грузятся асинхронно — даём им секунду.
    setTimeout(() => list.forEach((e) => track(e.name, e.value)), 1200);
  } catch {}
}
