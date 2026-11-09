const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { authenticateJWT, authenticateApiKey, prisma } = require('../middleware/auth');
const { slidingWindowRateLimiter } = require('../middleware/rateLimiter');
const { attemptDelivery } = require('../services/webhookWorker');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'chronos_gate_super_secret_jwt_key_2026';

// Healthcheck
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ChronosGate Engine', timestamp: new Date().toISOString() });
});

// 1. Auth Endpoints
router.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash } });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. API Key & Webhook Endpoints
router.post('/keys', authenticateJWT, async (req, res) => {
  try {
    const { name, rateLimit } = req.body;
    const rawKey = `cg_live_${crypto.randomBytes(16).toString('hex')}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        name: name || 'Default Service Key',
        rateLimit: Number(rateLimit) || 10,
        key: rawKey,
        userId: req.user.userId
      }
    });
    res.status(201).json(apiKey);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/keys', authenticateJWT, async (req, res) => {
  const keys = await prisma.apiKey.findMany({
    where: { userId: req.user.userId },
    orderBy: { createdAt: 'desc' }
  });
  res.json(keys);
});

router.post('/webhooks', authenticateJWT, async (req, res) => {
  try {
    const { url, eventTypes } = req.body;
    const secret = `whsec_${crypto.randomBytes(16).toString('hex')}`;

    const webhook = await prisma.webhookEndpoint.create({
      data: {
        url,
        secret,
        eventTypes: eventTypes || ['payment.success', 'order.created'],
        userId: req.user.userId
      }
    });
    res.status(201).json(webhook);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/webhooks', authenticateJWT, async (req, res) => {
  const webhooks = await prisma.webhookEndpoint.findMany({
    where: { userId: req.user.userId },
    orderBy: { createdAt: 'desc' }
  });
  res.json(webhooks);
});

// 3. Rate-Limited Event Ingestion & Webhook Dispatcher
router.post('/v1/events/trigger', authenticateApiKey, slidingWindowRateLimiter, async (req, res) => {
  try {
    const { eventType, payload } = req.body;
    if (!eventType || !payload) {
      return res.status(400).json({ error: 'eventType and payload are required' });
    }

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        userId: req.apiKey.userId,
        eventTypes: { has: eventType }
      }
    });

    const deliveries = await Promise.all(
      endpoints.map(ep =>
        prisma.webhookDelivery.create({
          data: {
            webhookId: ep.id,
            eventType,
            payload,
            status: 'PENDING'
          }
        })
      )
    );

    deliveries.forEach(d => attemptDelivery(d.id));

    res.status(202).json({
      status: 'Accepted',
      message: `Event '${eventType}' queued across ${deliveries.length} webhook endpoint(s).`,
      deliveryIds: deliveries.map(d => d.id)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simulated Downstream Receiver (25% failure rate to test exponential backoff retries)
router.post('/mock-receiver', (req, res) => {
  const shouldFail = Math.random() < 0.25;
  if (shouldFail) {
    return res.status(503).json({ error: 'Simulated downstream outage - triggering backoff retry' });
  }
  res.status(200).json({
    received: true,
    verifiedSignature: req.headers['x-chronos-signature'],
    timestamp: new Date().toISOString()
  });
});

// 4. Real-Time Telemetry & Analytics
router.get('/analytics', authenticateJWT, async (req, res) => {
  try {
    const logs = await prisma.requestLog.findMany({
      where: { apiKey: { userId: req.user.userId } },
      orderBy: { timestamp: 'desc' },
      take: 50
    });

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhook: { userId: req.user.userId } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { webhook: { select: { url: true } } }
    });

    const totalRequests = logs.length;
    const throttledCount = logs.filter(l => l.statusCode === 429).length;
    const avgLatency = totalRequests
      ? Math.round(logs.reduce((acc, l) => acc + l.latencyMs, 0) / totalRequests)
      : 0;

    res.json({
      metrics: { totalRequests, throttledCount, avgLatency },
      recentLogs: logs.slice(0, 15),
      recentDeliveries: deliveries
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
