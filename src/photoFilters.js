/*
  photoFilters.js — punto 105 (filtros y ajustes), parte 1: el motor.
  Punto 106, parte 1: "Belleza" (suavizar la piel sin perder los bordes).

  Filtros de color (como el Instagram de los inicios) y ajustes con
  barritas, para fotos del Muro, videos del Muro y Momentos. Este archivo
  solo dibuja: los editores (ImageEditor.jsx, VideoTrimmer.jsx) y la
  compresión de video (videoCompress.js) lo usan.

  LA ELECCIÓN ("look") es un objeto chico, que se puede guardar o pasar
  como opción tal cual:
    { filter: "warm", intensity: 100, brightness: 0, contrast: 0,
      saturation: 0, warmth: 0, beauty: 0 }
  - filter: uno de FILTER_IDS ("original" = sin filtro).
  - intensity: 0..100, cuánto del filtro se aplica (100 = completo).
  - brightness, contrast, saturation, warmth: -100..100 (0 = sin cambio).
  - beauty: 0..100 (0 = apagado), ver BELLEZA abajo.
  Los ajustes se suman ENCIMA del filtro.

  POR QUÉ WEBGL: `ctx.filter` del canvas no funciona en todos los iPhone,
  y recorrer los píxeles en JavaScript es demasiado lento para video. Un
  programa chico en la tarjeta gráfica del teléfono lo hace, igual en la
  vista previa, las miniaturas, la foto final y cada cuadro del video: lo
  que se ve es lo que se publica.

  BELLEZA (punto 106): filtro bilateral. Cada píxel se promedia con sus
  vecinos, pero solo con los de color PARECIDO: la piel (poros, granitos)
  se alisa, y en un borde (ojo contra piel, pelo contra fondo) los vecinos
  del otro lado son muy distintos y casi no cuentan, así que el borde
  queda nítido. Sin detección de cara: se aplica a toda la imagen (con
  valores altos también se alisan un poco texturas finas). Para que sea
  liviano en video va en DOS pasadas (horizontal y después vertical, 13
  muestras cada una, en vez de 13×13 = 169): una aproximación conocida
  que en piel se ve igual. El radio es una proporción del lado corto de
  la imagen (BEAUTY_SPACING), así se ve igual en la vista previa chica, la
  foto de 1080 px y el video de 720p. La segunda pasada ya mezcla con el
  original según la barrita. Orden: primero Belleza (sobre los colores
  originales), después el filtro y los ajustes. Con beauty = 0 no hay
  pasadas extra: todo es exactamente como antes del punto 106.

  UN SOLO CONTEXTO WEBGL para toda la app (iPhone limita cuántos puede
  haber abiertos a la vez): se crea la primera vez y se reutiliza. Si el
  teléfono lo cierra (falta de memoria), se vuelve a crear en el próximo
  uso. Si WebGL no está o falla, las funciones devuelven null y quien las
  llama sigue SIN filtro (nunca se rompe una publicación por esto).

  Uso:
    if (isLookSupported()) ...               // mostrar o no los filtros
    const canvas = applyLook(source, look);  // canvas 2D nuevo, o null
    renderLook(source, look, w, h)           // canvas WebGL compartido
                                             // (vista previa / video:
                                             // copiarlo antes del próximo uso)
  `source`: <img>, <canvas>, <video>, ImageBitmap o VideoFrame.
*/

export const FILTER_IDS = [
  "original",
  "warm",
  "cool",
  "bw",
  "vintage",
  "vivid",
  "soft",
  "sunset",
  "drama",
];

export const ADJUSTMENT_IDS = ["brightness", "contrast", "saturation", "warmth"];

export const DEFAULT_LOOK = Object.freeze({
  filter: "original",
  intensity: 100,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  beauty: 0,
});

/*
  Cada filtro, en las unidades del programa (al 100 % de intensidad):
  - brightness: curva de luz (-1..1; mueve los tonos medios, sin quemar
    los blancos ni ensuciar los negros).
  - contrast: -1..1.  saturation: -1 (gris) .. 1 (el doble).
  - warmth: -1 (azulado) .. 1 (anaranjado).
  - tint + tintAmount: un color que se mezcla encima.
  - fade: levanta los negros (efecto de foto vieja).
  - vignette: oscurece las esquinas.
*/
const FILTERS = {
  original: {},
  warm: { warmth: 0.45, saturation: 0.1, brightness: 0.05 },
  cool: { warmth: -0.45, saturation: 0.05, contrast: 0.05 },
  bw: { saturation: -1, contrast: 0.15 },
  vintage: {
    saturation: -0.3,
    contrast: -0.1,
    warmth: 0.3,
    fade: 0.08,
    tint: [1.0, 0.9, 0.7],
    tintAmount: 0.08,
    vignette: 0.35,
  },
  vivid: { saturation: 0.45, contrast: 0.15 },
  soft: { contrast: -0.2, saturation: -0.1, brightness: 0.1, fade: 0.05 },
  sunset: { warmth: 0.5, saturation: 0.15, tint: [1.0, 0.55, 0.3], tintAmount: 0.12, vignette: 0.2 },
  drama: { contrast: 0.35, saturation: -0.25, brightness: -0.08, vignette: 0.4 },
};

// Cuánto mueve cada barrita (de -100 a 100) en las unidades del programa.
const SLIDER_SCALE = { brightness: 0.5, contrast: 0.5, saturation: 1, warmth: 0.6 };

// Belleza: distancia entre muestras, como fracción del lado corto (6
// muestras por lado: radio ≈ 2 % del lado corto), y cuánta diferencia de
// color todavía cuenta como "parecido" (0..1 por canal), según la barrita.
const BEAUTY_SPACING = 0.0035;
const BEAUTY_RANGE_MIN = 0.06;
const BEAUTY_RANGE_MAX = 0.12;

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Un look válido y completo a partir de cualquier cosa (incluso null).
export function normalizeLook(look) {
  const src = look && typeof look === "object" ? look : {};
  const out = {
    filter: FILTER_IDS.includes(src.filter) ? src.filter : "original",
    intensity: Math.round(clampNumber(src.intensity, 0, 100, 100)),
  };
  ADJUSTMENT_IDS.forEach((id) => {
    out[id] = Math.round(clampNumber(src[id], -100, 100, 0));
  });
  out.beauty = Math.round(clampNumber(src.beauty, 0, 100, 0));
  return out;
}

// true si el look no cambia nada: entonces no hace falta dibujar (en video,
// la compresión queda idéntica a la de antes).
export function isNeutralLook(look) {
  const l = normalizeLook(look);
  const noFilter = l.filter === "original" || l.intensity === 0;
  return noFilter && l.beauty === 0 && ADJUSTMENT_IDS.every((id) => l[id] === 0);
}

// El look pasado a los valores que recibe el programa: filtro escalado por
// la intensidad, más las barritas.
function lookUniforms(look) {
  const l = normalizeLook(look);
  const f = FILTERS[l.filter] || {};
  const k = l.intensity / 100;
  const tint = f.tint || [1, 1, 1];
  return {
    brightness: (f.brightness || 0) * k + (l.brightness / 100) * SLIDER_SCALE.brightness,
    contrast: (f.contrast || 0) * k + (l.contrast / 100) * SLIDER_SCALE.contrast,
    saturation: (f.saturation || 0) * k + (l.saturation / 100) * SLIDER_SCALE.saturation,
    warmth: (f.warmth || 0) * k + (l.warmth / 100) * SLIDER_SCALE.warmth,
    tint,
    tintAmount: (f.tintAmount || 0) * k,
    fade: (f.fade || 0) * k,
    vignette: (f.vignette || 0) * k,
    beauty: l.beauty / 100,
  };
}

// ---------------------------------------------------------------------
// WebGL
// ---------------------------------------------------------------------

const VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const COLOR_SHADER = `${PRECISION}
varying vec2 vUv;
uniform sampler2D uImage;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uWarmth;
uniform vec3 uTint;
uniform float uTintAmount;
uniform float uFade;
uniform float uVignette;

void main() {
  vec3 c = texture2D(uImage, vUv).rgb;
  // Luz: curva (gamma), así los blancos y negros quedan en su lugar.
  c = pow(max(c, vec3(0.0)), vec3(exp(-uBrightness)));
  // Contraste alrededor del gris medio.
  c = (c - 0.5) * (1.0 + uContrast) + 0.5;
  // Saturación.
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, 1.0 + uSaturation);
  // Calidez: más rojo y menos azul (o al revés).
  c += vec3(0.1, 0.02, -0.1) * uWarmth;
  // Color encima y negros levantados.
  c = mix(c, uTint * max(luma, 0.15) * 1.4, uTintAmount);
  c = uFade + c * (1.0 - uFade);
  // Esquinas más oscuras.
  float d = length(vUv - 0.5) * 1.4142;
  c *= 1.0 - uVignette * smoothstep(0.45, 1.0, d);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

// Belleza: una pasada del bilateral en la dirección uStep (horizontal o
// vertical). uAmount mezcla el resultado con uOriginal (la 1.ª pasada usa
// 1.0; la 2.ª, la barrita).
const BILATERAL_SHADER = `${PRECISION}
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uOriginal;
uniform vec2 uStep;
uniform float uRange;
uniform float uAmount;

void main() {
  vec3 center = texture2D(uImage, vUv).rgb;
  vec3 sum = center;
  float wsum = 1.0;
  float inv = 1.0 / (2.0 * uRange * uRange);
  for (int i = 1; i <= 6; i++) {
    float fi = float(i);
    // Peso por distancia (campana de 6 muestras).
    float ws = exp(-fi * fi / 18.0);
    vec3 a = texture2D(uImage, vUv + uStep * fi).rgb;
    vec3 b = texture2D(uImage, vUv - uStep * fi).rgb;
    vec3 da = a - center;
    vec3 db = b - center;
    // Peso por parecido de color: casi 0 del otro lado de un borde.
    float wa = ws * exp(-dot(da, da) * inv);
    float wb = ws * exp(-dot(db, db) * inv);
    sum += a * wa + b * wb;
    wsum += wa + wb;
  }
  vec3 smoothed = sum / wsum;
  vec3 original = texture2D(uOriginal, vUv).rgb;
  gl_FragColor = vec4(mix(original, smoothed, uAmount), 1.0);
}
`;

let renderer = null; // ver createRenderer
let unsupported = false; // WebGL no existe o el programa no compila

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // eslint-disable-next-line no-console
    console.warn("photoFilters:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Un programa (vértices de siempre + `fragment`), con aPos en el lugar 0
// para que los dos programas compartan el mismo rectángulo.
function makeProgram(gl, fragment, uniformNames) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const uniforms = {};
  uniformNames.forEach((name) => {
    uniforms[name] = gl.getUniformLocation(program, name);
  });
  return { program, uniforms };
}

// Medidas cualquiera (no potencia de 2): sin mipmaps y sin repetir.
function makeTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

// Una textura intermedia donde se puede dibujar (para las pasadas de
// Belleza). Se agranda o achica con la imagen (ver sizeTarget).
function makeTarget(gl) {
  const texture = makeTexture(gl);
  const framebuffer = gl.createFramebuffer();
  return { texture, framebuffer, w: 0, h: 0 };
}

function sizeTarget(gl, target, w, h) {
  if (target.w === w && target.h === h) return true;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  target.w = ok ? w : 0;
  target.h = ok ? h : 0;
  return ok;
}

function createRenderer() {
  const canvas = document.createElement("canvas");
  const gl =
    canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      // Para poder copiar el canvas (drawImage, toBlob) después de dibujar.
      preserveDrawingBuffer: true,
    }) || null;
  if (!gl) return null;

  const color = makeProgram(gl, COLOR_SHADER, [
    "uImage",
    "uBrightness",
    "uContrast",
    "uSaturation",
    "uWarmth",
    "uTint",
    "uTintAmount",
    "uFade",
    "uVignette",
  ]);
  if (!color) return null;
  // Si Belleza no compila en algún teléfono, los filtros siguen andando
  // (Belleza simplemente no se aplica).
  const bilateral = makeProgram(gl, BILATERAL_SHADER, [
    "uImage",
    "uOriginal",
    "uStep",
    "uRange",
    "uAmount",
  ]);

  // Un rectángulo que cubre todo el canvas (dos triángulos).
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const source = makeTexture(gl);
  // La imagen viene de arriba hacia abajo; WebGL la lee de abajo hacia
  // arriba. Solo afecta lo que se sube (la foto o el cuadro), no las
  // texturas intermedias.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const r = {
    canvas,
    gl,
    color,
    bilateral,
    source,
    passA: bilateral ? makeTarget(gl) : null,
    passB: bilateral ? makeTarget(gl) : null,
    lost: false,
  };
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    r.lost = true;
  });
  return r;
}

function getRenderer() {
  if (unsupported || typeof document === "undefined") return null;
  if (renderer && !renderer.lost && !renderer.gl.isContextLost()) return renderer;
  renderer = null;
  try {
    renderer = createRenderer();
  } catch (e) {
    renderer = null;
  }
  if (!renderer) unsupported = true;
  return renderer;
}

// ¿Se pueden mostrar los filtros en este teléfono?
export function isLookSupported() {
  return !!getRenderer();
}

function sourceSize(source) {
  const w = source.displayWidth || source.videoWidth || source.naturalWidth || source.width || 0;
  const h = source.displayHeight || source.videoHeight || source.naturalHeight || source.height || 0;
  return { w, h };
}

// Belleza en dos pasadas: devuelve la textura con el resultado, o null si
// no se pudo (entonces se sigue sin Belleza).
function renderBeauty(r, amount, w, h) {
  const { gl, bilateral, passA, passB } = r;
  if (!bilateral || !sizeTarget(gl, passA, w, h) || !sizeTarget(gl, passB, w, h)) return null;
  const spacing = Math.max(1, Math.min(w, h) * BEAUTY_SPACING);
  const u = bilateral.uniforms;
  gl.useProgram(bilateral.program);
  gl.uniform1i(u.uImage, 0);
  gl.uniform1i(u.uOriginal, 1);
  gl.uniform1f(u.uRange, BEAUTY_RANGE_MIN + (BEAUTY_RANGE_MAX - BEAUTY_RANGE_MIN) * amount);
  gl.viewport(0, 0, w, h);
  // El original queda en la unidad 1 para las dos pasadas.
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, r.source);
  gl.activeTexture(gl.TEXTURE0);

  // 1.ª pasada: horizontal, sin mezclar.
  gl.bindFramebuffer(gl.FRAMEBUFFER, passA.framebuffer);
  gl.bindTexture(gl.TEXTURE_2D, r.source);
  gl.uniform2f(u.uStep, spacing / w, 0);
  gl.uniform1f(u.uAmount, 1);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // 2.ª pasada: vertical, mezclada con el original según la barrita.
  gl.bindFramebuffer(gl.FRAMEBUFFER, passB.framebuffer);
  gl.bindTexture(gl.TEXTURE_2D, passA.texture);
  gl.uniform2f(u.uStep, 0, spacing / h);
  gl.uniform1f(u.uAmount, amount);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return passB.texture;
}

/*
  Dibuja `source` con el look en el canvas WebGL COMPARTIDO, a width x
  height (por defecto, el tamaño de la fuente), y lo devuelve. El mismo
  canvas se reutiliza en la próxima llamada: quien lo necesite guardar lo
  copia antes (applyLook ya lo hace). null si no se pudo.
*/
export function renderLook(source, look, width, height) {
  const r = getRenderer();
  if (!r || !source) return null;
  const size = sourceSize(source);
  const w = Math.max(1, Math.round(width || size.w));
  const h = Math.max(1, Math.round(height || size.h));
  if (!size.w || !size.h) return null;
  const { gl } = r;
  try {
    if (r.canvas.width !== w) r.canvas.width = w;
    if (r.canvas.height !== h) r.canvas.height = h;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, r.source);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const v = lookUniforms(look);

    // Belleza primero (sobre los colores originales); sin ella, el color
    // se aplica directo sobre la imagen.
    const input = (v.beauty > 0 && renderBeauty(r, v.beauty, w, h)) || r.source;

    const u = r.color.uniforms;
    gl.useProgram(r.color.program);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(u.uImage, 0);
    gl.uniform1f(u.uBrightness, v.brightness);
    gl.uniform1f(u.uContrast, v.contrast);
    gl.uniform1f(u.uSaturation, v.saturation);
    gl.uniform1f(u.uWarmth, v.warmth);
    gl.uniform3f(u.uTint, v.tint[0], v.tint[1], v.tint[2]);
    gl.uniform1f(u.uTintAmount, v.tintAmount);
    gl.uniform1f(u.uFade, v.fade);
    gl.uniform1f(u.uVignette, v.vignette);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) return null;
    return r.canvas;
  } catch (e) {
    // Por ejemplo, una fuente que el navegador no deja leer como textura.
    return null;
  }
}

/*
  Como renderLook, pero devuelve un canvas 2D NUEVO (propio de quien lo
  pide), o null si no se pudo. Con un look neutro igual dibuja (copia).
*/
export function applyLook(source, look, width, height) {
  const glCanvas = renderLook(source, look, width, height);
  if (!glCanvas) return null;
  const out = document.createElement("canvas");
  out.width = glCanvas.width;
  out.height = glCanvas.height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(glCanvas, 0, 0);
  return out;
}
