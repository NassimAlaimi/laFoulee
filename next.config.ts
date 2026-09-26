import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { staticSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // En-têtes fixes sur toutes les réponses ; la CSP (à nonce, par requête)
  // est posée par le middleware.
  async headers() {
    const https = (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");
    return [{ source: "/:path*", headers: staticSecurityHeaders({ https }) }];
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
