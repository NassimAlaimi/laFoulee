/**
 * Squelettes de chargement — statiques, donc inoffensifs pour
 * `prefers-reduced-motion`. Chaque `loading.tsx` des pages qui calculent
 * (analyse, rétrospective, performance) rend ce squelette pour un retour
 * immédiat pendant que le serveur prépare les chiffres.
 */

import { useTranslations } from "next-intl";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-[6px] bg-sunken ${className}`} aria-hidden />;
}

export function PageSkeleton() {
  const t = useTranslations("common");
  return (
    <div className="space-y-6" aria-busy="true" aria-label={t("loading")}>
      <div className="space-y-3">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-[220px]" />
      <Skeleton className="h-[180px]" />
    </div>
  );
}
