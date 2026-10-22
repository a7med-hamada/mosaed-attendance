function createRateLimiter({ windowMs, max, message }) {
  const requests = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let entry = requests.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      requests.set(key, entry);
    }

    for (const [client, current] of requests) {
      if (current.resetAt <= now) requests.delete(client);
    }

    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, error: message });
    }

    next();
  };
}

module.exports = { createRateLimiter };
