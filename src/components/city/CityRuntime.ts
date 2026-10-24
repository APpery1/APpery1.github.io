import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { loadCityBytes } from "./CityAsset";
import {
  landmarks,
  landmarkById,
  type CityDestination,
  type XYZ,
} from "./ModelLandmarks";
let asset: Promise<GLTF> | undefined;
const loadAsset = async (onProgress?: (value: number) => void) => {
  const bytes = await loadCityBytes((value) =>
    onProgress?.(0.05 + value * 0.75),
  );
  onProgress?.(0.82);
  if (!asset) {
    performance.mark("city-decode-start");
    asset = new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(bytes, `${import.meta.env.BASE_URL}models/`)
      .then((gltf) => {
        performance.mark("city-decode-end");
        return gltf;
      })
      .catch((error: unknown) => {
        asset = undefined;
        throw error;
      });
  }
  const gltf = await asset;
  onProgress?.(0.9);
  return gltf;
};
let saved:
  | {
      position: THREE.Vector3;
      target: THREE.Vector3;
      zoom: number;
      height: number;
      mode: string;
    }
  | undefined;
export type ScreenPoint = { x: number; y: number; visible: boolean };
type Options = {
  onReady: () => void;
  onError: (error: Error) => void;
  onHover: (id: CityDestination | null) => void;
  onSelect: (id: CityDestination) => void;
  onProject: (
    id: CityDestination,
    point: ScreenPoint,
    hit: ScreenPoint,
  ) => void;
  onView: (zoom: number) => void;
  onProgress?: (value: number) => void;
};
type BatchEntry = {
  batch: THREE.BatchedMesh;
  instance: number;
  source: THREE.Mesh;
  dynamic: boolean;
};
export class CityRuntime {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, 1, 0.4, 4000);
  private readonly home = new THREE.Vector3(126, 154, 170);
  private readonly homeTarget = new THREE.Vector3(0, 1.8, 0);
  private readonly baseDistance = this.home.distanceTo(this.homeTarget);
  controls: MapControls;
  root?: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  options: Options;
  width = 1;
  height = 1;
  viewHeight = 140;
  mode = "explore";
  ready = false;
  private presented = false;
  disposed = false;
  paused = false;
  night = false;
  private raf = 0;
  private last = 0;
  private lastPaint = 0;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  private dirty = true;
  private entries: BatchEntry[] = [];
  private hits: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private start = { x: 0, y: 0 };
  private dragged = false;
  private touchPointers = new Set<number>();
  private staticMaterials = new Set<THREE.MeshStandardMaterial>();
  private highlight = new THREE.Group();
  private selected: CityDestination | null = null;
  private sun = new THREE.DirectionalLight("#fff6dd", 2.1);
  private sky = new THREE.HemisphereLight("#d7edff", "#b3b58c", 1.2);
  private fill = new THREE.DirectionalLight("#cbe7fc", 0.4);
  private resizeObserver: ResizeObserver;
  constructor(
    public host: HTMLDivElement,
    options: Options,
  ) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, window.innerWidth < 760 ? 1.5 : 2),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = "city-canvas";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.prepend(this.renderer.domElement);
    this.scene.background = new THREE.Color("#d4dfcc");
    this.camera.position.copy(this.home);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.homeTarget);
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.homeTarget);
    this.controls.screenSpacePanning = false;
    this.controls.enableDamping = false;
    this.controls.minDistance = this.baseDistance / 4.5;
    this.controls.maxDistance = this.baseDistance / 0.5;
    this.controls.minPolarAngle = 0.72;
    this.controls.maxPolarAngle = 1.15;
    this.controls.zoomSpeed = 0.7;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: -1 as THREE.MOUSE,
    };
    this.controls.rotateSpeed = 0.45;
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.addEventListener("change", this.changed);
    this.renderer.domElement.addEventListener(
      "pointerdown",
      this.middleDown,
      true,
    );
    this.renderer.domElement.addEventListener("auxclick", this.blockMiddle);
    window.addEventListener("pointerup", this.middleUp);
    window.addEventListener("pointercancel", this.middleUp);
    this.sun.position.set(-65, 105, 65);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -110,
      right: 110,
      top: 110,
      bottom: -110,
      near: 1,
      far: 350,
    });
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.09;
    this.sun.shadow.radius = 3;
    this.fill.position.set(40, 70, -70);
    this.scene.add(
      this.sun,
      this.sun.target,
      this.sky,
      this.fill,
      this.highlight,
    );
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: "#d0d9c7", roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.55;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.renderer.domElement.addEventListener("pointerdown", this.down);
    this.renderer.domElement.addEventListener("pointermove", this.move);
    this.renderer.domElement.addEventListener("pointerup", this.up);
    this.renderer.domElement.addEventListener("pointercancel", this.cancel);
    this.renderer.domElement.addEventListener("pointerleave", this.leave);
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.reduced.addEventListener("change", this.changed);
    document.addEventListener("visibilitychange", this.changed);
    this.resize();
    this.loop(0);
    void this.load();
  }
  private changed = () => {
    this.dirty = true;
    this.options.onView(this.effectiveZoom());
  };
  private middleDown = (event: PointerEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
    this.host.classList.add("is-rotating");
    this.host.dataset.rotateButton = "middle";
  };
  private middleUp = (event: PointerEvent) => {
    if (event.button !== 1) return;
    this.host.classList.remove("is-rotating");
  };
  private blockMiddle = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault();
  };
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError(new Error("The graphics context was lost."));
  };
  private resize() {
    this.width = this.host.clientWidth;
    this.height = this.host.clientHeight;
    if (!this.width || !this.height) return;
    this.renderer.setSize(this.width, this.height);
    this.applyLens();
    if (this.mode === "overview") this.overview();
    else this.controls.update();
    this.dirty = true;
  }
  // A fixed mild perspective keeps the reference framing, without the shear an orthographic orbit produces.
  private applyLens() {
    const aspect = this.width / Math.max(this.height, 1);
    this.camera.aspect = aspect;
    const vertical = 168 / Math.max(1, aspect);
    this.camera.fov = THREE.MathUtils.radToDeg(
      2 * Math.atan(vertical / (2 * this.baseDistance)),
    );
    this.camera.zoom = 1;
    this.camera.up.set(0, 1, 0);
    this.camera.updateProjectionMatrix();
  }
  private effectiveZoom() {
    return (
      this.baseDistance /
      Math.max(this.camera.position.distanceTo(this.controls.target), 0.001)
    );
  }
  private setZoom(value: number) {
    const next = THREE.MathUtils.clamp(value, 0.5, 4.5);
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(this.baseDistance / next);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.up.set(0, 1, 0);
    this.mode = "explore";
    this.controls.update();
    this.dirty = true;
    this.options.onView(this.effectiveZoom());
  }
  private async load() {
    try {
      const gltf = await loadAsset(this.options.onProgress);
      if (this.disposed) return;
      this.root = gltf.scene.clone(true);
      this.root.name = "Blender city source";
      this.scene.add(this.root);
      const materialCopies = new Map<
        THREE.Material,
        THREE.MeshStandardMaterial
      >();
      this.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mat = o.material as THREE.MeshStandardMaterial;
        if (!materialCopies.has(mat)) materialCopies.set(mat, mat.clone());
        o.material = materialCopies.get(mat)!;
        this.staticMaterials.add(o.material as THREE.MeshStandardMaterial);
        o.updateMatrixWorld();
        this.hits.push(o);
      });
      this.root.updateMatrixWorld(true);
      this.buildBatches();
      this.root.visible = false;
      this.mixer = new THREE.AnimationMixer(this.root);
      for (const clip of gltf.animations) this.mixer.clipAction(clip).play();
      if (saved) {
        this.camera.position.copy(saved.position);
        this.controls.target.copy(saved.target);
        this.mode = saved.mode;
        this.applyLens();
        this.controls.update();
      }
      this.applyTheme();
      this.ready = true;
      performance.mark("city-scene-ready");
      this.host.dataset.modelSource = "blender/city_model.blend";
      this.host.dataset.animationClips = String(gltf.animations.length);
      this.host.dataset.sourceMeshes = String(this.hits.length);
      this.renderer.shadowMap.needsUpdate = true;
      this.dirty = true;
      this.options.onProgress?.(0.95);
    } catch (error) {
      if (!this.disposed)
        this.options.onError(
          error instanceof Error ? error : new Error(String(error)),
        );
    }
  }
  private buildBatches() {
    const buckets = new Map<
      string,
      {
        mat: THREE.MeshStandardMaterial;
        dynamic: boolean;
        meshes: THREE.Mesh[];
      }
    >();
    for (const mesh of this.hits) {
      let node: THREE.Object3D | null = mesh,
        dynamic = false;
      while (node) {
        if (node.name.startsWith("motion_")) dynamic = true;
        node = node.parent;
      }
      const mat = mesh.material as THREE.MeshStandardMaterial,
        key = mat.uuid + dynamic;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { mat, dynamic, meshes: [] };
        buckets.set(key, bucket);
      }
      bucket.meshes.push(mesh);
    }
    for (const { mat, dynamic, meshes } of buckets.values()) {
      const geometries = [...new Set(meshes.map((m) => m.geometry))],
        vertices = geometries.reduce(
          (s, g) => s + g.getAttribute("position").count,
          0,
        ),
        indices = geometries.reduce(
          (s, g) => s + (g.index?.count ?? g.getAttribute("position").count),
          0,
        );
      const batch = new THREE.BatchedMesh(
        meshes.length,
        vertices,
        indices,
        mat,
      );
      batch.name = dynamic ? "Animated city batch" : "Static city batch";
      batch.castShadow = !dynamic;
      batch.receiveShadow = true;
      batch.frustumCulled = false;
      batch.perObjectFrustumCulled = false;
      batch.sortObjects = false;
      const ids = new Map<THREE.BufferGeometry, number>();
      for (const source of geometries) {
        const geometry = new THREE.BufferGeometry();
        for (const key of ["position", "normal"]) {
          const a = source.getAttribute(key),
            values = new Float32Array(a.count * 3);
          for (let i = 0; i < a.count; i++) {
            values[i * 3] = a.getX(i);
            values[i * 3 + 1] = a.getY(i);
            values[i * 3 + 2] = a.getZ(i);
          }
          geometry.setAttribute(key, new THREE.BufferAttribute(values, 3));
        }
        if (source.index) geometry.setIndex(source.index.clone());
        ids.set(source, batch.addGeometry(geometry));
        geometry.dispose();
      }
      for (const mesh of meshes) {
        const instance = batch.addInstance(ids.get(mesh.geometry)!);
        batch.setMatrixAt(instance, mesh.matrixWorld);
        this.entries.push({ batch, instance, source: mesh, dynamic });
      }
      this.scene.add(batch);
    }
  }
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const active =
      this.ready && !this.paused && !this.reduced.matches && !document.hidden;
    const elapsed = this.last ? Math.min((now - this.last) / 1000, 0.15) : 0;
    this.last = now;
    if (
      document.hidden ||
      (!this.dirty && !active) ||
      now - this.lastPaint < (this.width < 760 ? 1000 / 24 : 1000 / 30)
    )
      return;
    const dt = this.lastPaint
      ? Math.min((now - this.lastPaint) / 1000, 0.15)
      : elapsed;
    this.lastPaint = now;
    if (active && this.mixer) {
      this.mixer.update(dt);
      this.root!.updateMatrixWorld(true);
      for (const e of this.entries)
        if (e.dynamic) e.batch.setMatrixAt(e.instance, e.source.matrixWorld);
    }
    this.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    if (this.ready && !this.presented) {
      this.presented = true;
      this.host.dataset.modelLoaded = "true";
      performance.mark("city-first-frame");
      this.options.onProgress?.(1);
      this.options.onReady();
    }
    for (const l of landmarks)
      this.options.onProject(
        l.id,
        this.project(l.anchor),
        this.project(l.focus),
      );
    this.host.dataset.animationTime = (this.mixer?.time ?? 0).toFixed(3);
    this.host.dataset.animationPaused = String(!active);
    this.host.dataset.drawCalls = String(this.renderer.info.render.calls);
    this.host.dataset.triangles = String(this.renderer.info.render.triangles);
    this.host.dataset.cameraZoom = this.effectiveZoom().toFixed(2);
    this.host.dataset.cameraTarget = JSON.stringify(
      this.controls.target.toArray().map((n) => Number(n.toFixed(3))),
    );
    this.host.dataset.cameraPosition = JSON.stringify(
      this.camera.position.toArray().map((n) => Number(n.toFixed(3))),
    );
    this.host.dataset.viewMode = this.mode;
    this.dirty = false;
  };
  project(point: XYZ): ScreenPoint {
    const p = new THREE.Vector3(...point).project(this.camera);
    return {
      x: ((p.x + 1) * this.width) / 2,
      y: ((1 - p.y) * this.height) / 2,
      visible:
        p.z > -1 &&
        p.z < 1 &&
        p.x > -1.2 &&
        p.x < 1.2 &&
        p.y > -1.2 &&
        p.y < 1.2,
    };
  }
  focus(id: CityDestination, force = false) {
    const l = landmarkById[id],
      p = this.project(l.door);
    if (
      force ||
      p.x < 90 ||
      p.x > this.width - 90 ||
      p.y < 110 ||
      p.y > this.height - 155
    ) {
      const target = new THREE.Vector3(...l.focus),
        delta = target.clone().sub(this.controls.target);
      this.camera.position.add(delta);
      this.controls.target.copy(target);
      this.mode = "explore";
      if (force) this.setZoom(1.7);
      else {
        this.controls.update();
        this.camera.updateMatrixWorld();
        this.dirty = true;
      }
    }
    return this.project(l.door);
  }
  entrance(id: CityDestination) {
    return this.focus(id);
  }
  zoom(factor: number) {
    this.setZoom(this.effectiveZoom() * factor);
  }
  reset() {
    this.mode = "explore";
    this.camera.position.copy(this.home);
    this.controls.target.copy(this.homeTarget);
    this.camera.zoom = 1;
    this.camera.up.set(0, 1, 0);
    this.applyLens();
    this.controls.update();
    this.dirty = true;
    this.options.onView(this.effectiveZoom());
  }
  overview() {
    this.mode = "overview";
    this.applyLens();
    this.controls.target.set(0, 8, 0);
    const aspect = this.width / Math.max(this.height, 1);
    const fovY = THREE.MathUtils.degToRad(this.camera.fov);
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);
    const radius = 102;
    const distance =
      Math.max(radius / Math.sin(fovY / 2), radius / Math.sin(fovX / 2)) * 1.08;
    const offset = this.home.clone().sub(this.homeTarget).setLength(distance);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.up.set(0, 1, 0);
    this.controls.update();
    this.dirty = true;
    this.options.onView(this.effectiveZoom());
  }
  pan(dx: number, dy: number) {
    const right = new THREE.Vector3().setFromMatrixColumn(
      this.camera.matrix,
      0,
    );
    right.y = 0;
    right.normalize();
    const forward = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), right)
      .normalize();
    const visible =
      2 *
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) *
      this.camera.position.distanceTo(this.controls.target);
    const delta = right
      .multiplyScalar(dx)
      .add(forward.multiplyScalar(dy))
      .multiplyScalar(visible / this.height);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.mode = "explore";
    this.controls.update();
    this.dirty = true;
  }
  rotate() {
    const delta = this.camera.position.clone().sub(this.controls.target);
    delta.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6);
    this.camera.position.copy(this.controls.target).add(delta);
    this.controls.update();
    this.dirty = true;
  }
  setNight(value: boolean) {
    this.night = value;
    this.applyTheme();
  }
  private applyTheme() {
    this.scene.background = new THREE.Color(this.night ? "#172b32" : "#d4dfcc");
    this.sky.intensity = this.night ? 0.42 : 1.2;
    this.sun.intensity = this.night ? 0.35 : 2.1;
    this.sun.color.set(this.night ? "#96bcf2" : "#fff6dd");
    this.fill.intensity = this.night ? 0.25 : 0.4;
    this.renderer.toneMappingExposure = this.night ? 0.87 : 0.95;
    for (const material of this.staticMaterials) {
      const n = material.name.toLowerCase(),
        lit = n.includes("glass") || n.includes("lamp");
      material.emissive.set(
        lit && this.night
          ? n.includes("lamp")
            ? "#edbd70"
            : "#4c95ad"
          : "#000000",
      );
      material.emissiveIntensity = this.night
        ? n.includes("lamp")
          ? 1.2
          : 0.14
        : 0;
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.dirty = true;
  }
  select(id: CityDestination | null) {
    if (this.selected === id) return;
    this.selected = id;
    for (const c of [...this.highlight.children]) {
      this.highlight.remove(c);
      const line = c as THREE.LineSegments;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    if (id) {
      for (const mesh of this.hits.filter((m) => m.userData.place === id)) {
        const line = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry, 40),
          new THREE.LineBasicMaterial({
            color: this.night ? "#ffe1a0" : "#fdf1ad",
            transparent: true,
            opacity: 0.75,
            depthTest: true,
          }),
        );
        line.applyMatrix4(mesh.matrixWorld);
        this.highlight.add(line);
      }
    }
    this.dirty = true;
  }
  private pick(x: number, y: number) {
    if (!this.ready) return null;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((x - bounds.left) / bounds.width) * 2 - 1,
      (-(y - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const first = this.raycaster.intersectObjects(this.hits, false)[0];
    if (!first) return null;
    const id = first.object.userData.place as CityDestination;
    return landmarkById[id] ? id : null;
  }
  private down = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      this.touchPointers.add(event.pointerId);
      if (this.touchPointers.size > 1) {
        this.dragged = true;
        return;
      }
    }
    this.start = { x: event.clientX, y: event.clientY };
    this.dragged = false;
  };
  private move = (event: PointerEvent) => {
    if (
      (event.buttons || event.pointerType === "touch") &&
      Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > 5
    )
      this.dragged = true;
    if (!event.buttons && event.pointerType !== "touch") {
      const id = this.pick(event.clientX, event.clientY);
      this.renderer.domElement.style.cursor = id ? "pointer" : "grab";
      this.options.onHover(id);
    }
  };
  private up = (event: PointerEvent) => {
    this.touchPointers.delete(event.pointerId);
    if (event.button === 0 && !this.dragged && !this.touchPointers.size) {
      const id = this.pick(event.clientX, event.clientY);
      if (id) {
        this.host.dataset.lastPick = id;
        this.options.onSelect(id);
      }
    }
  };
  private cancel = (event: PointerEvent) => {
    this.touchPointers.delete(event.pointerId);
    this.dragged = true;
  };
  private leave = () => this.options.onHover(null);
  setPaused(value: boolean) {
    this.paused = value;
    this.dirty = true;
  }
  snapshot() {
    return {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      zoom: this.camera.zoom,
      height: this.viewHeight,
      mode: this.mode,
    };
  }
  restore(view: ReturnType<CityRuntime["snapshot"]>) {
    this.camera.position.copy(view.position);
    this.controls.target.copy(view.target);
    this.camera.zoom = 1;
    this.camera.up.set(0, 1, 0);
    this.mode = view.mode;
    this.applyLens();
    this.controls.update();
    this.dirty = true;
  }
  dispose() {
    if (this.ready) saved = this.snapshot();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this.middleDown,
      true,
    );
    this.renderer.domElement.removeEventListener("auxclick", this.blockMiddle);
    window.removeEventListener("pointerup", this.middleUp);
    window.removeEventListener("pointercancel", this.middleUp);
    this.reduced.removeEventListener("change", this.changed);
    document.removeEventListener("visibilitychange", this.changed);
    this.mixer?.stopAllAction();
    if (this.root) this.mixer?.uncacheRoot(this.root);
    this.scene.traverse((o) => {
      if (o instanceof THREE.BatchedMesh) o.dispose();
      if (o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    for (const material of this.staticMaterials) material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
