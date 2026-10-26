// Batterie-Wächter: Batteriestände aller Geräte mit Verlauf, Prognose und Batterietyp (Battery Notes) für den Agenten.
// Akkus (Handy, Hausspeicher, Mäher …) erkennt das Werkzeug am Verlauf und lässt sie aus.
// Autor: SebastianInTheWild · MIT-Lizenz

import { join } from "node:path";
import { agentData, loadJson, out, readReport, saveJson, sendReport } from "./report.mjs";

const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : d);
const CFG = {
  warn: num(process.env.BATTERY_WARN, 20), // ab diesem Stand (in %) gilt eine Batterie als schwach
  empty: num(process.env.BATTERY_EMPTY, 5), // bis zu diesem Stand rechnet die Prognose
  horizon: num(process.env.BATTERY_HORIZON_DAYS, 30), // Prognose „leer in höchstens so vielen Tagen“ meldet der Agent
  remind: num(process.env.BATTERY_REMIND_DAYS, 14), // gemeldete Batterien erst nach so vielen Tagen erneut melden
  days: num(process.env.BATTERY_HISTORY_DAYS, 90),
  exclude: (process.env.BATTERY_EXCLUDE || "").split(",").map((s) => s.trim()).filter(Boolean),
  excludePlatforms: (process.env.BATTERY_EXCLUDE_PLATFORMS || "mobile_app").split(",").map((s) => s.trim()).filter(Boolean),
  todo: (process.env.BATTERY_TODO || "").trim(),
};
const stateFile = () => join(agentData(), "state.json");
const DAY = 86400000;
const r1 = (x) => Math.round(x * 10) / 10;
const matches = (id, pattern) => (pattern.endsWith("*") ? id.startsWith(pattern.slice(0, -1)) : id === pattern);
const AKKU = /rechargeable|akku|li-?ion|lipo|li-?po|integriert|built.?in|internal|intern/i;

/** Ladeereignisse im Tagesverlauf: Anstieg um mindestens 30 Punkte innerhalb von 3 Tagen. */
export function recharges(series) {
  const events = [];
  for (let i = 1; i < series.length; i++) {
    const back = series.slice(Math.max(0, i - 3), i);
    const low = Math.min(...back.map((p) => p.v));
    if (series[i].v - low >= 30 && (!events.length || series[i].t - events[events.length - 1] > 3 * DAY)) events.push(series[i].t);
  }
  return events;
}

/** Lineare Steigung (Punkte pro Tag) über die Tageswerte; null bei zu wenig Daten. */
export function slope(series) {
  if (series.length < 7 || series[series.length - 1].t - series[0].t < 7 * DAY) return null;
  const xs = series.map((p) => (p.t - series[0].t) / DAY);
  const ys = series.map((p) => p.v);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return sxx ? sxy / sxx : null;
}

/**
 * Wertet alle Batterie-Sensoren aus. Je Gerät zählt ein Sensor; der von Battery Notes (mit battery_type) hat Vorrang.
 * history: { entity_id: [{t, v, lo, hi}] } Tagesmittel, -minimum und -maximum, state: Merkliste der gemeldeten Batterien.
 */
export function analyze({ states, entities, devices, areas, history, state, now = Date.now(), cfg = CFG }) {
  const ent = Object.fromEntries(entities.map((e) => [e.entity_id, e]));
  const dev = Object.fromEntries(devices.map((d) => [d.id, d]));
  const area = Object.fromEntries(areas.map((a) => [a.area_id, a.name]));
  const byDevice = new Map();
  for (const s of states) {
    if (!s.entity_id.startsWith("sensor.") || s.attributes.device_class !== "battery" || s.attributes.unit_of_measurement !== "%") continue;
    if (cfg.exclude.some((p) => matches(s.entity_id, p))) continue;
    const deviceId = ent[s.entity_id]?.device_id || s.attributes.device_id;
    if (!deviceId || !dev[deviceId] || dev[deviceId].disabled_by) continue;
    const list = byDevice.get(deviceId) || [];
    list.push(s);
    byDevice.set(deviceId, list);
  }
  const res = { candidates: [], ok: 0, rechargeable: [], unavailable: [] };
  for (const [deviceId, list] of byDevice) {
    // Gerät mit einer Batterie, die über eine andere Integration ein Akku ist (z. B. Handy), auslassen
    if (list.some((s) => cfg.excludePlatforms.includes(ent[s.entity_id]?.platform))) continue;
    const s = list.find((x) => x.attributes.battery_type || x.attributes.battery_type_and_quantity) || list.find((x) => !/health/i.test(x.entity_id)) || list[0];
    const d = dev[deviceId];
    const name = d.name_by_user || d.name || s.attributes.friendly_name;
    const level = Number(s.state);
    if (!Number.isFinite(level)) {
      res.unavailable.push(name);
      continue;
    }
    const type = s.attributes.battery_type_and_quantity || s.attributes.battery_type || null;
    const series = (history[s.entity_id] || []).filter((p) => p.t >= now - cfg.days * DAY).sort((a, b) => a.t - b.t);
    const events = recharges(series);
    // Akku: mehrfach geladen oder an mindestens 2 Tagen um 30 Punkte geschwankt (Laden und Entladen am selben Tag)
    const swings = series.filter((p) => p.hi - p.lo >= 30).length;
    if ((type && AKKU.test(type)) || events.length >= 2 || swings >= 2) {
      res.rechargeable.push(name);
      continue;
    }
    // Nach einem Batteriewechsel zählt nur der Verlauf danach
    const since = Math.max(events[events.length - 1] || 0, Date.parse(s.attributes.battery_last_replaced || 0) || 0);
    const k = slope(series.filter((p) => p.t >= since));
    const daysLeft = k !== null && k < -0.05 ? Math.max(0, Math.round((level - cfg.empty) / -k)) : null;
    const low = s.attributes.battery_low === true || level <= cfg.warn;
    if (!low && !(daysLeft !== null && daysLeft <= cfg.horizon)) {
      res.ok++;
      continue;
    }
    const rep = state.reported?.[s.entity_id];
    res.candidates.push({
      entity_id: s.entity_id,
      device: name,
      area: area[d.area_id] || null,
      model: [d.manufacturer, d.model].filter(Boolean).join(" ") || null,
      level,
      low,
      days_left: daysLeft,
      drop_per_week: k !== null ? r1(-k * 7) : null,
      battery_type: type,
      last_replaced: s.attributes.battery_last_replaced || (events.length ? new Date(events[events.length - 1]).toISOString() : null),
      reported: rep ? rep.at : null,
      new: !rep || now - Date.parse(rep.at) > cfg.remind * DAY,
    });
  }
  res.candidates.sort((a, b) => (a.days_left ?? -1) - (b.days_left ?? -1) || a.level - b.level);
  return res;
}

async function load(call) {
  const [states, entities, devices, areas] = await Promise.all([
    call({ type: "get_states" }),
    call({ type: "config/entity_registry/list" }),
    call({ type: "config/device_registry/list" }),
    call({ type: "config/area_registry/list" }),
  ]);
  const ids = states.filter((s) => s.entity_id.startsWith("sensor.") && s.attributes.device_class === "battery" && s.attributes.state_class).map((s) => s.entity_id);
  const raw = ids.length
    ? await call({
        type: "recorder/statistics_during_period",
        start_time: new Date(Date.now() - CFG.days * DAY).toISOString(),
        statistic_ids: ids,
        period: "day",
        types: ["mean", "min", "max"],
      })
    : {};
  const history = Object.fromEntries(
    Object.entries(raw).map(([id, rows]) => [id, rows.filter((r) => Number.isFinite(r.mean)).map((r) => ({ t: r.start, v: r.mean, lo: r.min ?? r.mean, hi: r.max ?? r.mean }))]),
  );
  const state = loadJson(stateFile(), { reported: {} });
  // Gewechselte Batterien aus der Merkliste nehmen (Stand deutlich gestiegen)
  for (const [id, rep] of Object.entries(state.reported)) {
    const now = Number(states.find((s) => s.entity_id === id)?.state);
    if (Number.isFinite(now) && now >= rep.level + 30) delete state.reported[id];
  }
  return { result: analyze({ states, entities, devices, areas, history, state }), state };
}

export async function batteries(call, cmd, args) {
  if (cmd === "status") {
    const { result } = await load(call);
    if (args.includes("--count")) return console.log(result.candidates.filter((c) => c.new).length);
    return out({ settings: { warn: CFG.warn, horizon_days: CFG.horizon, shopping_list: CFG.todo || null }, ...result });
  }
  if (cmd === "report") {
    // report.json: {title, message, shopping: ["2× CR2032", …]}
    const r = readReport();
    if (!r.ok) return out(r);
    const shopping = (r.report.shopping || []).map((x) => String(x).trim()).filter(Boolean);
    if (shopping.length > 10) return out({ ok: false, errors: ["shopping: höchstens 10 Einträge"] });
    const { result, state } = await load(call);
    const res = await sendReport(call, r);
    const added = [];
    if (CFG.todo && shopping.length && !res.dry) {
      const items = await call({ type: "todo/item/list", entity_id: CFG.todo }).then((x) => x.items || []).catch(() => []);
      const open = new Set(items.filter((i) => i.status !== "completed").map((i) => i.summary.toLowerCase()));
      for (const s of shopping) {
        if (open.has(s.toLowerCase())) continue;
        await call({ type: "call_service", domain: "todo", service: "add_item", target: { entity_id: CFG.todo }, service_data: { item: s } });
        added.push(s);
      }
    }
    const now = new Date().toISOString();
    for (const c of result.candidates) state.reported[c.entity_id] = { at: now, level: c.level, device: c.device };
    if (!res.dry) saveJson(stateFile(), state);
    return out({ ok: true, ...res, marked: result.candidates.length, shopping_added: added, shopping_list: CFG.todo || null });
  }
  throw new Error(`Unbekannter Befehl: batteries ${cmd}`);
}
