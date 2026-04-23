# Project 72H Production Backend

This repository contains a production‑ready backend for the **Project 72H** social lock‑up platform. It is built using [Node.js](https://nodejs.org/) with [Express](https://expressjs.com/) and TypeScript, and uses [PostgreSQL](https://www.postgresql.org/) as the primary datastore.

## Features

* **Express API** following the previously defined API specification. Includes endpoints for bootstrap information, waves, passes and initial referral handling.
* **TypeScript** with strict typing and clean project structure.
* **Database Layer** using the `pg` library with simple model classes to query and persist data.
* **Environment Configuration** loaded from `.env` files via [dotenv](https://github.com/motdotla/dotenv).
* **Testing** via [Jest](https://jestjs.io/) and [supertest](https://github.com/visionmedia/supertest) with an example API test.
* **Docker Support** including `Dockerfile` and `docker-compose.yml` for running the app and a PostgreSQL instance together.

## Getting Started

### Prerequisites

* Node.js 18+
* npm or yarn
* PostgreSQL 13+

### Development Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and adjust the values for your setup:

   ```bash
   cp .env.sample .env
   # edit .env as needed
   ```

3. Generate the database schema:

   ```bash
   psql "$DATABASE_URL" -f migrations/001_init.sql
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

   This will compile TypeScript on the fly using `ts-node` through nodemon and serve the API at `http://localhost:4000` by default.

5. Run tests:

   ```bash
   npm test
   ```

### Docker

For convenience you can run the app and a PostgreSQL database together using Docker Compose. This is helpful for local development or deploying to environments where Docker is available.

```bash
docker-compose up --build
```

This will build the Node.js image, create a PostgreSQL database and expose the API on port 4000.

## Structure

* `src/` – TypeScript source files
  * `index.ts` – Application entry point
  * `server.ts` – Express server configuration
  * `db.ts` – Database connection helper
  * `models/` – Simple database models
  * `controllers/` – Route handlers implementing business logic
  * `routes/` – Express routers composing endpoints
* `test/` – Jest and supertest integration tests

## API Endpoints

* `GET /` – health check.
* `GET /v1/app/bootstrap` – app configuration, current wave and latest price.
* `POST /v1/auth/register` – create an email/password account.
* `POST /v1/auth/login` – login and receive a JWT.
* `GET /v1/waves/current` – current wave.
* `POST /v1/waves/:waveId/passes` – claim a Rush Pass.
* `POST /v1/waves/:waveId/deposit-precheck` – authenticated deposit precheck.
* `POST /v1/waves/:waveId/deposit` – authenticated demo deposit record.
* `GET /v1/prices/latest` – latest confirmed administrator price.

## Note

This codebase is a working baseline. To run in production you must complete the model implementations and route handlers according to the detailed product requirement document. This includes validation, additional business rules, comprehensive error handling, and more integration tests. The current implementation is intentionally minimal but organised to allow incremental development.
