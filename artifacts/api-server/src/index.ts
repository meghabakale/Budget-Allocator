import { createServer } from "node:http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectDatabase } from "./config/database.js";
import { initSocket } from "./sockets/index.js";
import { seedDatabase } from "./services/seedService.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

async function main() {
  await connectDatabase();
  await seedDatabase();

  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
