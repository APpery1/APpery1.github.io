import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/LanguageContext";
import letterSvg from "../assets/letter-arrival.svg?raw";

type Props = { progress: number; modelReady: boolean; onDone: () => void };
const english: Record<string, string> = {
  寄往小城的一封信: "A letter to a quiet town",
  "让风替你带路，让美好慢慢抵达。":
    "Follow the breeze. Let good things arrive.",
  "风的下一站，是这里。": "The next stop is here.",
  "APpery · 每个想法，都有一扇亮着的窗": "APpery · A light for every idea",
  "风物来信 / 01": "LETTERS ON THE BREEZE / 01",
};
export function CityArrival({ progress, modelReady, onDone }: Props) {
  const { lang } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const state = useRef({ progress, modelReady, onDone });
  state.current = { progress, modelReady, onDone };
  useEffect(() => {
    const host = stage.current;
    const layer = overlay.current;
    if (!host || !layer) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      :host{display:block;width:100%;height:100%}svg{display:block;width:100%;height:100%}
      text{fill:#48685f;font-family:'Segoe UI','Microsoft YaHei',sans-serif}
      .heading{font-family:'Songti SC','SimSun',serif;font-size:38px;letter-spacing:5px}
      .eyebrow{font-size:10px;letter-spacing:5px;fill:#526d60}
      .subtitle{font-size:13px;letter-spacing:2px;fill:#526d60}
      .brand text{font-size:23px;font-weight:600}.brand .edition{font-size:11px;letter-spacing:3px;font-weight:400}
      #envelope,#plane,#copy,#destination,#wipe,#trail{opacity:0}
      @media(max-width:650px){.brand{display:none}.heading{font-size:34px}.subtitle{font-size:14px}}
      .loading-status{position:absolute;bottom:max(6%,env(safe-area-inset-bottom));left:12%;right:12%;text-align:center;color:#48685f;font:11px 'Segoe UI','Microsoft YaHei',sans-serif;letter-spacing:1px}
      .track{height:2px;width:min(240px,70%);margin:14px auto 0;background:#c7d4bd;overflow:hidden}
      .fill{height:100%;background:#b88d73;transform-origin:left;transform:scaleX(0)}
    </style>${letterSvg}<div class="loading-status"><span id="message"></span> <span id="percentage"></span><div class="track"><div class="fill"></div></div></div>`;
    if (lang === "en")
      root.querySelectorAll("text").forEach((node) => {
        const text = english[node.textContent ?? ""];
        if (text) node.textContent = text;
      });
    const svg = root.querySelector("svg")!;
    const plane = root.getElementById("plane")!;
    const message = root.getElementById("message")!;
    const percent = root.getElementById("percentage")!;
    const fill = root.querySelector<HTMLElement>(".fill")!;
    const status = root.querySelector<HTMLElement>(".loading-status")!;
    const tracks: Animation[] = [];
    const animate = (
      selector: string,
      frames: Keyframe[],
      start: number,
      length: number,
      easing = "cubic-bezier(.45,0,.2,1)",
    ) => {
      const a = root
        .querySelector(selector)!
        .animate(frames, {
          delay: start,
          duration: length,
          fill: "both",
          easing,
        });
      a.pause();
      tracks.push(a);
    };
    const opacity = (
      selector: string,
      values: number[],
      start: number,
      length: number,
    ) =>
      animate(
        selector,
        values.map((opacity) => ({ opacity })),
        start,
        length,
        "linear",
      );
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = media.matches;
    const configure = () => {
      tracks.splice(0).forEach((a) => a.cancel());
      if (reduced) {
        opacity("#destination", [1, 1], 0, 1);
        opacity("#front-clouds", [0.3, 0.3], 0, 1);
        return;
      }
      opacity("#copy", [0, 1, 1, 0], 0, 3500);
      opacity("#envelope", [0, 1, 1, 0], 200, 2300);
      animate(
        "#envelope",
        [
          { transform: "translate(720px,465px) rotate(-5deg)" },
          { transform: "translate(720px,430px)", offset: 0.5 },
          { transform: "translate(720px,403px) scale(.6) rotate(8deg)" },
        ],
        200,
        2400,
      );
      animate(
        "#letter",
        [
          { transform: "translateY(0)" },
          { transform: "translateY(-70px) rotate(-6deg)", offset: 0.62 },
          { transform: "translate(0px,-45px) rotate(-24deg) scaleX(.2)" },
        ],
        850,
        1450,
      );
      animate(
        "#plane-shape",
        [{ transform: "scale(.35,.1)" }, { transform: "scale(1)" }],
        2050,
        650,
      );
      opacity("#plane", [0, 1, 1, 1, 1, 0], 2000, 6200);
      opacity("#trail", [0, 0.65, 0.65, 0], 2500, 5600);
      animate(
        "#trail",
        [{ strokeDashoffset: 100 }, { strokeDashoffset: -100 }],
        2300,
        6200,
        "linear",
      );
      opacity("#front-clouds", [1, 0.3], 2700, 3500);
      animate(
        "#front-clouds",
        [{ transform: "translateY(0)" }, { transform: "translateY(115px)" }],
        2700,
        4200,
      );
      animate(
        "#far-clouds",
        [{ transform: "translateX(-15px)" }, { transform: "translateX(35px)" }],
        0,
        12000,
        "linear",
      );
      animate(
        "#birds",
        [
          { transform: "translate(30px,8px)" },
          { transform: "translate(-50px,-12px)" },
        ],
        0,
        12000,
        "linear",
      );
      opacity("#destination", [0, 1], 5400, 1400);
      opacity("#wipe", [1, 1], 9000, 3000);
      animate(
        "#wipe",
        [
          { transform: "translate(3200px,2400px) rotate(-32deg)" },
          { transform: "translate(720px,450px)" },
        ],
        9300,
        1500,
      );
      opacity("#crease", [1, 0], 10400, 500);
    };
    const fit = () => {
      // Keep one wide artboard and crop it with `slice`. Expanding the mobile
      // viewBox to match portrait height made the letter and horizon tiny,
      // leaving the opening composition visually empty.
      svg.setAttribute("viewBox", "0 0 1440 900");
      svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    };
    const resize = new ResizeObserver(fit);
    resize.observe(host);
    fit();
    configure();
    let frame = 0,
      previous: number | null = null,
      time = 0,
      shown = 0,
      finished = false;
    const preference = () => {
      reduced = media.matches;
      configure();
    };
    media.addEventListener("change", preference);
    const visibility = () => {
      previous = null;
    };
    document.addEventListener("visibilitychange", visibility);
    const bezier = (a: number, b: number, c: number, d: number, u: number) =>
      (1 - u) ** 3 * a +
      3 * (1 - u) ** 2 * u * b +
      3 * (1 - u) * u * u * c +
      u ** 3 * d;
    const tick = (now: number) => {
      if (finished) return;
      const delta =
        previous === null || document.hidden ? 0 : Math.min(now - previous, 64);
      previous = now;
      const target = state.current.modelReady
        ? 1
        : Math.max(0, Math.min(state.current.progress, 0.95));
      shown = Math.max(
        shown,
        shown + (target - shown) * (1 - Math.exp(-delta / 120)),
      );
      if (state.current.modelReady && shown > 0.99) shown = 1;
      time = reduced
        ? state.current.modelReady
          ? time + delta
          : 0
        : Math.min(time + delta, state.current.modelReady ? 12000 : 9200);
      tracks.forEach((a) => (a.currentTime = time));
      const u = Math.max(0, Math.min(1, (time - 2100) / 5800)),
        v = 1 - u;
      const dx =
        3 * v * v * (170 - 720) +
        6 * v * u * (1220 - 170) +
        3 * u * u * (1040 - 1220);
      const dy =
        3 * v * v * (25 - 410) +
        6 * v * u * (510 - 25) +
        3 * u * u * (190 - 510);
      plane.setAttribute(
        "transform",
        `translate(${bezier(720, 170, 1220, 1040, u)} ${bezier(410, 25, 510, 190, u)}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}) scale(${0.65 + Math.sin(u * Math.PI) * 0.22})`,
      );
      message.textContent = state.current.modelReady
        ? lang === "zh"
          ? "风已抵达，正在为你翻开小城"
          : "Your letter has arrived. Welcome."
        : lang === "zh"
          ? "正在装好沿途的风景"
          : "Preparing the scenery";
      percent.textContent = `${Math.round(shown * 100)}%`;
      fill.style.transform = `scaleX(${shown})`;
      const reveal = reduced
        ? Math.min(time / 450, 1)
        : Math.max(0, Math.min((time - 10800) / 1200, 1));
      // Lift the paper layer to reveal the real rendered city underneath.
      layer.style.clipPath = `inset(0 0 ${100 * (1 - (1 - reveal) ** 3)}% 0)`;
      status.style.opacity = String(
        reduced ? 1 - reveal : Math.max(0, 1 - (time - 9300) / 900),
      );
      layer.dataset.phase =
        reveal > 0
          ? "revealing"
          : time >= 9200
            ? "waiting-for-city"
            : "letter-flight";
      if (reveal >= 1 && state.current.modelReady) {
        finished = true;
        state.current.onDone();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      finished = true;
      cancelAnimationFrame(frame);
      tracks.forEach((a) => a.cancel());
      resize.disconnect();
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [lang]);
  return (
    <div
      ref={overlay}
      className="city-arrival"
      data-loading-screen="letter-arrival"
      role="status"
      aria-label={
        lang === "zh"
          ? "风物来信，正在抵达小城"
          : "A letter on the breeze, arriving in town"
      }
      aria-busy="true"
    >
      <div className="arrival-stage" ref={stage} />
    </div>
  );
}
