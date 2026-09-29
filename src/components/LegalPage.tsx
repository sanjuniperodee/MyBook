import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { getCurrentUser } from "@/lib/auth";

export async function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="container-x max-w-3xl pt-28 pb-20 sm:pt-36">
        <h1 className="font-serif text-4xl font-medium sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-muted">Редакция от {updated}</p>
        <div className="mt-10 space-y-5 leading-relaxed text-ink-soft [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
