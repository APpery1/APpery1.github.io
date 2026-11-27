import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { NodeIO, Accessor } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, meshopt, simplifyPrimitive, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
const root = process.cwd(),
  dir = path.join(root, "evidence/model-export");
const metadata = JSON.parse(
  fs.readFileSync(path.join(dir, "city-export.json"), "utf8"),
);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(path.join(dir, "city-raw.glb")),
  buffer = doc.getRoot().listBuffers()[0];
const nodes = new Map(
  doc
    .getRoot()
    .listNodes()
    .map((n) => [n.getName(), n]),
);
const time = doc
  .createAccessor("timeline")
  .setType(Accessor.Type.SCALAR)
  .setArray(
    Float32Array.from(
      { length: metadata.fps * metadata.motionDuration + 1 },
      (_, i) => i / metadata.fps,
    ),
  )
  .setBuffer(buffer);
const scene = doc.getRoot().getDefaultScene();
scene.setExtras({ ...scene.getExtras(), daylight: metadata.daylight });
const clip = doc.createAnimation("Street traffic");
for (const track of metadata.animations) {
  const node = nodes.get(track.node);
  if (!node) throw new Error(`Missing animation node ${track.node}`);
  for (const key of ["translation", "rotation", "scale"]) {
    if (!track[key]) continue;
    const output = doc
      .createAccessor(`${track.node}-${key}`)
      .setType(key === "rotation" ? Accessor.Type.VEC4 : Accessor.Type.VEC3)
      .setArray(new Float32Array(track[key]))
      .setBuffer(buffer);
    const sampler = doc
      .createAnimationSampler()
      .setInput(time)
      .setOutput(output)
      .setInterpolation("LINEAR");
    clip
      .addSampler(sampler)
      .addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(node)
          .setTargetPath(key)
          .setSampler(sampler),
      );
  }
}
// Dense bevels and lettering dominate this model. Limit geometric error and
// leave small primitives (including clock hands) and animation tracks alone.
await MeshoptSimplifier.ready;
await doc.transform(weld());
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if ((prim.getIndices()?.getCount() ?? 0) > 9000) {
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0.28, error: 0.0004 });
    }
  }
}
await doc.transform(
  dedup({ keepUniqueNames: true }),
  resample({ tolerance: 0.00001 }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: "high", quantizePosition: 16 }),
);
fs.mkdirSync("public/models", { recursive: true });
await io.write("public/models/city.glb", doc);
const manifest = {
  ...metadata,
  animations: undefined,
  daylight: undefined,
  modelBytes: fs.statSync("public/models/city.glb").size,
  modelSha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync("public/models/city.glb"))
    .digest("hex"),
  animationClips: doc.getRoot().listAnimations().length,
  animationChannels: clip.listChannels().length,
  materials: doc.getRoot().listMaterials().length,
  meshes: doc.getRoot().listMeshes().length,
};
fs.writeFileSync(
  "public/models/city-manifest.json",
  JSON.stringify(manifest, null, 2),
);
console.log(JSON.stringify(manifest, null, 2));
