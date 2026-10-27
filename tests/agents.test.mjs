// Tests für die Auswertungen von Batterie-Wächter, Update-Berater und Geräte-Wächter (node --test tests/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze as batteries } from "../app/lib/batteries.mjs";
import { analyze as devices, outages } from "../app/lib/devices.mjs";
import { pendingUpdates } from "../app/lib/updates.mjs";

const DAY = 86400000;
const now = Date.parse("2026-10-27T12:00:00Z");
const cfg = { warn: 20, empty: 5, horizon: 30, remind: 14, days: 90, exclude: [], excludePlatforms: ["mobile_app"], todo: "" };
const days = (n, f) => Array.from({ length: n }, (_, i) => ({ t: now - (n - i) * DAY, ...f(i) }));
const sensor = (entity_id, state, attrs = {}) => ({ entity_id, state: String(state), attributes: { device_class: "battery", unit_of_measurement: "%", state_class: "measurement", ...attrs } });

test("Batterien: schwach, Prognose, Akkus und Handy", () => {
  const states = [
    sensor("sensor.thea_battery", 0),
    sensor("sensor.thea_battery_plus", 0, { battery_type_and_quantity: "CR2450", battery_low: true, device_id: "thea" }),
    sensor("sensor.flur_battery", 40),
    sensor("sensor.ok_battery", 95),
    sensor("sensor.evcc_battery_soc", 13.6),
    sensor("sensor.iphone_battery_level", 15),
    sensor("sensor.iphone_battery_plus", 15, { battery_type: "Rechargeable", device_id: "iphone" }),
    sensor("sensor.maeher_battery", "unavailable"),
    sensor("sensor.hausakku_ohne_geraet", 13),
  ];
  const entities = [
    { entity_id: "sensor.thea_battery", device_id: "thea", platform: "mqtt" },
    { entity_id: "sensor.thea_battery_plus", device_id: "thea", platform: "battery_notes" },
    { entity_id: "sensor.flur_battery", device_id: "flur", platform: "mqtt" },
    { entity_id: "sensor.ok_battery", device_id: "ok", platform: "mqtt" },
    { entity_id: "sensor.evcc_battery_soc", device_id: "evcc", platform: "evcc_intg" },
    { entity_id: "sensor.iphone_battery_level", device_id: "iphone", platform: "mobile_app" },
    { entity_id: "sensor.iphone_battery_plus", device_id: "iphone", platform: "battery_notes" },
    { entity_id: "sensor.maeher_battery", device_id: "maeher", platform: "gardena" },
  ];
  const devs = ["thea", "flur", "ok", "evcc", "iphone", "maeher"].map((id) => ({ id, name: id, area_id: "buero" }));
  const history = {
    "sensor.thea_battery_plus": days(30, (i) => ({ v: 30 - i, lo: 30 - i, hi: 30 - i })),
    // 40 % und 1 Punkt pro Tag weniger: in ~35 Tagen leer → außerhalb von 30 Tagen
    "sensor.flur_battery": days(30, (i) => ({ v: 70 - i, lo: 70 - i, hi: 70 - i })),
    // Hausspeicher: schwankt täglich stark
    "sensor.evcc_battery_soc": days(30, () => ({ v: 50, lo: 10, hi: 95 })),
  };
  const r = batteries({ states, entities, devices: devs, areas: [{ area_id: "buero", name: "Büro" }], history, state: { reported: {} }, now, cfg });
  assert.deepEqual(r.candidates.map((c) => c.device), ["thea"]);
  assert.equal(r.candidates[0].battery_type, "CR2450");
  assert.equal(r.candidates[0].entity_id, "sensor.thea_battery_plus");
  assert.equal(r.candidates[0].area, "Büro");
  assert.ok(r.rechargeable.includes("evcc"));
  assert.ok(!r.candidates.some((c) => c.device === "iphone"));
  assert.deepEqual(r.unavailable, ["maeher"]);
  assert.equal(r.ok, 2);

  // Kürzerer Horizont: Flur wird nicht gemeldet, längerer schon
  const r2 = batteries({ states, entities, devices: devs, areas: [], history, state: { reported: {} }, now, cfg: { ...cfg, horizon: 40 } });
  assert.ok(r2.candidates.some((c) => c.device === "flur" && c.days_left > 30 && c.days_left <= 40));

  // Schon gemeldet: nicht neu, bis die Erinnerungsfrist abgelaufen ist
  const rep = { reported: { "sensor.thea_battery_plus": { at: new Date(now - 3 * DAY).toISOString(), level: 0 } } };
  assert.equal(batteries({ states, entities, devices: devs, areas: [], history, state: rep, now, cfg }).candidates[0].new, false);
});

test("Geräte: Ausfälle zählen", () => {
  const start = now - 7 * DAY;
  const pts = [
    { state: "on", t: start - DAY },
    { state: "unavailable", t: start + 2 * 3600000 },
    { state: "on", t: start + 4 * 3600000 },
    { state: "unavailable", t: now - 3600000 },
  ];
  const o = outages(pts, { start, end: now });
  assert.equal(o.count, 2);
  assert.equal(o.hours, 3);
});

test("Geräte: offline, wackelig, schwaches Signal, ignoriert", () => {
  const t = (h) => new Date(now - h * 3600000).toISOString();
  const states = [
    { entity_id: "light.flur", state: "unavailable", last_changed: t(5) },
    { entity_id: "sensor.flur_linkquality", state: "unavailable", last_changed: t(5) },
    { entity_id: "switch.kurz", state: "unavailable", last_changed: t(0.2) },
    { entity_id: "sensor.bad_temp", state: "21", last_changed: t(1) },
    { entity_id: "sensor.bad_linkquality", state: "18", last_changed: t(1) },
    { entity_id: "sensor.wackel", state: "5", last_changed: t(1) },
    { entity_id: "sensor.alt", state: "unavailable", last_changed: t(24 * 60) },
    { entity_id: "sensor.dienst", state: "unavailable", last_changed: t(5) },
  ];
  const entities = [
    { entity_id: "light.flur", device_id: "flur" },
    { entity_id: "sensor.flur_linkquality", device_id: "flur", entity_category: "diagnostic" },
    { entity_id: "switch.kurz", device_id: "kurz" },
    { entity_id: "sensor.bad_temp", device_id: "bad" },
    { entity_id: "sensor.bad_linkquality", device_id: "bad", entity_category: "diagnostic" },
    { entity_id: "sensor.wackel", device_id: "wackel" },
    { entity_id: "sensor.alt", device_id: "alt" },
    { entity_id: "sensor.dienst", device_id: "dienst" },
  ];
  const devs = [
    { id: "flur", name: "Flur Licht", config_entries: ["z2m"] },
    { id: "kurz", name: "Kurz weg" },
    { id: "bad", name: "Bad Sensor" },
    { id: "wackel", name: "Wackelkontakt" },
    { id: "alt", name: "Altgerät" },
    { id: "dienst", name: "Dienst", entry_type: "service" },
  ];
  const flaps = [{ state: "5", t: now - 8 * DAY }];
  for (let i = 0; i < 4; i++) flaps.push({ state: "unavailable", t: now - (6 - i) * DAY }, { state: "5", t: now - (6 - i) * DAY + 600000 });
  const r = devices({
    states, entities, devices: devs, areas: [], entries: [{ entry_id: "z2m", domain: "mqtt" }],
    history: { "sensor.wackel": flaps }, state: { reported: {}, ignored: { alt: { reason: "steht im Keller" } } }, now,
    cfg: { grace: 60, flaps: 3, lqi: 40, remind: 7, days: 7 },
  });
  const by = Object.fromEntries(r.issues.map((i) => [i.device, i]));
  assert.equal(by["Flur Licht"].problem, "offline");
  assert.equal(by["Flur Licht"].integration, "mqtt");
  assert.equal(by["Wackelkontakt"].problem, "fällt immer wieder weg");
  assert.equal(by["Wackelkontakt"].outages_7d, 4);
  assert.equal(by["Bad Sensor"].problem, "schwaches Signal");
  assert.ok(!by["Kurz weg"], "kurz offline zählt noch nicht");
  assert.ok(!by["Dienst"], "Dienste zählen nicht");
  assert.deepEqual(r.ignored, ["Altgerät"]);
});

test("Updates: offen, übersprungen, schon beraten", () => {
  const states = [
    { entity_id: "update.core", state: "on", attributes: { title: "Home Assistant Core", installed_version: "2026.10.4", latest_version: "2026.11.0" } },
    { entity_id: "update.hacs_x", state: "on", attributes: { title: "X", installed_version: "1", latest_version: "2", skipped_version: "2" } },
    { entity_id: "update.fw", state: "on", attributes: { title: "Sensor", installed_version: "1", latest_version: "3" } },
    { entity_id: "update.aktuell", state: "off", attributes: {} },
  ];
  const entities = [{ entity_id: "update.core", platform: "hassio" }, { entity_id: "update.fw", platform: "mqtt" }];
  const list = pendingUpdates({ states, entities, advised: { "update.fw@3": "x" } });
  assert.deepEqual(list.map((u) => [u.entity_id, u.new]), [["update.core", true], ["update.fw", false]]);
  assert.equal(list[0].kind, "Home Assistant / Add-on");
});

test("Status-Sensor: letzte Push", async () => {
  const { agentState } = await import("../app/lib/control.mjs");
  const agent = { id: "log-detektiv", name: "Log-Detektiv", schedule: "07:30" };
  const s = agentState(agent, { lastPush: { at: "2026-10-27T08:15:00Z", title: "🔎 2 neue Fehler", message: "x".repeat(2000) } });
  assert.equal(s.attributes.last_push, "Di 27.10. 09:15");
  assert.equal(s.attributes.last_push_at, "2026-10-27T08:15:00Z");
  assert.equal(s.attributes.last_push_title, "🔎 2 neue Fehler");
  assert.equal(s.attributes.last_push_message.length, 1500);
  const leer = agentState(agent, {});
  assert.equal(leer.attributes.last_push, "");
  assert.equal(leer.attributes.last_push_message, "");
});

test("Dashboard: je Agent ein Abschnitt, Panel-Link, stabiler Hash", async () => {
  const { buildDashboard, hashConfig } = await import("../app/lib/dashboard.mjs");
  const agents = [
    { id: "log-detektiv", name: "Log-Detektiv", icon: "mdi:text-search" },
    { id: "automationen", name: "Automationen sortieren" },
  ];
  const c = buildDashboard(agents, "/abc_unser_zuhause_agents");
  const sections = c.views[0].sections;
  assert.equal(sections.length, 4);
  assert.equal(sections[2].cards[0].heading, "Automationen sortieren");
  assert.equal(sections[3].cards[1].entity, "sensor.agent_log_detektiv");
  assert.equal(sections[3].cards[0].tap_action.navigation_path, "/abc_unser_zuhause_agents");
  assert.match(sections[1].cards[1].content, /expand\(\['sensor\.agent_automationen', 'sensor\.agent_log_detektiv'\]\)|expand\(\['sensor\.agent_automationen','sensor\.agent_log_detektiv'\]\)/);
  assert.equal(hashConfig(c), hashConfig(JSON.parse(JSON.stringify(c))));
  assert.notEqual(hashConfig(c), hashConfig(buildDashboard(agents.slice(0, 1), "/abc_unser_zuhause_agents")));
  // Ohne Add-on kein Panel: keine Links
  assert.equal(buildDashboard(agents, "").views[0].sections[2].cards[0].tap_action, undefined);
});

test("Agenten abgleichen: neue kopieren, unveränderte aktualisieren, eigene behalten", async () => {
  const { sync, hashOf } = await import("../app/agents-sync.mjs");
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "agents-"));
  const src = join(root, "src"), dst = join(root, "dst");
  for (const d of ["a", "b", "neu"]) mkdirSync(join(src, d), { recursive: true });
  for (const d of ["a", "b"]) mkdirSync(join(dst, d), { recursive: true });
  writeFileSync(join(dst, "a", "prompt.md"), "alt\n");
  writeFileSync(join(dst, "b", "prompt.md"), "meins\n");
  const alt = hashOf(join(dst, "a", "prompt.md"));
  writeFileSync(join(src, "a", "prompt.md"), "neu\n");
  writeFileSync(join(src, "a", "agent.json"), "{}\n");
  writeFileSync(join(src, "b", "prompt.md"), "neu\n");
  writeFileSync(join(src, "neu", "prompt.md"), "x\n");
  writeFileSync(join(src, ".versionen.json"), JSON.stringify({ "a/prompt.md": [alt], "b/prompt.md": [alt] }));
  const r = sync(src, dst, () => {});
  assert.deepEqual(r.copied, ["neu"]);
  assert.deepEqual(r.updated.sort(), ["a/agent.json", "a/prompt.md"]);
  assert.deepEqual(r.kept, ["b/prompt.md"]);
  assert.equal(readFileSync(join(dst, "a", "prompt.md"), "utf8"), "neu\n");
  assert.equal(readFileSync(join(dst, "b", "prompt.md"), "utf8"), "meins\n");
});

test("Deaktiviert: Sensor und Dashboard", async () => {
  const { agentState } = await import("../app/lib/control.mjs");
  const { buildDashboard } = await import("../app/lib/dashboard.mjs");
  const s = agentState({ id: "log-detektiv", name: "Log-Detektiv", schedule: [], enabled: false, disabled: true }, {});
  assert.equal(s.state, "deaktiviert");
  assert.equal(s.attributes.next_run, "deaktiviert");
  assert.equal(s.attributes.disabled, true);
  const c = buildDashboard([
    { id: "log-detektiv", name: "Log-Detektiv", disabled: true, dashboard: { url: "log-detektiv" } },
    { id: "automations-doktor", name: "Automations-Doktor", dashboard: { url: "automations-doktor", title: "Automations-Doktor" } },
  ], "/p");
  const sections = c.views[0].sections;
  assert.equal(sections.length, 3);
  assert.match(sections[0].cards[1].content, /\*\*Deaktiviert:\*\* Log-Detektiv/);
  assert.match(sections[2].cards[2].content, /\(\/automations-doktor\)/);
});
