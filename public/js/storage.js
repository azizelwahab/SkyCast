// Safe localStorage helpers and validation for saved locations.
// `storage` is passed in so the logic can be unit-tested without a browser.
export const MAX_SAVED = 12;

export function readJSON(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJSON(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Returns a clean { name, country, lat, lon } or null if the data is not trustworthy.
export function parseLocation(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 100) : "";
  const country = typeof raw.country === "string" ? raw.country.trim().slice(0, 60) : "";
  const { lat, lon } = raw;
  if (!name) return null;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  return { name, country, lat, lon };
}

export const isSameLocation = (a, b) => Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;

export function parseSavedLocations(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const loc = parseLocation(item);
    if (loc && !out.some((o) => isSameLocation(o, loc))) out.push(loc);
  }
  return out.slice(0, MAX_SAVED);
}

export function addLocation(list, loc) {
  if (list.some((x) => isSameLocation(x, loc))) return list; // no duplicates
  return [...list, loc].slice(-MAX_SAVED);
}

export const removeLocation = (list, loc) => list.filter((x) => !isSameLocation(x, loc));
