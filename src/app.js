const express = require("express");
const path = require("path");
const { loadConfig } = require("./config");
const { TTLCache } = require("./cache");
const { rateLimiter } = require("./rateLimit");
const { parseWeatherQuery } = require("./validation");
const { createWeatherService, UpstreamError } = require("./weatherService");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function securityHeaders(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  });
  next();
}

function errorHandler(config) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof UpstreamError) {
      if (!config.silent) console.warn(`[upstream] ${err.message}${err.cause ? ` (${err.cause.message})` : ""}`);
      return res.status(err.status).json({ error: err.message });
    }
    if (!config.silent) console.error(config.isProduction ? err.message : err);
    res.status(500).json({ error: "Something went wrong on our side. Please try again." });
  };
}

// createApp is separate from server.js so tests can run it with a mocked weather service.
function createApp(overrides = {}) {
  const config = { ...loadConfig(), ...overrides.config };
  const service =
    overrides.service ||
    createWeatherService({ fetchImpl: overrides.fetchImpl, timeoutMs: config.upstreamTimeoutMs });
  const cache = new TTLCache({ ttlMs: config.cacheTtlMs, maxEntries: config.cacheMaxEntries });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.locals.cache = cache;

  app.use(securityHeaders);
  app.use(express.static(path.join(__dirname, "..", "public"), { maxAge: config.isProduction ? "1h" : 0 }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()), cacheEntries: cache.size });
  });

  app.use("/api", rateLimiter({ max: config.rateLimitMax, windowMs: config.rateLimitWindowMs }));

  app.get("/api/weather", async (req, res, next) => {
    try {
      const query = parseWeatherQuery(req.query);
      if (query.error) throw new HttpError(400, query.error);

      let place;
      if (query.type === "city") {
        place = await cache.getOrLoad(`geo:${query.city.toLowerCase()}`, () => service.geocode(query.city));
        if (!place) throw new HttpError(404, `No place found for "${query.city}".`);
      } else {
        place = { name: query.name, country: query.country, lat: query.lat, lon: query.lon };
      }

      // 4 decimal places (~11 m) keeps cache keys precise without fragmenting the cache.
      const lat = Number(place.lat.toFixed(4));
      const lon = Number(place.lon.toFixed(4));
      const forecast = await cache.getOrLoad(`wx:${lat.toFixed(4)},${lon.toFixed(4)}`, () =>
        service.forecast(lat, lon)
      );

      res.set("Cache-Control", "private, max-age=60");
      res.json({ place: { ...place, lat, lon }, forecast });
    } catch (err) {
      next(err);
    }
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));
  app.use((req, res) => res.status(404).type("text/plain").send("Not found"));
  app.use(errorHandler(config));
  return app;
}

module.exports = { createApp, HttpError };
