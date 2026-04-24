import cors from "cors";
import express from "express";
import health from "./health.js";
import longRunning from "./long-running.js";
import sse from "./server-sent-events.js";

const app = express();

app.use(cors());
app.use(express.static("public"));
app.use("/health", health);
app.use("/long-running", longRunning);
app.use("/sse", sse);

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;
if (Number.isNaN(PORT) || PORT < 1 || PORT > 65535) {
	console.error(`Invalid PORT environment variable: ${process.env.PORT}`);
	process.exit(1);
}

app.listen(PORT, () => {
	console.log(`Listening on port ${PORT}`);
});
