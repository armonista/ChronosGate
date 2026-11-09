const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'chronos_gate_super_secret_jwt_key_2026');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Forbidden: Token expired or invalid' });
  }
};

const authenticateApiKey = async (req, res, next) => {
  const apiKeyHeader = req.headers['x-api-key'];
  if (!apiKeyHeader) {
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }

  try {
    const keyRecord = await prisma.apiKey.findUnique({
      where: { key: apiKeyHeader },
      include: { user: true }
    });

    if (!keyRecord || !keyRecord.isActive) {
      return res.status(403).json({ error: 'Invalid or revoked API Key' });
    }

    req.apiKey = keyRecord;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error during key validation' });
  }
};

module.exports = { authenticateJWT, authenticateApiKey, prisma };
