"use client";

import { createContext, useContext } from "react";

const DemoContext = createContext(false);

/** Set once by the root layout from the bootstrap flag; every mutation control asks `useDemo()`. */
export function DemoProvider({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  return <DemoContext.Provider value={demo}>{children}</DemoContext.Provider>;
}

export function useDemo(): boolean {
  return useContext(DemoContext);
}
