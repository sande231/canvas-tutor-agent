const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const configPath = path.join(root, "daily-digest-config.json");
const statePath = path.join(root, "daily-digest-state.json");

if (!fs.existsSync(configPath)) {
  console.error("No daily digest schedule found. Connect Canvas and click Schedule first.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
fs.writeFileSync(
  configPath,
  JSON.stringify(
    {
      ...config,
      scheduleMode: "interval",
      intervalMinutes: 2,
    },
    null,
    2,
  ),
);

const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};
delete state.lastIntervalSentAt;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

console.log("Canvas To Do email test mode enabled: every 2 minutes.");
console.log("Keep the background agent running, or run node server.js.");
