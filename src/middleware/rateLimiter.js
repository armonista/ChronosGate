const { prisma } = require('./auth');

// Sliding window store: Map<apiKeyId, Array<timestampMs>>
const slidingWindowStore = new Map();

const slidingWindowRateLimiter = async (req, res, next) => {
  const startTime = Date.now();
  const apiKey = req.apiKey;
  const windowMs = 60 * 1000; // 60 seconds window
  const limit = apiKey.rateLimit;

  const now = Date.now();
  const windowStart = now - windowMs;

  let requestTimestamps = slidingWindowStore.get(apiKey.id) || [];
  requestTimestamps = requestTimestamps.filter(ts => ts > windowStart);

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - requestTimestamps.length - 1));
  res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));

  if (requestTimestamps.length >= limit) {
    prisma.requestLog.create({
      data: {
        apiKeyId: apiKey.id,
        endpoint: req.originalUrl,
        method: req.method,
        statusCode: 429,
        latencyMs: Date.now() - startTime
      }
    }).catch(console.error);

    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit of ${limit} requests/min exceeded. Try again shortly.`,
      retryAfterSeconds: Math.ceil((requestTimestamps[0] + windowMs - now) / 1000)
    });
  }

  requestTimestamps.push(now);
  slidingWindowStore.set(apiKey.id, requestTimestamps);

  res.on('finish', () => {
    prisma.requestLog.create({
      data: {
        apiKeyId: apiKey.id,
        endpoint: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        latencyMs: Date.now() - startTime
      }
    }).catch(console.error);
  });

  next();
};

module.exports = { slidingWindowRateLimiter };
