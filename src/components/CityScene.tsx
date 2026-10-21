import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useI18n } from "../i18n/LanguageContext";
import { places, type PlaceId } from "../lib/places";
import { Icon } from "./Icon";
import {
  landmarks,
  landmarkById,
  type CityDestination,
} from "./city/ModelLandmarks";
import type { CityRuntime, ScreenPoint } from "./city/CityRuntime";
type Props = {
  onEnter: (id: PlaceId) => void;
  onPlayRace: () => void;
  night: boolean;
  onToggleLanguage: () => void;
  onQuietChange: (quiet: boolean) => void;
  onCityReady: () => void;
  onLoadProgress: (value: number) => void;
  previewPlace?: PlaceId | null;
};
export type CitySceneHandle = {
  entrance: (id: PlaceId) => ScreenPoint | undefined;
};
export const CityScene = forwardRef<CitySceneHandle, Props>(
  function CityScene(props, ref) {
    const { lang } = useI18n(),
      host = useRef<HTMLDivElement>(null),
      runtime = useRef<CityRuntime | undefined>(undefined),
      callbacks = useRef(props),
      markers = useRef(new Map<CityDestination, HTMLButtonElement>()),
      quietButton = useRef<HTMLButtonElement>(null),
      exitButton = useRef<HTMLButtonElement>(null);
    callbacks.current = props;
    const [ready, setReady] = useState(false),
      [failure, setFailure] = useState(false),
      [retry, setRetry] = useState(0),
      [hover, setHover] = useState<CityDestination | null>(null),
      [hints, setHints] = useState(true),
      [quiet, setQuiet] = useState(false),
      [paused, setPaused] = useState(false),
      [zoom, setZoom] = useState(1);
    const beforeQuiet = useRef<ReturnType<CityRuntime["snapshot"]> | undefined>(
      undefined,
    );
    const active = hover || props.previewPlace || null;
    useImperativeHandle(
      ref,
      () => ({ entrance: (id) => runtime.current?.entrance(id) }),
      [],
    );
    const select = (id: CityDestination) => {
      if (id === "airport") callbacks.current.onToggleLanguage();
      else if (id === "highway") callbacks.current.onPlayRace();
      else callbacks.current.onEnter(id);
    };
    useEffect(() => {
      let cancelled = false;
      setFailure(false);
      setReady(false);
      void import("./city/CityRuntime")
        .then(({ CityRuntime }) => {
          if (cancelled || !host.current) return;
          try {
            const engine = new CityRuntime(host.current, {
              onReady: () => {
                if (!cancelled) {
                  setReady(true);
                  callbacks.current.onCityReady();
                }
              },
              onError: () => {
                if (!cancelled) {
                  setFailure(true);
                  callbacks.current.onCityReady();
                }
              },
              onProgress: (value) => callbacks.current.onLoadProgress(value),
              onHover: (id) => setHover(id),
              onSelect: select,
              onProject: (id, p, hit) => {
                const button = markers.current.get(id);
                if (!button) return;
                const w = host.current!.clientWidth,
                  h = host.current!.clientHeight;
                button.style.left = `${Math.max(25, Math.min(w - 25, p.x))}px`;
                button.style.top = `${Math.max(88, Math.min(h - 120, p.y))}px`;
                button.dataset.screenX = p.x.toFixed(2);
                button.dataset.screenY = p.y.toFixed(2);
                button.dataset.hitX = hit.x.toFixed(2);
                button.dataset.hitY = hit.y.toFixed(2);
                button.classList.toggle("is-offscreen", !p.visible);
              },
              onView: setZoom,
            });
            runtime.current = engine;
            engine.setNight(callbacks.current.night);
          } catch {
            setFailure(true);
            callbacks.current.onCityReady();
          }
        })
        .catch(() => {
          setFailure(true);
          callbacks.current.onCityReady();
        });
      return () => {
        cancelled = true;
        runtime.current?.dispose();
        runtime.current = undefined;
      };
    }, [retry]);
    useEffect(
      () => runtime.current?.setNight(props.night),
      [props.night, ready],
    );
    useEffect(() => runtime.current?.setPaused(paused), [paused, ready]);
    useEffect(() => {
      runtime.current?.select(quiet ? null : active);
    }, [active, ready, quiet]);
    useEffect(() => {
      props.onQuietChange(quiet);
      return () => props.onQuietChange(false);
    }, [quiet, props.onQuietChange]);
    const endQuiet = () => {
      setQuiet(false);
      if (beforeQuiet.current) runtime.current?.restore(beforeQuiet.current);
      requestAnimationFrame(() => quietButton.current?.focus());
    };
    const startQuiet = () => {
      beforeQuiet.current = runtime.current?.snapshot();
      setQuiet(true);
      setHover(null);
      runtime.current?.overview();
      requestAnimationFrame(() => exitButton.current?.focus());
    };
    useEffect(() => {
      const key = (e: KeyboardEvent) => {
        if (
          document.querySelector("dialog[open]") ||
          (e.target as Element).closest("input,textarea")
        )
          return;
        if (e.key === "Escape" && quiet) {
          e.preventDefault();
          endQuiet();
        } else if (e.key.toLowerCase() === "h" && !quiet)
          setHints((value) => !value);
      };
      window.addEventListener("keydown", key);
      return () => window.removeEventListener("keydown", key);
    }, [quiet]);
    const title = (id: CityDestination) =>
      id === "airport"
        ? lang === "zh"
          ? "机场 · 中 / EN"
          : "Airport · EN / 中"
        : id === "highway"
          ? lang === "zh"
            ? "上高架"
            : "Highway"
          : lang === "zh"
            ? places.find((p) => p.id === id)!.building
            : places.find((p) => p.id === id)!.buildingEn;
    return (
      <div
        ref={host}
        className={`city-stage city-viewport model-city ${ready ? "is-ready" : ""} ${props.night ? "is-night" : ""} ${quiet ? "is-quiet" : ""} ${hints ? "show-entrances" : ""}`}
        tabIndex={0}
        aria-label={
          lang === "zh"
            ? "可探索的 APpery 三维城市"
            : "Explore APpery’s 3D city"
        }
        aria-describedby="city-map-help"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || quiet) return;
          const engine = runtime.current;
          if (!engine) return;
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "=",
              "-",
              "Home",
            ].includes(e.key)
          )
            e.preventDefault();
          if (e.key === "Home") engine.reset();
          else if (e.key === "+" || e.key === "=") engine.zoom(1.2);
          else if (e.key === "-") engine.zoom(1 / 1.2);
          else if (e.key.startsWith("Arrow"))
            engine.pan(
              e.key === "ArrowLeft" ? -60 : e.key === "ArrowRight" ? 60 : 0,
              e.key === "ArrowUp" ? 60 : e.key === "ArrowDown" ? -60 : 0,
            );
        }}
      >
        {(!ready || failure) && (
          <div className="model-status" role="status">
            <span className="model-status-symbol">
              <Icon name="map" size={28} />
            </span>
            <strong>
              {failure
                ? lang === "zh"
                  ? "城市暂时未能展开"
                  : "The city could not be opened"
                : lang === "zh"
                  ? "正在搭建你的城市…"
                  : "Unfolding your city…"}
            </strong>
            <p>
              {failure
                ? lang === "zh"
                  ? "你仍可以使用下方导航浏览全部内容。"
                  : "All content remains available in the navigation below."
                : lang === "zh"
                  ? "河岸、屋顶，还有沿途的风景。"
                  : "The river, the rooftops, and everything in between."}
            </p>
            {failure && (
              <button onClick={() => setRetry((v) => v + 1)}>
                {lang === "zh" ? "重新加载" : "Try again"}
              </button>
            )}
          </div>
        )}
        <div
          className="model-entrances"
          aria-label={lang === "zh" ? "城市建筑入口" : "City entrances"}
          hidden={quiet || !ready}
        >
          {landmarks.map((l) => (
            <button
              key={l.id}
              ref={(el) => {
                if (el) markers.current.set(l.id, el);
                else markers.current.delete(l.id);
              }}
              data-place={l.id}
              className={`model-marker ${l.id === "airport" ? "city-airport" : l.id === "highway" ? "highway-entry" : `city-building building-${l.id}`} ${active === l.id ? "is-selected" : ""} ${l.id === "highway" ? "is-sign" : ""}`}
              aria-label={
                l.id === "airport"
                  ? lang === "zh"
                    ? "机场，切换到 English"
                    : "Airport, switch to 中文"
                  : l.id === "highway"
                    ? lang === "zh"
                      ? "上高架，进入鹈鹕竞速"
                      : "Take the highway, enter Pelican Racing"
                    : lang === "zh"
                      ? `进入${title(l.id)}`
                      : `Enter ${title(l.id)}`
              }
              onClick={() => select(l.id)}
              onFocus={() => {
                runtime.current?.focus(l.id);
                setHover(l.id);
              }}
              onBlur={() => setHover(null)}
              onMouseEnter={() => setHover(l.id)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="marker-title">
                {l.id === "highway" && <Icon name="arrow" size={12} />}
                {title(l.id)}
              </span>
              {active === l.id && (
                <span className="marker-description">
                  {lang === "zh"
                    ? landmarkById[l.id].hintZh
                    : landmarkById[l.id].hintEn}
                </span>
              )}
            </button>
          ))}
        </div>
        {!quiet && (
          <>
            <div
              className="map-controls"
              aria-label={lang === "zh" ? "地图操作" : "Map controls"}
            >
              <div className="map-views">
                <button
                  className="map-overview"
                  onClick={() => runtime.current?.overview()}
                  title={lang === "zh" ? "总览整座城市" : "View the whole city"}
                  aria-label={
                    lang === "zh" ? "总览整座城市" : "View the whole city"
                  }
                >
                  <Icon name="map" size={18} />
                </button>
                <button
                  className="airport-locate"
                  onClick={() => runtime.current?.focus("airport", true)}
                  aria-label={lang === "zh" ? "定位机场" : "Locate airport"}
                >
                  <Icon name="plane" size={18} />
                  <span>{lang === "zh" ? "机场" : "Airport"}</span>
                </button>
              </div>
              <div className="map-details">
                <button
                  className="map-hints"
                  onClick={() => setHints(!hints)}
                  aria-pressed={hints}
                  aria-label={lang === "zh" ? "显示建筑入口" : "Show entrances"}
                  title={lang === "zh" ? "显示入口（H）" : "Show entrances (H)"}
                >
                  <Icon name="pin" size={18} />
                </button>
                <button
                  className="map-quiet"
                  ref={quietButton}
                  onClick={startQuiet}
                  aria-label={
                    lang === "zh"
                      ? "沉浸欣赏城市"
                      : "Enjoy the city without controls"
                  }
                  title={
                    lang === "zh"
                      ? "沉浸欣赏城市"
                      : "Enjoy the city without controls"
                  }
                >
                  <Icon name="expand" size={18} />
                </button>
              </div>
              <div className="zoom-controls">
                <button
                  onClick={() => runtime.current?.zoom(1.2)}
                  aria-label={lang === "zh" ? "放大城市" : "Zoom in"}
                  disabled={!ready || zoom >= 4.5 - 0.0001}
                >
                  +
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => runtime.current?.zoom(1 / 1.2)}
                  aria-label={lang === "zh" ? "缩小城市" : "Zoom out"}
                  disabled={!ready || zoom <= 0.5 + 0.0001}
                >
                  −
                </button>
              </div>
              <div className="map-details">
                <button
                  className="map-rotate"
                  onClick={() => runtime.current?.rotate()}
                  aria-label={
                    lang === "zh" ? "旋转城市视角" : "Rotate city view"
                  }
                  title={lang === "zh" ? "旋转视角" : "Rotate view"}
                >
                  <Icon name="rotate" size={18} />
                </button>
                <button
                  className="map-reset"
                  onClick={() => runtime.current?.reset()}
                  aria-label={
                    lang === "zh" ? "复位城市视角" : "Reset city view"
                  }
                  title={lang === "zh" ? "复位视角" : "Reset view"}
                >
                  <Icon name="locate" size={19} />
                </button>
              </div>
              <button
                className="map-motion"
                onClick={() => setPaused(!paused)}
                aria-pressed={paused}
                aria-label={
                  lang === "zh"
                    ? paused
                      ? "继续城市动画"
                      : "暂停城市动画"
                    : paused
                      ? "Play city animations"
                      : "Pause city animations"
                }
                title={
                  lang === "zh"
                    ? paused
                      ? "继续动画"
                      : "暂停动画"
                    : paused
                      ? "Play animations"
                      : "Pause animations"
                }
              >
                <Icon name={paused ? "play" : "pause"} size={16} />
              </button>
            </div>
            <div className="city-map-help" id="city-map-help">
              <Icon name="move" size={15} />
              <span>
                {lang === "zh" ? "拖动漫游" : "Drag to explore"}
              </span>
              <kbd>H</kbd>
              <span className="map-help-secondary">
                {lang === "zh" ? "显示入口" : "Entrances"}
              </span>
            </div>
          </>
        )}
        {quiet && (
          <button className="quiet-exit" ref={exitButton} onClick={endQuiet}>
            <Icon name="back" size={16} />
            <span>{lang === "zh" ? "返回漫游" : "Back to the city"}</span>
            <kbd>Esc</kbd>
          </button>
        )}
      </div>
    );
  },
);
