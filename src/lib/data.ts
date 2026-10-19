import snapshot from "../../data/repos.json";
import { categories as scannedCategories } from "virtual:doc-categories";

export { places, type PlaceId } from "./places";
export const repos = snapshot.repos;
export const snapshotDate = snapshot.generatedAt.slice(0, 10);

const texts = import.meta.glob("../../document/*/*.{md,txt,MD,TXT}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
const attachments = import.meta.glob("../../document/*/*.{pdf,html,PDF,HTML}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
export type Doc = {
  category: string;
  slug: string;
  title: string;
  order: string;
  content: string;
  kind: string;
  url?: string;
};
export const docs: Doc[] = [
  ...Object.entries(texts),
  ...Object.entries(attachments),
]
  .flatMap(([path, content]) => {
    const parts = path.split("/");
    const file = parts[parts.length - 1];
    const slug = file.replace(/\.[^.]+$/, "");
    if (/^readme$/i.test(slug)) return [];
    const match = slug.match(/^(\d+)[_\-\s.]+(.+)$/);
    const kind = file.split(".").pop()!.toLowerCase();
    return [
      {
        category: parts[parts.length - 2],
        slug,
        title: match?.[2] ?? slug,
        order: match?.[1] ?? "",
        content,
        kind,
        url: /pdf|html/.test(kind) ? content : undefined,
      },
    ];
  })
  .sort((a, b) => a.slug.localeCompare(b.slug, undefined, { numeric: true }));
export const categories = [
  ...new Set([...scannedCategories, ...docs.map((doc) => doc.category)]),
].sort();
export const docHref = (category: string, slug?: string) =>
  `#docs/${encodeURIComponent(category)}${slug ? `/${encodeURIComponent(slug)}` : ""}`;

const thumbnails = import.meta.glob(
  "../../photo/.thumbs/*.{jpg,jpeg,png,webp}",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;
const previews = import.meta.glob("../../photo/.full/*.{jpg,jpeg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const originals = import.meta.glob("../../photo/*.{jpg,jpeg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
export const photos = Object.entries(originals)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, original], index) => {
    const file = path.split("/").pop()!;
    return {
      original,
      src: previews[`../../photo/.full/${file}`] ?? original,
      thumb: thumbnails[`../../photo/.thumbs/${file}`] ?? original,
      id: file,
      number: index + 1,
    };
  });
