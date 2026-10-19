export type PlaceId =
  "about" | "projects" | "research" | "docs" | "album" | "contact" | "game";
export type Route = { place: PlaceId | null; category?: string; slug?: string };
export const places: {
  id: PlaceId;
  zh: string;
  en: string;
  building: string;
  buildingEn: string;
  color: string;
  description: string;
  descriptionEn: string;
}[] = [
  {
    id: "about",
    zh: "关于我",
    en: "About",
    building: "关于公馆",
    buildingEn: "The town hall",
    color: "#739d84",
    description: "认识这座小城的建造者。",
    descriptionEn: "Meet the person building this town.",
  },
  {
    id: "projects",
    zh: "项目",
    en: "Projects",
    building: "项目大厦",
    buildingEn: "The project tower",
    color: "#d47e65",
    description: "把一个个想法，写成可以运行的东西。",
    descriptionEn: "Turning small ideas into things that work.",
  },
  {
    id: "research",
    zh: "研究",
    en: "Research",
    building: "研究实验室",
    buildingEn: "The laboratory",
    color: "#719fa2",
    description: "同一时间，只深挖一件事。",
    descriptionEn: "One focus at a time.",
  },
  {
    id: "docs",
    zh: "文档",
    en: "Notes",
    building: "文档图书馆",
    buildingEn: "The library",
    color: "#caad73",
    description: "学过的、想过的，慢慢写下来。",
    descriptionEn: "A place for things learned along the way.",
  },
  {
    id: "album",
    zh: "相册",
    en: "Photos",
    building: "摄影馆",
    buildingEn: "The photo gallery",
    color: "#8a9bb5",
    description: "代码之外，也看看沿途的风景。",
    descriptionEn: "A few landscapes beyond the screen.",
  },
  {
    id: "contact",
    zh: "联系",
    en: "Contact",
    building: "联系邮局",
    buildingEn: "The post office",
    color: "#b58c8f",
    description: "如果你也有一个有意思的想法。",
    descriptionEn: "If you have an interesting idea, say hello.",
  },
  {
    id: "game",
    zh: "小游戏",
    en: "Arcade",
    building: "街角游戏厅",
    buildingEn: "The corner arcade",
    color: "#778fbb",
    description: "休息一下，在城市高架上兜个风。",
    descriptionEn: "Take a break. Go for a ride above the city.",
  },
];
export function parseRoute(): Route {
  try {
    const [page, category, slug] = window.location.hash
      .slice(1)
      .split("/")
      .map(decodeURIComponent);
    const place = page === "work" ? "projects" : page;
    return {
      place: places.some((item) => item.id === place)
        ? (place as PlaceId)
        : null,
      category,
      slug,
    };
  } catch {
    return { place: null };
  }
}
