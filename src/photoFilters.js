/*
  photoFilters.js — punto 105 (filtros y ajustes), parte 1: el motor.

  Filtros de color (como el Instagram de los inicios) y 4 ajustes con
  barritas, para fotos del Muro, videos del Muro y Momentos. Este archivo
  solo dibuja: los editores (ImageEditor.jsx, VideoTrimmer.jsx) y la
  compresión de video (videoCompress.js) lo usan.

  LA ELECCIÓN ("look") es un objeto chico, que se puede guardar o pasar
  como opción tal cual:
    { filter: "warm", intensity: 100, brightness: 0, contrast: 0,
      saturation: 0, warmth: 0 }
  - filter: uno de FILTER_IDS ("original" = sin filtro).
  - intensity: 0..100, cuánto del filtro se aplica (100 = completo).
  - brightness, contrast, saturation, warmth: -100..100 (0 = sin cambio).
  Los ajustes se suman ENCIMA del filtro.

  POR QUÉ WEBGL: `ctx.filter` del canvas no funciona en todos los iPhone,
  y recorrer los píxeles en JavaScript es demasiado lento para video. Un
  programa chico en la tarjeta gráfica del teléfono hace todo en una sola
  pasada, igual en la vista previa, las miniaturas, la foto final y cada
  cuadro del video: lo que se ve es lo que se publica.

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
  return out;
}

// true si el look no cambia nada: entonces no hace falta dibujar (en video,
// la compresión queda idéntica a la de antes).
export function isNeutralLook(look) {
  const l = normalizeLook(look);
  const noFilter = l.filter === "original" || l.intensity === 0;
  return noFilter && ADJUSTMENT_IDS.every((id) => l[id] === 0);
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

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
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

let renderer = null; // { canvas, gl, program, uniforms, texture, lost }
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

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  // Un rectángulo que cubre todo el canvas (dos triángulos).
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // Medidas cualquiera (no potencia de 2): sin mipmaps y sin repetir.
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // La imagen viene de arriba hacia abajo; WebGL la lee de abajo hacia arriba.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(gl.getUniformLocation(program, "uImage"), 0);

  const uniforms = {};
  ["uBrightness", "uContrast", "uSaturation", "uWarmth", "uTint", "uTintAmount", "uFade", "uVignette"].forEach(
    (name) => {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
  );

  const r = { canvas, gl, program, uniforms, texture, lost: false };
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
  const { gl, uniforms: u } = r;
  try {
    if (r.canvas.width !== w) r.canvas.width = w;
    if (r.canvas.height !== h) r.canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, r.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const v = lookUniforms(look);
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
