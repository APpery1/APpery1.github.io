import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useI18n } from "./i18n/LanguageContext";
import { places, parseRoute, type PlaceId } from "./lib/places";
import { CityScene, type CitySceneHandle } from "./components/CityScene";
import { CityArrival } from "./components/CityArrival";
import { Icon } from "./components/Icon";
const ContentPanel = lazy(() =>
  import("./components/ContentPanel").then((module) => ({
    default: module.ContentPanel,
  })),
);
const readNight = () => {
  try {
    return localStorage.getItem("appery-city-night") === "1";
  } catch {
    return false;
  }
};
const alreadyArrived = () => {
  try {
    return (
      sessionStorage.getItem("appery-city-arrived") === "1" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
};

export default function App() {
  const { lang, toggleLang } = useI18n();
  const [route, setRoute] = useState(parseRoute);
  const [night, setNight] = useState(readNight);
  const [entering, setEntering] = useState<PlaceId | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [portalOrigin, setPortalOrigin] = useState({ x: 0, y: 0 });
  const [sceneOrigin, setSceneOrigin] = useState({ x: 50, y: 50 });
  const [languageNotice, setLanguageNotice] = useState("");
  const [mapQuiet, setMapQuiet] = useState(false);
  const [previewPlace, setPreviewPlace] = useState<PlaceId | null>(null);
  const [returning, setReturning] = useState(false);
  const [cityReady, setCityReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [arrived, setArrived] = useState(alreadyArrived);
  const [raceVeil, setRaceVeil] = useState<"enter" | "exit" | null>(() => {
    try {
      if (
        sessionStorage.getItem("appery-race-return") === "1" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return "exit";
    } catch {
      /* private session */
    }
    return null;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const entryInFlight = useRef(false);
  const guideRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cityRef = useRef<CitySceneHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inside = route.place !== null;
  useEffect(() => {
    const sync = () => {
      setRoute(parseRoute());
      if (!entryInFlight.current) setEntering(null);
    };
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (raceVeil !== "exit") return;
    try {
      sessionStorage.removeItem("appery-race-return");
    } catch {
      /* private session */
    }
    const timeout = setTimeout(() => setRaceVeil(null), 620);
    return () => clearTimeout(timeout);
  }, [raceVeil]);
  useEffect(() => {
    document.documentElement.dataset.theme = night ? "night" : "day";
    try {
      localStorage.setItem("appery-city-night", night ? "1" : "0");
    } catch {
      /* session preference */
    }
  }, [night]);
  useEffect(() => {
    if (guideOpen) guideRef.current?.showModal();
    else guideRef.current?.close();
  }, [guideOpen]);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
    if (inside) window.scrollTo({ top: 0 });
  }, [route.place, route.category, route.slug, inside]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        document.querySelector("dialog[open]") ||
        !route.place
      )
        return;
      if (route.place === "docs" && route.slug && route.category)
        window.location.hash = `docs/${encodeURIComponent(route.category)}`;
      else if (route.place === "docs" && route.category)
        window.location.hash = "docs";
      else returnToCity();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route]);
  useEffect(() => {
    if (!languageNotice) return;
    const timeout = setTimeout(() => setLanguageNotice(""), 4000);
    return () => clearTimeout(timeout);
  }, [languageNotice]);
  const enter = useCallback(
    (id: PlaceId) => {
      setGuideOpen(false);
      if (entryInFlight.current) return;
      if (
        inside ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        window.location.hash = id;
        return;
      }
      entryInFlight.current = true;
      setPreviewPlace(null);
      const screen = cityRef.current?.entrance(id);
      void import("./components/ContentPanel");
      timer.current = setTimeout(() => {
        if (screen) {
          setPortalOrigin({
            x: screen.x - window.innerWidth / 2,
            y: screen.y - window.innerHeight / 2,
          });
          setSceneOrigin({
            x: (screen.x / window.innerWidth) * 100,
            y: (screen.y / window.innerHeight) * 100,
          });
        }
        setEntering(id);
        timer.current = setTimeout(() => {
          window.location.hash = id;
          setEntering(null);
          entryInFlight.current = false;
        }, 670);
      }, 65);
    },
    [inside],
  );
  const playRace = useCallback(() => {
    if (entryInFlight.current) return;
    const destination = `${import.meta.env.BASE_URL}game/play.html`;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.location.href = destination;
      return;
    }
    entryInFlight.current = true;
    setRaceVeil("enter");
    timer.current = setTimeout(() => {
      window.location.href = destination;
    }, 640);
  }, []);
  const finishArrival = useCallback(() => {
    setArrived(true);
    try {
      sessionStorage.setItem("appery-city-arrived", "1");
    } catch {
      /* private session */
    }
  }, []);
  const returnToCity = useCallback(() => {
    if (!inside || entryInFlight.current) {
      if (!entryInFlight.current) window.location.hash = "city";
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.location.hash = "city";
      return;
    }
    entryInFlight.current = true;
    setReturning(true);
    timer.current = setTimeout(() => {
      window.location.hash = "city";
      entryInFlight.current = false;
      timer.current = setTimeout(() => setReturning(false), 720);
    }, 180);
  }, [inside]);
  const switchLanguage = () => {
    toggleLang();
    setLanguageNotice(
      lang === "zh"
        ? "Welcome aboard. Language switched to English."
        : "欢迎抵达，已切换为中文。",
    );
  };
  const activePlace = places.find((p) => p.id === route.place);
  return (
    <div
      className={`app ${inside ? "is-inside" : "is-outside"} ${entering ? "is-entering" : ""} ${returning ? "is-returning" : ""} ${mapQuiet ? "is-map-quiet" : ""}`}
      data-arrival={arrived ? "done" : "playing"}
      style={
        {
          "--portal-x": `${portalOrigin.x}px`,
          "--portal-y": `${portalOrigin.y}px`,
        } as CSSProperties
      }
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
      >
        {lang === "zh" ? "跳到主要内容" : "Skip to main content"}
      </a>
      <header className="site-header">
        <div className="city-brand-lockup">
          <a
            className="brand"
            href="#city"
            aria-label={lang === "zh" ? "APpery 城市首页" : "APpery city home"}
            onClick={(event) => {
              if (!inside) return;
              event.preventDefault();
              returnToCity();
            }}
          >
            <span className="brand-symbol" aria-hidden="true">
              <i />
              <b />
              <em />
            </span>
            <span>
              APpery<span className="brand-dot">.</span>
            </span>
          </a>
          <span className="brand-caption">
            {lang === "zh" ? "城市漫游" : "City explorer"}
          </span>
        </div>
        <nav
          className="header-actions"
          aria-label={lang === "zh" ? "站点工具" : "Site tools"}
        >
          <button className="guide-button" onClick={() => setGuideOpen(true)}>
            <Icon name="map" size={16} />
            <span>{lang === "zh" ? "城市导览" : "City guide"}</span>
          </button>
          <span className="header-divider" />
          <button
            className="icon-button theme-toggle"
            onClick={() => setNight(!night)}
            aria-label={
              lang === "zh"
                ? night
                  ? "切换到白昼"
                  : "切换到夜晚"
                : night
                  ? "Switch to day"
                  : "Switch to night"
            }
          >
            <Icon name={night ? "moon" : "sun"} size={19} />
          </button>
          <button
            className="language-button"
            onClick={switchLanguage}
            aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}
          >
            {lang === "zh" ? "EN" : "中"}
          </button>
          <a
            className="icon-button github-header"
            href="https://github.com/APpery1"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <Icon name="github" size={19} />
          </a>
        </nav>
      </header>
      <div
        className="main-viewport"
        id="main-content"
        ref={contentRef}
        tabIndex={-1}
      >
        {inside && route.place ? (
          <Suspense
            fallback={
              <main className="room-loading" role="status">
                {lang === "zh" ? "推开窗，马上就到。" : "Opening the window…"}
              </main>
            }
          >
            <ContentPanel
              key={route.place}
              place={route.place}
              category={route.category}
              slug={route.slug}
              onBack={returnToCity}
              onEnter={enter}
              onPlayRace={playRace}
            />
          </Suspense>
        ) : (
          <main className="city-home full-city-home">
            <h1 className="sr-only">
              {lang === "zh" ? "APpery 的可探索城市" : "Explore APpery city"}
            </h1>
            <div
              className="city-composition"
              ref={stageRef}
              style={
                {
                  "--entry-x": `${sceneOrigin.x}%`,
                  "--entry-y": `${sceneOrigin.y}%`,
                } as CSSProperties
              }
            >
              <div className="scene-zoom">
                <CityScene
                  ref={cityRef}
                  onEnter={enter}
                  night={night}
                  onToggleLanguage={switchLanguage}
                  onQuietChange={setMapQuiet}
                  onCityReady={() => setCityReady(true)}
                  onLoadProgress={setLoadProgress}
                  onPlayRace={playRace}
                  previewPlace={previewPlace}
                />
              </div>
            </div>
            <div className="city-arrival-note" role="status">
              {languageNotice}
            </div>
          </main>
        )}
      </div>
      <div className="city-dock-wrap">
        {inside && (
          <button
            className="dock-home"
            onClick={returnToCity}
            aria-label={lang === "zh" ? "回到城市" : "Back to city"}
          >
            <Icon name="map" size={18} />
          </button>
        )}
        <nav
          className="city-dock"
          aria-label={lang === "zh" ? "探索小城" : "Explore the city"}
        >
          {places.map((place) => (
            <button
              key={place.id}
              className={`dock-item ${route.place === place.id ? "is-active" : ""}`}
              onClick={() => {
                setPreviewPlace(null);
                enter(place.id);
              }}
              onMouseEnter={() => setPreviewPlace(place.id)}
              onMouseLeave={() => setPreviewPlace(null)}
              onFocus={() => setPreviewPlace(place.id)}
              onBlur={() => setPreviewPlace(null)}
              title={lang === "zh" ? place.building : place.buildingEn}
              aria-current={route.place === place.id ? "page" : undefined}
              style={{ "--place-color": place.color } as CSSProperties}
            >
              <Icon name={place.id} size={20} />
              <span>{lang === "zh" ? place.zh : place.en}</span>
              <i />
            </button>
          ))}
        </nav>
        <span className="dock-caption">
          {inside
            ? lang === "zh"
              ? `你在${activePlace?.building}`
              : `You are at ${activePlace?.buildingEn}`
            : lang === "zh"
              ? "中央街区 · 点击建筑进入"
              : "Central district · Choose a building"}
        </span>
      </div>
      <footer className="site-footer">
        <span>© 2026 APpery</span>
        <span className="footer-center">
          {lang === "zh"
            ? "用好奇心，一砖一瓦。"
            : "Built with curiosity, brick by brick."}
        </span>
        <span>
          {lang === "zh" ? "托管于 GitHub Pages" : "Hosted on GitHub Pages"}
          <span className="footer-signal" />
        </span>
      </footer>
      {raceVeil && (
        <div className={`race-veil is-${raceVeil}`} role="status">
          <p>
            {raceVeil === "enter"
              ? lang === "zh"
                ? "上高架"
                : "Take the highway"
              : lang === "zh"
                ? "回到街区"
                : "Back to the district"}
          </p>
          <div className="race-road" aria-hidden="true">
            <i />
            <b />
            <em />
            <div className="race-car">
              <span />
              <u />
              <u />
            </div>
          </div>
        </div>
      )}
      {!arrived && !inside && (
        <CityArrival
          progress={loadProgress}
          modelReady={cityReady}
          onDone={finishArrival}
        />
      )}
      {(entering || returning) && (
        <div
          className={`entry-transition ${returning ? "is-leave" : ""}`}
          aria-hidden="true"
        >
          <div className="transition-window">
            <i />
            <b />
            <em />
          </div>
          <span>
            {returning
              ? lang === "zh"
                ? "回到城市"
                : "Back to the city"
              : lang === "zh"
                ? `走进${places.find((p) => p.id === entering)?.building}`
                : `Entering ${places.find((p) => p.id === entering)?.buildingEn}`}
          </span>
        </div>
      )}
      <dialog
        ref={guideRef}
        className="guide-dialog"
        onClose={() => setGuideOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setGuideOpen(false);
        }}
      >
        <button
          className="guide-close icon-button"
          onClick={() => setGuideOpen(false)}
          aria-label={lang === "zh" ? "关闭导览" : "Close guide"}
        >
          <Icon name="close" />
        </button>
        <p className="eyebrow">
          {lang === "zh" ? "欢迎来到 APpery 城市" : "Welcome to APpery city"}
        </p>
        <h2>{lang === "zh" ? "今天，想去哪里？" : "Where shall we go?"}</h2>
        <p>
          {lang === "zh"
            ? "河流两岸藏着七个入口。悬停或点击建筑探索内容，按 H 显示入口。高架直达竞速游戏，机场切换中英文。"
            : "Seven entrances across the river. Hover or tap a building, or press H to reveal the entrances. The highway opens Pelican Racing; the airport switches language."}
        </p>
        <div className="guide-places">
          {places.map((place) => (
            <button key={place.id} onClick={() => enter(place.id)}>
              <span style={{ color: place.color }}>
                <Icon name={place.id} size={22} />
              </span>
              <span>
                <strong>
                  {lang === "zh" ? place.building : place.buildingEn}
                </strong>
                <small>
                  {lang === "zh" ? place.description : place.descriptionEn}
                </small>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        </div>
        <small className="guide-help">
          {lang === "zh"
            ? "Tab 选择建筑，Enter 进入。左键拖动或用方向键漫游，滚轮 / 双指缩放，按住鼠标中键旋转视角，Home 复位。右下角可总览全城、暂停动画或隐藏界面。"
            : "Tab selects buildings; Enter steps inside. Left-drag or use arrow keys to explore, scroll or pinch to zoom, and hold the middle mouse button to rotate. Home resets the view. Map tools show the whole city, pause animations, or hide the controls."}
        </small>
      </dialog>
    </div>
  );
}
