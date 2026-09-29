import { PageFade } from "@/components/motion/PageTransition";

export default function Template({ children }: { children: React.ReactNode }) {
  return <PageFade>{children}</PageFade>;
}
