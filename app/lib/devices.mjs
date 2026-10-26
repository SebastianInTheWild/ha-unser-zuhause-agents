// Geräte-Wächter: Geräte, die offline sind, in den letzten 7 Tagen immer wieder wegfallen oder ein schwaches
// Funksignal haben – mit Integration, Raum und Ausfall-Uhrzeiten, damit der Agent Muster erkennt.
// Autor: SebastianInTheWild · MIT-Lizenz

import { join } from "node:path";
import { rest } from "./ha.mjs";
import { agentData, loadJson, out, readReport, saveJson, sendReport } from "./report.mjs";

const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : d);
const CFG = {
  grace: num(process.env.DEVICE_GRACE_MIN, 60), // erst nach so vielen Minuten offline zählt ein Gerät
  flaps: num(process.env.DEVICE_FLAPS, 3), // so viele Ausfälle in 7 Tagen gelten als „fällt immer wieder weg“
  lqi: num(process.env.DEVICE_LQI_WEAK, 40), // Zigbee-Linkqualität bis zu diesem Wert gilt als schwach
  remind: num(process.env.DEVICE_REMIND_DAYS, 7),
  days: 7,
};
const TZ = process.env.TZ || "Europe/Berlin";
const HOUR = 3600000;
const stateFile = () => join(agentData(), "state.json");
const hourOf = (ms) => Number(new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(ms))) % 24;
const r1 = (x) => Math.round(x * 10) / 10;
const DOWN = new Set(["unavailable"]);

/** Ausfälle aus dem Verlauf einer Entität: [{state, t}] → Anzahl, Stunden offline, Uhrzeiten der Ausfälle. */
export function outages(points, { start, end }) {
  let count = 0;
  let downMs = 0;
  const hours = [];
  let downSince = null;
  for (const p of points) {
    const down = DOWN.has(p.state);
    if (down && downSince === null) {
      downSince = Math.max(p.t, start);
      if (p.t > start) {
        count++;
        hours.push(hourOf(p.t));
      }
    } else if (!down && downSince !== null) {
      downMs += p.t - downSince;
      downSince = null;
    }
  }
  if (downSince !== null) downMs += end - downSince;
  return { count, hours: r1(downMs / HOUR), at_hours: hours };
}

/** Geräte mit Auffälligkeiten. history: { entity_id: [{state, t}] } der letzten 7 Tage. */
export function analyze({ states, entities, devices, areas, entries, history, state, now = Date.now(), cfg = CFG }) {
  const st = Object.fromEntries(states.map((s) => [s.entity_id, s]));
  const area = Object.fromEntries(areas.map((a) => [a.area_id, a.name]));
  const domain = Object.fromEntries(entries.map((e) => [e.entry_id, e.domain]));
  const byDevice = new Map();
  for (const e of entities) {
    if (!e.device_id || e.disabled_by || !st[e.entity_id]) continue;
    const list = byDevice.get(e.device_id) || [];
    list.push(e);
    byDevice.set(e.device_id, list);
  }
  const issues = [];
  const ignored = [];
  for (const d of devices) {
    if (d.disabled_by || d.entry_type === "service") continue;
    const list = byDevice.get(d.id);
    if (!list?.length) continue;
    const name = d.name_by_user || d.name || d.id;
    if (state.ignored?.[d.id]) {
      ignored.push(name);
      continue;
    }
    const primary = list.filter((e) => !e.entity_category);
    const main = primary.length ? primary : list;
    const offline = main.every((e) => DOWN.has(st[e.entity_id].state));
    const since = offline ? Math.max(...main.map((e) => Date.parse(st[e.entity_id].last_changed))) : null;
    const rep = main[0].entity_id;
    const o = outages(history[rep] || [], { start: now - cfg.days * 24 * HOUR, end: now });
    const lqiEnt = list.find((e) => /_linkquality$/.test(e.entity_id));
    const lqi = lqiEnt ? Number(st[lqiEnt.entity_id].state) : null;
    const weak = Number.isFinite(lqi) && lqi <= cfg.lqi;
    const isOffline = offline && now - since >= cfg.grace * 60000;
    const flapping = o.count >= cfg.flaps;
    if (!isOffline && !flapping && !weak) continue;
    const kind = isOffline ? "offline" : flapping ? "fällt immer wieder weg" : "schwaches Signal";
    const prev = state.reported?.[d.id];
    issues.push({
      device_id: d.id,
      device: name,
      area: area[d.area_id] || null,
      integration: domain[d.primary_config_entry] || domain[d.config_entries?.[0]] || null,
      model: [d.manufacturer, d.model].filter(Boolean).join(" ") || null,
      via_device: d.via_device_id ? devices.find((x) => x.id === d.via_device_id)?.name || null : null,
      problem: kind,
      offline_since: isOffline ? new Date(since).toISOString() : null,
      offline_days: isOffline ? r1((now - since) / (24 * HOUR)) : null,
      outages_7d: o.count,
      offline_hours_7d: o.hours,
      outage_hours_of_day: o.at_hours,
      linkquality: Number.isFinite(lqi) ? lqi : null,
      new: !prev || prev.problem !== kind || now - Date.parse(prev.at) > cfg.remind * 24 * HOUR,
    });
  }
  issues.sort((a, b) => Number(b.new) - Number(a.new) || (a.offline_days ?? 1e9) - (b.offline_days ?? 1e9) || b.outages_7d - a.outages_7d);
  return { issues, ignored };
}

async function history(ids, start, end) {
  const res = {};
  for (let i = 0; i < ids.length; i += 40) {
    const part = ids.slice(i, i + 40);
    const q = `history/period/${encodeURIComponent(new Date(start).toISOString())}?end_time=${encodeURIComponent(new Date(end).toISOString())}&filter_entity_id=${part.join(",")}&minimal_response&no_attributes`;
    const rows = await rest("GET", q).catch(() => []);
    for (const list of rows || []) {
      const id = list[0]?.entity_id;
      if (id) res[id] = list.map((p) => ({ state: p.state, t: Date.parse(p.last_changed) }));
    }
  }
  return res;
}

async function load(call) {
  const [states, entities, devices, areas, entries] = await Promise.all([
    call({ type: "get_states" }),
    call({ type: "config/entity_registry/list" }),
    call({ type: "config/device_registry/list" }),
    call({ type: "config/area_registry/list" }),
    call({ type: "config_entries/get" }).catch(() => []),
  ]);
  // Je Gerät eine Haupt-Entität für den Verlauf
  const present = new Set(states.map((s) => s.entity_id));
  const main = new Map();
  for (const e of entities) {
    if (!e.device_id || e.disabled_by || !present.has(e.entity_id)) continue;
    if (!main.has(e.device_id) || (main.get(e.device_id).entity_category && !e.entity_category)) main.set(e.device_id, e);
  }
  const now = Date.now();
  const hist = await history([...main.values()].map((e) => e.entity_id), now - CFG.days * 24 * HOUR, now);
  const state = loadJson(stateFile(), { reported: {}, ignored: {} });
  state.ignored ||= {};
  return { result: analyze({ states, entities, devices, areas, entries, history: hist, state, now }), state, devices };
}

export async function devicesCmd(call, cmd, args) {
  if (cmd === "check") {
    const { result } = await load(call);
    if (args.includes("--count")) return console.log(result.issues.filter((i) => i.new).length);
    return out({ settings: { grace_min: CFG.grace, flaps_7d: CFG.flaps, weak_linkquality: CFG.lqi }, issues: result.issues, ignored: result.ignored });
  }
  if (cmd === "report") {
    // report.json: {title, message, ignore: [{device_id, reason}]}
    const r = readReport();
    if (!r.ok) return out(r);
    const { result, state } = await load(call);
    const known = new Map(result.issues.map((i) => [i.device_id, i]));
    const ignore = r.report.ignore || [];
    const bad = ignore.filter((x) => !known.has(x.device_id) || !String(x.reason || "").trim());
    if (bad.length) return out({ ok: false, errors: [`ignore: unbekannte device_id oder Grund fehlt: ${bad.map((x) => x.device_id).join(", ")}`] });
    const res = await sendReport(call, r);
    const now = new Date().toISOString();
    for (const i of result.issues) state.reported[i.device_id] = { at: now, problem: i.problem, device: i.device };
    for (const x of ignore) state.ignored[x.device_id] = { at: now, device: known.get(x.device_id).device, reason: x.reason.trim() };
    if (!res.dry) saveJson(stateFile(), state);
    return out({ ok: true, ...res, marked: result.issues.length, ignored: ignore.length });
  }
  if (cmd === "ignored") {
    const state = loadJson(stateFile(), { ignored: {} });
    return out(Object.entries(state.ignored || {}).map(([device_id, v]) => ({ device_id, ...v })));
  }
  if (cmd === "unignore") {
    const state = loadJson(stateFile(), { reported: {}, ignored: {} });
    if (!state.ignored?.[args[0]]) return out({ ok: false, errors: [`${args[0]} steht nicht auf der Ignorierliste`] });
    delete state.ignored[args[0]];
    saveJson(stateFile(), state);
    return out({ ok: true });
  }
  throw new Error(`Unbekannter Befehl: devices ${cmd}`);
}
