import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VoxelModel, unpackKey } from '../../shared/voxel/VoxelModel';
import { meshModel, type MeshData } from '../../shared/formats/mesher';
import type { RenderSettings } from '../../shared/palette/styles';
import { PixelPass } from './PixelPass';

export type ViewPreset = 'iso' | 'front' | 'side' | 'back' | 'top';
export type Projection = 'perspective' | 'orthographic';
export type Cell = [number, number, number];

export interface PickResult {
  /** Getroffener Voxel (oder null bei Bodentreffer). */
  voxel: Cell | null;
  /** Zelle vor der getroffenen Fläche (zum Anbauen). */
  adjacent: Cell;
  normal: Cell;
}

export interface ViewportSettings extends RenderSettings {
  showGrid: boolean;
  ao: boolean;
}

/**
 * Der 3D-Viewer: kapselt Three.js-Szene, Kameras, Steuerung, Licht,
 * Voxel-Meshes, Auswahl-Overlay, Picking und das Pixel-Rendering.
 *
 * Die React-Komponente `ViewportView` erzeugt eine Instanz und reicht
 * Modell, Auswahl und Einstellungen durch.
 */
export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly overlay = new THREE.Scene();
  private readonly perspCam: THREE.PerspectiveCamera;
  private readonly orthoCam: THREE.OrthographicCamera;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  readonly controls: OrbitControls;
  private readonly pixelPass = new PixelPass();
  private readonly voxelGroup = new THREE.Group();
  private readonly lightGroup = new THREE.Group();
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly grid: THREE.GridHelper;
  private readonly ground: THREE.Mesh;
  private readonly selectionGroup = new THREE.Group();
  /** Unsichtbare Tiefen-Kopie der Voxel im Overlay, damit das Raster verdeckt wird. */
  private readonly depthProxy = new THREE.Group();
  private readonly depthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
  private readonly hoverBox: THREE.LineSegments;
  private readonly previewBox: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly materials: Record<string, THREE.Material>;

  private model: VoxelModel | null = null;
  private builtVersion = -1;
  private builtModel: VoxelModel | null = null;
  private selectionKey = '';
  private settings: ViewportSettings;
  private frameHandle = 0;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private needsRender = true;
  projection: Projection = 'perspective';

  constructor(private readonly container: HTMLElement, settings: ViewportSettings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = true;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    this.perspCam = new THREE.PerspectiveCamera(35, 1, 0.5, 2000);
    this.orthoCam = new THREE.OrthographicCamera(-20, 20, 20, -20, -1000, 2000);
    this.camera = this.perspCam;
    this.perspCam.position.set(40, 34, 40);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.15;
    this.setLeftMouseOrbit(false);
    this.controls.addEventListener('change', () => (this.needsRender = true));

    // Materialien pro Voxel-Materialtyp
    this.materials = {
      diffuse: new THREE.MeshLambertMaterial({ vertexColors: true }),
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.35 }),
      emissive: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1, depthWrite: false }),
    };

    // Licht im Videospiel-Stil: Himmel/Boden-Ambient + harte Sonne mit Schatten
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.voxelGroup, this.lightGroup);

    // Raster wird scharf im Overlay gezeichnet (nicht verpixelt)
    this.grid = new THREE.GridHelper(64, 64, 0x6a6a8a, 0x3a3a50);
    this.grid.position.y = -0.5;
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.3;
    this.overlay.add(this.grid);

    // Schattenfänger: schreibt keine Tiefe → zählt im Pixel-Shader als Hintergrund
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.3, depthWrite: false }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.5;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Overlay: Auswahl, Cursor, Box-Vorschau (scharf, über dem Pixelbild)
    this.overlay.add(this.depthProxy);
    this.overlay.add(this.selectionGroup);
    this.hoverBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    this.hoverBox.visible = false;
    this.overlay.add(this.hoverBox);
    this.previewBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.35, depthTest: false }),
    );
    this.previewBox.visible = false;
    this.overlay.add(this.previewBox);

    this.applySettings(settings);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------- Lebenszyklus

  private loop = () => {
    if (this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.loop);
    this.controls.update();
    if (this.model && (this.model !== this.builtModel || this.model.version !== this.builtVersion)) this.rebuild();
    if (this.needsRender) {
      this.render();
      this.needsRender = false;
    }
  };

  requestRender(): void {
    this.needsRender = true;
  }

  /** Baut das Mesh sofort neu, falls sich das Modell geändert hat (z.B. vor Exporten). */
  flush(): void {
    if (this.model && (this.model !== this.builtModel || this.model.version !== this.builtVersion)) this.rebuild();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.pixelPass.dispose();
    this.clearGroup(this.voxelGroup);
    this.clearGroup(this.selectionGroup);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.updateCameraAspect(w, h);
    this.updatePixelTarget(w, h);
    this.needsRender = true;
  }

  private updateCameraAspect(w: number, h: number): void {
    const aspect = w / h;
    this.perspCam.aspect = aspect;
    this.perspCam.updateProjectionMatrix();
    const half = this.orthoHalf;
    this.orthoCam.left = -half * aspect;
    this.orthoCam.right = half * aspect;
    this.orthoCam.top = half;
    this.orthoCam.bottom = -half;
    this.orthoCam.updateProjectionMatrix();
  }

  private orthoHalf = 20;

  private updatePixelTarget(w: number, h: number): void {
    const pr = this.renderer.getPixelRatio();
    const scale = Math.max(1, this.settings.pixelScale) * pr;
    this.pixelPass.setSize(Math.round((w * pr) / scale), Math.round((h * pr) / scale));
  }

  // --------------------------------------------------------- Einstellungen

  applySettings(s: ViewportSettings): void {
    const pixelChanged = s.pixelScale !== this.settings.pixelScale;
    const aoChanged = s.ao !== this.settings.ao;
    this.settings = s;
    this.sun.color.set(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.hemi.color.set(s.ambientColor);
    this.hemi.groundColor.set(new THREE.Color(s.ambientColor).multiplyScalar(0.35));
    this.hemi.intensity = s.ambientIntensity;
    this.sun.castShadow = s.shadows;
    this.ground.visible = s.shadows;
    this.grid.visible = s.showGrid;
    this.pixelPass.applySettings(s, false);
    if (pixelChanged) this.resize();
    if (aoChanged) this.builtVersion = -1;
    this.needsRender = true;
  }

  /** Linke Maustaste dreht die Kamera (Kamera-Werkzeug) oder ist frei für Werkzeuge. */
  setLeftMouseOrbit(orbit: boolean): void {
    this.controls.mouseButtons = {
      LEFT: orbit ? THREE.MOUSE.ROTATE : (null as unknown as THREE.MOUSE),
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
  }

  // --------------------------------------------------------------- Modell

  setModel(model: VoxelModel): void {
    if (this.model !== model) {
      this.model = model;
      this.needsRender = true;
    }
  }

  private rebuild(): void {
    const model = this.model!;
    const firstBuild = this.builtModel === null;
    this.builtModel = model;
    this.builtVersion = model.version;
    this.depthProxy.clear();
    this.clearGroup(this.voxelGroup);
    this.clearGroup(this.lightGroup);
    const meshes = meshModel(model, { ao: this.settings.ao });
    for (const md of meshes) {
      const geo = toGeometry(md);
      const mesh = new THREE.Mesh(geo, this.materials[md.material]);
      mesh.castShadow = md.material !== 'glass';
      mesh.receiveShadow = md.material !== 'emissive';
      if (md.material === 'glass') mesh.renderOrder = 1;
      this.voxelGroup.add(mesh);
      const proxy = new THREE.Mesh(geo, this.depthMaterial);
      proxy.renderOrder = -1;
      this.depthProxy.add(proxy);
    }
    this.addEmissiveLights(model);
    this.fitShadowCamera(model);
    if (firstBuild) this.frameModel();
    this.needsRender = true;
  }

  /** Punktlichter an leuchtenden Ebenen (Feuer, Fenster, Kristalle). */
  private addEmissiveLights(model: VoxelModel): void {
    const groups = new Map<number, { x: number; y: number; z: number; r: number; g: number; b: number; n: number }>();
    for (const v of model.values()) {
      if (v.m !== 'emissive') continue;
      const layer = model.getLayer(v.l);
      if (layer && !layer.visible) continue;
      let g = groups.get(v.l);
      if (!g) groups.set(v.l, (g = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, n: 0 }));
      const c = new THREE.Color(model.palette[v.c]);
      g.x += v.x; g.y += v.y; g.z += v.z; g.r += c.r; g.g += c.g; g.b += c.b; g.n++;
    }
    [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 4).forEach((g) => {
      const light = new THREE.PointLight(new THREE.Color(g.r / g.n, g.g / g.n, g.b / g.n), Math.min(60, 4 + g.n * 0.8), 10 + Math.sqrt(g.n) * 3, 1.6);
      light.position.set(g.x / g.n, g.y / g.n + 0.5, g.z / g.n);
      this.lightGroup.add(light);
    });
  }

  private fitShadowCamera(model: VoxelModel): void {
    const b = model.bounds();
    const r = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) + 8 : 32;
    const cx = b ? (b.minX + b.maxX) / 2 : 0, cz = b ? (b.minZ + b.maxZ) / 2 : 0;
    this.sun.position.set(cx + r * 0.6, r * 1.4, cz + r * 0.9);
    this.sun.target.position.set(cx, 0, cz);
    const cam = this.sun.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.1; cam.far = r * 4;
    cam.updateProjectionMatrix();
    const gridSize = Math.max(24, Math.ceil((r + 8) / 2) * 2);
    if ((this.grid.geometry as THREE.BufferGeometry).userData.size !== gridSize) {
      this.grid.geometry.dispose();
      const g = new THREE.GridHelper(gridSize, gridSize, 0x6a6a8a, 0x3a3a50);
      this.grid.geometry = g.geometry;
      this.grid.geometry.userData.size = gridSize;
      // Raster an Voxelgrenzen ausrichten
      this.grid.position.x = Math.round(cx) + 0.5;
      this.grid.position.z = Math.round(cz) + 0.5;
    }
  }

  private clearGroup(g: THREE.Group): void {
    for (const c of [...g.children]) {
      g.remove(c);
      const m = c as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (c instanceof THREE.LineSegments || (m.material && !Object.values(this.materials ?? {}).includes(m.material as THREE.Material))) {
        (m.material as THREE.Material)?.dispose?.();
      }
    }
  }

  // --------------------------------------------------------------- Auswahl

  setSelection(model: VoxelModel, keys: Set<number>): void {
    const key = `${keys.size}:${model.version}:${keys.size < 4000 ? [...keys].slice(0, 50).join(',') : ''}`;
    if (key === this.selectionKey) return;
    this.selectionKey = key;
    this.clearGroup(this.selectionGroup);
    if (keys.size === 0) {
      this.needsRender = true;
      return;
    }
    const sel = new VoxelModel(['#ffffff']);
    for (const k of keys) {
      const [x, y, z] = unpackKey(k);
      if (model.hasKey(k)) sel.set(x, y, z, 0);
    }
    const [md] = meshModel(sel, { ao: false, visibleOnly: false });
    if (md) {
      const geo = toGeometry(md);
      const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.28, depthTest: false }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), new THREE.LineBasicMaterial({ color: 0xffe680, depthTest: false, transparent: true, opacity: 0.95 }));
      this.selectionGroup.add(fill, edges);
    }
    this.needsRender = true;
  }

  setHover(cell: Cell | null, color = 0xffffff): void {
    if (!cell) {
      if (this.hoverBox.visible) this.needsRender = true;
      this.hoverBox.visible = false;
      return;
    }
    this.hoverBox.visible = true;
    this.hoverBox.position.set(cell[0], cell[1], cell[2]);
    (this.hoverBox.material as THREE.LineBasicMaterial).color.setHex(color);
    this.needsRender = true;
  }

  setPreviewBox(a: Cell | null, b?: Cell, color = 0x66ccff): void {
    if (!a || !b) {
      if (this.previewBox.visible) this.needsRender = true;
      this.previewBox.visible = false;
      return;
    }
    const min = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
    const max = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    this.previewBox.visible = true;
    this.previewBox.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    this.previewBox.scale.set(max[0] - min[0] + 1.02, max[1] - min[1] + 1.02, max[2] - min[2] + 1.02);
    (this.previewBox.material as THREE.MeshBasicMaterial).color.setHex(color);
    this.needsRender = true;
  }

  // --------------------------------------------------------------- Picking

  private ndc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  }

  pick(clientX: number, clientY: number): PickResult | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const hits = this.raycaster.intersectObjects(this.voxelGroup.children, false);
    const hit = hits.find((h) => h.face);
    if (hit && hit.face) {
      const n = hit.face.normal;
      const p = hit.point;
      const voxel: Cell = [Math.round(p.x - n.x * 0.5), Math.round(p.y - n.y * 0.5), Math.round(p.z - n.z * 0.5)];
      return { voxel, adjacent: [voxel[0] + Math.round(n.x), voxel[1] + Math.round(n.y), voxel[2] + Math.round(n.z)], normal: [Math.round(n.x), Math.round(n.y), Math.round(n.z)] };
    }
    // Boden (y = -0.5) → Zelle auf Höhe 0
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5);
    const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, pt)) {
      return { voxel: null, adjacent: [Math.round(pt.x), 0, Math.round(pt.z)], normal: [0, 1, 0] };
    }
    return null;
  }

  /** Schnittpunkt mit einer achsenparallelen Ebene (für Verschieben/Box-Werkzeug). */
  pickPlane(clientX: number, clientY: number, axis: 'x' | 'y' | 'z', value: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const normal = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
    const plane = new THREE.Plane(normal, -value);
    const pt = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, pt) ? pt : null;
  }

  /** Achse, die am ehesten zur Kamera zeigt (für vertikale Verschiebeebenen). */
  dominantViewAxis(): 'x' | 'z' {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return Math.abs(d.x) > Math.abs(d.z) ? 'x' : 'z';
  }

  /** Alle Voxel, deren Mittelpunkt im Bildschirmrechteck liegt. */
  voxelsInRect(model: VoxelModel, x0: number, y0: number, x1: number, y1: number, visibleOnly = true): Set<number> {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const minX = Math.min(x0, x1) - rect.left, maxX = Math.max(x0, x1) - rect.left;
    const minY = Math.min(y0, y1) - rect.top, maxY = Math.max(y0, y1) - rect.top;
    const v = new THREE.Vector3();
    const out = new Set<number>();
    const hidden = new Set(model.layers.filter((l) => !l.visible || l.locked).map((l) => l.id));
    for (const [k, vox] of model.entries()) {
      if (visibleOnly && hidden.has(vox.l)) continue;
      v.set(vox.x, vox.y, vox.z).project(this.camera);
      const sx = ((v.x + 1) / 2) * rect.width, sy = ((1 - v.y) / 2) * rect.height;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) out.add(k);
    }
    return out;
  }

  // ---------------------------------------------------------------- Kamera

  setProjection(p: Projection): void {
    if (p === this.projection) return;
    const from = this.camera;
    const target = this.controls.target.clone();
    const dist = from.position.distanceTo(target);
    if (p === 'orthographic') {
      this.orthoCam.position.copy(from.position);
      this.orthoHalf = dist * Math.tan(THREE.MathUtils.degToRad(this.perspCam.fov / 2));
      this.orthoCam.zoom = 1;
      this.camera = this.orthoCam;
    } else {
      const d = this.orthoHalf / this.orthoCam.zoom / Math.tan(THREE.MathUtils.degToRad(this.perspCam.fov / 2));
      const dir = from.position.clone().sub(target).normalize();
      this.perspCam.position.copy(target).addScaledVector(dir, d);
      this.camera = this.perspCam;
    }
    this.projection = p;
    this.controls.object = this.camera;
    this.updateCameraAspect(this.container.clientWidth || 1, this.container.clientHeight || 1);
    this.camera.lookAt(target);
    this.controls.update();
    this.needsRender = true;
  }

  /** Setzt eine Standardansicht (Isometrisch, Vorne, Seite, Hinten, Oben). */
  setView(view: ViewPreset): void {
    const dirs: Record<ViewPreset, THREE.Vector3> = {
      iso: new THREE.Vector3(1, 1, 1),
      front: new THREE.Vector3(0, 0, 1),
      back: new THREE.Vector3(0, 0, -1),
      side: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 1, 0.0001),
    };
    if (view === 'iso') this.setProjection('orthographic');
    this.frameModel(dirs[view].normalize());
  }

  /** Richtet die Kamera so aus, dass das ganze Modell sichtbar ist. */
  frameModel(direction?: THREE.Vector3): void {
    const b = this.model?.bounds();
    const center = b ? new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2) : new THREE.Vector3(0, 8, 0);
    const radius = b ? Math.max(6, Math.hypot(b.maxX - b.minX + 1, b.maxY - b.minY + 1, b.maxZ - b.minZ + 1) / 2) : 16;
    const dir = direction ?? this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.lengthSq() < 0.01) dir.set(1, 0.8, 1).normalize();
    const dist = (radius * 1.15) / Math.tan(THREE.MathUtils.degToRad(this.perspCam.fov / 2));
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.orthoHalf = radius * 1.1;
    this.orthoCam.zoom = 1;
    this.updateCameraAspect(this.container.clientWidth || 1, this.container.clientHeight || 1);
    this.camera.lookAt(center);
    this.controls.update();
    this.needsRender = true;
  }

  // ------------------------------------------------------------- Rendering

  private render(): void {
    this.pixelPass.applySettings(this.settings, false);
    this.renderer.autoClear = true;
    this.pixelPass.render(this.renderer, this.scene, this.camera);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.overlay, this.camera);
    this.renderer.autoClear = true;
  }

  /**
   * Rendert ein Bild in beliebiger Größe (für PNG-Export & Sprite-Sheets).
   * @param cameraAngle optionale Drehung um die Hochachse (Radiant)
   */
  renderToCanvas(width: number, height: number, opts: { transparent?: boolean; cameraAngle?: number; showGrid?: boolean } = {}): HTMLCanvasElement {
    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);
    const prevRatio = this.renderer.getPixelRatio();
    const prevGrid = this.grid.visible;
    const prevGround = this.ground.visible;
    const prevPos = this.camera.position.clone();

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.updateCameraAspect(width, height);
    const scale = Math.max(1, this.settings.pixelScale);
    this.pixelPass.setSize(Math.round(width / scale), Math.round(height / scale));
    this.grid.visible = opts.showGrid ?? false;
    this.ground.visible = !opts.transparent && this.settings.shadows;
    if (opts.cameraAngle) {
      const t = this.controls.target;
      const off = this.camera.position.clone().sub(t);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), opts.cameraAngle);
      this.camera.position.copy(t).add(off);
      this.camera.lookAt(t);
    }
    this.pixelPass.applySettings(this.settings, !!opts.transparent);
    this.pixelPass.render(this.renderer, this.scene, this.camera);

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    out.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0);

    // Zustand wiederherstellen
    this.camera.position.copy(prevPos);
    this.camera.lookAt(this.controls.target);
    this.grid.visible = prevGrid;
    this.ground.visible = prevGround;
    this.renderer.setPixelRatio(prevRatio);
    this.renderer.setSize(prevSize.x, prevSize.y);
    this.resize();
    return out;
  }

  /** Alle Voxel-Meshes (für GLTF-Export). */
  buildExportGroup(model: VoxelModel): THREE.Group {
    const g = new THREE.Group();
    g.name = 'VoxelModel';
    for (const md of meshModel(model, { ao: false })) {
      const mat = this.materials[md.material].clone();
      const mesh = new THREE.Mesh(toGeometry(md), mat);
      mesh.name = `voxels_${md.material}`;
      g.add(mesh);
    }
    return g;
  }
}

/** MeshData → THREE.BufferGeometry (Farben von sRGB nach linear). */
export function toGeometry(md: MeshData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(md.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(md.normals, 3));
  const colors = new Float32Array(md.colors.length);
  const c = new THREE.Color();
  for (let i = 0; i < md.colors.length; i += 3) {
    c.setRGB(md.colors[i], md.colors[i + 1], md.colors[i + 2], THREE.SRGBColorSpace);
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(md.indices);
  geo.computeBoundingSphere();
  return geo;
}
