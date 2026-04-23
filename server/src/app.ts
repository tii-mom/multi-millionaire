import express from 'express';
import dotenv from 'dotenv';
import routes from './routes';

// Load environment variables at startup
dotenv.config();

const app = express();

// JSON body parser
app.use(express.json());

// Assign simple request ID for logging and correlation
app.use((req, res, next) => {
  req.id = (Math.random().toString(36).substring(2, 8)) as any;
  next();
});

// Versioned routes
app.use('/v1', routes);

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ request_id: (req.id as any) || '', error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// Generic error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Internal server error';
  res.status(status).json({ request_id: (req.id as any) || '', error: { code, message } });
});

export default app;