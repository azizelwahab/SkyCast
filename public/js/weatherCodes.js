// WMO weather interpretation codes used by Open-Meteo: [day icon, night icon, label]
const CODES = {
  0: ["☀️", "🌙", "Clear sky"],
  1: ["🌤️", "🌙", "Mainly clear"],
  2: ["⛅", "☁️", "Partly cloudy"],
  3: ["☁️", "☁️", "Overcast"],
  45: ["🌫️", "🌫️", "Fog"],
  48: ["🌫️", "🌫️", "Rime fog"],
  51: ["🌦️", "🌧️", "Light drizzle"],
  53: ["🌦️", "🌧️", "Drizzle"],
  55: ["🌧️", "🌧️", "Heavy drizzle"],
  56: ["🌧️", "🌧️", "Freezing drizzle"],
  57: ["🌧️", "🌧️", "Heavy freezing drizzle"],
  61: ["🌦️", "🌧️", "Light rain"],
  63: ["🌧️", "🌧️", "Rain"],
  65: ["🌧️", "🌧️", "Heavy rain"],
  66: ["🌧️", "🌧️", "Freezing rain"],
  67: ["🌧️", "🌧️", "Heavy freezing rain"],
  71: ["🌨️", "🌨️", "Light snow"],
  73: ["🌨️", "🌨️", "Snow"],
  75: ["❄️", "❄️", "Heavy snow"],
  77: ["🌨️", "🌨️", "Snow grains"],
  80: ["🌦️", "🌧️", "Rain showers"],
  81: ["🌧️", "🌧️", "Heavy rain showers"],
  82: ["⛈️", "⛈️", "Violent rain showers"],
  85: ["🌨️", "🌨️", "Snow showers"],
  86: ["❄️", "❄️", "Heavy snow showers"],
  95: ["⛈️", "⛈️", "Thunderstorm"],
  96: ["⛈️", "⛈️", "Thunderstorm with hail"],
  99: ["⛈️", "⛈️", "Severe thunderstorm with hail"],
};

export const KNOWN_CODES = Object.keys(CODES).map(Number);

export function describeWeather(code, isDay = true) {
  const entry = CODES[code];
  if (!entry) return { icon: "🌡️", label: "Unknown conditions" };
  return { icon: isDay ? entry[0] : entry[1], label: entry[2] };
}
