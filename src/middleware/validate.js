const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' })
});

const createKeySchema = z.object({
  name: z.string().min(1, { message: 'Key name is required' }),
  rateLimit: z.number().int().positive({ message: 'Rate limit must be a positive integer' }).optional()
});

const triggerEventSchema = z.object({
  eventType: z.string().min(1, { message: 'Event type is required' }),
  payload: z.record(z.any(), { message: 'Payload must be a valid JSON object' })
});

const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (err) {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors.map(e => e.message)
    });
  }
};

module.exports = { validate, registerSchema, createKeySchema, triggerEventSchema };