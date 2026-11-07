import { describeWeather } from "./weatherCodes.js";
import { formatTemp, formatWind, normalizePrefs } from "./units.js";
import { areaChart, ring } from "./charts.js";
import { addDays, escapeHtml as esc, formatDate, hhmm, hour12 } from "./format.js";
import {
  addLocation, isSameLocation, parseLocation, parseSavedLocations, readJSON, removeLocation, writeJSON,
} from "./storage.js";

const $ = (id) => document.getElementById(id);
const storage = (() => {
  try { const s = window.localStorage; s.getItem("probe"); return s; }
  catch { return { getItem: () => null, setItem() {} }; } // storage blocked (private mode, etc.)
})();

const state = {
  prefs: normalizePrefs(readJSON(storage, "prefs", null)),
  saved: parseSavedLocations(readJSON(storage, "saved", [])),
  data: null,
  view: "dashboard",
  lastQuery: null,
  requestId: 0,
};

// ---- Status: loading, errors, retry ---------------------------------------
function showStatus({ loading = false, message = "", retry = null, error = false } = {}) {
  const el = $("status");
  el.replaceChildren();
  el.classList.toggle("error", error);
  $("main").setAttribute("aria-busy", String(loading));
  if (loading) {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    el.append(spinner);
  }
  if (message) el.append(message);
  if (retry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "retry";
    btn.textContent = "Try again";
    btn.onclick = retry;
    el.append(btn);
  }
  updateViews();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function requestWeather(query, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("/api/weather?" + new URLSearchParams(query), { signal: AbortSignal.timeout(12000) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return body;
      const err = new Error(body.error || `Request failed (${res.status}).`);
      err.retryable = res.status >= 500; // client errors (400/404/429) will not fix themselves
      throw err;
    } catch (err) {
      lastError = err;
      if (err.retryable === false || attempt === retries) break;
      await sleep(800 * (attempt + 1));
    }
  }
  if (lastError.name === "TimeoutError") lastError = new Error("The request timed out. Check your connection and try again.");
  else if (lastError instanceof TypeError) lastError = new Error("Could not reach the server. Check your internet connection.");
  throw lastError;
}

async function load(query) {
  state.lastQuery = query;
  const id = ++state.requestId;
  showStatus({ loading: true, message: "Loading weather…" });
  try {
    const body = await requestWeather(query);
    if (id !== state.requestId) return; // a newer request replaced this one
    state.data = body;
    writeJSON(storage, "last", body.place);
    showStatus();
    state.view = "dashboard";
    render();
  } catch (err) {
    if (id !== state.requestId) return;
    showStatus({ message: err.message, error: true, retry: () => load(query) });
    updateViews();
  }
}

// ---- Rendering -----------------------------------------------------------
const level = (v, lo, hi) => (v < lo ? "Low" : v < hi ? "Medium" : "High");

function render() {
  const d = state.data;
  if (!d) return updateViews();
  const { place, forecast: f } = d;
  const { temp, wind } = state.prefs;
  const c = f.current, h = f.hourly, day = f.daily;
  const t = (v) => formatTemp(v, temp);
  const w = (v) => formatWind(v, wind);
  const where = place.country ? `${place.name}, ${place.country}` : place.name;
  const { icon, label } = describeWeather(c.weather_code, c.is_day !== 0);

  $("title").textContent = `${place.name}, ${t(c.temperature_2m)}`;
  document.title = `${place.name} ${t(c.temperature_2m)} – SkyCast`;

  const nowKey = c.time.slice(0, 13) + ":00";
  const idx = Math.max(0, h.time.indexOf(nowKey));
  const localHour = Number(c.time.slice(11, 13));
  const start = Math.max(0, idx - localHour);
  const today = h.temperature_2m.slice(start, start + 24);
  const at = (hr) => today[Math.min(hr, today.length - 1)];
  const hi = day.temperature_2m_max[0], lo = day.temperature_2m_min[0];

  $("current").innerHTML = `
    <div>
      <div class="big-icon" aria-hidden="true">${icon}</div>
      <div class="big-temp">${esc(t(c.temperature_2m))} ${temp}</div>
      <div class="place">${esc(where)}</div>
      <div class="meta">
        <div>${esc(label)} · Feels like ${esc(t(c.apparent_temperature))}</div>
        <div>High ${esc(t(hi))} · Low ${esc(t(lo))}</div>
        <div>${esc(formatDate(c.time, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</div>
        <div>${esc(hhmm(c.time))} local time</div>
        <div><span aria-hidden="true">🌅</span> Sunrise ${esc(hhmm(day.sunrise[0]))} · <span aria-hidden="true">🌇</span> Sunset ${esc(hhmm(day.sunset[0]))}</div>
      </div>
    </div>
    <div class="chart">
      <h2 class="chart-title">Temperature today</h2>
      ${areaChart(today, { id: "tg", label: `Temperature today, from ${t(Math.min(...today))} to ${t(Math.max(...today))}` })}
      <dl class="periods">
        <div><dt>Morning</dt><dd>${esc(t(at(8)))}</dd></div>
        <div><dt>Afternoon</dt><dd>${esc(t(at(14)))}</dd></div>
        <div><dt>Evening</dt><dd>${esc(t(at(19)))}</dd></div>
        <div><dt>Night</dt><dd>${esc(t(at(23)))}</dd></div>
      </dl>
      <div class="foot"><span>Pressure ${Math.round(c.surface_pressure)} hPa</span><span>Humidity ${c.relative_humidity_2m}%</span><span>Wind ${esc(w(c.wind_speed_10m))}</span></div>
    </div>`;

  const rain = day.precipitation_probability_max[0] ?? 0;
  const uv = h.uv_index[idx] ?? 0;
  const uvLabel = uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : "Very high";
  const winds = h.wind_speed_10m.slice(idx, idx + 24);
  const peak = Math.max(...winds, c.wind_speed_10m);
  $("minis").innerHTML = `
    <article class="mini"><h3 class="mini-head"><span>Wind</span></h3>
      ${areaChart(winds, { id: "wg", fill: false, label: `Wind over the next 24 hours, peaking at ${w(peak)}` })}
      <p class="val">${esc(w(c.wind_speed_10m))}<span class="sub">Peak ${esc(w(peak))}</span></p></article>
    <article class="mini"><h3 class="mini-head"><span>Rain chance</span><span class="lvl">${level(rain, 30, 60)}</span></h3>
      ${ring(rain, rain + "%", `Chance of rain today ${rain} percent`)}</article>
    <article class="mini"><h3 class="mini-head"><span>UV index</span><span class="lvl">${uvLabel}</span></h3>
      ${ring((uv / 11) * 100, uv.toFixed(1), `UV index ${uv.toFixed(1)}, ${uvLabel}`)}</article>
    <article class="mini"><h3 class="mini-head"><span>Cloud cover</span><span class="lvl">${level(c.cloud_cover, 30, 70)}</span></h3>
      ${ring(c.cloud_cover, c.cloud_cover + "%", `Cloud cover ${c.cloud_cover} percent`)}</article>`;

  $("hourly").innerHTML = Array.from({ length: 12 }, (_, i) => {
    const j = idx + i;
    if (j >= h.time.length) return "";
    const hr = Number(h.time[j].slice(11, 13));
    const isDay = hr >= 6 && hr < 19;
    const wx = describeWeather(h.weather_code[j], isDay);
    const when = i === 0 ? "Now" : hour12(hr);
    return `<li class="hour"><span class="t">${when}</span><span class="i" role="img" aria-label="${esc(wx.label)}">${wx.icon}</span><b>${esc(t(i === 0 ? c.temperature_2m : h.temperature_2m[j]))}</b></li>`;
  }).join("");

  const todayIso = c.time.slice(0, 10), tomorrowIso = addDays(todayIso, 1);
  $("daily").innerHTML = day.time.map((dt, i) => {
    const name = dt === todayIso ? "Today" : dt === tomorrowIso ? "Tomorrow" : formatDate(dt, { weekday: "long" });
    const wx = describeWeather(day.weather_code[i], true);
    return `<li class="day">
      <div><div class="n">${esc(name)}</div>
        <div class="d">${esc(formatDate(dt, { day: "numeric", month: "short" }))} · Rain ${day.precipitation_probability_max[i] ?? 0}%</div>
        <div class="sun">Sunrise ${esc(hhmm(day.sunrise[i]))} · Sunset ${esc(hhmm(day.sunset[i]))}</div></div>
      <div class="i" role="img" aria-label="${esc(wx.label)}">${wx.icon}</div>
      <div class="r"><span class="sr-only">High </span>${esc(t(day.temperature_2m_max[i]))}<small><span class="sr-only">Low </span>${esc(t(day.temperature_2m_min[i]))}</small></div></li>`;
  }).join("");

  updateSaveBtn();
  updateViews();
}

function updateViews() {
  const hasData = Boolean(state.data);
  document.querySelectorAll(".nav").forEach((b) => {
    const active = b.dataset.view === state.view;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  $("view-dashboard").hidden = !(state.view === "dashboard" && hasData);
  $("view-empty").hidden = !(state.view === "dashboard" && !hasData && $("main").getAttribute("aria-busy") !== "true");
  $("view-saved").hidden = state.view !== "saved";
  $("view-settings").hidden = state.view !== "settings";
  if (state.view === "saved") renderSaved();
}

function setView(view, { focus = false } = {}) {
  state.view = view;
  updateViews();
  if (focus) $("main").focus();
}

// ---- Saved locations -------------------------------------------------------
function updateSaveBtn() {
  const loc = state.data && parseLocation(state.data.place);
  const saved = Boolean(loc && state.saved.some((s) => isSameLocation(s, loc)));
  const btn = $("saveBtn");
  btn.disabled = !loc;
  btn.setAttribute("aria-pressed", String(saved));
  btn.setAttribute("aria-label", saved ? "Remove this location from saved" : "Save this location");
  btn.classList.toggle("on", saved);
  btn.firstElementChild.textContent = saved ? "♥" : "♡";
}

function persistSaved() {
  if (!writeJSON(storage, "saved", state.saved)) showStatus({ message: "Could not save: browser storage is unavailable.", error: true });
  updateSaveBtn();
}

function toggleSave() {
  const loc = state.data && parseLocation(state.data.place);
  if (!loc) return;
  const exists = state.saved.some((s) => isSameLocation(s, loc));
  state.saved = exists ? removeLocation(state.saved, loc) : addLocation(state.saved, loc);
  persistSaved();
}

function renderSaved() {
  const box = $("view-saved");
  box.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = "Saved locations";
  box.append(heading);
  if (!state.saved.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No saved locations yet. Open a city and press the heart button to save it here.";
    box.append(p);
    return;
  }
  const list = document.createElement("ul");
  list.className = "saved-list";
  for (const loc of state.saved) {
    const li = document.createElement("li");
    li.className = "saved-item";
    const label = loc.country ? `${loc.name}, ${loc.country}` : loc.name;
    const open = document.createElement("button");
    open.type = "button";
    open.className = "open";
    open.textContent = label;
    open.onclick = () => load(loc);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.setAttribute("aria-label", `Remove ${label} from saved locations`);
    remove.textContent = "✕";
    remove.onclick = () => { state.saved = removeLocation(state.saved, loc); persistSaved(); renderSaved(); };
    li.append(open, remove);
    list.append(li);
  }
  box.append(list);
}

// ---- Preferences -----------------------------------------------------------
function applyPrefs() {
  document.querySelectorAll("[data-temp]").forEach((b) => {
    const on = b.dataset.temp === state.prefs.temp;
    b.setAttribute("aria-pressed", String(on)); b.classList.toggle("active", on);
  });
  document.querySelectorAll("[data-wind]").forEach((b) => {
    const on = b.dataset.wind === state.prefs.wind;
    b.setAttribute("aria-pressed", String(on)); b.classList.toggle("active", on);
  });
  writeJSON(storage, "prefs", state.prefs);
  render();
}

// ---- Events ----------------------------------------------------------------
function geolocationMessage(err) {
  if (!window.isSecureContext) return "Location needs a secure (HTTPS) connection. Search for a city instead.";
  switch (err.code) {
    case 1: return "Location access is blocked. Allow it in your browser's site settings, or search for a city.";
    case 2: return "Your location could not be determined. Check your GPS or connection, or search for a city.";
    case 3: return "Finding your location took too long. Try again, or search for a city.";
    default: return "Something went wrong while finding your location. Search for a city instead.";
  }
}

$("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const city = $("cityInput").value.trim();
  if (city.length < 2) return showStatus({ message: "Enter at least 2 characters.", error: true });
  load({ city });
});

$("locBtn").addEventListener("click", () => {
  if (!navigator.geolocation) return showStatus({ message: "This browser does not support location. Search for a city instead.", error: true });
  showStatus({ loading: true, message: "Finding your location…" });
  navigator.geolocation.getCurrentPosition(
    (p) => load({ lat: p.coords.latitude, lon: p.coords.longitude }),
    (err) => showStatus({ message: geolocationMessage(err), error: true }),
    { timeout: 10000 }
  );
});

$("saveBtn").addEventListener("click", toggleSave);
document.querySelectorAll("[data-temp]").forEach((b) => b.addEventListener("click", () => { state.prefs.temp = b.dataset.temp; applyPrefs(); }));
document.querySelectorAll("[data-wind]").forEach((b) => b.addEventListener("click", () => { state.prefs.wind = b.dataset.wind; applyPrefs(); }));
document.querySelectorAll(".nav").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view, { focus: true })));
$("clearBtn").addEventListener("click", () => {
  if (!state.saved.length || !window.confirm("Remove all saved locations?")) return;
  state.saved = [];
  persistSaved();
  showStatus({ message: "Saved locations cleared." });
});

// ---- Start -----------------------------------------------------------------
applyPrefs();
const last = parseLocation(readJSON(storage, "last", null));
load(last || { city: "London" });
