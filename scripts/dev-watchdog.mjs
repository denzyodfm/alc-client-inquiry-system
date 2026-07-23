import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.PORT || 3002);
const healthUrl = `http://localhost:${port}/login`;
const command = process.execPath;
const args = ["node_modules/next/dist/bin/next", "dev", "-p", String(port)];
const checkEveryMs = 10000;
const startupGraceMs = 25000;
const maxFailures = 4;
const outLogPath = path.resolve(process.cwd(), `.dev-stable-${port}.out.log`);
const errLogPath = path.resolve(process.cwd(), `.dev-stable-${port}.err.log`);

let child = null;
let startedAt = 0;
let failures = 0;
let stopping = false;
let restartTimer = null;
let cacheCleared = false;
let outLog = null;
let errLog = null;

function timestamp() {
  return new Date().toISOString();
}

function log(message) {
  console.log(message);
  try {
    fs.appendFileSync(outLogPath, `[${timestamp()}] ${message}\n`);
  } catch {
    // Keep the watchdog alive even if Windows briefly locks the log file.
  }
}

function ensureLogStreams() {
  outLog ??= fs.createWriteStream(outLogPath, { flags: "a" });
  errLog ??= fs.createWriteStream(errLogPath, { flags: "a" });
}

function clearNextCacheOnce() {
  if (cacheCleared || process.env.SKIP_NEXT_CACHE_CLEAR === "1") return;
  cacheCleared = true;

  const cachePath = path.resolve(process.cwd(), ".next");
  if (!cachePath.startsWith(process.cwd())) return;

  try {
    fs.rmSync(cachePath, { recursive: true, force: true });
    log("[dev:stable] cleared stale Next build cache");
  } catch (error) {
    log(`[dev:stable] could not clear .next cache: ${error.message}`);
  }
}

function start() {
  clearNextCacheOnce();
  ensureLogStreams();
  startedAt = Date.now();
  failures = 0;
  log(`[dev:stable] starting Next dev server on http://localhost:${port}`);
  child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=4096"].filter(Boolean).join(" ")
    }
  });
  child.stdout.pipe(outLog, { end: false });
  child.stderr.pipe(errLog, { end: false });

  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) return;
    log(`[dev:stable] dev server exited (${signal ?? code}). Restarting...`);
    scheduleRestart();
  });
}

function scheduleRestart() {
  if (restartTimer) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    start();
  }, 2000);
}

function stopChild() {
  if (!child) return;
  child.kill();
}

function checkHealth() {
  if (!child || Date.now() - startedAt < startupGraceMs) return;

  const request = http.get(healthUrl, { timeout: 5000 }, (response) => {
    response.resume();
    if (response.statusCode && response.statusCode < 500) {
      failures = 0;
      return;
    }
    failures += 1;
    if (failures >= maxFailures) {
      log(`[dev:stable] ${healthUrl} returned repeated errors. Restarting dev server...`);
      failures = 0;
      stopChild();
    }
  });

  request.on("timeout", () => {
    request.destroy(new Error("Health check timed out."));
  });

  request.on("error", () => {
    failures += 1;
    if (failures >= maxFailures) {
      log(`[dev:stable] ${healthUrl} is not responding. Restarting dev server...`);
      failures = 0;
      stopChild();
    }
  });
}

process.on("SIGINT", () => {
  stopping = true;
  stopChild();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopping = true;
  stopChild();
  process.exit(0);
});

start();
setInterval(checkHealth, checkEveryMs);
