// Dashboard „Agenten“ in Home Assistant: je Agent ein Abschnitt (Status, Zeitplan, letzter Lauf, letzte Push, Protokoll)
// und oben die letzte Push aller Agenten. Die App schreibt es neu, sobald Agenten dazukommen oder wegfallen –
// aber nur, solange niemand es in Home Assistant von Hand geändert hat. DASHBOARD=off schaltet es ab.
// Autor: SebastianInTheWild · MIT-Lizenz

import { exec } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { connect } from "./ha.mjs";
import { loadJson, saveDashboard, saveJson } from "./report.mjs";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(exec);

const sensorId = (id) => `sensor.agent_${id.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`; // wie in control.mjs
const DATA_DIR = process.env.DATA_DIR || "/data";
const STATE_FILE = join(DATA_DIR, "dashboard.json");
export const DASHBOARD = { url: "dashboard-agenten", title: "Agenten", icon: "mdi:robot-outline" };

// Seitenleisten-Eintrag der Weboberfläche: Im Add-on heißt das Ingress-Panel wie der Slug (Hostname mit _ statt -)
export function panelPath() {
  if (process.env.AGENTS_PANEL) return process.env.AGENTS_PANEL;
  if (process.env.SUPERVISOR_TOKEN && process.env.HOSTNAME) return `/${process.env.HOSTNAME.replace(/-/g, "_")}`;
  return "";
}

// Gleiche Konfiguration = gleicher Hash, egal in welcher Reihenfolge Home Assistant die Schlüssel zurückgibt
const stable = (v) =>
  Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v;
export const hashConfig = (config) => createHash("sha256").update(JSON.stringify(stable(config))).digest("hex").slice(0, 16);

// Markdown mit Templates für einen Agenten; liest alles aus den Attributen von sensor.agent_<id>
function agentMarkdown(sensor) {
  const a = (name) => `state_attr('${sensor}', '${name}')`;
  return [
    `{{ ${a("description")} }}`,
    `**Zeitplan:** {{ ${a("schedule")} }} · **Nächster Lauf:** {{ ${a("next_run")} }}`,
    `{% if ${a("running_since")} %}**Läuft seit:** {{ ${a("running_since")} }}\n\n{% endif %}` +
      `**Letzter Lauf:** {% if ${a("last_run")} %}{{ ${a("last_run")} }} · {{ ${a("last_result")} }} · {{ ${a("last_duration")} }}` +
      `{% if ${a("last_by")} %} ({{ ${a("last_by")} }}){% endif %}{% else %}noch nie{% endif %}` +
      `{% if ${a("last_check")} %}\n\n**Zuletzt geprüft:** {{ ${a("last_check")} }} (nichts zu tun){% endif %}` +
      `{% if ${a("last_note")} %}\n\n⚠️ {{ ${a("last_note")} }}{% endif %}`,
    `**Letzte Push:** {% if ${a("last_push")} %}{{ ${a("last_push")} }} · {{ ${a("last_push_title")} }}\n` +
      `<details><summary>Nachricht</summary>\n\n{{ ${a("last_push_message")} }}\n</details>{% else %}noch keine{% endif %}`,
    `{% if ${a("log")} %}<details><summary>Protokoll</summary>\n\n\`\`\`\n{{ ${a("log")} }}\n\`\`\`\n</details>{% endif %}`,
  ].join("\n\n");
}

// Neueste Push über alle Agenten (nach last_push_at)
function lastPushMarkdown(sensors) {
  return [
    `{%- set list = expand(${JSON.stringify(sensors).replace(/"/g, "'")}) | selectattr('attributes.last_push_at', 'defined')`,
    `   | rejectattr('attributes.last_push_at', 'eq', '') | sort(attribute='attributes.last_push_at', reverse=true) | list -%}`,
    `{%- if list -%}`,
    `{%- set s = list[0] -%}`,
    `### {{ s.attributes.last_push_title }}`,
    `**{{ s.name | replace('${process.env.CONTROL_PREFIX || "Agent"} ', '', 1) }}** · {{ s.attributes.last_push }}`,
    ``,
    `{{ s.attributes.last_push_message }}`,
    `{%- else -%}`,
    `Noch keine Push von den Agenten.`,
    `{%- endif -%}`,
  ].join("\n");
}

/** Konfiguration des Dashboards für die aktuelle Agentenliste. */
export function buildDashboard(agents, panel = panelPath()) {
  const open = panel ? { tap_action: { action: "navigate", navigation_path: panel } } : {};
  const sorted = [...agents].sort((x, y) => (x.name || x.id).localeCompare(y.name || y.id, "de"));
  const list = sorted.filter((a) => !a.disabled);
  const off = sorted.filter((a) => a.disabled);
  const sensors = list.map((a) => sensorId(a.id));
  const intro = [
    { type: "heading", heading: "Agenten", icon: "mdi:robot-outline" },
    {
      type: "markdown",
      content:
        "Die KI-Agenten laufen in der App **Unser Zuhause – Agenten**. Starten, Zeitplan ändern oder pausieren geht dort" +
        (panel ? " – ein Tipp auf einen Agenten öffnet sie." : ".") +
        " Diese Seite pflegt die App selbst; kommen Agenten dazu oder fallen weg, passt sie sich an." +
        (off.length ? `\n\n**Deaktiviert:** ${off.map((a) => a.name || a.id).join(", ")}` : ""),
    },
  ];
  if (panel) intro.push({ type: "button", name: "Starten & Zeitplan", icon: "mdi:play-circle-outline", show_state: false, icon_height: "28px", ...open, grid_options: { columns: "full", rows: 1 } });
  return {
    title: DASHBOARD.title,
    views: [
      {
        title: "Agenten",
        path: "agenten",
        icon: DASHBOARD.icon,
        type: "sections",
        max_columns: 3,
        sections: [
          { type: "grid", column_span: 2, cards: intro },
          { type: "grid", cards: [{ type: "heading", heading: "Letzte Push", icon: "mdi:bell-ring-outline" }, { type: "markdown", content: lastPushMarkdown(sensors) }] },
          ...list.map((a) => ({
            type: "grid",
            cards: [
              { type: "heading", heading: a.name || a.id, icon: a.icon || "mdi:robot-outline", heading_style: "title", ...open },
              { type: "tile", entity: sensorId(a.id), name: "Status", vertical: false, ...open, grid_options: { columns: "full" } },
              {
                type: "markdown",
                content: agentMarkdown(sensorId(a.id)) + (a.dashboard?.url ? `\n\n[📊 Dashboard „${a.dashboard.title || a.name || a.id}“ öffnen](/${a.dashboard.url})` : ""),
              },
            ],
          })),
        ],
      },
    ],
  };
}

/**
 * Schreibt das Dashboard, wenn sich die Agentenliste geändert hat. Wurde es in Home Assistant von Hand geändert
 * (aktueller Stand ≠ zuletzt geschriebener), bleibt es, wie es ist. Fehlt es, legt die App es neu an.
 */
export function startDashboard() {
  const overview = !/^(aus|off)$/i.test(process.env.DASHBOARD || "");
  let done = ""; // Hash der Konfiguration, die in diesem Prozess schon geprüft wurde
  const agentDashboards = startAgentDashboards();
  return {
    async sync(agents) {
      await agentDashboards(agents);
      if (!overview) return;
      const config = buildDashboard(agents);
      const hash = hashConfig(config);
      if (hash === done) return;
      const state = loadJson(STATE_FILE, {});
      const call = await connect();
      try {
        const exists = (await call({ type: "lovelace/dashboards/list" })).some((d) => d.url_path === DASHBOARD.url);
        if (exists && state.written) {
          const current = await call({ type: "lovelace/config", url_path: DASHBOARD.url }).catch(() => null);
          const now = current ? hashConfig(current) : "";
          if (now === hash) return void (done = hash);
          if (now !== state.written) {
            console.log(`Dashboard „${DASHBOARD.title}“ wurde in Home Assistant geändert – die App überschreibt es nicht (löschen = neu anlegen)`);
            return void (done = hash);
          }
        }
        await saveDashboard(call, DASHBOARD, config);
        // So zurückgelesen, wie Home Assistant es speichert – Vergleichsbasis für „von Hand geändert“
        const saved = await call({ type: "lovelace/config", url_path: DASHBOARD.url }).catch(() => config);
        saveJson(STATE_FILE, { written: hashConfig(saved), at: new Date().toISOString(), agents: agents.map((a) => a.id) });
        console.log(`Dashboard „${DASHBOARD.title}“ (/${DASHBOARD.url}) ${exists ? "aktualisiert" : "angelegt"}: ${agents.length} Agenten`);
        done = hash;
      } finally {
        call.close();
      }
    },
  };
}

/**
 * Dashboards der Agenten (agent.json „dashboard“: {url, title, create}): Ist der Agent aktiv und fehlt sein Dashboard,
 * legt die App es mit dem create-Befehl an (aus den gemerkten Daten). Ist er deaktiviert, entfernt sie es –
 * die Daten bleiben im Datenordner, beim Aktivieren kommt es wieder. Geprüft bei jeder Änderung und nach dem Start.
 */
export function startAgentDashboards() {
  let done = "";
  let failedAt = 0;
  return async (agents) => {
    const wanted = agents.filter((a) => a.dashboard?.url).map((a) => ({ id: a.id, url: a.dashboard.url, title: a.dashboard.title || a.name || a.id, create: a.dashboard.create, active: !a.disabled }));
    const key = JSON.stringify(wanted);
    if (!wanted.length || key === done || Date.now() - failedAt < 5 * 60_000) return;
    const call = await connect();
    let ok = true;
    try {
      const existing = await call({ type: "lovelace/dashboards/list" });
      for (const w of wanted) {
        const found = existing.find((d) => d.url_path === w.url);
        if (!w.active && found) {
          await call({ type: "lovelace/dashboards/delete", dashboard_id: found.id });
          console.log(`Dashboard „${w.title}“ (/${w.url}) entfernt – Agent ${w.id} ist deaktiviert`);
        } else if (w.active && !found && w.create) {
          try {
            const env = { ...process.env, AGENT_DATA: join(DATA_DIR, w.id), AGENT_ID: w.id };
            await run(w.create, { cwd: APP, env, timeout: 120_000 });
            console.log(`Dashboard „${w.title}“ (/${w.url}) angelegt`);
          } catch (e) {
            ok = false;
            console.error(`Dashboard „${w.title}“ anlegen fehlgeschlagen: ${(e.stderr || e.message).trim().slice(0, 300)}`);
          }
        }
      }
    } finally {
      call.close();
    }
    if (ok) done = key;
    else failedAt = Date.now();
  };
}
