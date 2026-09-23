"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Signale aux graphiques qu'ils sont dans une bande « nuit » : ils lisent
 * alors la palette sombre au lieu de celle du document.
 */
const NightContext = createContext(false);

export function NightScope({ children }: { children: ReactNode }) {
  return <NightContext.Provider value>{children}</NightContext.Provider>;
}

export function useNight(): boolean {
  return useContext(NightContext);
}
