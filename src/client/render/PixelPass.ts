import * as THREE from 'three';
import type { RenderSettings } from '../../shared/palette/styles';

/**
 * Pixel-Art-Postprocessing.
 *
 * Die Szene wird in ein niedrig aufgelöstes Render-Target gezeichnet und
 * mit Nearest-Neighbor-Filterung hochskaliert (harte Pixel). Ein Shader
 * ergänzt anschließend:
 *  - Außenkontur (Outline) um das Modell
 *  - dunklere Innenkanten an Tiefensprüngen
 *  - Posterize (begrenzte Helligkeitsstufen)
 *  - optionale 4-Farben-Palette (Game Boy)
 *  - Hintergrundverlauf bzw. transparenten Hintergrund
 */
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  #include <packing>
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 texel;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform bool ortho;
  uniform bool outline;
  uniform vec3 outlineColor;
  uniform float posterize;
  uniform bool paletteLock;
  uniform vec3 lockColors[4];
  uniform vec3 bgTop;
  uniform vec3 bgBottom;
  uniform bool transparentBg;

  vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
  vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }

  float linearDepth(float d) {
    float vz = ortho ? orthographicDepthToViewZ(d, cameraNear, cameraFar) : perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    return -vz;
  }

  void main() {
    float d = texture2D(tDepth, vUv).x;
    bool bg = d >= 0.999999;
    vec2 offs[4];
    offs[0] = vec2(texel.x, 0.0); offs[1] = vec2(-texel.x, 0.0);
    offs[2] = vec2(0.0, texel.y); offs[3] = vec2(0.0, -texel.y);

    if (bg) {
      bool edge = false;
      for (int i = 0; i < 4; i++) {
        if (texture2D(tDepth, vUv + offs[i]).x < 0.999999) edge = true;
      }
      // Schattenfänger (Boden) hat Alpha < 1 → über den Hintergrund legen
      vec4 sh = texture2D(tColor, vUv);
      if (outline && edge) {
        gl_FragColor = vec4(outlineColor, 1.0);
      } else if (transparentBg) {
        gl_FragColor = vec4(sh.rgb, sh.a);
      } else {
        gl_FragColor = vec4(mix(bgBottom, bgTop, vUv.y) * (1.0 - sh.a) + sh.rgb, 1.0);
      }
      #include <colorspace_fragment>
      return;
    }

    vec4 c = texture2D(tColor, vUv);
    vec3 col = c.rgb;

    if (outline) {
      float z = linearDepth(d);
      float maxDiff = 0.0;
      for (int i = 0; i < 4; i++) {
        float dn = texture2D(tDepth, vUv + offs[i]).x;
        if (dn < 0.999999) {
          float zn = linearDepth(dn);
          maxDiff = max(maxDiff, z - zn);
        }
      }
      // Pixel liegt hinter einer Kante → Innenkontur abdunkeln
      if (maxDiff > max(0.9, z * 0.02)) col *= 0.55;
    }

    vec3 s = toSrgb(clamp(col, 0.0, 1.0));
    if (posterize > 0.5) s = floor(s * posterize + 0.5) / posterize;
    if (paletteLock) {
      float lum = dot(s, vec3(0.299, 0.587, 0.114));
      int idx = int(clamp(floor(lum * 4.2), 0.0, 3.0));
      vec3 pc = lockColors[0];
      if (idx == 1) pc = lockColors[1];
      if (idx == 2) pc = lockColors[2];
      if (idx == 3) pc = lockColors[3];
      gl_FragColor = vec4(pc, 1.0);
    } else {
      gl_FragColor = vec4(toLin(s), 1.0);
    }
    #include <colorspace_fragment>
  }
`;

export class PixelPass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.target.depthTexture.type = THREE.UnsignedIntType;
    this.target.depthTexture.minFilter = THREE.NearestFilter;
    this.target.depthTexture.magFilter = THREE.NearestFilter;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
        ortho: { value: false },
        outline: { value: true },
        outlineColor: { value: new THREE.Color('#000000') },
        posterize: { value: 0 },
        paletteLock: { value: false },
        lockColors: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
        bgTop: { value: new THREE.Color('#333') },
        bgBottom: { value: new THREE.Color('#111') },
        transparentBg: { value: false },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(width: number, height: number): void {
    this.target.setSize(Math.max(1, width), Math.max(1, height));
    this.material.uniforms.texel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  applySettings(s: RenderSettings, transparent: boolean): void {
    const u = this.material.uniforms;
    u.outline.value = s.outline;
    u.outlineColor.value.set(s.outlineColor);
    u.posterize.value = s.posterize;
    u.paletteLock.value = !!s.paletteLock;
    if (s.paletteLock) s.paletteLock.forEach((c, i) => (u.lockColors.value[i] as THREE.Color).set(c));
    u.bgTop.value.set(s.bgTop);
    u.bgBottom.value.set(s.bgBottom);
    u.transparentBg.value = transparent;
  }

  /** Rendert die Szene pixelig und zeichnet das Ergebnis ins aktuelle Ziel. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const cam = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const u = this.material.uniforms;
    u.cameraNear.value = cam.near;
    u.cameraFar.value = cam.far;
    u.ortho.value = (cam as THREE.OrthographicCamera).isOrthographicCamera === true;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevTarget);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
