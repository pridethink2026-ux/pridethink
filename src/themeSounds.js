/*
  themeSounds.js
  --------------
  Un sonido corto (< 0,5s) y distinto por cada tema visual, sintetizado con
  Web Audio API (osciladores + envolventes de ganancia) — sin archivos de
  audio externos, para no depender de licencias ni subir assets nuevos.
  Suena UNA sola vez al confirmar el cambio de tema (ThemeMenu, App.js),
  nunca en hover ni en loop.

  playThemeSound(themeKey) es la única función que se usa desde afuera.
  Volumen bajo a propósito (ganancia pico <= 0.09) para no sobresaltar; no
  hay botón de silenciar todavía, pero al estar todo detrás de esta única
  función es fácil agregar ese chequeo después sin tocar el resto del
  código (por ejemplo, leyendo una preferencia antes del try/catch).
*/

// AudioContext único, creado recién al primer uso (nunca al cargar la
// página): los navegadores bloquean el audio hasta el primer gesto real
// del usuario, y el clic de elegir un tema ya es ese gesto.
let audioCtx = null;

function getAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Un tono = un oscilador + su propia envolvente de ganancia (ataque rápido,
// decaimiento exponencial), programado en el tiempo absoluto del contexto
// (ctx.currentTime + start) para poder encadenar varias notas o capas sin
// setTimeout. freqRampTo desliza el tono (para el "goteo" de Océano);
// filterFreq (opcional) pasa el oscilador por un lowpass antes de la
// ganancia, para suavizar el brillo agudo (la "campana lejana" de Noche).
function playTone(ctx, { freq, type = "sine", start = 0, duration = 0.3, peakGain = 0.08, attack = 0.008, freqRampTo = null, filterFreq = null }) {
  const startTime = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (freqRampTo != null) {
    osc.frequency.exponentialRampToValueAtTime(freqRampTo, startTime + duration);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  if (filterFreq) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    osc.connect(filter);
    filter.connect(gain);
  } else {
    osc.connect(gain);
  }
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

// Campana lejana, grave y suave: fundamental grave (220Hz, A3) + un
// parcial más agudo e inarmónico (528Hz, típico de un timbre de campana)
// que se apaga antes que el fundamental — así decae una campana real.
function playNocheSound(ctx) {
  playTone(ctx, { freq: 220, type: "sine", duration: 0.42, peakGain: 0.09, attack: 0.008, filterFreq: 1200 });
  playTone(ctx, { freq: 528, type: "sine", duration: 0.3, peakGain: 0.035, attack: 0.006, filterFreq: 1500 });
}

// Arpegio alegre y ascendente (Do-Mi-Sol-Do agudo), cada nota disparada en
// cascada con un breve solape.
function playArcoirisSound(ctx) {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    playTone(ctx, { freq, type: "triangle", start: i * 0.07, duration: 0.09, peakGain: 0.07, attack: 0.005 });
  });
}

// Gota/burbuja: un solo tono que se desliza rápido de agudo a grave
// (exponentialRampToValueAtTime), como el "plic" de una gota cayendo.
function playOceanoSound(ctx) {
  playTone(ctx, { freq: 900, type: "sine", duration: 0.22, peakGain: 0.08, attack: 0.005, freqRampTo: 260 });
}

// Tono medio cálido (392Hz, G4) con un sub-armónico una octava abajo más
// bajito, para dar cuerpo sin sonar como una campana (nada de filtro ni
// segundo parcial agudo, a diferencia de Noche).
function playAtardecerSound(ctx) {
  playTone(ctx, { freq: 392, type: "triangle", duration: 0.4, peakGain: 0.08, attack: 0.015 });
  playTone(ctx, { freq: 196, type: "triangle", duration: 0.4, peakGain: 0.03, attack: 0.015 });
}

// Tick neutro y simple: un solo tono agudo (1047Hz, C6) con ataque y
// decaimiento muy rápidos, sin capas ni deslizamiento.
function playRotativoSound(ctx) {
  playTone(ctx, { freq: 1046.5, type: "sine", duration: 0.11, peakGain: 0.07, attack: 0.003 });
}

const SOUND_BUILDERS = {
  noche: playNocheSound,
  arcoiris: playArcoirisSound,
  oceano: playOceanoSound,
  atardecer: playAtardecerSound,
  rotativo: playRotativoSound,
};

export function playThemeSound(themeKey) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const builder = SOUND_BUILDERS[themeKey] || SOUND_BUILDERS.noche;
    builder(ctx);
  } catch (err) {
    // Web Audio no disponible o bloqueado por el navegador: fallar en
    // silencio, nunca romper el cambio de tema por esto.
  }
}
