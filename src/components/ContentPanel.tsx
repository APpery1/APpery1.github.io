import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/LanguageContext";
import {
  categories,
  docs,
  docHref,
  photos,
  places,
  repos,
  type PlaceId,
} from "../lib/data";
import { site } from "../content/site";
import { renderMarkdown } from "../lib/markdown";
import { Icon } from "./Icon";
import researchSource from "../content/research.md?raw";

type Props = {
  place: PlaceId;
  category?: string;
  slug?: string;
  onBack: () => void;
  onEnter: (place: PlaceId) => void;
  onPlayRace: () => void;
};

function PanelFrame({
  place,
  children,
  onBack,
}: {
  place: PlaceId;
  children: React.ReactNode;
  onBack: () => void;
}) {
  const { lang } = useI18n();
  const item = places.find((p) => p.id === place)!;
  return (
    <main className={`inside inside-${place}`}>
      <header className="inside-header">
        <button className="back-button" type="button" onClick={onBack}>
          <Icon name="back" size={17} />
          <span>{lang === "zh" ? "回到城市" : "Back to town"}</span>
        </button>
        <div className="inside-breadcrumb">
          <span className="breadcrumb-dot" style={{ background: item.color }} />
          {lang === "zh" ? item.building : item.buildingEn}
          <span>/</span>
          <span>{lang === "zh" ? item.zh : item.en}</span>
        </div>
        <div className="inside-window-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </header>
      <div className="inside-body">{children}</div>
    </main>
  );
}

function About({ onEnter }: { onEnter: (place: PlaceId) => void }) {
  const { lang } = useI18n();
  return (
    <div className="about-content">
      <div className="about-portrait" aria-hidden="true">
        <div className="portrait-sky" />
        <div className="portrait-building">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="portrait-person">
          <i />
          <b />
          <em />
        </div>
        <div className="portrait-note">AP / 2026</div>
      </div>
      <section className="copy-column">
        <p className="eyebrow">
          {lang === "zh" ? "关于 APpery" : "About APpery"}
        </p>
        <h1>
          {lang === "zh" ? (
            <>
              你好，我是
              <br />
              <strong>APpery</strong>
            </>
          ) : (
            <>
              Hi, I’m
              <br />
              <strong>APpery</strong>
            </>
          )}
        </h1>
        <p className="lead-copy">
          {lang === "zh"
            ? "正在学习成长的 coder"
            : "A coder learning and growing"}
        </p>
        <p className="body-copy">
          {lang === "zh"
            ? "我是 APpery，长江大学在读学生。目前主要用 Python 和 TypeScript 写东西，靠一个个小项目把基础打牢——从桌面小工具到全栈小应用，边做边学。这个站点本身也是其中一次练习。"
            : "I'm APpery, an undergraduate at Yangtze University. These days I mainly write Python and TypeScript, building my fundamentals one small project at a time — from desktop utilities to small full-stack apps, learning as I go. This site is one of those exercises."}
        </p>
        <div className="about-facts">
          <span>
            <b>{lang === "zh" ? "现在" : "Now"}</b>
            {lang === "zh" ? "长江大学" : "Yangtze University"}
          </span>
          <span>
            <b>{lang === "zh" ? "常用" : "Tools"}</b>Python · TypeScript
          </span>
          <span>
            <b>{lang === "zh" ? "研究" : "Focus"}</b>
            {lang === "zh" ? "Agent 协作体系" : "Agent collaboration"}
          </span>
        </div>
        <button className="text-link" onClick={() => onEnter("research")}>
          {lang === "zh"
            ? "去实验室看看现在在研究什么"
            : "See what I am researching"}{" "}
          <Icon name="arrow" size={17} />
        </button>
      </section>
    </div>
  );
}

function Projects() {
  const { lang } = useI18n();
  return (
    <div className="project-content">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">
            {lang === "zh" ? "持续施工中" : "Always under construction"}
          </p>
          <h1>{lang === "zh" ? "项目大厦" : "The project tower"}</h1>
          <p>
            {lang === "zh"
              ? "与 GitHub 公开仓库同步。把想法，写成可以运行的东西。"
              : "Synced with my public GitHub repositories."}
          </p>
        </div>
        <div className="workshop-stamp">
          <span>{repos.length}</span>
          <small>{lang === "zh" ? "个仓库" : "repos"}</small>
        </div>
      </div>
      <div className="repo-grid">
        {repos.map((repo, index) => (
          <a
            className={`repo-card repo-card-${index % 4}`}
            key={repo.name}
            href={repo.url}
            target="_blank"
            rel="noreferrer"
          >
            <div className="repo-card-top">
              <Icon name="projects" size={18} />
              <Icon name="external" size={15} />
            </div>
            <h2>{repo.name}</h2>
            <p>
              {repo.descZh || repo.descEn
                ? lang === "zh"
                  ? repo.descZh || repo.description
                  : repo.descEn || repo.description
                : repo.description ||
                  (lang === "zh" ? "暂无描述" : "No description yet")}
            </p>
            <div className="repo-meta">
              <span>
                {repo.language || (lang === "zh" ? "未标注" : "Unlisted")}
              </span>
              <span>
                {repo.stars} <Icon name="star" size={11} />
              </span>
              <time>{repo.pushedAt.slice(0, 10)}</time>
            </div>
            <div className="repo-door" />
          </a>
        ))}
      </div>
    </div>
  );
}

function Research() {
  const { lang } = useI18n();
  const html = useMemo(() => renderMarkdown(researchSource), []);
  const [mermaidReady, setMermaidReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(".research-page pre.mermaid"),
    );
    if (!nodes.length) return;
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "strict",
          fontFamily: "inherit",
        });
        await mermaid.run({ nodes });
        setMermaidReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [html]);
  return (
    <article className="research-page">
      <div className="section-heading research-heading">
        <div>
          <p className="eyebrow">
            {lang === "zh" ? "实验室笔记 / 2026" : "Lab notes / 2026"}
          </p>
          <h1>{lang === "zh" ? "Agent 协作体系" : "Agent collaboration"}</h1>
          <p>
            {lang === "zh" ? "同一时间只深挖一件事。" : "One focus at a time."}
          </p>
        </div>
        <div className="lab-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
          <b>AI</b>
        </div>
      </div>
      <div className="research-intro">
        <span>{lang === "zh" ? "正在研究" : "Currently studying"}</span>
        <p>
          {lang === "zh"
            ? "目前正在研究 agent 协作体系：多个 AI agent 之间怎么分工、怎么交换中间结果、出现分歧时又怎么收敛。我用一系列小实验把这件事做实——从「谁负责哪一块」这种最基础的问题开始，再一步步加上更复杂的协作结构。"
            : "I am currently researching how agents collaborate: how multiple AI agents divide the work, exchange intermediate results, and converge when they disagree. I am working through it with a series of small experiments — starting from the most basic question of who owns which part, then adding more involved collaboration patterns."}
        </p>
      </div>
      <div
        className={`markdown-body research-body ${mermaidReady ? "mermaid-ready" : ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}

function Docs({
  category,
  slug,
  onEnter,
}: {
  category?: string;
  slug?: string;
  onEnter: (place: PlaceId) => void;
}) {
  const { lang } = useI18n();
  const [query, setQuery] = useState("");
  if (slug) {
    const doc = docs.find(
      (item) => item.slug === slug && (!category || item.category === category),
    );
    const list = docs.filter((item) => item.category === category);
    const index = list.findIndex((item) => item.slug === slug);
    const html =
      doc && doc.kind !== "txt"
        ? renderMarkdown(doc.content, doc.category)
        : "";
    return (
      <article className="doc-reader">
        <button
          className="small-back"
          onClick={() => {
            window.location.hash = category
              ? `#docs/${encodeURIComponent(category)}`
              : "#docs";
          }}
        >
          <Icon name="back" size={15} />
          {lang === "zh" ? "返回文档列表" : "Back to notes"}
        </button>
        {doc ? (
          <>
            <div className="doc-reader-head">
              <span>{doc.category}</span>
              <h1>{doc.title}</h1>
              <small>
                {doc.kind.toUpperCase()} ·{" "}
                {doc.order ? `NO. ${doc.order}` : "NOTE"}
              </small>
            </div>
            {doc.kind === "txt" ? (
              <pre className="plain-note">{doc.content}</pre>
            ) : doc.url ? (
              <a
                className="attachment-link"
                href={doc.url}
                target="_blank"
                rel="noreferrer"
              >
                {lang === "zh" ? "打开文件" : "Open attachment"}{" "}
                <Icon name="external" size={15} />
              </a>
            ) : (
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
            {list.length > 1 && (
              <div className="doc-pager">
                {list[index - 1] ? (
                  <a href={docHref(category!, list[index - 1].slug)}>
                    <small>{lang === "zh" ? "上一篇" : "Previous"}</small>
                    {list[index - 1].title}
                  </a>
                ) : (
                  <span />
                )}
                {list[index + 1] ? (
                  <a href={docHref(category!, list[index + 1].slug)}>
                    <small>{lang === "zh" ? "下一篇" : "Next"}</small>
                    {list[index + 1].title}
                  </a>
                ) : (
                  <span />
                )}
              </div>
            )}
          </>
        ) : (
          <div className="empty-note">
            {lang === "zh" ? "找不到这篇文档。" : "This note was not found."}
          </div>
        )}
      </article>
    );
  }
  const filtered = docs
    .filter((doc) => !category || doc.category === category)
    .filter((doc) =>
      `${doc.title} ${doc.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  return (
    <div className="docs-page">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">
            {lang === "zh"
              ? "把路走过的地方标下来"
              : "Marking the path as I go"}
          </p>
          <h1>{lang === "zh" ? "文档图书馆" : "The library"}</h1>
          <p>
            {lang === "zh"
              ? "笔记与写过的长文。按分类查看。"
              : "Notes and longer writing, grouped by topic."}
          </p>
        </div>
        <label className="doc-search">
          <Icon name="zoom" size={16} />
          <input
            value={query}
            aria-label={lang === "zh" ? "查找笔记" : "Search notes"}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "zh" ? "查找笔记" : "Search notes"}
          />
        </label>
      </div>
      <div className="doc-tabs">
        <a className={!category ? "is-active" : ""} href="#docs">
          {lang === "zh" ? "全部" : "All"} <small>{docs.length}</small>
        </a>
        {categories.map((cat) => (
          <a
            className={category === cat ? "is-active" : ""}
            key={cat}
            href={docHref(cat)}
          >
            {cat}
            <small>{docs.filter((doc) => doc.category === cat).length}</small>
          </a>
        ))}
      </div>
      <div className="doc-shelf">
        {filtered.map((doc) => (
          <a
            href={docHref(doc.category, doc.slug)}
            className="doc-card"
            key={`${doc.category}/${doc.slug}`}
          >
            <div>
              <span className="book-spine" />
              <small>
                {doc.category} · {doc.kind}
              </small>
              <h2>{doc.title}</h2>
            </div>
            <Icon name="chevron" size={17} />
          </a>
        ))}
        {filtered.length === 0 && (
          <p className="empty-note">
            {lang === "zh"
              ? "这个分类还没有文档。"
              : "Nothing in this topic yet."}
          </p>
        )}
      </div>
      <button className="shelf-link" onClick={() => onEnter("research")}>
        {lang === "zh"
          ? "研究实验室也有一份完整记录"
          : "There is a full record in the lab"}{" "}
        <Icon name="arrow" size={16} />
      </button>
    </div>
  );
}

function Album() {
  const { lang } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const current = selected === null ? null : photos[selected];
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected !== null && !dialogRef.current?.open)
      dialogRef.current?.showModal();
    if (selected === null) dialogRef.current?.close();
  }, [selected]);
  useEffect(() => {
    const fn = (event: KeyboardEvent) => {
      if (selected === null) return;
      if (event.key === "Escape") setSelected(null);
      if (event.key === "ArrowLeft")
        setSelected((selected - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight")
        setSelected((selected + 1) % photos.length);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [selected]);
  return (
    <div className="album-page">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">
            {lang === "zh"
              ? "窗外的十五个瞬间"
              : "Fifteen views out the window"}
          </p>
          <h1>{lang === "zh" ? "摄影馆" : "The photo gallery"}</h1>
          <p>
            {lang === "zh"
              ? "一些自己拍的风景。"
              : "A few landscapes of my own."}
          </p>
        </div>
        <div className="photo-count">
          {String(photos.length).padStart(2, "0")}
          <small>{lang === "zh" ? "张照片" : "photos"}</small>
        </div>
      </div>
      <div className="photo-wall">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            className={`photo-frame frame-${index % 6}`}
            onClick={() => setSelected(index)}
          >
            <img src={photo.thumb} alt={photoAlt(index, lang)} loading="lazy" />
            <span>{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
      </div>
      <dialog
        className="lightbox"
        ref={dialogRef}
        aria-label={lang === "zh" ? "查看照片" : "View photo"}
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelected(null);
        }}
      >
        {current && (
          <>
            <div className="lightbox-image">
              <img src={current.src} alt={photoAlt(current.number - 1, lang)} />
              <span>
                {String((selected ?? 0) + 1).padStart(2, "0")} /{" "}
                {String(photos.length).padStart(2, "0")}
              </span>
              <a
                className="photo-original"
                href={current.original}
                target="_blank"
                rel="noreferrer"
              >
                {lang === "zh" ? "查看原图" : "View original"}{" "}
                <Icon name="external" size={11} />
              </a>
            </div>
            <button
              className="lightbox-close"
              aria-label={lang === "zh" ? "关闭照片" : "Close photo"}
              onClick={() => setSelected(null)}
            >
              <Icon name="close" size={19} />
            </button>
            <button
              className="lightbox-prev"
              aria-label={lang === "zh" ? "上一张" : "Previous photo"}
              onClick={(e) => {
                e.stopPropagation();
                setSelected((selected! - 1 + photos.length) % photos.length);
              }}
            >
              <Icon name="back" size={21} />
            </button>
            <button
              className="lightbox-next"
              aria-label={lang === "zh" ? "下一张" : "Next photo"}
              onClick={(e) => {
                e.stopPropagation();
                setSelected((selected! + 1) % photos.length);
              }}
            >
              <Icon name="arrow" size={21} />
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}

function photoAlt(index: number, lang: string) {
  const zh = [
    "青山间的白色瀑布",
    "晴空下层叠的山峦",
    "海边落日与人群剪影",
    "崖壁间的山间栈道",
    "绿叶掩映的瀑布",
    "瀑布与层层流水",
    "蓝天下的青年毛泽东雕像",
    "雾中绝壁上的栈道",
    "灯火映照的山城夜景",
    "阳光洒在江面的波光",
    "水中游动的彩色鱼群",
    "山峦之间的江河",
    "河畔高楼与城市景色",
    "晚霞映照的路灯剪影",
    "云朵下的山城与群山",
  ];
  const en = [
    "A white waterfall among green hills",
    "Layered mountains under a blue sky",
    "Sunset silhouettes beside the water",
    "A walkway along a sheer cliff",
    "A waterfall framed by green leaves",
    "Cascading water and a broad waterfall",
    "The young Mao Zedong statue under blue skies",
    "A cliffside walkway in the mist",
    "City lights reflected on the river",
    "Sunlight shimmering on the water",
    "Colorful fish swimming underwater",
    "A river between mountain ranges",
    "Riverside buildings and city views",
    "Street lamps silhouetted against a sunset",
    "A hillside town beneath clouds and mountains",
  ];
  return (
    (lang === "zh" ? zh : en)[index] ??
    (lang === "zh" ? `风景照片 ${index + 1}` : `Landscape ${index + 1}`)
  );
}

function Contact() {
  const { lang } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied("manual");
    }
  };
  const links = [
    {
      key: "email",
      label: lang === "zh" ? "邮箱" : "Email",
      value: site.email,
      href: `mailto:${site.email}`,
    },
    { key: "qq", label: "QQ", value: site.qq },
    {
      key: "wechat",
      label: lang === "zh" ? "微信" : "WeChat",
      value: site.wechat,
    },
    {
      key: "github",
      label: "GitHub",
      value: site.githubLabel,
      href: site.githubUrl,
    },
  ];
  return (
    <div className="contact-page">
      <div className="contact-note">
        <p className="eyebrow">
          {lang === "zh" ? "写一封信，寄到这里" : "Send a letter this way"}
        </p>
        <h1>
          {lang === "zh" ? (
            <>
              如果你也有
              <br />
              <em>有意思的想法。</em>
            </>
          ) : (
            <>
              If you have
              <br />
              <em>an interesting idea.</em>
            </>
          )}
        </h1>
        <p>
          {lang === "zh"
            ? "任意一种方式都可以。会收到的。"
            : "Any of these will reach me."}
        </p>
        <div className="postmark">
          AP
          <br />
          <small>荆州 · 2026</small>
        </div>
      </div>
      <div className="contact-list">
        {links.map((link) => (
          <div className="contact-row" key={link.key}>
            <span className="contact-icon">
              <Icon
                name={
                  link.key === "email"
                    ? "mail"
                    : link.key === "github"
                      ? "github"
                      : "location"
                }
                size={20}
              />
            </span>
            <div>
              <small>{link.label}</small>
              {link.href ? (
                <a
                  href={link.href}
                  target={link.key === "github" ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  {link.value}
                </a>
              ) : (
                <strong>{link.value}</strong>
              )}
            </div>
            {link.key !== "github" && (
              <button
                className="copy-button"
                aria-label={`${copied === link.key ? (lang === "zh" ? "已复制" : "Copied") : lang === "zh" ? "复制" : "Copy"} ${link.label}`}
                onClick={() => copy(link.value, link.key)}
              >
                {copied === link.key ? (
                  <Icon name="check" size={16} />
                ) : (
                  <Icon name="copy" size={16} />
                )}
                <span>
                  {copied === link.key
                    ? lang === "zh"
                      ? "已复制"
                      : "Copied"
                    : lang === "zh"
                      ? "复制"
                      : "Copy"}
                </span>
              </button>
            )}
          </div>
        ))}
        <div className="contact-legend" role="status">
          <span />
          <p>
            {copied === "manual"
              ? lang === "zh"
                ? "浏览器无法自动复制，请选中上面的账号手动复制。"
                : "Select the account above and copy it manually."
              : copied
                ? lang === "zh"
                  ? "已复制到剪贴板。"
                  : "Copied to clipboard."
                : lang === "zh"
                  ? "邮箱可直接写信，QQ 和微信可复制账号。"
                  : "Send an email, or copy my QQ or WeChat ID."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ContentPanel({
  place,
  category,
  slug,
  onBack,
  onEnter,
  onPlayRace,
}: Props) {
  const { lang } = useI18n();
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>(".inside h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [place, category, slug]);
  const content =
    place === "about" ? (
      <About onEnter={onEnter} />
    ) : place === "projects" ? (
      <Projects />
    ) : place === "research" ? (
      <Research />
    ) : place === "docs" ? (
      <Docs category={category} slug={slug} onEnter={onEnter} />
    ) : place === "album" ? (
      <Album />
    ) : place === "contact" ? (
      <Contact />
    ) : (
      <div className="game-page">
        <div className="game-sign">
          PLAY
          <br />
          <span>鹈鹕 · 手机竞速</span>
        </div>
        <h1>{lang === "zh" ? "街角游戏厅" : "The corner arcade"}</h1>
        <p>
          {lang === "zh"
            ? "城市高架就在这一扇门后。准备好了吗？"
            : "The elevated highway is just behind this door. Ready?"}
        </p>
        <a
          className="primary-button"
          href="./game/play.html"
          onClick={(event) => {
            event.preventDefault();
            onPlayRace();
          }}
        >
          {lang === "zh" ? "进入游戏" : "Enter game"}{" "}
          <Icon name="arrow" size={17} />
        </a>
        <p className="game-note">W / S 加减速　A / D 切道　R 重新开始</p>
      </div>
    );
  return (
    <PanelFrame place={place} onBack={onBack}>
      {content}
    </PanelFrame>
  );
}
