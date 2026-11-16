/* Deluxe showroom, variant B (spotlit): the real pack as a true 3D object floating on a dark showroom floor.

   <div class="showroom" data-showroom data-shape="pouch|stick" data-layout="feature|card"
        data-front="...webp" data-back="...webp" data-label="Deluxe 30 Pack"></div>
   <script type="module" src="showroom.js"></script>   (plus showroom.css; no import map needed)

   Every [data-showroom] mounts itself. window.DeluxeShowroom = { mount(el) };
   el.showroom = { set({ front, back, label, shape }), turn(dir), dispose() }.

   Three ways to turn it, always on: page scroll (never touches the wheel event), drag with inertia, arrow buttons / Left Right keys.
   One WebGL context for the whole page: a single hidden renderer draws each on-screen showroom and the frame is
   copied into that showroom's own 2D canvas. Without WebGL (or after a lost context) the front art shows as a plain
   image on the same stage and the arrows swap front and back.

   Test switches in the page URL: ?showroom-selftest  ?showroom-nogl  ?showroom-reduce (acts as prefers-reduced-motion). */

const THREE_URL = new URL('../vendor/three/three.module.min.js', import.meta.url).href; // if this file moves, fix this path
const FLAGS = location.search;
const SELFTEST = FLAGS.includes('showroom-selftest');
const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => reduceQuery.matches || FLAGS.includes('showroom-reduce');

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// selftest only: count every WebGL context the page really creates
const contexts = [];
if (SELFTEST) {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && /webgl/.test(type) && !contexts.includes(ctx)) contexts.push(ctx);
    return ctx;
  };
  window.__showroomGL = contexts;
}

/* ---------- the pack: a sealed pillow grown from the art's own alpha ---------- */

// seals and crimps are fractions of the art's opaque box; depth is half the thickness as a fraction of its width;
// press is how hard the fill pushes at v (0 top, 1 bottom)
const SHAPES = {
  pouch: { side: 0.05, top: 0.17, bottom: 0.012, depth: 0.105, press: (v) => 0.12 + 0.88 * ease(0.05, 0.85, v) },
  stick: { side: 0, top: 0.1, bottom: 0.1, depth: 0.17, press: () => 1 },
};
const BOX = { pouch: { w: 0.91, h: 0.92 }, stick: { w: 0.36, h: 0.945 } }; // opaque box in pack heights, until the art has loaded
const ROWS = 112; // grid rows per sheet
// The cutouts' alpha is lossy: 0.94 to 0.99 inside the pack, in blotches. Everything from SOLID up counts as fully opaque.
const CLEAR = 0.06, SOLID = 0.8;

function alphaOf(img, w, h, dx, dy, dw, dh) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, dx, dy, dw, dh);
  const px = x.getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] / 255;
  return a;
}

function boxBlur(a, w, h, r, passes) {
  const b = new Float32Array(a.length), n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[y * w + Math.min(w - 1, Math.max(0, x + k))];
      b[y * w + x] = sum / n;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += b[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      a[y * w + x] = sum / n;
    }
  }
  return a;
}

// One face of the pack: a grid over the art, pushed out like a filled pouch. Flat where the film is sealed
// (edges, the header above the zip, the stick's crimps), fullest where the product settles.
function buildSheet(THREE, img, shape) {
  const S = SHAPES[shape] || SHAPES.pouch;
  const aspect = img.naturalWidth / img.naturalHeight;
  const ny = ROWS, nx = Math.max(8, Math.round(ny * aspect));
  const W = nx + 1, H = ny + 1;
  const alpha = alphaOf(img, W, H, 0.5, 0.5, nx, ny); // pixel centres sit on the grid's vertices
  const inside = (i) => alpha[i] > 0.5;

  // distance to the silhouette, in cells (two pass chamfer)
  const d = new Float32Array(W * H);
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!inside(i)) continue;
    d[i] = 1e6;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (d[i]) d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (d[i]) d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
  }

  // inflate: a membrane under pressure (Poisson), pinned to zero along every seal
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const free = new Uint8Array(W * H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    free[i] = d[i] > Math.max(1, S.side * bw) && y - y0 > S.top * bh && y1 - y > S.bottom * bh ? 1 : 0;
  }
  const h = new Float32Array(W * H);
  for (let it = 0; it < 240; it++) {
    for (let y = y0 + 1; y < y1; y++) {
      const p = S.press((y - y0) / bh);
      for (let x = x0 + 1; x < x1; x++) {
        const i = y * W + x;
        if (free[i]) h[i] += 1.9 * ((h[i - 1] + h[i + 1] + h[i - W] + h[i + W] + p) * 0.25 - h[i]);
      }
    }
  }
  boxBlur(h, W, H, 1, 2); // rounds the fold where the fill meets a seal
  let top = 1e-6;
  for (let i = 0; i < h.length; i++) { if (!inside(i)) h[i] = 0; top = Math.max(top, h[i]); }
  const depth = S.depth * (bw / nx) * aspect; // world units: the pack is 1 tall, aspect wide
  const k = depth / top;

  const pos = new Float32Array(W * H * 3), uv = new Float32Array(W * H * 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    pos[i * 3] = (x / nx - 0.5) * aspect;
    pos[i * 3 + 1] = 0.5 - y / ny;
    pos[i * 3 + 2] = h[i] * k;
    uv[i * 2] = x / nx;
    uv[i * 2 + 1] = 1 - y / ny;
  }
  const index = new Uint32Array(nx * ny * 6);
  let n = 0;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const a = y * W + x, b = a + 1, c = a + W, e = c + 1;
    index[n++] = a; index[n++] = c; index[n++] = b;
    index[n++] = b; index[n++] = c; index[n++] = e;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  return { geo, depth, box: { w: (bw / nx) * aspect, h: bh / ny } };
}

// blurred alpha: 0.5 on the silhouette rising to 1 a few pixels inside, used to draw the lit edge of the film
function edgeTexture(THREE, img) {
  const w = Math.round(img.naturalWidth / 2), h = Math.round(img.naturalHeight / 2);
  const a = alphaOf(img, w, h, 0, 0, w, h);
  for (let i = 0; i < a.length; i++) a[i] = clamp01((a[i] - CLEAR) / (SOLID - CLEAR)); // or the blotches inside would light up as edges
  boxBlur(a, w, h, 2, 3);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const im = x.createImageData(w, h);
  for (let i = 0; i < a.length; i++) { im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = a[i] * 255; im.data[i * 4 + 3] = 255; }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

async function loadFace(G, url, shape) {
  const { THREE } = G;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const map = new THREE.Texture(img);
  map.colorSpace = THREE.SRGBColorSpace; // the art is sRGB; the GPU decodes it, the shader lights it in linear, output is sRGB again
  map.anisotropy = G.renderer.capabilities.getMaxAnisotropy();
  map.needsUpdate = true;
  return { map, edge: edgeTexture(THREE, img), ...buildSheet(THREE, img, shape) };
}

/* ---------- shaders ---------- */

const HASH = 'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }';

// the whole room in one pass: graphite stage, the spot's beam in the air, its pool on a glossy floor, the pack's contact shadow
const STAGE_VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const STAGE_FRAG = `
uniform vec4 uFrame;   // world rectangle the canvas shows on the plane z = 0: x, y, width, height
uniform vec3 uStage;   // stage colour, linear
uniform float uR;      // radius of the pool of light on the floor
uniform float uApex;   // height of the lamp
uniform float uGlowY;
uniform vec4 uShadow;  // cos, sin of the pack's turn, then its half width and half depth
uniform float uShadowK;
varying vec2 vUv;
${HASH}
// light caught by the air inside the spot's cone, along a ray from o towards d, no further than tMax
float beam(vec3 o, vec3 d, float tMax) {
  float k = uR / uApex, k2 = k * k;
  vec3 p = o - vec3(0.0, uApex, 0.0);
  float A = d.x * d.x + d.z * d.z - k2 * d.y * d.y;
  float B = 2.0 * (p.x * d.x + p.z * d.z - k2 * p.y * d.y);
  float C = p.x * p.x + p.z * p.z - k2 * p.y * p.y;
  float disc = B * B - 4.0 * A * C;
  if (disc <= 0.0 || A <= 0.0) return 0.0;
  float s = sqrt(disc);
  float t0 = max((-B - s) / (2.0 * A), 0.0), t1 = min((-B + s) / (2.0 * A), tMax);
  if (t1 <= t0) return 0.0;
  float ym = p.y + d.y * 0.5 * (t0 + t1);
  if (ym >= 0.0) return 0.0;                       // that is the mirror cone above the lamp
  float rad = -ym * k;
  float chord = (t1 - t0) / (2.0 * rad);
  return pow(min(chord, 1.0), 1.3) * min(uR / rad, 2.6);
}
void main() {
  vec3 w = vec3(uFrame.xy + vUv * uFrame.zw, 0.0);
  vec3 d = normalize(w - cameraPosition);
  vec3 col = uStage; // solid black stage: no spotlight, no pool of light, no floor (client direction)
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither: dark gradients band without it
}`;

const PACK_VERT = `
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
// The art is the colour, shown at full strength. On top: a broad sheen from the overhead spot, two strip lights behind
// left and right that rake the foil as it turns, and a lit line along the film's own edge.
const PACK_FRAG = `
uniform sampler2D uMap; uniform sampler2D uEdge;
uniform float uBias;     // mip bias: a touch sharper for the pack, soft for its reflection
uniform float uMirror;   // 1 for the pack, -1 for its image in the floor
uniform float uReflect;  // strength of that image; 0 for the pack itself
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${HASH}
const vec3 KEY = vec3(0.0, 0.8, 0.6);
const vec3 RIM_L = vec3(-0.921, 0.22, -0.32);
const vec3 RIM_R = vec3(0.921, 0.22, -0.32);
void main() {
  vec4 t = texture2D(uMap, vUv, uBias);
  float a = smoothstep(${CLEAR}, ${SOLID}, t.a);
  if (a < 0.004) discard;
  vec3 flip = vec3(1.0, uMirror, 1.0);
  vec3 N = normalize(vN) * flip;
  vec3 P = vP * flip;
  vec3 V = normalize(cameraPosition * flip - P);
  float nv = max(dot(N, V), 0.0);
  float kd = dot(N, KEY) * 0.5 + 0.5;
  // the floor of 0.004 evens out compression grain in the art's blacks, which any light on the foil would otherwise show up
  vec3 col = max(t.rgb, vec3(0.004)) * mix(0.55, 1.08, smoothstep(0.1, 0.8, kd));
  float sheen = pow(max(dot(N, normalize(KEY + V)), 0.0), 20.0);
  float stripL = pow(max(dot(N, normalize(RIM_L + V)), 0.0), 70.0);
  float stripR = pow(max(dot(N, normalize(RIM_R + V)), 0.0), 70.0);
  float wrap = pow(max(dot(N, RIM_L), 0.0), 2.0) + pow(max(dot(N, RIM_R), 0.0), 2.0);
  float fres = pow(1.0 - nv, 3.0);
  // foil is not a smooth mirror: it catches light along the creases already in the art, so the highlights follow them
  float foil = 0.55 + 1.3 * smoothstep(0.0, 0.5, dot(t.rgb, vec3(0.2126, 0.7152, 0.0722)));
  float bounce = max(-N.y, 0.0);                           // light coming back up off the bright floor, on the underside only
  col += foil * (0.04 * sheen + 0.2 * (stripL + stripR) + 0.03 * wrap + 0.2 * fres * wrap + 0.12 * bounce * bounce) + 0.05 * fres;
  // the film's own edge catching the light: bright along the top and both sides, where the spot and the rim lights
  // reach it, faint underneath. uEdge is the blurred alpha, so its slope points in from the silhouette.
  float e = texture2D(uEdge, vUv).r;
  vec2 px = vec2(0.006, 0.0);
  vec2 inward = vec2(texture2D(uEdge, vUv + px.xy).r - texture2D(uEdge, vUv - px.xy).r, texture2D(uEdge, vUv + px.yx).r - texture2D(uEdge, vUv - px.yx).r);
  float up = -inward.y / (length(inward) + 1e-4);
  col += (0.3 + 0.6 * smoothstep(-0.7, 0.1, up)) * pow(clamp((1.0 - e) * 2.0, 0.0, 1.0), 1.6);
  if (uReflect > 0.0) a *= uReflect * (1.0 - smoothstep(0.0, 0.32, P.y));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
}`;

/* ---------- the one shared renderer ---------- */

let glPromise = null; // resolves to the shared GL state, or null when WebGL is not to be had
const instances = new Set();
let raf = 0, last = 0;

function initGL() {
  return (glPromise ??= (async () => {
    try {
      if (FLAGS.includes('showroom-nogl')) return null;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!context) return null;
      const THREE = await import(THREE_URL);
      const renderer = new THREE.WebGLRenderer({ canvas, context });
      renderer.setPixelRatio(1); // each showroom sizes its own canvas in device pixels
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping; // tone mapping greys the white logo; the art goes out as drawn
      renderer.setScissorTest(true);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
      const stage = new THREE.ShaderMaterial({
        vertexShader: STAGE_VERT, fragmentShader: STAGE_FRAG, depthTest: false, depthWrite: false,
        uniforms: {
          uFrame: { value: new THREE.Vector4() }, uStage: { value: new THREE.Color() }, uR: { value: 1 }, uApex: { value: 3 },
          uGlowY: { value: 0.6 }, uShadow: { value: new THREE.Vector4() }, uShadowK: { value: 0.8 },
        },
      });
      const room = new THREE.Mesh(tri, stage);
      room.frustumCulled = false;
      scene.add(room);
      const G = { THREE, renderer, scene, camera, stage, faces: new Map(), shown: null, bufW: 1, bufH: 1, dead: false };
      canvas.addEventListener('webglcontextlost', () => { // no restore: the flat image is a fine place to stay
        G.dead = true;
        instances.forEach((s) => s.flat());
      });
      return G;
    } catch (err) {
      console.warn('showroom: no WebGL, showing flat images', err);
      return null;
    }
  })());
}

// faces are cached per art file and shape, and freed when the last showroom using them lets go
function acquireFace(G, url, shape) {
  const key = `${shape}|${url}`;
  let entry = G.faces.get(key);
  if (!entry) G.faces.set(key, (entry = { refs: 0, promise: loadFace(G, url, shape) }));
  entry.refs++;
  return entry.promise;
}
function releaseFace(G, url, shape) {
  const key = `${shape}|${url}`;
  const entry = G.faces.get(key);
  if (!entry || --entry.refs > 0) return;
  G.faces.delete(key);
  entry.promise.then((f) => { f.map.dispose(); f.edge.dispose(); f.geo.dispose(); }, () => {});
}

function frame(now) {
  raf = 0;
  const dt = Math.min(1, (now - last) / 1000) || 0;
  last = now;
  let live = false;
  for (const s of instances) if (s.visible) { s.tick(dt, now); live = true; }
  if (live && !document.hidden) raf = requestAnimationFrame(frame);
}
const wake = () => { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
document.addEventListener('visibilitychange', wake);

/* ---------- one showroom ---------- */

const FLOAT = 0.05;   // gap under the art, in pack heights
const FOV = 22, ELEV = 16; // lens, and how far above the floor the camera looks down from, degrees
const chevron = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

function mount(el) {
  if (el.showroom) return el.showroom;
  const layout = el.dataset.layout === 'feature' ? 'feature' : 'card';
  el.classList.add('showroom', `showroom--${layout}`);
  el.dataset.mode = 'flat';
  el.innerHTML = `
    <div class="showroom__pin">
      <div class="showroom__stage" tabindex="0" role="group" aria-roledescription="product viewer">
        <canvas class="showroom__canvas" aria-hidden="true"></canvas>
        <img class="showroom__flat" alt="" decoding="async" draggable="false">
      </div>
      <button class="showroom__arrow showroom__arrow--prev" type="button" aria-label="Turn left">${chevron('M15 5l-7 7 7 7')}</button>
      <button class="showroom__arrow showroom__arrow--next" type="button" aria-label="Turn right">${chevron('M9 5l7 7-7 7')}</button>
      <p class="showroom__meta"><span class="showroom__label"></span><span class="showroom__side" data-side aria-live="polite">Front</span></p>
      <button class="showroom__zoom" type="button" aria-pressed="false" aria-label="Magnify the label">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20M10.5 8v5M8 10.5h5"/></svg>
      </button>
    </div>`;
  const pin = el.querySelector('.showroom__pin');
  const stage = el.querySelector('.showroom__stage');
  const canvas = el.querySelector('canvas');
  const flatImg = el.querySelector('.showroom__flat');
  const side = el.querySelector('[data-side]');
  const labelEl = el.querySelector('.showroom__label');
  const ctx = canvas.getContext('2d', { alpha: false });
  const gone = new AbortController(), on = { signal: gone.signal };

  const s = {
    front: '', back: '', label: '', shape: 'pouch',
    u: 0, vel: 0, goal: null,     // the visitor's own turn (radians), its spin, and where an arrow press is taking it
    scroll: 0, scrollNow: 0,      // the turn the page scroll asks for, and the eased value drawn
    visible: false, cssW: 0, cssH: 0, bg: '#0c0c0d', pinTop: 0, F: 1.6, rise: 0.565, box: BOX.pouch,
    pack: null, G: null, sig: '', frames: 0, phase: Math.random() * 20, drag: null, gen: 0, disposed: false,
    roll: 0, packScale: 1,        // the stick lies flat when its back faces us (its label runs along its length)
    zoom: false, lensAt: null, lensImg: {},
  };

  // the side named is where the pack is heading, so an arrow press reads out its destination at once
  const facing = () => (Math.cos(s.scroll + (s.goal ?? s.u)) >= 0 ? 'Front' : 'Back');
  const showSide = () => {
    const name = facing();
    if (side.textContent !== name) side.textContent = name;
    if (el.dataset.facing !== name) el.dataset.facing = name; // the flat fallback lays the stick down from this too
    const src = name === 'Front' ? s.front : s.back;
    if (el.dataset.mode === 'flat' && src && flatImg.getAttribute('src') !== src) {
      flatImg.src = src;
      flatImg.alt = name === 'Front' ? s.label : `${s.label}, back`;
    }
  };

  // dir +1 turns the way a drag to the right does. In the feature it lands square on a face wherever the scroll has
  // the pack; in a card it flips the pack and leaves the scroll's small glance alone.
  const turn = (dir) => {
    const base = layout === 'feature' ? s.scroll : 0;
    s.goal = (Math.round((base + (s.goal ?? s.u)) / Math.PI) + Math.sign(dir || 1)) * Math.PI - base;
    s.vel = 0;
    if (still() || el.dataset.mode === 'flat') { s.u = s.goal; s.goal = null; }
    showSide();
    wake();
  };

  /* scroll: how far the page has carried this showroom, turned into an angle.
     OFF unless the element says data-scroll="on": the client found the pack turning with the page
     "weird to have them attached" (2026-11-16). The pack now turns only by drag, arrows or keys. */
  const measure = () => {
    if (still() || el.dataset.scroll !== 'on') { s.scroll = 0; return; }
    const r = el.getBoundingClientRect();
    if (layout === 'feature') {
      const track = r.height - pin.offsetHeight;
      const p = track > 0 ? clamp01((s.pinTop - r.top) / track) : 0;
      s.scroll = Math.PI * (ease(0.04, 0.47, p) + ease(0.53, 0.96, p)); // front, side, back (a pause to read it), side, front
    } else {
      const p = clamp01((innerHeight - r.top) / (innerHeight + r.height));
      s.scroll = (p - 0.5) * 0.9; // a gentle quarter-glance either way as the card passes
    }
  };

  /* size: canvas in device pixels (ratio capped at 2), and how big the pack sits in it */
  const fit = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    s.cssW = w; s.cssH = h;
    const cs = getComputedStyle(pin);
    s.bg = cs.backgroundColor; s.pinTop = parseFloat(cs.top) || 0;
    const scale = Math.min(Math.min(devicePixelRatio || 1, 2), Math.sqrt(4e6 / (w * h))); // and never more than 4 megapixels
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const room = Math.max(0.5, Math.min(0.72, 1 - 128 / w)); // leave the arrows clear either side
    const tall = s.box.h / 0.575; // the pack takes 57.5% of the height, unless the stage is too narrow for that
    s.F = Math.max(tall, s.box.w / (room * (w / h))); // height of the view in pack heights
    s.rise = 0.565 - 0.07 * clamp01(s.F / tall - 1); // where the pack's middle sits, measured up from the bottom; lower on tall phone stages
    el.style.setProperty('--pack-h', `${h / s.F}px`);
    el.style.setProperty('--pack-y', `${(1 - s.rise) * 100}%`);
    el.style.setProperty('--pack-w', `${(s.box.w * h) / s.F}px`);
    s.sig = '';
    draw(performance.now()); // resizing clears a canvas: repaint before the browser shows it
    wake();
  };

  /* drag: pointer events; touch-action: pan-y in the CSS leaves vertical swipes to the page */
  stage.addEventListener('pointerdown', (e) => {
    if (s.zoom) return; // while the magnifier is on, the pointer moves the lens, not the pack
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { stage.setPointerCapture(e.pointerId); } catch { /* a scripted event has no live pointer to capture */ }
    s.drag = { x: e.clientX, t: e.timeStamp, v: 0 };
    s.goal = null; s.vel = 0;
    el.classList.add('is-dragging');
  }, on);
  stage.addEventListener('pointermove', (e) => {
    if (!s.drag) return;
    const k = Math.PI / Math.min(460, Math.max(200, s.cssW * 0.5)); // half the stage, or about a hand's travel, is a half turn
    const dx = e.clientX - s.drag.x, dt = Math.max(1, e.timeStamp - s.drag.t);
    s.u += dx * k;
    s.drag.v = 0.6 * s.drag.v + 0.4 * ((dx * k) / dt) * 1000; // radians a second
    s.drag.x = e.clientX; s.drag.t = e.timeStamp;
    showSide();
    wake();
  }, on);
  const release = (e) => {
    if (!s.drag) return;
    s.vel = !still() && e.timeStamp - s.drag.t < 90 ? Math.max(-14, Math.min(14, s.drag.v)) : 0;
    s.drag = null;
    el.classList.remove('is-dragging');
    wake();
  };
  stage.addEventListener('pointerup', release, on);
  stage.addEventListener('pointercancel', release, on);

  el.querySelector('.showroom__arrow--prev').addEventListener('click', () => turn(-1), on);
  el.querySelector('.showroom__arrow--next').addEventListener('click', () => turn(1), on);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && s.zoom) { setZoom(false); return; }
    const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    turn(dir);
  }, on);

  /* magnifier: a lens that follows the pointer and shows the real label art enlarged.
     It draws from the art file itself (not the 3D frame), so it is as sharp as the source render allows. */
  const zoomBtn = el.querySelector('.showroom__zoom');
  let lens = null, lctx = null; // made on first use, on <body> and fixed: no header or stage edge can cover or clip it
  const hideLens = () => { s.lensAt = null; if (lens) lens.hidden = true; };
  const LENS = 250, MAG = 3.2;
  const art = (src) => {
    let im = s.lensImg[src];
    if (!im) { im = s.lensImg[src] = new Image(); im.decoding = 'async'; im.onload = () => paintLens(); im.src = src; }
    return im;
  };
  const paintLens = () => {
    const p = s.lensAt;
    if (!p || !s.zoom || !lens) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (lens.width !== LENS * dpr) lens.width = lens.height = LENS * dpr;
    const im = art(facing() === 'Front' ? s.front : s.back);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.fillStyle = s.bg;
    lctx.fillRect(0, 0, LENS, LENS);
    if (im.complete && im.naturalWidth) {
      // where the art sits on the stage: centred, one pack-height tall (the same box the flat fallback uses)
      const H = (s.cssH / s.F) * s.packScale, W = (H * im.naturalWidth) / im.naturalHeight;
      const cx = s.cssW / 2, cy = (1 - s.rise) * s.cssH;
      lctx.translate(LENS / 2 + MAG * (cx - p.x), LENS / 2 + MAG * (cy - p.y));
      lctx.rotate(-s.roll); // canvas angles run clockwise, the scene's run the other way
      lctx.scale(MAG, MAG);
      lctx.imageSmoothingQuality = 'high';
      lctx.drawImage(im, -W / 2, -H / 2, W, H);
    }
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.strokeStyle = 'rgba(255,255,255,.85)';
    lctx.lineWidth = 2;
    const C = 22, a = 1, b = LENS - 1; // the frame follows the chamfered corners the CSS clips
    lctx.beginPath();
    lctx.moveTo(C, a); lctx.lineTo(b, a); lctx.lineTo(b, b - C); lctx.lineTo(b - C, b); lctx.lineTo(a, b); lctx.lineTo(a, C);
    lctx.closePath();
    lctx.stroke();
    const keep = (v, max) => Math.max(4, Math.min(max - LENS - 4, v));
    lens.style.left = `${keep(p.cx - LENS / 2, innerWidth)}px`;
    lens.style.top = `${keep(p.cy - LENS / 2 - (p.touch ? LENS * 0.62 : 0), innerHeight)}px`; // above a finger, centred on a mouse
    lens.hidden = false;
  };
  const setZoom = (want) => {
    s.zoom = !!want;
    el.classList.toggle('is-zooming', s.zoom);
    zoomBtn.setAttribute('aria-pressed', String(s.zoom));
    zoomBtn.setAttribute('aria-label', s.zoom ? 'Close the magnifier' : 'Magnify the label');
    if (s.zoom && !lens) {
      lens = document.createElement('canvas');
      lens.className = 'showroom__lens';
      lens.hidden = true;
      lens.setAttribute('aria-hidden', 'true');
      document.body.appendChild(lens);
      lctx = lens.getContext('2d');
    }
    if (s.zoom) { // square the pack up to the face it is showing and hold it still
      s.vel = 0;
      s.goal = Math.round((s.goal ?? s.u) / Math.PI) * Math.PI;
      if (still() || el.dataset.mode === 'flat') { s.u = s.goal; s.goal = null; }
    } else hideLens();
    s.sig = '';
    showSide();
    wake();
  };
  const lensMove = (e) => {
    if (!s.zoom) return;
    const r = stage.getBoundingClientRect();
    s.lensAt = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY, touch: e.pointerType !== 'mouse' };
    paintLens();
  };
  zoomBtn.addEventListener('click', () => setZoom(!s.zoom), on);
  stage.addEventListener('pointermove', lensMove, on);
  stage.addEventListener('pointerdown', lensMove, on);
  // a mouse that leaves takes the lens with it; a lifted finger leaves the lens where it was, to be read
  stage.addEventListener('pointerleave', (e) => { if (s.zoom && e.pointerType === 'mouse') hideLens(); }, on);
  addEventListener('scroll', hideLens, { passive: true, signal: gone.signal }); // the page moved under a fixed lens

  /* drawing */
  s.flat = () => { el.dataset.mode = 'flat'; s.u = Math.round(s.u / Math.PI) * Math.PI; s.goal = null; s.vel = 0; showSide(); };

  const draw = (now) => {
    const G = s.G, w = canvas.width, h = canvas.height;
    if (!G || G.dead || !s.pack || !s.cssW) return;
    const idle = still() || s.zoom ? 0 : 1; // the pack holds still under the magnifier
    const t = now / 1000 + s.phase;
    const bob = idle * Math.sin(t * 1.1) * 0.013;
    const angle = s.scrollNow + s.u + idle * Math.sin(t * 0.63) * 0.03;
    // The stick's back label is printed along its length. As the back comes round, lay the stick on its
    // side (a quarter turn clockwise) so the label reads left to right, and shrink it to fit the stage width.
    const lay = s.shape === 'stick' ? (1 - Math.cos(angle)) / 2 : 0; // 0 facing front, 1 facing back
    s.roll = (-lay * Math.PI) / 2;
    // lying flat, its length must fit between the arrows, which the CSS parks at the stage edges (8 + 48 + 12 each side)
    s.packScale = 1 - lay * (1 - Math.min(1.3, (s.cssW - 136) / ((s.cssH / s.F) * s.box.h)));
    const sig = `${w}x${h}|${angle.toFixed(4)}|${bob.toFixed(4)}`;
    if (sig === s.sig) return; // nothing moved: keep the frame already on the canvas
    s.sig = sig;
    s.frames++;

    const { THREE, renderer, camera, stage: room } = G;
    // camera: level, raised, with the lens shifted down, so the pack stays square-on while the floor falls away below it
    const F = s.F, Fw = (F * w) / h;
    const cy = FLOAT + 0.5, ymin = cy - s.rise * F, xmin = -Fw / 2;
    const D = F / (2 * Math.tan((FOV * Math.PI) / 360));
    const camY = D * Math.tan((ELEV * Math.PI) / 180);
    const near = 0.5, k = near / D;
    camera.position.set(0, camY, D);
    camera.updateMatrixWorld();
    camera.projectionMatrix.makePerspective(xmin * k, (xmin + Fw) * k, (ymin + F - camY) * k, (ymin - camY) * k, near, 60);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    const { pivot, mirror, roller, depth } = s.pack;
    roller.position.y = mirror.position.y = cy + bob;
    pivot.rotation.y = mirror.rotation.y = angle;
    roller.rotation.z = s.roll;
    roller.scale.setScalar(s.packScale);
    if (s.zoom && s.lensAt) paintLens(); // keep the lens true while the pack settles
    if (G.shown !== s.pack) { if (G.shown) G.shown.root.visible = false; s.pack.root.visible = true; G.shown = s.pack; }

    const U = room.uniforms;
    U.uFrame.value.set(xmin, ymin, Fw, F);
    U.uStage.value.setStyle(s.bg);
    U.uR.value = Math.min(0.88, Fw * 0.49);
    U.uApex.value = Math.max(2.6, ymin + F + 0.5); // the lamp stays out of shot
    U.uGlowY.value = cy;
    U.uShadow.value.set(Math.cos(angle), Math.sin(angle), s.box.w * 0.47, depth * 0.8);
    U.uShadowK.value = 0.78 - bob * 6;

    if (w > G.bufW || h > G.bufH) { G.bufW = Math.max(G.bufW, w); G.bufH = Math.max(G.bufH, h); renderer.setSize(G.bufW, G.bufH, false); }
    renderer.setViewport(0, 0, w, h);
    renderer.setScissor(0, 0, w, h);
    renderer.render(G.scene, camera);
    ctx.drawImage(renderer.domElement, 0, G.bufH - h, w, h, 0, 0, w, h); // same task as the render, so the buffer is still there
    if (el.dataset.mode !== 'gl') el.dataset.mode = 'gl';
  };

  s.tick = (dt, now) => {
    measure();
    if (s.goal !== null) {
      s.u += (s.goal - s.u) * (1 - Math.exp(-dt * 7));
      if (Math.abs(s.goal - s.u) < 0.0008) { s.u = s.goal; s.goal = null; }
    } else if (!s.drag && s.vel) {
      s.u += s.vel * Math.min(dt, 0.05);
      s.vel *= Math.exp(-dt * 2.4);
      if (Math.abs(s.vel) < 0.02) s.vel = 0;
    }
    s.scrollNow += (s.scroll - s.scrollNow) * (1 - Math.exp(-dt * 9));
    if (Math.abs(s.scroll - s.scrollNow) < 0.0004) s.scrollNow = s.scroll;
    showSide();
    draw(now);
  };

  /* the 3D pack for the current art */
  const dropPack = () => {
    if (!s.pack) return;
    const { G } = s;
    G.scene.remove(s.pack.root);
    if (G.shown === s.pack) G.shown = null;
    s.pack.mats.forEach((m) => m.dispose());
    releaseFace(G, s.pack.front, s.pack.shape);
    releaseFace(G, s.pack.back, s.pack.shape);
    s.pack = null;
  };
  const buildPack = async () => {
    const gen = ++s.gen;
    const G = await initGL();
    if (s.disposed || gen !== s.gen || !G || G.dead || !s.front || !s.back) return;
    s.G = G;
    const { front, back, shape } = s;
    let faces;
    try {
      faces = await Promise.all([acquireFace(G, front, shape), acquireFace(G, back, shape)]);
    } catch (err) { // art would not load or could not be read: the flat image stays
      console.warn('showroom: could not build the 3D pack', err);
      releaseFace(G, front, shape); releaseFace(G, back, shape);
      return;
    }
    if (s.disposed || gen !== s.gen || G.dead) { releaseFace(G, front, shape); releaseFace(G, back, shape); return; }
    dropPack();
    const { THREE } = G;
    const mats = [];
    const sheet = (face, turned, mirrored) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: PACK_VERT, fragmentShader: PACK_FRAG, transparent: true,
        blending: mirrored ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: {
          uMap: { value: face.map }, uEdge: { value: face.edge },
          uBias: { value: mirrored ? 1.6 : -0.6 }, uMirror: { value: mirrored ? -1 : 1 }, uReflect: { value: mirrored ? 0.22 : 0 },
        },
      });
      mats.push(mat);
      const mesh = new THREE.Mesh(face.geo, mat);
      mesh.rotation.y = turned ? Math.PI : 0; // the back sheet is the same build, facing the other way
      mesh.frustumCulled = false;
      mesh.renderOrder = mirrored ? 1 : 2;
      return mesh;
    };
    const root = new THREE.Group(), pivot = new THREE.Group(), floor = new THREE.Group(), mirror = new THREE.Group();
    pivot.add(sheet(faces[0], false, false), sheet(faces[1], true, false));
    mirror.add(sheet(faces[0], false, true), sheet(faces[1], true, true));
    floor.scale.y = -1; // everything under it is the image in the floor
    floor.add(mirror);
    const roller = new THREE.Group(); // turns the pack in the plane of the screen (the stick lying flat), around its own middle
    roller.add(pivot);
    root.add(roller); // the floor mirror is built but never drawn: there is no floor
    root.visible = false;
    G.scene.add(root);
    s.pack = { root, pivot, mirror, roller, mats, front, back, shape, depth: Math.max(faces[0].depth, faces[1].depth) };
    s.box = faces[0].box;
    fit();
    s.tick(0, performance.now()); // one frame now, on screen or not, so the canvas is never seen empty
  };

  const set = ({ front = s.front, back = s.back, label = s.label, shape = s.shape } = {}) => {
    const changed = front !== s.front || back !== s.back || shape !== s.shape;
    if (changed && s.zoom) setZoom(false);
    Object.assign(s, { front, back, label, shape: SHAPES[shape] ? shape : 'pouch' });
    el.dataset.shape = s.shape;
    stage.setAttribute('aria-label', label);
    labelEl.textContent = label;
    if (!changed) return;
    if (!s.pack) s.box = BOX[s.shape];
    s.goal = Math.round(s.u / (2 * Math.PI)) * 2 * Math.PI; // undo the visitor's own turn the short way; the scroll still has its say
    if (still() || el.dataset.mode === 'flat') { s.u = s.goal; s.goal = null; }
    showSide();
    fit();
    buildPack();
  };

  const resize = new ResizeObserver(fit);
  resize.observe(stage);
  const seen = new IntersectionObserver(([entry]) => { s.visible = entry.isIntersecting; if (s.visible) wake(); }, { rootMargin: '80px' });
  seen.observe(pin);
  reduceQuery.addEventListener('change', () => { s.sig = ''; wake(); }, on);

  const dispose = () => {
    s.disposed = true;
    instances.delete(s);
    resize.disconnect();
    seen.disconnect();
    gone.abort();
    dropPack();
    if (lens) lens.remove();
    el.innerHTML = '';
    delete el.showroom;
  };

  instances.add(s);
  measure();
  s.scrollNow = s.scroll;
  set({ front: el.dataset.front || '', back: el.dataset.back || '', label: el.dataset.label || 'Product', shape: el.dataset.shape || 'pouch' });
  el.showroom = { set, turn, dispose, zoom: setZoom };
  return el.showroom;
}

window.DeluxeShowroom = { mount };
document.querySelectorAll('[data-showroom]').forEach(mount);

// self-check: open any page that loads this file with ?showroom-selftest and read the console
if (SELFTEST) {
  const first = document.querySelector('[data-showroom]');
  if (!first) console.error('showroom selftest failed: no [data-showroom] on the page');
  else {
    const read = () => first.querySelector('[data-side]').textContent;
    first.showroom.turn(1);
    const one = read();
    first.showroom.turn(1);
    const two = read();
    if (one === 'Back' && two === 'Front') console.log('showroom selftest ok');
    else console.error(`showroom selftest failed: expected Back then Front, read ${one} then ${two}`);
    initGL().then(() => setTimeout(() => {
      console.log(`showroom selftest: ${contexts.length} WebGL context(s) for ${instances.size} showrooms`);
      console.log(`showroom selftest: frames drawn so far, on screen first: ${[...instances].map((s) => `${s.frames}${s.visible ? ' (on screen)' : ' (off screen)'}`).join(', ')}`);
    }, 2500));
  }
}
