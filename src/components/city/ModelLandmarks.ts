import type { PlaceId } from "../../lib/places";
export type CityDestination = PlaceId | "airport" | "highway";
export type XYZ = readonly [number, number, number];
export type Landmark = {
  id: CityDestination;
  anchor: XYZ;
  door: XYZ;
  focus: XYZ;
  hintZh: string;
  hintEn: string;
};
// Coordinates are the Blender model's coordinates converted to glTF Y-up: (x,z,-y).
export const landmarks: Landmark[] = [
  {
    id: "research",
    anchor: [-41, 16, -38],
    door: [-41, 0.7, -30.4],
    focus: [-41, 3, -37],
    hintZh: "蓝色穹顶下，探索 Agent 协作",
    hintEn: "Agent collaboration, under the dome",
  },
  {
    id: "docs",
    anchor: [-5, 16.5, -35],
    door: [-5, 0.6, -26],
    focus: [-5, 3, -32],
    hintZh: "走进图书馆，翻阅学习笔记",
    hintEn: "A library of notes and ideas",
  },
  {
    id: "projects",
    anchor: [29, 30.5, -24.3],
    door: [29, 1.4, -19.2],
    focus: [29, 9, -24.3],
    hintZh: "把想法写成可以运行的东西",
    hintEn: "A home for things I have built",
  },
  {
    id: "album",
    anchor: [-35, 11.5, 28.2],
    door: [-35, 0.7, 33.3],
    focus: [-35, 3, 28.2],
    hintZh: "透过镜头，看看沿途的风景",
    hintEn: "A few landscapes beyond the screen",
  },
  {
    id: "contact",
    anchor: [-2.5, 13.8, 29],
    door: [-2.5, 0.7, 35.5],
    focus: [-2.5, 3, 29],
    hintZh: "如果你也有一个有意思的想法",
    hintEn: "Have an interesting idea? Say hello",
  },
  {
    id: "about",
    anchor: [34, 14.8, 26.5],
    door: [34, 0.7, 32.8],
    focus: [34, 3, 26.5],
    hintZh: "认识这座城市的建造者 APpery",
    hintEn: "Meet APpery, the person behind this city",
  },
  {
    id: "game",
    anchor: [-12, 5.4, 44.4],
    door: [-12, 0.6, 46.7],
    focus: [-12, 2, 44.4],
    hintZh: "街角歇一歇，再去高架上兜风",
    hintEn: "Take a break and go for a ride",
  },
  {
    id: "airport",
    anchor: [44, 11, -33.5],
    door: [43.5, 0.6, -29.5],
    focus: [47, 3, -36],
    hintZh: "点击航站楼切换到 English",
    hintEn: "Click the terminal to switch to 中文",
  },
  {
    id: "highway",
    anchor: [-48, 5.8, -5.4],
    door: [-48, 4, -5.4],
    focus: [-40, 3, -5.4],
    hintZh: "上高架，进入《鹈鹕竞速》",
    hintEn: "Take the highway into Pelican Racing",
  },
];
export const landmarkById = Object.fromEntries(
  landmarks.map((l) => [l.id, l]),
) as Record<CityDestination, Landmark>;
