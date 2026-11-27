const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { promisify } = require("node:util");
const run = promisify(require("node:child_process").execFile);

const SAMPLE = process.argv.includes("--sample");
const API = (process.env.SUPERFOCUS_API_URL || "https://api.superfocus.me/v1").replace(/\/+$/, "");
const KEY = process.env.SUPERFOCUS_API_KEY;
const PORT = Number(process.env.PORT || 8787);
const WIDTH = 1072;
const HEIGHT = 1448;

const CHROME_DEFAULTS = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
};

function findChrome() {
  if (process.env.CHROME_PATH) {
    if (!fs.existsSync(process.env.CHROME_PATH)) {
      console.error(`CHROME_PATH points to ${process.env.CHROME_PATH}, which does not exist.`);
      process.exit(1);
    }
    return process.env.CHROME_PATH;
  }
  const found = (CHROME_DEFAULTS[process.platform] || []).find((p) => fs.existsSync(p));
  if (!found) {
    console.error("Chrome or Chromium was not found. Install it, or set CHROME_PATH in .env to its full path.");
    process.exit(1);
  }
  return found;
}

if (!SAMPLE && !KEY) {
  console.error("SUPERFOCUS_API_KEY is missing. Copy .env.example to .env, paste your key, then run: npm start");
  process.exit(1);
}

const CHROME = findChrome();

function minutes(text) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/.exec(text);
  if (!m) throw new Error("Unreadable time from Superfocus: " + text);
  const h = (parseInt(m[1], 10) % 12) + (m[3] === "PM" ? 12 : 0);
  return h * 60 + parseInt(m[2], 10);
}

function label(today) {
  const [y, mo, d] = today.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" }).format(
    new Date(Date.UTC(y, mo - 1, d)),
  );
}

async function get(route) {
  const res = await fetch(API + route, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`Superfocus answered ${res.status} on ${route.split("?")[0]}`);
  return (await res.json()).data;
}

async function day() {
  if (SAMPLE) return JSON.parse(fs.readFileSync(path.join(__dirname, "sample", "day.json"), "utf8"));
  const me = await get("/me");
  const date = me.today;
  const clock = /(\d{2}):(\d{2})$/.exec(me.now);
  if (!clock) throw new Error("Unreadable current time from Superfocus: " + me.now);
  const [rows, groups] = await Promise.all([
    get(`/blocks?startDate=${date}&endDate=${date}`),
    get("/tasks?includeCompleted=true"),
  ]);
  const blocks = rows
    .filter((b) => b.startTime && b.endTime)
    .map((b) => {
      const s = minutes(b.startTime);
      const e = minutes(b.endTime);
      return { t: b.type, title: b.title, s, e: e > s ? e : 1440, done: b.isCompleted === true };
    });
  const planned = groups
    .flatMap((g) => g.tasks)
    .filter((t) => (t.completed ? (t.completedAt || "").slice(0, 10) === date : t.plannedFor === date))
    .map((t) => ({ title: t.title, done: t.completed }))
    .sort((a, b) => Number(a.done) - Number(b.done));
  const top = me.topThing ? { title: me.topThing.title, done: me.topThing.completed } : null;
  return { date: label(date), now: parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10), blocks, planned, top };
}

const PROFILE = path.join(os.tmpdir(), `superfocus-kindle-chrome-${PORT}`);
const SHOT = path.join(os.tmpdir(), `superfocus-kindle-${PORT}.png`);

async function render() {
  fs.rmSync(SHOT, { force: true });
  await run(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${WIDTH},${HEIGHT}`,
      "--virtual-time-budget=5000",
      `--user-data-dir=${PROFILE}`,
      `--screenshot=${SHOT}`,
      `http://127.0.0.1:${PORT}/`,
    ],
    { timeout: 50000, killSignal: "SIGKILL" },
  ).catch((err) => {
    if (!fs.existsSync(SHOT)) throw err;
  });
  return fs.readFileSync(SHOT);
}

let latest = null;

async function refresh() {
  try {
    latest = await render();
  } catch (err) {
    console.error(err);
  }
  setTimeout(refresh, 60000);
}

http
  .createServer(async (req, res) => {
    const url = req.url.split("?")[0];
    if (url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(fs.readFileSync(path.join(__dirname, "index.html")));
      return;
    }
    if (url === "/data.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
      try {
        res.end("window.DAY = " + JSON.stringify(await day()) + ";");
      } catch (err) {
        console.error(err);
        res.end("window.DAY_ERROR = " + JSON.stringify(String(err.message)) + ";");
      }
      return;
    }
    if (url === "/screen.png") {
      if (!latest) {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      res.end(latest);
      return;
    }
    res.writeHead(404);
    res.end();
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`Superfocus Kindle server on port ${PORT}${SAMPLE ? " (sample day)" : ""}`);
    console.log(`Picture: http://localhost:${PORT}/screen.png (ready after a few seconds)`);
    refresh();
  });
