"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Signale aux graphiques qu'ils sont dans une bande « nuit » **et** que la
 * page est en thème sombre. La bande suit désormais le thème (claire en
 * clair) : ce n'est qu'en sombre que les graphiques doivent lire la palette
 * de la bande au lieu de celle du document.
 */
const NightContext = createContext(false);

export function NightScope({ children }: { children: ReactNode }) {
  return <NightContext.Provider value>{children}</NightContext.Provider>;
}

export function useNight(): boolean {
  const inBand = useContext(NightContext);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () =>
      setDark(document.documentElement.getAttribute("data-theme") === "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);
  return inBand && dark;
}
