# APpery 城市漫游

全屏个人主页。城市直接使用 `blender/city_model.blend` 的三维模型，在浏览器中实时渲染，不使用参考图或渲染图当背景。左键拖动漫游，滚轮缩放，按住鼠标中键旋转视角；手机单指滑动旋转，双指拨开放大、聚拢缩小。点击建筑进入内容，高架进入竞速游戏，机场切换中英文。

- **模型**：河道、高架、蓝顶图书馆、穹顶实验楼、玻璃塔、摄影馆、邮局、公馆、机场、公园和住宅都来自该 Blender 场景。源文件在导出时不会被改写。
- **动画**：模型自带 32 秒循环，包括桥上与街区的汽车、滨河行人、游船和帆船。可暂停；系统开启“减少动态效果”时自动停止。
- **高架公路**点击「上高架」直接进入原版《鹈鹕竞速》。街角游戏厅仍可使用。
- **机场**可从右下角定位。点击航站楼切换中英文。
- **地图操作**：左键拖动、中键旋转、滚轮缩放；手机单指旋转、双指开合缩放。右下角缩放按钮与百分比同步显示当前视角，提供总览、复位和旋转按钮。聚焦地图后可用方向键、加减号与 Home。
- **首次加载**：新版「风物来信」以信封、纸飞机、云景与纸页揭幕衔接真实 3D 城市，没有绘制额外的简易小城，也没有跳过按钮。完整动效约 12 秒；模型未就绪时保持云景等待，就绪后才揭幕。模型从 HTML 阶段就开始预加载，三维引擎并行下载。下载进度由 GLB 文件头的长度计算，兼容 gzip 和缺少 `Content-Length` 的响应；加载完成后还会等待城市首帧实际渲染，再自动进入。同一会话内不重复播放；减少动态效果时保留静态云景和加载提示，并在就绪后短暂揭幕。本地字体延后到城市出现后加载，避免争抢首屏带宽。
- **鼠标指针**：折纸罗盘采用松绿与纸白，悬停链接时出现珊瑚色定位环，拖动与中键旋转使用对应罗盘符号。日夜主题自动适配；文本选择、输入框、高对比模式使用系统指针，纯触屏设备不显示装饰指针。
- **界面**使用与城市相同的松绿和纸色。悬浮导航随时直达七个内容区；中英文与日夜主题保存在本地。

## 本地运行

建议 Node.js 22.12+ 或 Node.js 24。

```powershell
cd D:\code\Personal
npm install
npm run dev
```

访问 **http://127.0.0.1:5174**。

```powershell
npm run build        # 类型检查并生成 dist/
npm run preview      # 预览生成的静态站点
npm test             # 原独立项目的完整验收（仍引用迁移前的对照目录）
npm run test:city    # 构建并验证首次加载、压缩传输、失败重试、缩放按钮和手机手势
npm run test:cursor  # 构建并验证指针外观状态、地图交互、系统指针回退和触屏
```

浏览器验收默认使用本机 Microsoft Edge，可设置 `BROWSER_CHANNEL=chrome`。脚本在 5175 端口启动临时生产预览并在结束后关闭；`npm run test:browser` 单独检查已构建的 dist/。

## 城市里的内容

| 建筑 | 内容与功能 |
| --- | --- |
| 关于小屋 | APpery、长江大学、个人简介、Python / TypeScript、学习成长中的 coder |
| 项目工作室 | 9 个公开仓库，名称、公开描述、链接、语言、Star 数、更新时间 |
| 研究实验室 | Agent 协作简介、原研究 Markdown 全文、2 个 Mermaid 图表 |
| 文档图书馆 | FastAPI 10 篇、LangChain 9 篇、vue 空分类；分类、搜索、阅读、上一篇 / 下一篇 |
| 摄影馆 | 15 张原始照片与已有缩略图、预览图；放大、键盘翻页、查看原图 |
| 联系邮局 | 邮箱、QQ、微信、GitHub；邮件链接、复制账号与失败提示 |
| 街角游戏厅 | 原版《鹈鹕 · 手机竞速》完整文件；驾驶、天气与返回个人站入口 |

按本次要求，新版已移除真实姓名，仅使用 APpery。仓库描述中的姓名同步移除，抓取时先应用 `data/public-metadata.json` 中的公开描述，避免下次刷新重新引入。

新站已替换仓库根目录的旧站，数据、字体和素材均位于 `Personal` 内。文档、照片、研究和游戏在替换前通过 SHA-256 对照验证；仓库快照仅按公开元信息覆盖指定描述，其余字段保留。

## 维护入口

- 个人资料：`src/content/site.ts`；简介：`src/components/ContentPanel.tsx` 与 `src/i18n/dict.ts`。
- 项目列表：`data/repos.json`，运行 `npm run snapshot` 更新；配置为 `data/site-config.json`，双语描述为 `data/repo-overrides.json`，匿名化后的公开描述为 `data/public-metadata.json`。抓取失败时不覆盖已有快照。
- 研究：`src/content/research.md`；技术文档：`document/分类名/`。新分类自动扫描，支持空分类。
- 照片：`photo/`；缩略图与预览图分别位于 `.thumbs/` 和 `.full/`。
- 内容建筑：`src/components/CityScene.tsx`；名称与导航：`src/lib/places.ts`。
- 三维城市：`src/components/city/CityRuntime.ts`；模型下载和缓存：`CityAsset.ts`；建筑入口坐标：`ModelLandmarks.ts`；源模型：`blender/city_model.blend`。
- 重新导出模型：`scripts/export-city.py`，再运行 `node scripts/prepare-city.mjs`。
- 页面样式：`src/styles.css`；全屏城市与悬浮工具：`src/city.css`。
- 小游戏：`public/game/game.html`，保持原文件完整。

## 构建与材料

React 19 + TypeScript + Vite + Three.js。网页加载由 `city_model.blend` 导出的压缩 glTF，保留原材质、建筑分组和动画。入口动效从建筑的实际屏幕位置开始。内容与 Mermaid 按需加载，本地 Noto Sans SC 字体附带 OFL 授权。

静态部署使用整个 `dist/` 目录；`base: './'` 支持子目录，保留 `game/`、`assets/`、字体及原图。

- [设计与内容映射](DESIGN.md) · [城市疏密与地形修订](CITY-REVISION.md)
- [全城总览](evidence/city-overview.png) · [机场地面连接](evidence/airport-desktop.png) · [轻轨经过高架](evidence/rail-crossing.png)
- [验收说明](VERIFICATION.md) · [验收原始结果](evidence/verification.json)
- [桌面城市](evidence/home-desktop.png) · [夜间城市](evidence/home-night.png) · [手机城市](evidence/home-mobile.png)
- [项目工作室](evidence/projects-desktop.png) · [文档阅读器](evidence/document-desktop.png) · [摄影馆](evidence/album-desktop.png)

旧路径 `#about`、`#work`、`#projects`、`#research`、`#docs/分类/文档`、`#album`、`#contact` 保持可用；`#city` 返回城市，`#game` 打开游戏厅。
