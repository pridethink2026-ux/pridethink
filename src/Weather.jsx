import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";

/*
  Weather.jsx
  -----------
  Widget de clima para el muro: si el usuario da permiso de
  geolocalización, pide el clima actual (+ pronóstico de 5 días) a la API
  pública y gratuita de Open-Meteo (https://api.open-meteo.com, sin API
  key), y muestra un pill chico (ícono + temperatura + mínima/máxima) que
  se puede tocar para expandir y ver además la ciudad, la fecha/hora local
  del lugar donde está el usuario, y el pronóstico extendido. Sin permiso,
  el navegador no soporta geolocalización, o la API falla, el widget
  simplemente no aparece (sin mostrar ningún error ni insistir con el
  permiso — getCurrentPosition solo se pide una vez por montaje).

  PRIVACIDAD (importante): la ciudad, fecha/hora y clima son datos que
  viven ÚNICAMENTE en el estado de React de este componente, dentro del
  navegador de quien lo mira. Nunca se escriben en Firestore, nunca se
  pasan como prop a otro componente, y `WeatherWidget` solo se monta en
  `Feed.jsx` para el propio usuario logueado — nadie más ve esta
  información, ni en su perfil público ni en ningún otro lado.

  Colores 100% de variables de tema (--surface, --border, --text,
  --text-muted, --accent) — nada hardcodeado, para que combine con
  cualquiera de los 4 temas o el modo Rotativo.

  Ciudad aproximada por defecto, precisa solo con consentimiento
  explícito: Open-Meteo NO ofrece geocodificación inversa en su plan
  gratuito (se verificó contra su documentación: el único endpoint de
  Geocoding es una búsqueda por NOMBRE, `/v1/search`, no hay `/v1/reverse`).
  Por defecto el nombre que se muestra se deriva del campo "timezone" (zona
  horaria IANA, ej. "America/Argentina/Buenos_Aires") que YA devuelve la
  misma llamada al clima — cityNameFromTimezone() se queda con el último
  segmento y cambia "_" por espacios. Es aproximado y en la práctica puede
  ser bastante impreciso (una zona horaria cubre un área enorme: alguien en
  Ohio ve "New York" porque comparte "America/New_York"). Quien quiera el
  nombre real puede tocar "Precisar mi ubicación" — recién AHÍ, y con un
  aviso explícito que hay que aceptar, se manda la coordenada exacta a
  OpenStreetMap Nominatim (https://nominatim.openstreetmap.org, gratuito,
  sin API key, mantenido por la comunidad — por eso solo se llama bajo
  consentimiento y una sola vez por sesión/ubicación, nunca automático,
  para no abusar de un servicio comunitario). Ver `handleConfirmPrecise`
  y el docstring de `fetchPreciseCity` más abajo para el detalle completo.
*/

// 20 minutos: adentro del rango de 15-30 pedido, para no golpear la API
// de más si el muro se desmonta y se vuelve a montar seguido (cambiar de
// pestaña, volver de un perfil, etc.).
const CACHE_TTL_MS = 20 * 60 * 1000;

// Cuántos días de pronóstico se piden además de hoy (hoy ya se muestra
// como "clima actual", así que esto es lo que se ve en el panel expandido).
const FORECAST_DAYS_AHEAD = 5;

// En memoria (no Firestore, no localStorage): alcanza para el pedido, y
// se limpia solo al recargar la página.
let weatherCache = null; // { lat, lon, data, fetchedAt }

// Códigos WMO que devuelve Open-Meteo, agrupados en 6 familias de ícono.
function getWeatherIconGroup(code) {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

// "America/Argentina/Buenos_Aires" -> "Buenos Aires" — ver docstring de
// arriba para el porqué no es geocodificación inversa real.
function cityNameFromTimezone(timezone) {
  if (!timezone) return null;
  const lastSegment = timezone.split("/").pop();
  if (!lastSegment) return null;
  return lastSegment.replace(/_/g, " ");
}

// Ciudad PRECISA, solo bajo consentimiento explícito del usuario (ver
// handleConfirmPrecise en WeatherWidget) — nunca se llama sola. Guardada
// en sessionStorage (no localStorage): "recordar durante la sesión", no
// para siempre, y se pierde sola al cerrar la pestaña — mismo criterio
// de "no guardar de más" que ya sigue el resto del dato de ubicación
// (nunca Firestore, ver docstring de arriba).
const PRECISE_LOCATION_CACHE_KEY = "pridethink-precise-location";

function readPreciseLocationCache() {
  try {
    const raw = sessionStorage.getItem(PRECISE_LOCATION_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePreciseLocationCache(entry) {
  try {
    sessionStorage.setItem(PRECISE_LOCATION_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // sessionStorage puede fallar (modo privado, cuota llena) — no es
    // crítico, simplemente se pierde el caché y listo.
  }
}

// Nominatim (OpenStreetMap) devuelve un objeto "address" cuya forma
// cambia según el tipo de lugar (ciudad, pueblo, municipio rural...) — se
// prueba en orden de más a menos específico, y si no hay ninguno, se cae
// al nombre genérico del lugar ("name") antes de rendirse.
function extractCityFromNominatim(json) {
  const addr = json?.address || {};
  return addr.city || addr.town || addr.village || addr.municipality || addr.county || json?.name || null;
}

// Solo se llama después de que el usuario acepta explícitamente el aviso
// de privacidad (ver ConsentModal). zoom=10 le pide a Nominatim nivel de
// detalle "ciudad" (ni un país entero ni una calle puntual). No se puede
// mandar un User-Agent personalizado desde fetch() del navegador (los
// navegadores lo bloquean por seguridad) — Nominatim acepta igual
// identificar la app por el header "Referer", que el navegador ya manda
// solo con la URL de la página.
async function fetchPreciseCity(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&addressdetails=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("nominatim request failed");
  const json = await res.json();
  return extractCityFromNominatim(json);
}

async function fetchWeather(lat, lon) {
  const now = Date.now();
  if (
    weatherCache &&
    now - weatherCache.fetchedAt < CACHE_TTL_MS &&
    Math.abs(weatherCache.lat - lat) < 0.05 &&
    Math.abs(weatherCache.lon - lon) < 0.05
  ) {
    return weatherCache.data;
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode` +
    `&timezone=auto&forecast_days=${FORECAST_DAYS_AHEAD + 1}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather request failed");
  const json = await res.json();
  const data = {
    lat,
    lon,
    temp: Math.round(json.current_weather.temperature),
    code: json.current_weather.weathercode,
    tMin: Math.round(json.daily.temperature_2m_min[0]),
    tMax: Math.round(json.daily.temperature_2m_max[0]),
    timezone: json.timezone || null,
    cityName: cityNameFromTimezone(json.timezone),
    // Día 0 es "hoy" (ya mostrado como clima actual): el pronóstico
    // extendido son los días siguientes.
    forecast: json.daily.time.slice(1).map((dateStr, i) => ({
      date: dateStr,
      code: json.daily.weathercode[i + 1],
      tMin: Math.round(json.daily.temperature_2m_min[i + 1]),
      tMax: Math.round(json.daily.temperature_2m_max[i + 1]),
    })),
  };
  weatherCache = { lat, lon, data, fetchedAt: now };
  return data;
}

// Devuelve null mientras no haya nada que mostrar (sin permiso, api
// caída, o todavía cargando) — quien use este hook simplemente no
// renderiza nada en ese caso.
function useWeather() {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchWeather(pos.coords.latitude, pos.coords.longitude)
          .then((data) => {
            if (!cancelled) setWeather(data);
          })
          .catch(() => {});
      },
      () => {}, // permiso rechazado o error de ubicación: sin widget
      { maximumAge: CACHE_TTL_MS, timeout: 10000 }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return weather;
}

// Reloj en vivo de la zona horaria del lugar donde está el usuario —
// puramente local (Intl.DateTimeFormat), no pide nada a ninguna API.
// Solo corre mientras se pide (panel expandido, ver más abajo) para no
// mantener un intervalo activo de más.
function useLocalClock(timezone, active) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active || !timezone) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, [active, timezone]);

  return now;
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function ClearIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="6.3" y2="6.3" />
      <line x1="17.7" y1="17.7" x2="19.1" y2="19.1" />
      <line x1="4.9" y1="19.1" x2="6.3" y2="17.7" />
      <line x1="17.7" y1="6.3" x2="19.1" y2="4.9" />
    </svg>
  );
}

function CloudyIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 8.02 4.5 4.5 0 0 1 16.5 18H7z" />
    </svg>
  );
}

function FogIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 11a4 4 0 0 1-.4-7.98A5 5 0 0 1 16 5" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="6" y1="19" x2="18" y2="19" />
    </svg>
  );
}

function RainIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 15a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 5.02 4.5 4.5 0 0 1 16.5 15H7z" />
      <line x1="8" y1="18" x2="7" y2="21" />
      <line x1="12" y1="18" x2="11" y2="21" />
      <line x1="16" y1="18" x2="15" y2="21" />
    </svg>
  );
}

function SnowIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 14a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 4.02 4.5 4.5 0 0 1 16.5 14H7z" />
      <line x1="8" y1="18" x2="8" y2="21" />
      <line x1="6.5" y1="19.5" x2="9.5" y2="19.5" />
      <line x1="16" y1="18" x2="16" y2="21" />
      <line x1="14.5" y1="19.5" x2="17.5" y2="19.5" />
    </svg>
  );
}

function StormIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 14a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 4.02 4.5 4.5 0 0 1 16.5 14H7z" />
      <path d="M12 15l-2 4h3l-2 4" />
    </svg>
  );
}

function ChevronIcon(props) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

const ICONS_BY_GROUP = {
  clear: ClearIcon,
  cloudy: CloudyIcon,
  fog: FogIcon,
  rain: RainIcon,
  snow: SnowIcon,
  storm: StormIcon,
};

const styles = {
  wrapper: { position: "relative" },
  wrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
    color: "var(--accent)",
    cursor: "pointer",
  },
  temp: {
    fontSize: "13px",
    fontWeight: 700,
    color: "var(--text)",
  },
  range: {
    display: "flex",
    gap: "5px",
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--text-muted)",
  },
  chevron: (expanded) => ({
    color: "var(--text-muted)",
    display: "flex",
    transform: expanded ? "rotate(180deg)" : "none",
    transition: "transform 0.15s ease",
  }),
  panel: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    width: "270px",
    maxWidth: "90vw",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "18px",
    padding: "14px 16px",
    zIndex: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
    boxSizing: "border-box",
  },
  place: {
    fontSize: "14px",
    fontWeight: 700,
    color: "var(--text)",
    margin: 0,
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: "6px",
  },
  preciseLink: {
    background: "none",
    border: "none",
    padding: 0,
    color: "var(--accent)",
    fontSize: "11px",
    fontWeight: 600,
    textDecoration: "underline",
    cursor: "pointer",
  },
  dateTime: {
    fontSize: "12px",
    color: "var(--text-muted)",
    margin: "2px 0 12px",
    textTransform: "capitalize",
  },
  forecastRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "4px",
  },
  forecastDay: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    color: "var(--accent)",
  },
  forecastLabel: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "capitalize",
  },
  forecastRange: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: "10px",
    fontWeight: 600,
  },
  forecastMax: { color: "var(--text)" },
  forecastMin: { color: "var(--text-muted)" },
  consentOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 60,
    boxSizing: "border-box",
  },
  consentPanel: {
    width: "100%",
    maxWidth: "380px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "22px",
    boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
    padding: "22px 20px",
    boxSizing: "border-box",
  },
  consentTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "16px",
    fontWeight: 700,
    color: "var(--text)",
    margin: "0 0 12px",
  },
  consentBody: {
    fontSize: "13px",
    lineHeight: 1.5,
    color: "var(--text)",
    margin: "0 0 10px",
  },
  consentAccept: {
    width: "100%",
    padding: "12px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "8px",
  },
  consentCancel: {
    width: "100%",
    padding: "11px",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    marginTop: "10px",
  },
};

function formatDateTime(date, timezone, locale) {
  const dateText = date.toLocaleDateString(locale, {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeText = date.toLocaleTimeString(locale, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateText} · ${timeText}`;
}

// Aviso de privacidad antes de precisar la ubicación (hallazgo del
// pedido: tiene que ser un modal claro, no un texto chico que se pueda
// pasar por alto). Mismo patrón visual que ya usa ReportButton.jsx
// (overlay + panel centrado).
function ConsentModal({ onAccept, onCancel, loading, t }) {
  return (
    <div style={styles.consentOverlay} onClick={onCancel}>
      <div style={styles.consentPanel} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.consentTitle}>{t("weather.consentTitle")}</h2>
        <p style={styles.consentBody}>{t("weather.consentBody1")}</p>
        <p style={styles.consentBody}>{t("weather.consentBody2")}</p>
        <p style={styles.consentBody}>{t("weather.consentBody3")}</p>
        <button type="button" style={styles.consentAccept} onClick={onAccept} disabled={loading}>
          {loading ? t("weather.consentAccepting") : t("weather.consentAccept")}
        </button>
        <button type="button" style={styles.consentCancel} onClick={onCancel} disabled={loading}>
          {t("weather.consentCancel")}
        </button>
      </div>
    </div>
  );
}

export default function WeatherWidget() {
  const { language, t } = useLanguage();
  const locale = language === "en" ? "en-US" : "es-ES";
  const weather = useWeather();
  const [expanded, setExpanded] = useState(false);
  const [preciseCityName, setPreciseCityName] = useState(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [preciseLoading, setPreciseLoading] = useState(false);
  const now = useLocalClock(weather?.timezone, expanded);
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setExpanded(false);
      }
    }
    if (expanded) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  // Si ya se precisó la ubicación antes en esta misma sesión (y sigue
  // siendo la misma zona, ~5km de tolerancia), usa ese resultado en vez
  // de volver a preguntar o volver a llamar a Nominatim.
  useEffect(() => {
    if (!weather) return;
    const cached = readPreciseLocationCache();
    if (
      cached &&
      Math.abs(cached.lat - weather.lat) < 0.05 &&
      Math.abs(cached.lon - weather.lon) < 0.05
    ) {
      setPreciseCityName(cached.cityName);
    }
  }, [weather]);

  const handleConfirmPrecise = async () => {
    setPreciseLoading(true);
    try {
      const cityName = await fetchPreciseCity(weather.lat, weather.lon);
      if (cityName) {
        setPreciseCityName(cityName);
        writePreciseLocationCache({ lat: weather.lat, lon: weather.lon, cityName });
      }
    } catch {
      // Nominatim falló: se sigue mostrando el nombre aproximado, sin
      // ningún error visible (mismo criterio que el resto del widget).
    } finally {
      setPreciseLoading(false);
      setConsentOpen(false);
    }
  };

  if (!weather) return null;
  const Icon = ICONS_BY_GROUP[getWeatherIconGroup(weather.code)];
  const displayCityName = preciseCityName || weather.cityName;

  return (
    <div style={styles.wrapper} ref={panelRef}>
      <div style={styles.wrap} onClick={() => setExpanded((v) => !v)}>
        <Icon />
        <span style={styles.temp}>{weather.temp}°</span>
        <span style={styles.range}>
          <span>↓{weather.tMin}°</span>
          <span>↑{weather.tMax}°</span>
        </span>
        <ChevronIcon style={styles.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={styles.panel}>
          {displayCityName && (
            <p style={styles.place}>
              {displayCityName}
              {!preciseCityName && (
                <button
                  type="button"
                  style={styles.preciseLink}
                  onClick={() => setConsentOpen(true)}
                >
                  {t("weather.preciseLocationLink")}
                </button>
              )}
            </p>
          )}
          {weather.timezone && (
            <p style={styles.dateTime}>{formatDateTime(now, weather.timezone, locale)}</p>
          )}
          <div style={styles.forecastRow}>
            {weather.forecast.map((day) => {
              const DayIcon = ICONS_BY_GROUP[getWeatherIconGroup(day.code)];
              const dayLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString(locale, {
                timeZone: weather.timezone,
                weekday: "short",
              });
              return (
                <div key={day.date} style={styles.forecastDay}>
                  <span style={styles.forecastLabel}>{dayLabel}</span>
                  <DayIcon width={18} height={18} />
                  <span style={styles.forecastRange}>
                    <span style={styles.forecastMax}>{day.tMax}°</span>
                    <span style={styles.forecastMin}>{day.tMin}°</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {consentOpen && (
        <ConsentModal
          onAccept={handleConfirmPrecise}
          onCancel={() => setConsentOpen(false)}
          loading={preciseLoading}
          t={t}
        />
      )}
    </div>
  );
}
