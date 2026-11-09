const crypto = require('crypto');
const { prisma } = require('../middleware/auth');

const MAX_RETRIES = 4;

function signPayload(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function attemptDelivery(deliveryId) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true }
  });

  if (!delivery || delivery.status === 'SUCCESS') return;

  const attempt = delivery.attemptCount + 1;
  const signature = signPayload(delivery.payload, delivery.webhook.secret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(delivery.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chronos-Signature': `sha256=${signature}`,
        'X-Chronos-Event': delivery.eventType,
        'X-Chronos-Delivery-ID': delivery.id
      },
      body: JSON.stringify(delivery.payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SUCCESS',
          attemptCount: attempt,
          responseCode: response.status,
          nextRetryAt: null
        }
      });
      return;
    }

    throw new Error(`HTTP ${response.status}`);
  } catch (err) {
    const isFinalAttempt = attempt >= MAX_RETRIES;
    const backoffMs = Math.pow(2, attempt) * 1000;
    const nextRetry = isFinalAttempt ? null : new Date(Date.now() + backoffMs);

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: isFinalAttempt ? 'FAILED' : 'PENDING',
        attemptCount: attempt,
        responseCode: 503,
        nextRetryAt: nextRetry
      }
    });

    if (!isFinalAttempt) {
      setTimeout(() => attemptDelivery(delivery.id), backoffMs);
    }
  }
}

module.exports = { attemptDelivery, signPayload };
