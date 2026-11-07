const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");
const { TTLCache } = require("../src/cache");
const { parseWeatherQuery } = require("../src/validation");

// ---- Test doubles: a fake Open-Meteo, so no test touches the network ------
const FORECAST = {
  current: { time: "2026-01-16T10:00", temperature_2m: 3 },
  hourly: { time: ["2026-01-16T10:00"] },
  daily: { time: ["2026-01-16"] },
};
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const PARIS = { results: [{ name: "Paris", country_code: "FR", latitude: 48.8534, longitude: 2.3488 }] };

function fakeFetch({ geocode, forecast } = {}) {
  const calls = { geocode: 0, forecast: 0 };
  const impl = async (url) => {
    if (String(url).includes("geocoding-api")) {
      calls.geocode++;
      return geocode ? geocode() : json(PARIS);
    }
    calls.forecast++;
    return forecast ? forecast() : json(FORECAST);
  };
  return { impl, calls };
}

async function withServer({ mock, config } = {}, run) {
  const { impl, calls } = fakeFetch(mock);
  const app = createApp({ fetchImpl: impl, config: { silent: true, ...config } });
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ get: (path) => fetch(base + path), calls, app });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

// ---- Endpoints -------------------------------------------------------------
test("GET /api/health returns ok", () =>
  withServer({}, async ({ get }) => {
    const res = await get("/api/health");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, "ok");
  }));

test("GET /api/weather?city= returns place and forecast", () =>
  withServer({}, async ({ get }) => {
    const res = await get("/api/weather?city=Paris");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.place.name, "Paris");
    assert.equal(body.forecast.current.temperature_2m, 3);
  }));

test("GET /api/weather with coordinates and a display name", () =>
  withServer({}, async ({ get, calls }) => {
    const res = await get("/api/weather?lat=48.8534&lon=2.3488&name=Home");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).place.name, "Home");
    assert.equal(calls.geocode, 0);
  }));

test("unknown city returns 404", () =>
  withServer({ mock: { geocode: () => json({}) } }, async ({ get }) => {
    const res = await get("/api/weather?city=Nowhereville");
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /No place found/);
  }));

test("unknown API route returns JSON 404", () =>
  withServer({}, async ({ get }) => {
    const res = await get("/api/nope");
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, "Not found");
  }));

// ---- Invalid input -----------------------------------------------------------
for (const [label, qs] of [
  ["no parameters", ""],
  ["city too short", "?city=a"],
  ["city too long", "?city=" + "a".repeat(101)],
  ["city with markup", "?city=" + encodeURIComponent("<script>alert(1)</script>")],
  ["city given twice", "?city=Paris&city=London"],
  ["latitude out of range", "?lat=999&lon=1"],
  ["empty latitude", "?lat=&lon=1"],
  ["non-numeric longitude", "?lat=1&lon=abc"],
  ["latitude without longitude", "?lat=10"],
]) {
  test(`rejects invalid input: ${label}`, () =>
    withServer({}, async ({ get, calls }) => {
      const res = await get("/api/weather" + qs);
      assert.equal(res.status, 400);
      assert.ok((await res.json()).error);
      assert.equal(calls.geocode + calls.forecast, 0, "must not call the upstream API");
    }));
}

test("city validation accepts international names and collapses whitespace", () => {
  assert.equal(parseWeatherQuery({ city: "  São   Paulo " }).city, "São Paulo");
  assert.equal(parseWeatherQuery({ city: "Saint-Denis" }).city, "Saint-Denis");
  assert.equal(parseWeatherQuery({ city: "München" }).city, "München");
});

// ---- External API failures ----------------------------------------------------
test("network failure returns 502", () =>
  withServer({ mock: { forecast: () => { throw new TypeError("fetch failed"); } } }, async ({ get }) => {
    const res = await get("/api/weather?city=Paris");
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /weather service/i);
  }));

test("upstream timeout returns 504", () =>
  withServer({ mock: { geocode: () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); } } }, async ({ get }) => {
    assert.equal((await get("/api/weather?city=Paris")).status, 504);
  }));

test("upstream HTTP error returns 502", () =>
  withServer({ mock: { forecast: () => json({}, 500) } }, async ({ get }) => {
    assert.equal((await get("/api/weather?city=Paris")).status, 502);
  }));

test("incomplete upstream data returns 502", () =>
  withServer({ mock: { forecast: () => json({ current: {} }) } }, async ({ get }) => {
    assert.equal((await get("/api/weather?city=Paris")).status, 502);
  }));

// ---- Cache ---------------------------------------------------------------------
test("repeat requests are served from cache", () =>
  withServer({}, async ({ get, calls }) => {
    await get("/api/weather?city=Paris");
    await get("/api/weather?city=paris");
    assert.equal(calls.geocode, 1);
    assert.equal(calls.forecast, 1);
  }));

test("cache keys use 4 decimal places", () =>
  withServer({}, async ({ get, calls }) => {
    await get("/api/weather?lat=48.85001&lon=2.35001"); // rounds to 48.8500, 2.3500
    await get("/api/weather?lat=48.85002&lon=2.35002"); // same key
    assert.equal(calls.forecast, 1);
    await get("/api/weather?lat=48.8501&lon=2.3500"); // differs at the 4th decimal
    assert.equal(calls.forecast, 2);
  }));

test("simultaneous identical requests share one upstream call", () =>
  withServer({}, async ({ get, calls }) => {
    const results = await Promise.all(Array.from({ length: 6 }, () => get("/api/weather?city=Paris")));
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(calls.forecast, 1);
  }));

test("stale cache is served when the upstream fails", async () => {
  let fail = false;
  const forecast = () => { if (fail) throw new TypeError("fetch failed"); return json(FORECAST); };
  await withServer({ mock: { forecast }, config: { cacheTtlMs: 10 } }, async ({ get }) => {
    assert.equal((await get("/api/weather?city=Paris")).status, 200);
    await new Promise((r) => setTimeout(r, 30));
    fail = true;
    assert.equal((await get("/api/weather?city=Paris")).status, 200);
  });
});

test("TTLCache evicts oldest entries beyond its maximum size", async () => {
  const cache = new TTLCache({ ttlMs: 1000, maxEntries: 3 });
  for (const k of ["a", "b", "c", "d", "e"]) await cache.getOrLoad(k, async () => k);
  assert.equal(cache.size, 3);
  assert.equal(cache.map.has("a"), false);
  assert.equal(cache.map.has("e"), true);
});

test("TTLCache reloads after expiry", async () => {
  let now = 0, loads = 0;
  const cache = new TTLCache({ ttlMs: 100, maxEntries: 10, now: () => now });
  const loader = async () => ++loads;
  await cache.getOrLoad("k", loader);
  await cache.getOrLoad("k", loader);
  assert.equal(loads, 1);
  now = 150;
  await cache.getOrLoad("k", loader);
  assert.equal(loads, 2);
});

// ---- Rate limiting -----------------------------------------------------------
test("rate limit returns 429 with Retry-After after the maximum", () =>
  withServer({ config: { rateLimitMax: 3, rateLimitWindowMs: 60000 } }, async ({ get }) => {
    for (let i = 0; i < 3; i++) assert.equal((await get("/api/weather?city=Paris")).status, 200);
    const res = await get("/api/weather?city=Paris");
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get("retry-after")) >= 1);
    assert.equal((await get("/api/health")).status, 200, "health check is not rate limited");
  }));

// ---- Security headers ---------------------------------------------------------
test("responses include security headers and hide x-powered-by", () =>
  withServer({}, async ({ get }) => {
    const res = await get("/api/health");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.ok(res.headers.get("content-security-policy"));
    assert.equal(res.headers.get("x-powered-by"), null);
  }));
