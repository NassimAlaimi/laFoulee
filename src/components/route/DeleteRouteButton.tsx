"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function DeleteRouteButton({ id }: { id: string }) {
  const t = useTranslations("routes");
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-quiet btn-sm text-ink3 hover:text-rust"
      onClick={async () => {
        if (!confirm(t("confirmDelete"))) return;
        await fetch(`/api/routes?id=${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      {t("delete")}
    </button>
  );
}
