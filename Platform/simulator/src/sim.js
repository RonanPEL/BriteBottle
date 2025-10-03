// Platform/simulator/src/sim.js
import "dotenv/config";

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const API_KEY = process.env.API_KEY || "local-key-123";
const IDS = (process.env.CRUSHERS || "c-101,c-102,c-103").split(",").map(s => s.trim()).filter(Boolean);

const INTERVAL_MS = Number(process.env.INTERVAL_MS || 3000);
const CHANCE_ALERT = Number(process.env.CHANCE_ALERT || 0.10);
const CHANCE_EMPTY = Number(process.env.CHANCE_EMPTY || 0.05);
const MIN_QTY = Number(process.env.MIN_QTY || 5);
const MAX_QTY = Number(process.env.MAX_QTY || 20);

function randInt(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY, // required when REQUIRE_API_KEY=true
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`[${res.status}] ${path} -> ${t || res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : {};
}

async function tick() {
  const id = pick(IDS);

  // 1) Emit a crush event (most ticks)
  const qty = randInt(MIN_QTY, MAX_QTY);
  await post("/ingest/crush", { crusherId: id, qty });
  console.log(`[crush] ${id} +${qty}`);

  // 2) Occasionally emit an alert
  if (Math.random() < CHANCE_ALERT) {
    const messages = [
      "Door opened briefly",
      "Vibration spike detected",
      "Temperature high",
      "Network reconnect",
      "Sensor check required"
    ];
    const msg = pick(messages);
    await post("/ingest/alert", { crusherId: id, level: "info", message: msg });
    console.log(`[alert] ${id} ${msg}`);
  }

  // 3) Rarely empty the hopper (simulate collection)
  if (Math.random() < CHANCE_EMPTY) {
    await post("/ingest/empty", { crusherId: id });
    console.log(`[empty] ${id} hopper emptied`);
  }
}

async function main() {
  console.log(`Simulator started -> ${API_BASE}`);
  console.log(`Crushers: ${IDS.join(", ")} | interval ${INTERVAL_MS}ms`);
  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error("tick error:", e.message);
    }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
