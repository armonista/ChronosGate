# ⚡ ChronosGate — Distributed Rate-Limiting & Fault-Tolerant Webhook Engine

click this link if u wanna try 
[https://chronos-gate-engine.onrender.com](https://chronos-gate-engine.onrender.com)





# ⚡ ChronosGate — Distributed Rate-Limiting & Fault-Tolerant Webhook Engine

ChronosGate is a high-throughput API Gateway and asynchronous webhook delivery engine built with **Node.js, Express, PostgreSQL, and Prisma ORM**.

## ✨ Key Engineering Highlights
- **Sliding-Window Rate Limiter**: Custom algorithm tracking exact request timestamps per API key with standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
- **Fault-Tolerant Webhook Worker**: Asynchronous event dispatcher with **exponential backoff retries** (`2^attempt` seconds) to guarantee eventual delivery across flaky downstream endpoints.
- **Cryptographic Payload Signing**: Every webhook request is signed using `HMAC-SHA256` (`X-Chronos-Signature`) to prevent replay and tampering attacks.
- **Real-Time Telemetry Dashboard**: Built-in developer console to provision keys, burst-test rate limits, and inspect live webhook retry states.

## 🚀 Quick Start (Local Development)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env` and add your PostgreSQL or Supabase connection URL:
   ```bash
   cp .env.example .env
   ```

3. **Push database schema:**
   ```bash
   npm run db:push
   ```

4. **Start the server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.


   ## Branching Practice

This change was made in the feature-test branch.

Learning GitHub branches and pull requests.
