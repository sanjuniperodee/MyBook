import { notFound } from "next/navigation";
import { ChatPreview } from "@/components/admin/chat/ChatPreview";

/** Превью дизайна «Чатов» без базы — только в разработке; в production — 404. */
export default async function ChatPreviewPage({ searchParams }: { searchParams: Promise<{ empty?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  return <ChatPreview empty={!!sp.empty} />;
}
