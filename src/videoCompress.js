/*
  videoCompress.js — punto 101 (videos en el Muro), parte 2.

  Prepara en el teléfono el video de un post ANTES de subirlo: lo pasa a
  MP4 H.264 de 720p como máximo, a unos 2 Mbps, con el índice al principio
  del archivo ("fast start", para que empiece a sonar sin bajarlo entero),
  y saca una miniatura JPEG. Así un video de 90 s pesa ~15-24 MB en lugar
  de 100-450 MB, y uno HEVC de iPhone (.mov) se puede ver en Android y PC.

  Usa la librería Mediabunny (WebCodecs, el chip de video del teléfono).
  Se carga con import() solo cuando alguien elige un video, para no sumar
  peso a la app de todos los demás.

  Si el teléfono no puede comprimir, falla con un código y NO se sube el
  original (decisión del punto 101): quien llama muestra el aviso.

  AUDIO: si viene en AAC o MP3 (lo normal en la cámara de iPhone y
  Android) se COPIA tal cual, sin recodificar. Ojo: Mediabunny recodifica
  siempre que se le pasa `quality` o `codec` para el audio, aunque ya sea
  AAC, y hay iPhones que no pueden codificar AAC: con eso el audio se
  perdía (prueba del 2026-11-16). Solo si el audio viene en otro formato se
  pasa a AAC; si el teléfono no puede, falla con "audioFailed": un video
  que tenía sonido nunca se publica sin él.

  Uso:
    const job = compressVideo(file, (progress) => ...);  // progress 0..1
    const result = await job.promise;
    job.pause(); job.resume();  // al salir y volver a la app (videoJob.js)
    job.cancel();  // por ejemplo si la persona quita el video a la mitad

  result: { blob, posterBlob, duration, width, height }
  Errores (error.code): "notVideo" | "tooLong" | "unsupported" |
  "audioFailed" | "failed" | "canceled". En "tooLong", error.duration trae
  los segundos.
*/

export const MAX_VIDEO_SECONDS = 90;
const DURATION_MARGIN = 0.5; // un video "de 90 s" a veces mide 90,3 s
const MAX_LONG_SIDE = 1280; // 720p: 1280x720 horizontal, 720x1280 vertical
const VIDEO_BITRATE = 2000000;
const AUDIO_BITRATE = 128000;
const POSTER_LONG_SIDE = 720;
const POSTER_QUALITY = 0.8;
// Códecs de audio que se copian sin recodificar: MP4 los admite y se
// reproducen en todos los navegadores.
const COPYABLE_AUDIO = ["aac", "mp3"];
// Margen para alinear el audio copiado con el inicio (ver `copy` abajo).
const AUDIO_SHIFT_TOLERANCE = 0.5;

function videoError(code, extra) {
  const err = new Error(code);
  err.code = code;
  if (extra) Object.assign(err, extra);
  return err;
}

// H.264 exige medidas pares.
function even(n) {
  return Math.max(2, Math.round(n / 2) * 2);
}

function fitInside(width, height, maxLongSide) {
  const scale = Math.min(1, maxLongSide / Math.max(width, height));
  return { width: even(width * scale), height: even(height * scale) };
}

async function canvasToJpeg(canvas) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/jpeg", quality: POSTER_QUALITY });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("noblob"))),
      "image/jpeg",
      POSTER_QUALITY
    );
  });
}

// Miniatura: un cuadro cerca del principio del video YA comprimido (así
// la rotación ya viene aplicada y coincide con lo que se va a ver).
async function makePoster(mb, blob, duration) {
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(blob) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("notrack");
    const size = fitInside(track.displayWidth, track.displayHeight, POSTER_LONG_SIDE);
    const sink = new mb.CanvasSink(track, { width: size.width, height: size.height, fit: "fill" });
    const at = Math.min(0.5, duration / 2);
    const wrapped = (await sink.getCanvas(at)) || (await sink.getCanvas(0));
    if (!wrapped) throw new Error("noframe");
    return await canvasToJpeg(wrapped.canvas);
  } finally {
    input.dispose();
  }
}

// Elige la pista de audio: la primera que se pueda copiar (algunos iPhone
// graban más de una, por ejemplo audio espacial además del estéreo); si
// ninguna, la principal (habrá que recodificarla).
async function pickAudioTrack(input) {
  const tracks = await input.getAudioTracks().catch(() => []);
  if (tracks.length === 0) return null;
  for (const track of tracks) {
    const codec = await track.getCodec().catch(() => null);
    if (COPYABLE_AUDIO.includes(codec)) return { track, copy: true };
  }
  const primary = (await input.getPrimaryAudioTrack().catch(() => null)) || tracks[0];
  return { track: primary, copy: false };
}

export function compressVideo(file, onProgress) {
  let conversion = null;
  let canceled = false;
  // Pausa (videoJob.js la pide al salir de la app): se pasa a execute()
  // como pauseSignal; para seguir, se vuelve a llamar a execute().
  let paused = false;
  let pauseController = null;
  let wakeUp = null;
  const waitForResume = () =>
    new Promise((resolve) => {
      wakeUp = () => {
        wakeUp = null;
        resolve();
      };
      if (!paused || canceled) wakeUp();
    });

  const run = async () => {
    // Sin WebCodecs no hay nada que hacer (ni siquiera vale la pena bajar
    // la librería).
    if (typeof window.VideoEncoder !== "function" || typeof window.VideoDecoder !== "function") {
      throw videoError("unsupported");
    }

    const mb = await import("mediabunny");
    if (canceled) throw videoError("canceled");

    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
    try {
      let videoTrack;
      try {
        videoTrack = await input.getPrimaryVideoTrack();
      } catch (e) {
        throw videoError("notVideo");
      }
      if (!videoTrack) throw videoError("notVideo");
      if (!(await videoTrack.canDecode())) throw videoError("unsupported");

      let duration = await input.getDurationFromMetadata().catch(() => null);
      if (!duration) duration = await input.computeDuration();
      if (duration > MAX_VIDEO_SECONDS + DURATION_MARGIN) {
        throw videoError("tooLong", { duration });
      }

      const size = fitInside(videoTrack.displayWidth, videoTrack.displayHeight, MAX_LONG_SIDE);
      const videoQuality = new mb.Quality({ bitrate: VIDEO_BITRATE });
      const canEncode = await mb.canEncodeVideo("avc", {
        width: size.width,
        height: size.height,
        quality: videoQuality,
      });
      if (!canEncode) throw videoError("unsupported");

      const audio = await pickAudioTrack(input);

      const output = new mb.Output({
        format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
        target: new mb.BufferTarget(),
      });

      conversion = await mb.Conversion.init({
        input,
        output,
        showWarnings: false,
        // Permite correr el audio copiado hasta medio segundo para que
        // empiece junto con el video (el AAC de la cámara suele traer un
        // pequeño desfase al principio). Sin esto Mediabunny intentaría
        // recodificarlo.
        copy: { shiftTolerance: AUDIO_SHIFT_TOLERANCE },
        // Solo el video principal; cualquier otro se descarta.
        video: (track) =>
          track !== videoTrack
            ? { discard: true }
            : {
                codec: "avc",
                width: size.width,
                height: size.height,
                fit: "fill",
                quality: videoQuality,
                forceTranscode: true,
                // La rotación del iPhone se aplica a los cuadros, no se deja
                // como dato aparte: así se ve derecho en cualquier reproductor.
                allowTransformationMetadata: false,
              },
        // Solo la pista elegida. Si se puede copiar, SIN codec ni quality
        // (cualquiera de los dos obliga a recodificar, ver arriba).
        audio: (track) => {
          if (!audio || track !== audio.track) return { discard: true };
          if (audio.copy) return {};
          return { codec: "aac", quality: new mb.Quality({ bitrate: AUDIO_BITRATE }) };
        },
      });
      if (canceled) throw videoError("canceled");
      if (!conversion.isValid) throw videoError("unsupported");
      if (!conversion.utilizedTracks.includes(videoTrack)) throw videoError("unsupported");
      // Un video que tenía sonido nunca se publica sin él.
      if (audio && !conversion.utilizedTracks.includes(audio.track)) {
        throw videoError("audioFailed");
      }

      if (onProgress) {
        conversion.onProgress = (p) => onProgress(Math.min(1, Math.max(0, p)));
      }
      // Corre hasta terminar; si se pausa, espera a resume() y sigue desde
      // donde iba.
      for (;;) {
        pauseController = new AbortController();
        if (paused) pauseController.abort();
        await conversion.execute({ pauseSignal: pauseController.signal });
        if (conversion.state === "done") break;
        if (canceled) throw videoError("canceled");
        await waitForResume();
      }

      const buffer = output.target.buffer;
      if (!buffer) throw videoError("failed");
      const blob = new Blob([buffer], { type: "video/mp4" });

      const posterBlob = await makePoster(mb, blob, duration);

      return {
        blob,
        posterBlob,
        duration,
        width: size.width,
        height: size.height,
      };
    } finally {
      input.dispose();
    }
  };

  const promise = run().catch((err) => {
    if (canceled || (err && err.name === "ConversionCanceledError")) throw videoError("canceled");
    if (err && err.code) throw err;
    // Cualquier otro error (memoria, códec que falla a la mitad...).
    // eslint-disable-next-line no-console
    console.warn("compressVideo:", err);
    throw videoError("failed");
  });

  return {
    promise,
    pause: () => {
      paused = true;
      if (pauseController) pauseController.abort();
    },
    resume: () => {
      paused = false;
      if (wakeUp) wakeUp();
    },
    cancel: () => {
      canceled = true;
      if (conversion) conversion.cancel().catch(() => {});
      if (wakeUp) wakeUp();
    },
  };
}
