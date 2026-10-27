// Status-Sensoren in Home Assistant: je Agent sensor.agent_<id> mit Zustand (läuft, wartet, erfolgreich …),
// Zeitplan, nächstem und letztem Lauf, der letzten Push und den letzten Protokollzeilen – z. B. für Automationen oder eigene Dashboards.
// Gestartet wird über die Weboberfläche („Jetzt starten“). Läuft im Scheduler neben dem Zeitplan.
// Autor: SebastianInTheWild · MIT-Lizenz

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rest } from "./ha.mjs";

const DATA_DIR = process.env.DATA_DIR || "/data";
const PREFIX = process.env.CONTROL_PREFIX || "Agent";
const REFRESH_MS = 5 * 60_000; // Sensoren spätestens so oft neu schreiben (über die API gesetzte Zustände überleben keinen HA-Neustart)

const TZ = process.env.TZ || "Europe/Berlin";
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
// „Mo 19.10. 12:51“
const fmt = (iso) => {
  if (!iso) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.weekday.replace(".", "")} ${p.day}.${p.month}. ${p.hour}:${p.minute}`;
};
const duration = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
export const sensorId = (id) => `sensor.agent_${id.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;

/** Nächster Lauf als Text aus den Zeitplan-Einträgen („08:00“, „So 18:00“, „alle 5 min“). */
export function nextRunText(agent, nowDate = new Date()) {
  if (agent.enabled === false) return "nur von Hand";
  const slots = [].concat(agent.schedule || []);
  const every = slots.map((s) => /^alle\s+(\d+)\s*min$/i.exec(String(s).trim())).find(Boolean);
  if (every) return `alle ${every[1]} min`;
  const parts = (d) => Object.fromEntries(new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  const nowP = parts(nowDate);
  const nowTime = `${nowP.hour}:${nowP.minute}`;
  for (let add = 0; add < 8; add++) {
    const d = new Date(nowDate.getTime() + add * 86400000);
    const p = parts(d);
    const wd = p.weekday.replace(".", "");
    const times = slots
      .map((s) => /^(?:([A-Za-z,]+)\s+)?(\d{2}:\d{2})$/.exec(String(s).trim()))
      .filter(Boolean)
      .filter((m) => (m[1] ? m[1].split(",").map((x) => x.trim()) : DAYS).includes(wd))
      .map((m) => m[2])
      .filter((t) => add > 0 || t > nowTime)
      .sort();
    if (times.length) return `${add === 0 ? "heute" : add === 1 ? "morgen" : `${wd} ${p.day}.${p.month}.`} ${times[0]}`;
  }
  return slots.length ? "–" : "nur von Hand";
}

// Letzte Protokollzeilen (nur Zeilen des Programms, ohne die Ausgabe von Claude), höchstens 6
function logTail(id) {
  const dir = join(DATA_DIR, id, "logs");
  if (!existsSync(dir)) return "";
  const files = readdirSync(dir).filter((f) => f.endsWith(".log")).sort();
  for (const f of files.reverse()) {
    const lines = readFileSync(join(dir, f), "utf8").split("\n").filter((l) => /^\[\d/.test(l));
    if (lines.length) return lines.slice(-6).map((l) => l.replace(/^\[([^\]]+)\] \[[^\]]+\] /, "$1 · ")).join("\n").slice(-1200);
  }
  return "";
}

const RESULT = {
  ok: { text: "erfolgreich", icon: "mdi:check-circle-outline" },
  fehler: { text: "fehlgeschlagen", icon: "mdi:alert-circle-outline" },
  "nichts zu tun": { text: "nichts zu tun", icon: "mdi:sleep" },
};

/** Zustand eines Agenten für den Sensor. */
export function agentState(agent, { status, lastRun, lastCheck, lastPush, queued }) {
  const last = lastRun || lastCheck;
  const state = status?.running ? "läuft" : queued ? "wartet" : last ? RESULT[last.result]?.text || last.result : "noch nie gelaufen";
  const icon = status?.running ? "mdi:play-circle" : queued ? "mdi:timer-sand" : RESULT[last?.result]?.icon || "mdi:robot-outline";
  return {
    state,
    attributes: {
      friendly_name: `${PREFIX} ${agent.name || agent.id}`,
      icon,
      agent_id: agent.id,
      description: agent.description || "",
      schedule: agent.enabled === false ? "aus" : [].concat(agent.schedule || []).join(", ") || "keiner",
      next_run: nextRunText(agent),
      running_since: status?.running ? fmt(status.since) : "",
      last_run: lastRun ? fmt(lastRun.at) : "",
      last_by: lastRun?.by || "",
      last_result: lastRun ? RESULT[lastRun.result]?.text || lastRun.result : "",
      last_note: lastRun?.note || "",
      last_duration: lastRun ? duration(lastRun.duration_s) : "",
      last_check: lastCheck ? fmt(lastCheck.at) : "",
      // Letzte Push dieses Agenten; last_push_at (ISO) zum Sortieren über alle Agenten
      last_push: lastPush ? fmt(lastPush.at) : "",
      last_push_at: lastPush?.at || "",
      last_push_title: lastPush?.title || "",
      last_push_message: String(lastPush?.message || "").slice(0, 1500),
      log: logTail(agent.id),
    },
  };
}

/**
 * Sensoren pflegen. agents(): aktuelle Agentenliste (wie im Scheduler), readStatus(id, datei): Statusdateien,
 * isQueued(id): von Hand angefordert, noch nicht gestartet, dashboard: startDashboard() oder nichts. Gibt { refresh() } zurück.
 */
export function startControl({ agents, readStatus, isQueued, dashboard }) {
  let lastPublished = {};
  let lastFull = 0;
  let busy = false;
  let warned = "";

  async function publish(list) {
    const full = Date.now() - lastFull > REFRESH_MS;
    for (const a of list) {
      const s = agentState(a, {
        status: readStatus(a.id, "status.json"),
        lastRun: readStatus(a.id, "last-run.json"),
        lastCheck: readStatus(a.id, "last-check.json"),
        lastPush: readStatus(a.id, "last-push.json"),
        queued: isQueued(a.id),
      });
      const key = JSON.stringify(s);
      if (!full && lastPublished[a.id] === key) continue;
      await rest("POST", `states/${sensorId(a.id)}`, s);
      lastPublished[a.id] = key;
    }
    if (full) lastFull = Date.now();
  }

  async function cycle() {
    if (busy) return;
    busy = true;
    try {
      const list = agents();
      await publish(list);
      // Dashboard „Agenten“ nach den Sensoren, damit es keine fehlenden Entitäten zeigt
      await dashboard?.sync(list);
      warned = "";
    } catch (e) {
      // HA nicht erreichbar o. Ä.: Zeitplan läuft weiter, Meldung nur einmal
      if (e.message !== warned) console.error(`Status-Sensoren: ${e.message}`);
      warned = e.message;
    } finally {
      busy = false;
    }
  }

  cycle();
  setInterval(cycle, 15_000);
  return { refresh: () => cycle() };
}
