// Input validation and sanitisation for /api/weather query strings.
const CITY_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’()-]*$/u;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function parseCity(raw) {
  if (typeof raw !== "string") return { error: "City must be a single text value." };
  const city = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (city.length < 2) return { error: "City name must be at least 2 characters." };
  if (city.length > 100) return { error: "City name must be 100 characters or fewer." };
  if (!CITY_RE.test(city)) return { error: "City name contains unsupported characters." };
  return { value: city };
}

function parseCoordinate(raw, min, max, label) {
  if (typeof raw !== "string" || !NUMBER_RE.test(raw.trim())) {
    return { error: `${label} must be a number.` };
  }
  const n = Number(raw);
  if (n < min || n > max) return { error: `${label} must be between ${min} and ${max}.` };
  return { value: n };
}

// Optional display text: strip control characters and angle brackets, then truncate.
function cleanLabel(raw, max, fallback) {
  if (typeof raw !== "string") return fallback;
  const text = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}

function parseWeatherQuery(query) {
  if (query.city !== undefined) {
    const city = parseCity(query.city);
    return city.error ? { error: city.error } : { type: "city", city: city.value };
  }
  if (query.lat === undefined || query.lon === undefined) {
    return { error: "Provide a city, or both lat and lon." };
  }
  const lat = parseCoordinate(query.lat, -90, 90, "lat");
  if (lat.error) return { error: lat.error };
  const lon = parseCoordinate(query.lon, -180, 180, "lon");
  if (lon.error) return { error: lon.error };
  return {
    type: "coords",
    lat: lat.value,
    lon: lon.value,
    name: cleanLabel(query.name, 100, "Your location"),
    country: cleanLabel(query.country, 60, ""),
  };
}

module.exports = { parseCity, parseCoordinate, parseWeatherQuery };
