const CODES = {
  0: ["☀️", "Clear sky"], 1: ["🌤️", "Mainly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
  45: ["🌫️", "Fog"], 48: ["🌫️", "Rime fog"], 51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌧️", "Heavy drizzle"],
  56: ["🌧️", "Freezing drizzle"], 57: ["🌧️", "Freezing drizzle"], 61: ["🌧️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
  66: ["🌧️", "Freezing rain"], 67: ["🌧️", "Freezing rain"], 71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["❄️", "Heavy snow"],
  77: ["🌨️", "Snow grains"], 80: ["🌦️", "Rain showers"], 81: ["🌧️", "Heavy showers"], 82: ["⛈️", "Violent showers"],
  85: ["🌨️", "Snow showers"], 86: ["❄️", "Heavy snow showers"], 95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm, hail"], 99: ["⛈️", "Severe thunderstorm"],
};
const $ = (id) => document.getElementById(id);
const store = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const state = { unit: store.get("unit", "C"), data: null, saved: store.get("saved", []) };

const code = (c) => CODES[c] || ["🌡️", "Unknown"];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tNum = (c) => Math.round(state.unit === "C" ? c : (c * 9) / 5 + 32);
const t = (c) => tNum(c) + "°";
const wind = (k) => (state.unit === "C" ? Math.round(k) + " km/h" : Math.round(k * 0.621371) + " mph");
const ymd = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const hhmm = (s) => s.slice(11, 16);
const hour12 = (h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const level = (v, lo, hi) => (v < lo ? "Low" : v < hi ? "Medium" : "High");

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

// ---- SVG helpers ---------------------------------------------------------
function smooth(p) {
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}
function areaChart(values, id, fill = true) {
  const W = 300, H = 100, pad = 8;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, pad + (1 - (v - min) / span) * (H - pad * 2)]);
  const line = smooth(pts);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c6cf5" stop-opacity=".55"/><stop offset="1" stop-color="#7c6cf5" stop-opacity="0"/></linearGradient></defs>
    ${fill ? `<path d="${line} L${W},${H} L0,${H} Z" fill="url(#${id})"/>` : ""}
    <path d="${line}" fill="none" stroke="#a79bff" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function ring(pct, label) {
  const C = 2 * Math.PI * 46, dash = (Math.max(0, Math.min(100, pct)) / 100) * C;
  return `<svg class="ring" viewBox="0 0 110 110" role="img" aria-label="${esc(label)}">
    <circle cx="55" cy="55" r="46" fill="none" stroke="#2c2860" stroke-width="9"/>
    <circle cx="55" cy="55" r="46" fill="none" stroke="#7c6cf5" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${dash} ${C}" transform="rotate(-90 55 55)"/>
    <text x="55" y="61" text-anchor="middle">${esc(label)}</text></svg>`;
}

// ---- Rendering -----------------------------------------------------------
function render() {
  const d = state.data;
  if (!d) return;
  const { place, forecast: f } = d;
  const c = f.current, h = f.hourly, day = f.daily;
  const where = place.country ? `${place.name}, ${place.country}` : place.name;
  $("title").textContent = `${place.name}, ${t(c.temperature_2m)}`;
  document.title = `${place.name} ${t(c.temperature_2m)} – SkyCast`;

  const hourKey = c.time.slice(0, 13) + ":00";
  let idx = h.time.indexOf(hourKey);
  if (idx < 0) idx = 0;
  const dayStart = idx - Number(c.time.slice(11, 13));
  const today = h.temperature_2m.slice(Math.max(dayStart, 0), Math.max(dayStart, 0) + 24);
  const at = (hr) => today[Math.min(hr, today.length - 1)];
  const [icon, label] = code(c.weather_code);

  $("current").innerHTML = `
    <div>
      <div class="big-icon" title="${label}">${icon}</div>
      <div class="big-temp">${tNum(c.temperature_2m)}° ${state.unit}</div>
      <div class="place">${esc(where)}</div>
      <div class="meta">
        <div>${label} · Feels like ${t(c.apparent_temperature)}</div>
        <hr />
        <div>📅 ${ymd(c.time).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</div>
        <div>🕒 ${hhmm(c.time)} local time</div>
        <div>🌅 ${hhmm(day.sunrise[0])} &nbsp; 🌇 ${hhmm(day.sunset[0])}</div>
      </div>
    </div>
    <div class="chart">
      <div class="chart-title">Temperature today</div>
      ${areaChart(today, "tg")}
      <div class="periods">
        <div><span>Morning</span><strong>${t(at(8))}</strong></div>
        <div><span>Afternoon</span><strong>${t(at(14))}</strong></div>
        <div><span>Evening</span><strong>${t(at(19))}</strong></div>
        <div><span>Night</span><strong>${t(at(23))}</strong></div>
      </div>
      <div class="foot"><span>🧭 ${Math.round(c.surface_pressure)} hPa</span><span>💧 ${c.relative_humidity_2m}%</span><span>💨 ${wind(c.wind_speed_10m)}</span></div>
    </div>`;

  const rain = day.precipitation_probability_max[0] ?? 0;
  const uv = h.uv_index[idx] ?? 0;
  const uvLabel = uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : "Very high";
  const winds = h.wind_speed_10m.slice(idx, idx + 24);
  $("minis").innerHTML = `
    <div class="mini"><div class="mini-head">💨 Wind</div>${areaChart(winds, "wg", false)}<div class="val">${wind(c.wind_speed_10m)}</div></div>
    <div class="mini"><div class="mini-head">🌧️ Rain chance <span>${level(rain, 30, 60)}</span></div>${ring(rain, rain + "%")}</div>
    <div class="mini"><div class="mini-head">🔆 UV index <span>${uvLabel}</span></div>${ring((uv / 11) * 100, uv.toFixed(1))}</div>
    <div class="mini"><div class="mini-head">☁️ Cloud cover <span>${level(c.cloud_cover, 30, 70)}</span></div>${ring(c.cloud_cover, c.cloud_cover + "%")}</div>`;

  $("hourly").innerHTML = Array.from({ length: 12 }, (_, i) => {
    const j = idx + i;
    if (j >= h.time.length) return "";
    const [ic] = code(h.weather_code[j]);
    const hr = Number(h.time[j].slice(11, 13));
    return `<div class="hour"><div class="t">${i === 0 ? "Now" : hour12(hr)}</div><div class="i">${ic}</div><b>${t(i === 0 ? c.temperature_2m : h.temperature_2m[j])}</b></div>`;
  }).join("");

  $("daily").innerHTML = day.time.map((dt, i) => {
    const name = i === 0 ? "Today" : i === 1 ? "Tomorrow" : ymd(dt).toLocaleDateString(undefined, { weekday: "long" });
    const [ic, lb] = code(day.weather_code[i]);
    return `<div class="day">
      <div><div class="n">${name}</div><div class="d">${ymd(dt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · 💧 ${day.precipitation_probability_max[i] ?? 0}%</div>
      <div class="sun">🌅 ${hhmm(day.sunrise[i])} 🌇 ${hhmm(day.sunset[i])}</div></div>
      <div class="i" title="${lb}">${ic}</div>
      <div class="r">${t(day.temperature_2m_max[i])}<small>${t(day.temperature_2m_min[i])}</small></div></div>`;
  }).join("");

  updateSaveBtn();
  setView(currentView, true);
}

let currentView = "dashboard";
function setView(v, keep) {
  currentView = v;
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  ["dashboard", "saved", "settings"].forEach((n) => $("view-" + n).classList.toggle("hidden", n !== v || (n === "dashboard" && !state.data)));
  if (v === "saved") renderSaved();
}

const sameSpot = (a, b) => Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
function updateSaveBtn() {
  const place = state.data && state.data.place;
  const on = place && state.saved.some((s) => sameSpot(s, place));
  $("saveBtn").textContent = on ? "♥" : "♡";
  $("saveBtn").classList.toggle("on", !!on);
}
function toggleSave() {
  if (!state.data) return;
  const p = state.data.place;
  state.saved = state.saved.some((s) => sameSpot(s, p)) ? state.saved.filter((s) => !sameSpot(s, p)) : [...state.saved, p].slice(-12);
  store.set("saved", state.saved);
  updateSaveBtn();
}
function renderSaved() {
  const box = $("view-saved");
  box.innerHTML = "<h3>Saved locations</h3>";
  if (!state.saved.length) box.innerHTML += '<p class="muted">Nothing saved yet. Tap ♡ at the top to save a place.</p>';
  state.saved.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "saved-item";
    row.innerHTML = `<button class="open">${esc(p.name)}${p.country ? ", " + esc(p.country) : ""}</button><button aria-label="Remove">✕</button>`;
    row.querySelector(".open").onclick = () => load({ lat: p.lat, lon: p.lon, name: p.name, country: p.country });
    row.lastChild.onclick = () => { state.saved.splice(i, 1); store.set("saved", state.saved); renderSaved(); updateSaveBtn(); };
    box.appendChild(row);
  });
}

function setUnit(u) {
  state.unit = u;
  store.set("unit", u);
  ["unitC", "unitC2"].forEach((id) => $(id).classList.toggle("active", u === "C"));
  ["unitF", "unitF2"].forEach((id) => $(id).classList.toggle("active", u === "F"));
  render();
}

// ---- Data loading --------------------------------------------------------
async function load(query) {
  setStatus("Loading weather...");
  try {
    const res = await fetch("/api/weather?" + new URLSearchParams(query), { signal: AbortSignal.timeout(12000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Something went wrong");
    state.data = body;
    store.set("last", body.place);
    setStatus("");
    currentView = "dashboard";
    render();
  } catch (err) {
    setStatus(err.name === "TimeoutError" ? "The request timed out. Please try again." : err.message, true);
  }
}

$("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const city = $("cityInput").value.trim();
  if (city) load({ city });
});
$("locBtn").onclick = () => {
  if (!navigator.geolocation) return setStatus("Geolocation is not supported by this browser", true);
  setStatus("Getting your location...");
  navigator.geolocation.getCurrentPosition(
    (p) => load({ lat: p.coords.latitude, lon: p.coords.longitude }),
    () => setStatus("Location permission denied. Try searching for a city instead.", true),
    { timeout: 10000 }
  );
};
$("saveBtn").onclick = toggleSave;
["unitC", "unitC2"].forEach((id) => ($(id).onclick = () => setUnit("C")));
["unitF", "unitF2"].forEach((id) => ($(id).onclick = () => setUnit("F")));
$("clearBtn").onclick = () => { state.saved = []; store.set("saved", []); updateSaveBtn(); setStatus("Saved locations cleared."); };
document.querySelectorAll(".nav").forEach((b) => (b.onclick = () => setView(b.dataset.view)));

setUnit(state.unit);
const last = store.get("last", null);
load(last ? { lat: last.lat, lon: last.lon, name: last.name, country: last.country } : { city: "London" });
