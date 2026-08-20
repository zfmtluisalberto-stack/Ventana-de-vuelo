import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Wind, Navigation2, Droplets, Eye, CloudFog, Gauge, MapPin, RefreshCw, Settings2, Sun, CloudRain } from "lucide-react";

const PRESETS = [
  { name: "La Paz", lat: 24.1426, lon: -110.3128 },
  { name: "Los Cabos", lat: 22.8905, lon: -109.9167 },
  { name: "Loreto", lat: 26.0111, lon: -111.3481 },
  { name: "Todos Santos", lat: 23.4483, lon: -110.2242 },
];

const DEFAULT_THRESHOLDS = {
  windGo: 20, windCaution: 30,           // km/h sostenido
  gustGo: 25, gustCaution: 35,           // km/h ráfagas
  precipGo: 20, precipCaution: 50,       // % probabilidad
  visGo: 5000, visCaution: 3000,         // metros
  fogSpreadGo: 3, fogSpreadCaution: 1.5, // °C temp - punto de rocío
  cloudGood: 40, cloudPoor: 80,          // % cobertura (calidad, no seguridad)
};

const STATUS = {
  GO: { label: "VUELO", color: "#3F7A5C", bg: "#E4EEE6" },
  CAUTION: { label: "PRECAUCIÓN", color: "#C1811E", bg: "#F5E8D2" },
  NOGO: { label: "NO VOLAR", color: "#B8371F", bg: "#F3DCD5" },
};

const THRESHOLDS_STORAGE_KEY = "ventana-de-vuelo:thresholds";

function worst(a, b) {
  const order = { GO: 0, CAUTION: 1, NOGO: 2 };
  return order[a] >= order[b] ? a : b;
}

function evaluateHour(h, t) {
  let status = "GO";
  const reasons = [];

  if (h.wind_speed_10m >= t.windCaution) { status = worst(status, "NOGO"); reasons.push("viento sostenido"); }
  else if (h.wind_speed_10m >= t.windGo) { status = worst(status, "CAUTION"); reasons.push("viento sostenido"); }

  if (h.wind_gusts_10m >= t.gustCaution) { status = worst(status, "NOGO"); reasons.push("ráfagas"); }
  else if (h.wind_gusts_10m >= t.gustGo) { status = worst(status, "CAUTION"); reasons.push("ráfagas"); }

  if (h.precipitation_probability >= t.precipCaution) { status = worst(status, "NOGO"); reasons.push("lluvia"); }
  else if (h.precipitation_probability >= t.precipGo) { status = worst(status, "CAUTION"); reasons.push("lluvia"); }

  if (h.visibility <= t.visCaution) { status = worst(status, "NOGO"); reasons.push("visibilidad"); }
  else if (h.visibility <= t.visGo) { status = worst(status, "CAUTION"); reasons.push("visibilidad"); }

  const spread = h.temperature_2m - h.dew_point_2m;
  if (spread <= t.fogSpreadCaution) { status = worst(status, "NOGO"); reasons.push("neblina"); }
  else if (spread <= t.fogSpreadGo) { status = worst(status, "CAUTION"); reasons.push("neblina"); }

  let quality = "GO";
  if (h.cloud_cover >= t.cloudPoor) quality = "NOGO";
  else if (h.cloud_cover >= t.cloudGood) quality = "CAUTION";

  return { status, reasons, quality, spread };
}

function dirToCompass(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function fmtHour(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", hour12: false }) + "h";
}

function fmtDay(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" });
}

function loadStoredThresholds() {
  try {
    const raw = window.localStorage.getItem(THRESHOLDS_STORAGE_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_THRESHOLDS, ...parsed };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export default function App() {
  const [coords, setCoords] = useState(PRESETS[0]);
  const [customLat, setCustomLat] = useState(String(PRESETS[0].lat));
  const [customLon, setCustomLon] = useState(String(PRESETS[0].lon));
  const [thresholds, setThresholds] = useState(loadStoredThresholds);
  const [showConfig, setShowConfig] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [placeName, setPlaceName] = useState(PRESETS[0].name);
  const abortRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify(thresholds));
    } catch {
      // localStorage puede fallar en modo privado; no es crítico
    }
  }, [thresholds]);

  const fetchData = useCallback(async (lat, lon) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        hourly: [
          "temperature_2m", "relative_humidity_2m", "dew_point_2m",
          "precipitation_probability", "precipitation", "cloud_cover",
          "visibility", "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m",
          "wind_speed_80m", "wind_direction_80m", "uv_index", "surface_pressure",
        ].join(","),
        timezone: "auto",
        forecast_days: "3",
        wind_speed_unit: "kmh",
      });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`No se pudo obtener el pronóstico (HTTP ${res.status})`);
      const json = await res.json();
      setData(json);
      setSelectedIdx(null);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message || "Error de red al consultar Open-Meteo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(coords.lat, coords.lon);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [coords, fetchData]);

  const hourly = useMemo(() => {
    if (!data) return [];
    const n = data.hourly.time.length;
    const now = Date.now();
    const rows = [];
    for (let i = 0; i < n; i++) {
      const row = {
        time: data.hourly.time[i],
        temperature_2m: data.hourly.temperature_2m[i],
        relative_humidity_2m: data.hourly.relative_humidity_2m[i],
        dew_point_2m: data.hourly.dew_point_2m[i],
        precipitation_probability: data.hourly.precipitation_probability[i],
        precipitation: data.hourly.precipitation[i],
        cloud_cover: data.hourly.cloud_cover[i],
        visibility: data.hourly.visibility[i],
        wind_speed_10m: data.hourly.wind_speed_10m[i],
        wind_gusts_10m: data.hourly.wind_gusts_10m[i],
        wind_direction_10m: data.hourly.wind_direction_10m[i],
        wind_speed_80m: data.hourly.wind_speed_80m[i],
        wind_direction_80m: data.hourly.wind_direction_80m[i],
        uv_index: data.hourly.uv_index[i],
        surface_pressure: data.hourly.surface_pressure[i],
      };
      const evalResult = evaluateHour(row, thresholds);
      rows.push({ ...row, ...evalResult, ts: new Date(row.time).getTime() });
    }
    let nowIdx = rows.findIndex(r => r.ts >= now);
    if (nowIdx === -1) nowIdx = 0;
    return rows.map((r, i) => ({ ...r, isNow: i === nowIdx }));
  }, [data, thresholds]);

  const nowIdx = hourly.findIndex(r => r.isNow);
  const activeIdx = selectedIdx !== null ? selectedIdx : nowIdx;
  const active = hourly[activeIdx];

  const dayGroups = useMemo(() => {
    const groups = [];
    let currentDay = null;
    hourly.forEach((h, i) => {
      const day = new Date(h.time).toDateString();
      if (day !== currentDay) {
        groups.push({ day, label: fmtDay(h.time), startIdx: i, hours: [] });
        currentDay = day;
      }
      groups[groups.length - 1].hours.push({ ...h, idx: i });
    });
    return groups;
  }, [hourly]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError("Geolocalización no disponible en este navegador"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(4);
        const lon = +pos.coords.longitude.toFixed(4);
        setCoords({ lat, lon });
        setCustomLat(String(lat));
        setCustomLon(String(lon));
        setPlaceName("Mi ubicación");
      },
      () => setError("No se pudo obtener tu ubicación"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const applyCustomCoords = () => {
    const lat = parseFloat(customLat), lon = parseFloat(customLon);
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setError("Coordenadas inválidas");
      return;
    }
    setCoords({ lat, lon });
    setPlaceName("Personalizada");
  };

  const updateThreshold = (key, value) => {
    const num = parseFloat(value);
    setThresholds(prev => ({ ...prev, [key]: Number.isNaN(num) ? prev[key] : num }));
  };

  const resetThresholds = () => setThresholds(DEFAULT_THRESHOLDS);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#ECE4D3", minHeight: "100vh", color: "#10262B" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 60px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "3px solid #10262B", paddingBottom: 14, marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: 2, color: "#1F6F78", marginBottom: 4 }}>LEVANTAMIENTO FOTOGRAMÉTRICO · eXplora VTOL</div>
            <h1 className="disp" style={{ fontSize: 40, fontWeight: 900, lineHeight: 0.95, margin: 0, textTransform: "uppercase" }}>Ventana de Vuelo</h1>
          </div>
          <button onClick={() => fetchData(coords.lat, coords.lon)} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1.5px solid #10262B", borderRadius: 4, padding: "8px 12px", cursor: loading ? "default" : "pointer", fontFamily: "inherit", fontSize: 13, opacity: loading ? 0.6 : 1 }}>
            <RefreshCw size={14} className={loading ? "spin" : ""} /> {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20, alignItems: "center" }}>
          {PRESETS.map(p => (
            <button key={p.name} onClick={() => { setCoords(p); setCustomLat(String(p.lat)); setCustomLon(String(p.lon)); setPlaceName(p.name); }}
              style={{
                fontSize: 12.5, padding: "6px 12px", borderRadius: 100, cursor: "pointer", fontFamily: "inherit",
                border: placeName === p.name ? "1.5px solid #10262B" : "1.5px solid #C9BE9E",
                background: placeName === p.name ? "#10262B" : "transparent",
                color: placeName === p.name ? "#ECE4D3" : "#10262B",
              }}>
              {p.name}
            </button>
          ))}
          <button onClick={useMyLocation} style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 100, border: "1.5px solid #C9BE9E", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
            <MapPin size={13} /> Mi ubicación
          </button>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
            <input value={customLat} onChange={e => setCustomLat(e.target.value)} placeholder="lat" className="mono"
              style={{ width: 78, fontSize: 12, padding: "6px 8px", border: "1.5px solid #C9BE9E", borderRadius: 4, background: "#fff" }} />
            <input value={customLon} onChange={e => setCustomLon(e.target.value)} placeholder="lon" className="mono"
              style={{ width: 78, fontSize: 12, padding: "6px 8px", border: "1.5px solid #C9BE9E", borderRadius: 4, background: "#fff" }} />
            <button onClick={applyCustomCoords} style={{ fontSize: 12, padding: "6px 10px", border: "1.5px solid #10262B", borderRadius: 4, background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>Ir</button>
          </div>
        </div>

        {error && <div style={{ background: "#F3DCD5", border: "1.5px solid #B8371F", color: "#8A2A17", padding: "10px 14px", borderRadius: 4, marginBottom: 16, fontSize: 13.5 }}>{error}</div>}

        {loading && !data && <div className="mono" style={{ padding: 40, textAlign: "center", color: "#1F6F78" }}>Cargando pronóstico…</div>}

        {active && (
          <>
            <div style={{ background: STATUS[active.status].bg, border: `2px solid ${STATUS[active.status].color}`, borderRadius: 6, padding: "24px 28px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div className="mono" style={{ fontSize: 11, letterSpacing: 1.5, color: STATUS[active.status].color, marginBottom: 4 }}>
                  {selectedIdx === null ? "AHORA" : fmtDay(active.time).toUpperCase() + " · " + fmtHour(active.time)}
                </div>
                <div className="disp" style={{ fontSize: 52, fontWeight: 900, color: STATUS[active.status].color, lineHeight: 1 }}>
                  {STATUS[active.status].label}
                </div>
                {active.reasons.length > 0 && (
                  <div style={{ fontSize: 13, marginTop: 6, color: "#3A3226" }}>
                    Limitado por: {[...new Set(active.reasons)].join(", ")}
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, auto)", gap: "10px 28px" }}>
                <ReadOut icon={<Wind size={15} />} label="Viento 10m" value={`${active.wind_speed_10m.toFixed(0)} km/h`} sub={dirToCompass(active.wind_direction_10m)} />
                <ReadOut icon={<Navigation2 size={15} />} label="Ráfagas" value={`${active.wind_gusts_10m.toFixed(0)} km/h`} />
                <ReadOut icon={<Wind size={15} />} label="Viento 80m" value={`${active.wind_speed_80m.toFixed(0)} km/h`} sub={dirToCompass(active.wind_direction_80m)} />
                <ReadOut icon={<CloudRain size={15} />} label="Prob. lluvia" value={`${active.precipitation_probability}%`} />
                <ReadOut icon={<Eye size={15} />} label="Visibilidad" value={`${(active.visibility / 1000).toFixed(1)} km`} />
                <ReadOut icon={<CloudFog size={15} />} label="Margen niebla" value={`${active.spread.toFixed(1)} °C`} />
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div className="mono" style={{ fontSize: 11, letterSpacing: 1.5, color: "#5A5240", marginBottom: 10 }}>VENTANA · 72 HORAS</div>
              {dayGroups.map(g => (
                <div key={g.day} style={{ marginBottom: 14 }}>
                  <div className="disp" style={{ fontSize: 15, fontWeight: 700, textTransform: "uppercase", marginBottom: 4, color: "#5A5240" }}>{g.label}</div>
                  <div style={{ display: "flex", gap: 2 }}>
                    {g.hours.map(h => (
                      <div key={h.idx} onClick={() => setSelectedIdx(h.idx)} title={`${fmtHour(h.time)} · ${STATUS[h.status].label}`}
                        style={{
                          flex: 1, height: 34, background: STATUS[h.status].color, cursor: "pointer", borderRadius: 2,
                          outline: activeIdx === h.idx ? "2.5px solid #10262B" : "none", outlineOffset: 1,
                          opacity: h.quality === "NOGO" && h.status === "GO" ? 0.55 : 1,
                          position: "relative",
                        }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                    {g.hours.map(h => (
                      <div key={h.idx} className="mono" style={{ flex: 1, fontSize: 9, textAlign: "center", color: "#8A8268" }}>
                        {h.idx % 3 === 0 ? fmtHour(h.time).replace("h", "") : ""}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 16, fontSize: 11.5, marginTop: 8, color: "#5A5240", flexWrap: "wrap" }}>
                <Legend color={STATUS.GO.color} label="Vuelo" />
                <Legend color={STATUS.CAUTION.color} label="Precaución" />
                <Legend color={STATUS.NOGO.color} label="No volar" />
                <span style={{ opacity: 0.7 }}>· franjas atenuadas = nubosidad reduce calidad de imagen aunque el vuelo sea seguro</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 28 }}>
              <DetailCard icon={<Sun size={16} />} label="Índice UV" value={active.uv_index.toFixed(1)} />
              <DetailCard icon={<Droplets size={16} />} label="Humedad" value={`${active.relative_humidity_2m}%`} />
              <DetailCard icon={<Gauge size={16} />} label="Presión" value={`${active.surface_pressure.toFixed(0)} hPa`} />
              <DetailCard icon={<CloudRain size={16} />} label="Nubosidad" value={`${active.cloud_cover}%`} flag={active.quality} />
              <DetailCard icon={<CloudFog size={16} />} label="Punto rocío" value={`${active.dew_point_2m.toFixed(1)} °C`} />
              <DetailCard icon={<Wind size={16} />} label="Temp." value={`${active.temperature_2m.toFixed(1)} °C`} />
            </div>

            <div style={{ borderTop: "1.5px solid #C9BE9E", paddingTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <button onClick={() => setShowConfig(s => !s)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "#5A5240", padding: 0 }}>
                  <Settings2 size={14} /> Ajustar umbrales para el eXplora {showConfig ? "▲" : "▼"}
                </button>
                {showConfig && (
                  <button onClick={resetThresholds} style={{ fontSize: 11.5, background: "none", border: "none", cursor: "pointer", color: "#8A8268", textDecoration: "underline", fontFamily: "inherit" }}>
                    Restablecer valores por defecto
                  </button>
                )}
              </div>
              {showConfig && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 16 }}>
                  <ThresholdPair label="Viento sostenido (km/h)" goKey="windGo" cautionKey="windCaution" t={thresholds} onChange={updateThreshold} />
                  <ThresholdPair label="Ráfagas (km/h)" goKey="gustGo" cautionKey="gustCaution" t={thresholds} onChange={updateThreshold} />
                  <ThresholdPair label="Prob. lluvia (%)" goKey="precipGo" cautionKey="precipCaution" t={thresholds} onChange={updateThreshold} />
                  <ThresholdPair label="Visibilidad mín. (m)" goKey="visGo" cautionKey="visCaution" t={thresholds} onChange={updateThreshold} invert />
                  <ThresholdPair label="Margen anti-niebla (°C)" goKey="fogSpreadGo" cautionKey="fogSpreadCaution" t={thresholds} onChange={updateThreshold} invert />
                  <ThresholdPair label="Nubosidad calidad (%)" goKey="cloudGood" cautionKey="cloudPoor" t={thresholds} onChange={updateThreshold} />
                </div>
              )}
            </div>

            <div style={{ marginTop: 28, fontSize: 11.5, color: "#8A8268", lineHeight: 1.6 }}>
              Datos de Open-Meteo (modelo GFS/ICON). Los umbrales son un punto de partida — ajústalos a las especificaciones reales de tu eXplora y a tu manual de operaciones bajo AFAC. Esta herramienta apoya la decisión go/no-go; no sustituye el juicio del piloto en sitio.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReadOut({ icon, label, value, sub }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5A5240", marginBottom: 2 }}>{icon}{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{value}{sub && <span style={{ fontSize: 12, marginLeft: 6, color: "#5A5240" }}>{sub}</span>}</div>
    </div>
  );
}

function DetailCard({ icon, label, value, flag }) {
  const flagColor = flag ? STATUS[flag].color : null;
  return (
    <div style={{ background: "#fff", border: "1.5px solid #DDD3B8", borderRadius: 4, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5A5240", marginBottom: 4 }}>{icon}{label}</div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: flagColor || "#10262B" }}>{value}</div>
    </div>
  );
}

function Legend({ color, label }) {
  return <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: "inline-block" }} />{label}</span>;
}

function ThresholdPair({ label, goKey, cautionKey, t, onChange, invert }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#5A5240", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="number" value={t[goKey]} onChange={e => onChange(goKey, e.target.value)}
          className="mono" style={{ width: 70, fontSize: 12, padding: "5px 6px", border: "1.5px solid #3F7A5C", borderRadius: 4 }} />
        <span style={{ fontSize: 11, color: "#8A8268" }}>{invert ? "≥ vuelo" : "≤ vuelo"}</span>
        <input type="number" value={t[cautionKey]} onChange={e => onChange(cautionKey, e.target.value)}
          className="mono" style={{ width: 70, fontSize: 12, padding: "5px 6px", border: "1.5px solid #B8371F", borderRadius: 4 }} />
        <span style={{ fontSize: 11, color: "#8A8268" }}>{invert ? "≥ límite" : "≤ límite"}</span>
      </div>
    </div>
  );
}
