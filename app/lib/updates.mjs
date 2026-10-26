// Update-Berater: offene Updates (Core, OS, Add-ons, HACS, Firmware) mit Release Notes und den installierten
// Integrationen, damit der Agent einschätzen kann, was dich betrifft. Er installiert nichts.
// Autor: SebastianInTheWild · MIT-Lizenz

import { join } from "node:path";
import { agentData, loadJson, out, readReport, saveJson, sendReport } from "./report.mjs";

const NOTES_MAX = Number(process.env.UPDATE_NOTES_MAX || 6000); // Zeichen Release Notes je Update in der Übersicht
const stateFile = () => join(agentData(), "state.json");
const keyOf = (u) => `${u.entity_id}@${u.latest_version}`;

const KIND = { hassio: "Home Assistant / Add-on", hacs: "HACS" };

/** Offene Updates aus den Zuständen; übersprungene Versionen zählen nicht. */
export function pendingUpdates({ states, entities, advised = {} }) {
  const platform = Object.fromEntries(entities.map((e) => [e.entity_id, e.platform]));
  return states
    .filter((s) => s.entity_id.startsWith("update.") && s.state === "on")
    .filter((s) => !s.attributes.skipped_version || s.attributes.skipped_version !== s.attributes.latest_version)
    .map((s) => {
      const u = {
        entity_id: s.entity_id,
        title: s.attributes.title || s.attributes.friendly_name,
        kind: KIND[platform[s.entity_id]] || `Firmware/Integration (${platform[s.entity_id] || "?"})`,
        installed_version: s.attributes.installed_version,
        latest_version: s.attributes.latest_version,
        release_url: s.attributes.release_url || null,
        release_summary: s.attributes.release_summary || null,
        auto_update: Boolean(s.attributes.auto_update),
        in_progress: Boolean(s.attributes.in_progress),
      };
      return { ...u, new: !advised[keyOf(u)] };
    });
}

async function load(call) {
  const [states, entities] = await Promise.all([call({ type: "get_states" }), call({ type: "config/entity_registry/list" })]);
  const state = loadJson(stateFile(), { advised: {} });
  return { list: pendingUpdates({ states, entities, advised: state.advised }), state };
}

const notesOf = (call, id) => call({ type: "update/release_notes", entity_id: id }).catch(() => null);

export async function updates(call, cmd, args) {
  if (cmd === "pending") {
    const { list } = await load(call);
    if (args.includes("--count")) return console.log(list.filter((u) => u.new).length);
    for (const u of list) {
      const notes = await notesOf(call, u.entity_id);
      if (notes) u.release_notes = notes.length > NOTES_MAX ? `${notes.slice(0, NOTES_MAX)}\n… (gekürzt, ganz: node ha.mjs updates notes ${u.entity_id})` : notes;
    }
    const entries = await call({ type: "config_entries/get" }).catch(() => []);
    const integrations = [...new Set(entries.filter((e) => e.state !== "not_loaded" && !e.disabled_by).map((e) => e.domain))].sort();
    return out({ updates: list, integrations });
  }
  if (cmd === "notes") {
    const id = args[0];
    if (!/^update\.[a-z0-9_]+$/.test(id || "")) return out({ ok: false, errors: ["Aufruf: updates notes update.<name>"] });
    return out({ entity_id: id, release_notes: await notesOf(call, id) });
  }
  if (cmd === "report") {
    // report.json: {title, message}
    const r = readReport();
    if (!r.ok) return out(r);
    const { list, state } = await load(call);
    const res = await sendReport(call, r);
    const now = new Date().toISOString();
    for (const u of list) state.advised[keyOf(u)] = now;
    // Alte Einträge (Versionen, die nicht mehr offen sind) nach 90 Tagen vergessen
    for (const [k, at] of Object.entries(state.advised)) if (Date.now() - Date.parse(at) > 90 * 86400000) delete state.advised[k];
    if (!res.dry) saveJson(stateFile(), state);
    return out({ ok: true, ...res, marked: list.length });
  }
  throw new Error(`Unbekannter Befehl: updates ${cmd}`);
}
