import React, { useEffect, useState } from "react";

/*
  Weather.jsx
  -----------
  Widget de clima chico para el muro: si el usuario da permiso de
  geolocalización, pide el clima actual a la API pública y gratuita de
  Open-Meteo (https://api.open-meteo.com, sin API key) y muestra un
  ícono simple + temperatura actual + mínima/máxima del día. Si no hay
  permiso, el navegador no soporta geolocalización, o la API falla, el
  widget simplemente no aparece (sin mostrar ningún error ni insistir
  con el permiso — getCurrentPosition solo se pide una vez por montaje).

  Colores 100% de variables de tema (--surface, --border, --text,
  --text-muted, --accent) — nada hardcodeado, para que combine con
  cualquiera de los 4 temas o el modo Rotativo.

  Sin texto fijo de interfaz (solo números/ícono/flechas), así que no
  hizo falta agregar claves nuevas a translations.js.
*/

// 20 minutos: adentro del rango de 15-30 pedido, para no golpear la API
// de más si el muro se desmonta y se vuelve a montar seguido (cambiar de
// pestaña, volver de un perfil, etc.).
const CACHE_TTL_MS = 20 * 60 * 1000;

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
    `&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather request failed");
  const json = await res.json();
  const data = {
    temp: Math.round(json.current_weather.temperature),
    code: json.current_weather.weathercode,
    tMin: Math.round(json.daily.temperature_2m_min[0]),
    tMax: Math.round(json.daily.temperature_2m_max[0]),
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

function ClearIcon() {
  return (
    <svg {...iconProps}>
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

function CloudyIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 8.02 4.5 4.5 0 0 1 16.5 18H7z" />
    </svg>
  );
}

function FogIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 11a4 4 0 0 1-.4-7.98A5 5 0 0 1 16 5" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="6" y1="19" x2="18" y2="19" />
    </svg>
  );
}

function RainIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 15a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 5.02 4.5 4.5 0 0 1 16.5 15H7z" />
      <line x1="8" y1="18" x2="7" y2="21" />
      <line x1="12" y1="18" x2="11" y2="21" />
      <line x1="16" y1="18" x2="15" y2="21" />
    </svg>
  );
}

function SnowIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 14a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 4.02 4.5 4.5 0 0 1 16.5 14H7z" />
      <line x1="8" y1="18" x2="8" y2="21" />
      <line x1="6.5" y1="19.5" x2="9.5" y2="19.5" />
      <line x1="16" y1="18" x2="16" y2="21" />
      <line x1="14.5" y1="19.5" x2="17.5" y2="19.5" />
    </svg>
  );
}

function StormIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 14a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 4.02 4.5 4.5 0 0 1 16.5 14H7z" />
      <path d="M12 15l-2 4h3l-2 4" />
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
};

export default function WeatherWidget() {
  const weather = useWeather();
  if (!weather) return null;
  const Icon = ICONS_BY_GROUP[getWeatherIconGroup(weather.code)];
  return (
    <div style={styles.wrap}>
      <Icon />
      <span style={styles.temp}>{weather.temp}°</span>
      <span style={styles.range}>
        <span>↓{weather.tMin}°</span>
        <span>↑{weather.tMax}°</span>
      </span>
    </div>
  );
}
