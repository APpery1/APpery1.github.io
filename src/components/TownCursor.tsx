import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./TownCursor.css";

type CursorMode = "roam" | "link" | "pan" | "drag" | "rotate";
const interactive = 'a[href],button,[role="button"],summary,label[for]';
const native =
  'input,textarea,select,iframe,video,[contenteditable]:not([contenteditable="false"]),[data-native-cursor]';
const copy = "p,h1,h2,h3,h4,h5,h6,li,pre,code,blockquote,td,th,.markdown-body";

export function TownCursor() {
  const cursor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = cursor.current;
    if (!node) return;
    const fine = matchMedia("(any-pointer: fine) and (any-hover: hover)");
    const contrast = matchMedia("(forced-colors: active)");
    const root = document.documentElement;
    const controller = new AbortController();
    const events = { signal: controller.signal };
    let frame = 0;
    let x = -100;
    let y = -100;
    let mousePresent = false;
    let pressed = false;
    let gesture: "drag" | "rotate" | null = null;
    let nativeSelection = false;
    let dialog: Element | null = null;
    const popover = typeof node.showPopover === "function";

    const hide = () => {
      root.classList.remove("has-town-cursor");
      node.dataset.visible = "false";
      if (popover && node.matches(":popover-open")) node.hidePopover();
    };
    const draw = () => {
      frame = 0;
      if (
        !fine.matches ||
        contrast.matches ||
        !mousePresent ||
        document.hidden
      ) {
        hide();
        return;
      }
      const target = document.elementFromPoint(x, y);
      const action = target?.closest(interactive);
      const useNative =
        !target ||
        target.closest(native) ||
        nativeSelection ||
        action?.matches(':disabled,[aria-disabled="true"]') ||
        (!action && !gesture && target.closest(copy));
      if (useNative) {
        hide();
        return;
      }
      let mode: CursorMode = "roam";
      if (gesture) mode = gesture;
      else if (action) mode = "link";
      else if (target.closest(".city-canvas"))
        mode =
          (target as HTMLElement).style.cursor === "pointer" ? "link" : "pan";
      node.style.transform = `translate3d(${x - 4}px,${y - 3}px,0)`;
      node.dataset.mode = mode;
      node.dataset.pressed = String(pressed);
      node.dataset.visible = "true";
      // A manual popover keeps the decorative cursor above modal dialogs, too.
      // It never accepts focus, pointer events, or changes the underlying target.
      if (popover) {
        const currentDialog = document.querySelector("dialog[open]");
        if (dialog !== currentDialog && node.matches(":popover-open"))
          node.hidePopover();
        dialog = currentDialog;
        if (!node.matches(":popover-open")) node.showPopover();
      }
      root.classList.add("has-town-cursor");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        mousePresent = false;
        pressed = false;
        gesture = null;
        nativeSelection = false;
        hide();
        return;
      }
      mousePresent = true;
      x = event.clientX;
      y = event.clientY;
      schedule();
    };
    const down = (event: PointerEvent) => {
      pointer(event);
      if (event.pointerType !== "mouse") return;
      const target = event.target instanceof Element ? event.target : null;
      pressed = event.button === 0 || event.button === 1;
      nativeSelection =
        !!target?.closest(native) ||
        (!target?.closest(interactive) && !!target?.closest(copy));
      if (target?.closest(".city-canvas")) {
        if (event.button === 1) gesture = "rotate";
        else if (event.button === 0) gesture = "drag";
      }
    };
    const up = (event: PointerEvent) => {
      pressed = false;
      gesture = null;
      nativeSelection = false;
      pointer(event);
    };
    const leave = () => {
      mousePresent = false;
      pressed = false;
      gesture = null;
      nativeSelection = false;
      hide();
    };
    window.addEventListener("pointermove", pointer, events);
    window.addEventListener("pointerover", pointer, events);
    window.addEventListener("pointerdown", down, events);
    window.addEventListener("pointerup", up, events);
    window.addEventListener("pointercancel", leave, events);
    window.addEventListener(
      "pointerout",
      (event) => {
        if (!event.relatedTarget) leave();
      },
      events,
    );
    window.addEventListener("blur", leave, events);
    window.addEventListener(
      "keydown",
      (event) => {
        if (["Tab", "Escape", "Enter"].includes(event.key)) leave();
      },
      events,
    );
    window.addEventListener("scroll", schedule, {
      ...events,
      capture: true,
      passive: true,
    });
    document.addEventListener("visibilitychange", leave, events);
    fine.addEventListener("change", leave, events);
    contrast.addEventListener("change", leave, events);
    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
      hide();
    };
  }, []);

  return createPortal(
    <div
      ref={cursor}
      className="town-cursor"
      popover="manual"
      aria-hidden="true"
      data-visible="false"
      data-mode="roam"
    >
      <div className="town-cursor-mark">
        <span className="town-cursor-halo" />
        <svg className="town-cursor-paper" viewBox="0 0 38 38" fill="none">
          <path
            className="cursor-paper-base"
            d="M4 3 31 15.5 19 20 15.5 32 4 3Z"
          />
          <path className="cursor-paper-fold" d="M4 3 19 20 15.5 32 4 3Z" />
          <path
            className="cursor-paper-crease"
            d="m4 3 15 17 12-4.5M19 20l-3.5 12"
          />
        </svg>
        <svg className="town-cursor-compass" viewBox="0 0 48 48" fill="none">
          <circle className="cursor-compass-ring" cx="24" cy="24" r="16" />
          <g className="cursor-compass-ticks">
            <path d="M24 3v5m0 32v5M3 24h5m32 0h5" />
          </g>
          <g className="cursor-compass-move">
            <path d="m20 14 4-4 4 4m-8 20 4 4 4-4M14 20l-4 4 4 4m20-8 4 4-4 4" />
            <path d="M24 17v14m-7-7h14" />
          </g>
          <g className="cursor-compass-orbit">
            <path d="M10.6 17a15 15 0 0 1 25-3l2.8 3.3m-5.8 0h5.8v-5.8M37.4 31a15 15 0 0 1-25 3l-2.8-3.3m5.8 0H9.6v5.8" />
            <circle cx="24" cy="24" r="2" />
          </g>
        </svg>
      </div>
    </div>,
    document.body,
  );
}
