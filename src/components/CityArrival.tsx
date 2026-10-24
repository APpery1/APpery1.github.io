import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/LanguageContext";
import loadingSvg from "../../load/loading.svg?raw";

type Props = { progress: number; modelReady: boolean; onDone: () => void };
const copy: Record<string, string> = {
  沿途: "En route",
  "把等待，交给风景": "Leave the waiting to the view",
  美好正在靠近: "Something lovely is approaching",
  出发前的小小等待: "A short wait before setting off",
  正在驶入APpery小镇: "Driving into APpery town",
  加载中: "Loading",
  "每一次抵达，都从这里开始": "Every arrival starts here",
};
export function CityArrival({ progress, modelReady, onDone }: Props) {
  const { lang } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  const progressRef = useRef(progress);
  const readyRef = useRef(modelReady);
  const doneRef = useRef(onDone);
  progressRef.current = progress;
  readyRef.current = modelReady;
  doneRef.current = onDone;
  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${loadingSvg}`;
    const svg = root.querySelector("svg");
    const car = root.getElementById("car-position");
    const bar = root.getElementById("progress");
    const status = root.getElementById("status");
    const percent = root.getElementById("percentage");
    if (!svg || !car || !bar || !percent) {
      doneRef.current();
      return;
    }
    svg.classList.add("controlled");
    if (lang === "en") {
      root.querySelectorAll("text").forEach((node) => {
        const next = copy[node.textContent ?? ""];
        if (next) node.textContent = next;
      });
    }
    const fit = () => {
      const portrait = window.innerWidth / window.innerHeight <= 0.75;
      svg.setAttribute("viewBox", portrait ? "480 0 480 960" : "0 0 1440 960");
      svg.setAttribute(
        "preserveAspectRatio",
        portrait ? "xMidYMid meet" : "xMidYMid slice",
      );
    };
    fit();
    window.addEventListener("resize", fit);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const started = performance.now();
    let frame = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      doneRef.current();
    };
    let lastTick = started;
    let shown = 0;
    const tick = (now: number) => {
      const target = readyRef.current ? 1 : Math.min(progressRef.current, 0.95);
      const elapsed = now - lastTick;
      lastTick = now;
      shown = reduced
        ? target
        : Math.max(
            shown,
            shown + (target - shown) * (1 - Math.exp(-elapsed / 100)),
          );
      if (readyRef.current && shown >= 0.99) shown = 1;
      const message = readyRef.current
        ? lang === "zh"
          ? "欢迎抵达 APpery 小镇"
          : "Welcome to APpery town"
        : progressRef.current >= 0.8
          ? lang === "zh"
            ? "正在准备城市画面…"
            : "Preparing the city view…"
          : lang === "zh"
            ? "正在加载沿途风景…"
            : "Loading the scenery…";
      if (status && status.textContent !== message)
        status.textContent = message;
      car.setAttribute(
        "style",
        `transform:translate(${560 + 320 * shown}px,480px)`,
      );
      bar.setAttribute("width", String(320 * shown));
      bar.setAttribute("style", `width:${320 * shown}px`);
      const percentage = `${Math.round(shown * 100)}%`;
      if (percent.textContent !== percentage) percent.textContent = percentage;
      if (shown >= 0.995 && readyRef.current) {
        window.setTimeout(finish, reduced ? 0 : 100);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      finished = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
    };
  }, [lang]);
  return (
    <div
      className="city-arrival"
      data-loading-screen="load/loading.svg"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="arrival-stage" ref={stage} />
    </div>
  );
}
