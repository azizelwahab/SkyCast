// All configuration comes from environment variables, with safe defaults.
const int = (value, fallback, min = 1) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

function parseTrustProxy(value, isProduction) {
  if (value === undefined || value === "") return isProduction ? 1 : false;
  if (/^\d+$/.test(value)) return Number(value);
  return value === "true";
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  return {
    nodeEnv,
    isProduction,
    port: int(env.PORT, 3000),
    cacheTtlMs: int(env.CACHE_TTL_MS, 10 * 60 * 1000),
    cacheMaxEntries: int(env.CACHE_MAX_ENTRIES, 500),
    rateLimitMax: int(env.RATE_LIMIT_MAX, 60),
    rateLimitWindowMs: int(env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
    upstreamTimeoutMs: int(env.UPSTREAM_TIMEOUT_MS, 8000),
    trustProxy: parseTrustProxy(env.TRUST_PROXY, isProduction),
    silent: nodeEnv === "test",
  };
}

module.exports = { loadConfig };
