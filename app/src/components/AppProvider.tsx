"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MotionConfig } from "motion/react";
import type { AppConfig } from "@/lib/types";
import { api } from "@/lib/client";

type RunLabel = { run_id: string; mode_label: "Live" | "Replay" | "Mock" } | null;

type Ctx = {
  config: AppConfig | null;
  configError: string | null;
  run: RunLabel;
  setRun: (r: RunLabel) => void;
  refreshConfig: () => void;
};

const KeelContext = createContext<Ctx>({
  config: null,
  configError: null,
  run: null,
  setRun: () => {},
  refreshConfig: () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [run, setRun] = useState<RunLabel>(null);

  const refreshConfig = useCallback(() => {
    api
      .config()
      .then((c) => {
        setConfig(c);
        setConfigError(null);
      })
      .catch((e: unknown) => setConfigError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  const value = useMemo(() => ({ config, configError, run, setRun, refreshConfig }), [config, configError, run, refreshConfig]);
  return (
    <KeelContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </KeelContext.Provider>
  );
}

export function useKeel() {
  return useContext(KeelContext);
}
