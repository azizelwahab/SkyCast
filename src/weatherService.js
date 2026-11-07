// Talks to Open-Meteo. The fetch implementation is injectable so tests never hit the network.
class UpstreamError extends Error {
  constructor(message, { status = 502, cause } = {}) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.cause = cause;
  }
}

const isForecast = (d) =>
  d && d.current && Array.isArray(d.hourly && d.hourly.time) &&
  Array.isArray(d.daily && d.daily.time) && d.daily.time.length > 0;

function createWeatherService({ fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  async function getJSON(url) {
    let res;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new UpstreamError("The weather service took too long to respond.", { status: 504, cause: err });
      }
      throw new UpstreamError("Could not reach the weather service.", { cause: err });
    }
    if (!res.ok) throw new UpstreamError(`The weather service returned an error (${res.status}).`);
    try {
      return await res.json();
    } catch (err) {
      throw new UpstreamError("The weather service returned an unreadable response.", { cause: err });
    }
  }

  async function geocode(city) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const data = await getJSON(url);
    const r = data && data.results && data.results[0];
    if (!r) return null;
    return { name: r.name, country: r.country_code || r.country || "", lat: r.latitude, lon: r.longitude };
  }

  async function forecast(lat, lon) {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day,surface_pressure,cloud_cover",
      hourly: "temperature_2m,weather_code,precipitation_probability,wind_speed_10m,uv_index",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
      timezone: "auto",
      forecast_days: "7",
    });
    const data = await getJSON(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!isForecast(data)) throw new UpstreamError("The weather service returned incomplete data.");
    return data;
  }

  return { geocode, forecast };
}

module.exports = { createWeatherService, UpstreamError };
