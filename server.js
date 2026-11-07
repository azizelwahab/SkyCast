const { createApp } = require("./src/app");
const { loadConfig } = require("./src/config");

const config = loadConfig();
const app = createApp({ config });

const server = app.listen(config.port, () => {
  console.log(`SkyCast running on port ${config.port} (${config.nodeEnv})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
