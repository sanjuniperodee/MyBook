import type { Metadata } from "next";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.forgot.meta, robots: { index: false } };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
