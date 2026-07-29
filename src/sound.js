/*
  sound.js
  --------
  Infraestructura COMPARTIDA de Web Audio API para todos los sonidos
  sintetizados de la app (temas, reacciones, comentarios) — sin archivos de
  audio externos, para no depender de licencias ni subir assets. Antes
  vivía entera dentro de themeSounds.js; ahora ese archivo importa de acá
  lo que necesita (getAudioContext, playTone), y acá también viven las
  funciones de sonido de reacciones/comentarios (2026-07-29) — son un
  puñado de líneas cada una, no ameritan su propio archivo.

  Interruptor general ("Silenciar sonidos", AuthProfile.jsx): este módulo
  guarda un flag interno (setSoundMuted/isSoundMuted) que SoundContext.jsx
  mantiene sincronizado con users/{uid}.soundMuted en Firestore. Las 3
  funciones "públicas" (playThemeSound acá abajo en themeSounds.js,
  playReactionSound y playCommentSound acá mismo) lo consultan como
  primera línea — así "silenciar todo" queda garantizado en un solo
  lugar: cualquier sonido nuevo que se agregue después hereda el
  interruptor con un solo `if (isSoundMuted()) return;`.
*/

// AudioContext único, creado recién al primer uso (nunca al cargar la
// página): los navegadores bloquean el audio hasta el primer gesto real
// del usuario.
let audioCtx = null;

export function getAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

let soundMuted = false;

export function setSoundMuted(value) {
  soundMuted = value;
}

export function isSoundMuted() {
  return soundMuted;
}

// Un tono = un oscilador + su propia envolvente de ganancia (ataque rápido,
// decaimiento exponencial), programado en el tiempo absoluto del contexto
// (ctx.currentTime + start) para poder encadenar varias notas o capas sin
// setTimeout. freqRampTo desliza el tono (para el "goteo" de Océano, o el
// pop de reaccionar); filterFreq (opcional) pasa el oscilador por un
// lowpass antes de la ganancia, para suavizar el brillo agudo.
export function playTone(ctx, { freq, type = "sine", start = 0, duration = 0.3, peakGain = 0.08, attack = 0.008, freqRampTo = null, filterFreq = null }) {
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

// Reaccionar (post, comentario o mensaje de chat): un "pop" corto (< 300ms)
// que sube de tono al agregar una reacción, y baja al quitarla — mismo
// oscilador simple (seno), solo cambia la dirección del deslizamiento.
export function playReactionSound(adding) {
  if (isSoundMuted()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (adding) {
      playTone(ctx, { freq: 500, type: "sine", duration: 0.12, peakGain: 0.07, attack: 0.004, freqRampTo: 800 });
    } else {
      playTone(ctx, { freq: 700, type: "sine", duration: 0.12, peakGain: 0.06, attack: 0.004, freqRampTo: 400 });
    }
  } catch (err) {
    // Web Audio no disponible o bloqueado por el navegador: fallar en
    // silencio, nunca romper la reacción por esto.
  }
}

// Comentar: confirmación breve de "enviado" (< 300ms), distinta al pop de
// reaccionar — dos notas cortas ascendentes en cascada, más "musical" que
// un solo pop.
export function playCommentSound() {
  if (isSoundMuted()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    playTone(ctx, { freq: 660, type: "triangle", start: 0, duration: 0.09, peakGain: 0.07, attack: 0.004 });
    playTone(ctx, { freq: 880, type: "triangle", start: 0.05, duration: 0.09, peakGain: 0.07, attack: 0.004 });
  } catch (err) {
    // Web Audio no disponible o bloqueado por el navegador: fallar en
    // silencio, nunca romper el envío del comentario por esto.
  }
}
