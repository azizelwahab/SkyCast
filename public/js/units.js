// Temperature and wind units are independent settings.
export const TEMP_UNITS = ["C", "F"];
export const WIND_UNITS = ["kmh", "mph"];
export const DEFAULT_PREFS = { temp: "C", wind: "kmh" };

const clean = (n) => (n === 0 ? 0 : n); // avoid "-0"

export function toDisplayTemp(celsius, unit) {
  return clean(Math.round(unit === "F" ? (celsius * 9) / 5 + 32 : celsius));
}
export const formatTemp = (celsius, unit) => `${toDisplayTemp(celsius, unit)}°`;

export function toDisplayWind(kmh, unit) {
  return clean(Math.round(unit === "mph" ? kmh * 0.621371 : kmh));
}
export const formatWind = (kmh, unit) => `${toDisplayWind(kmh, unit)} ${unit === "mph" ? "mph" : "km/h"}`;

export function normalizePrefs(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    temp: TEMP_UNITS.includes(r.temp) ? r.temp : DEFAULT_PREFS.temp,
    wind: WIND_UNITS.includes(r.wind) ? r.wind : DEFAULT_PREFS.wind,
  };
}
