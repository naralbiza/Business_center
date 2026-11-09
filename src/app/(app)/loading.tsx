import { PageSkeleton } from "@/components/Skeleton";

// Fronteira de Suspense do segmento: navegação instantânea com esqueleto enquanto os dados carregam.
export default function Loading() {
  return <PageSkeleton />;
}
