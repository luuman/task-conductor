// frontend/src/hooks/useAppSettings.ts
// 应用级设置 hook：从后端读取界面偏好，缓存到 localStorage，供 App 级组件消费

import { useEffect, useState } from "react";
import { api } from "../lib/api";

const LS_KEY = "tc_app_settings";

export interface AppSettings {
  ui_theme: string;
  ui_sidebar_collapsed: boolean;
  ui_default_page: string;
  ui_log_max_lines: number;
}

const DEFAULTS: AppSettings = {
  ui_theme: "dark",
  ui_sidebar_collapsed: false,
  ui_default_page: "dashboard",
  ui_log_max_lines: 500,
};

function loadCached(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

function saveCache(s: AppSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

/** 应用主题到 document */
export function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else if (theme === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    root.removeAttribute("data-theme");
  }
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadCached);
  const [loaded, setLoaded] = useState(false);

  // 启动时从后端拉取最新设置
  useEffect(() => {
    applyTheme(settings.ui_theme);
    api.settings.get()
      .then((s: Record<string, unknown>) => {
        const merged: AppSettings = {
          ui_theme: (s.ui_theme as string) || DEFAULTS.ui_theme,
          ui_sidebar_collapsed: (s.ui_sidebar_collapsed as boolean) ?? DEFAULTS.ui_sidebar_collapsed,
          ui_default_page: (s.ui_default_page as string) || DEFAULTS.ui_default_page,
          ui_log_max_lines: (s.ui_log_max_lines as number) || DEFAULTS.ui_log_max_lines,
        };
        setSettings(merged);
        saveCache(merged);
        applyTheme(merged.ui_theme);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听系统主题变化（当设置为 system 时）
  useEffect(() => {
    if (settings.ui_theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.ui_theme]);

  return { settings, loaded };
}
