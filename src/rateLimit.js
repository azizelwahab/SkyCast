// Fixed-window, per-IP rate limiter. Sends standard RateLimit-* and Retry-After headers.
function rateLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map();

  return function limit(req, res, next) {
    const t = now();
    if (hits.size > 10000) {
      for (const [ip, rec] of hits) if (rec.reset <= t) hits.delete(ip);
      if (hits.size > 50000) hits.clear(); // hard cap on memory
    }
    let rec = hits.get(req.ip);
    if (!rec || rec.reset <= t) {
      rec = { count: 0, reset: t + windowMs };
      hits.set(req.ip, rec);
    }
    rec.count++;
    const secondsLeft = Math.max(1, Math.ceil((rec.reset - t) / 1000));
    res.set({
      "RateLimit-Limit": String(max),
      "RateLimit-Remaining": String(Math.max(0, max - rec.count)),
      "RateLimit-Reset": String(secondsLeft),
    });
    if (rec.count > max) {
      res.set("Retry-After", String(secondsLeft));
      return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
    }
    next();
  };
}

module.exports = { rateLimiter };
