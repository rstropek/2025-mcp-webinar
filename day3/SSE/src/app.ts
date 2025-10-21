import express from "express";
import logger from "./logging.js";
import cors from "cors";
import health from "./health.js";
import longRunning from "./long-running.js";
import sse from "./server-sent-events.js";
import pinoHTTP from "pino-http";

const app = express();

// Log all incoming requests
app.use(pinoHTTP.default({ logger }));

app.use(cors());
app.use(express.static("public"));
app.use("/health", health);
app.use("/long-running", longRunning);
app.use("/sse", sse);

const PORT = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 3000;
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  logger.error({ port: process.env["PORT"] }, "Invalid PORT environment variable");
  process.exit(1);
}

app.listen(PORT, () => {
  logger.info({ PORT }, "Listening");
});
