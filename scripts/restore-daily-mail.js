const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const configPath = path.join(root, "daily-digest-config.json");
const statePath = path.join(root, "daily-digest-state.json");

if (!fs.existsSync(configPath)) {
  console.error("No daily digest schedule found.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
delete config.scheduleMode;
delete config.intervalMinutes;
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};
delete state.lastIntervalSentAt;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

console.log(`Canvas To Do email restored to daily schedule at ${config.time || "07:30"}.`);
