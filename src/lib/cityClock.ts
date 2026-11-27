import { useEffect, useState } from "react";

export const periods = {
  dawn: [6, "日出", "Sunrise"],
  noon: [12, "午时", "Noon"],
  dusk: [18, "傍晚", "Dusk"],
  midnight: [0, "深夜", "Midnight"],
} as const;
export type TimeMode = "local" | keyof typeof periods;
const frames = 14400;
export function localHour(now = new Date()) {
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}
export function cityFrame(hour: number) {
  return 1 + Math.round((((hour + 18) % 24) / 24) * (frames - 1));
}
export function useCityClock() {
  const [mode, setMode] = useState<TimeMode>("local");
  const [local, setLocal] = useState(localHour);
  useEffect(() => {
    if (mode !== "local") return;
    const sync = () => setLocal(localHour());
    sync();
    const timer = window.setInterval(sync, 6000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, [mode]);
  const hour = mode === "local" ? local : periods[mode][0];
  return { mode, setMode, hour, frame: cityFrame(hour), night: hour < 6 || hour >= 18 };
}
export function clockLabel(hour: number) {
  const minutes = Math.floor(hour * 60 + 1e-8);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
