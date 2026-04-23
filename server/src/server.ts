import app from './app';
import { closePool } from './db';

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port}`);
});

function shutdown() {
  // eslint-disable-next-line no-console
  console.log('Shutting down HTTP server...');
  server.close(async () => {
    await closePool();
    // eslint-disable-next-line no-console
    console.log('Graceful shutdown complete.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default server;
