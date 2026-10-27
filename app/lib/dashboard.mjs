// Dashboard „Agenten“ in Home Assistant: je Agent ein Abschnitt (Status, Zeitplan, letzter Lauf, letzte Push, Protokoll)
// und oben die letzte Push aller Agenten. Die App schreibt es neu, sobald Agenten dazukommen oder wegfallen –
// aber nur, solange niemand es in Home Assistant von Hand geändert hat. DASHBOARD=off schaltet es ab.
// Autor: SebastianInTheWild · MIT-Lizenz

import { createHash } from "node:crypto";
import { join } from "node:path";
import { connect } from "./ha.mjs";
import { loadJson, saveDashboard, saveJson } from "./report.mjs";

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
  const list = [...agents].sort((x, y) => (x.name || x.id).localeCompare(y.name || y.id, "de"));
  const sensors = list.map((a) => sensorId(a.id));
  const intro = [
    { type: "heading", heading: "Agenten", icon: "mdi:robot-outline" },
    {
      type: "markdown",
      content:
        "Die KI-Agenten laufen in der App **Unser Zuhause – Agenten**. Starten, Zeitplan ändern oder pausieren geht dort" +
        (panel ? " – ein Tipp auf einen Agenten öffnet sie." : ".") +
        " Diese Seite pflegt die App selbst; kommen Agenten dazu oder fallen weg, passt sie sich an.",
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
              { type: "markdown", content: agentMarkdown(sensorId(a.id)) },
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
  if (/^(aus|off)$/i.test(process.env.DASHBOARD || "")) return { sync: async () => {} };
  let done = ""; // Hash der Konfiguration, die in diesem Prozess schon geprüft wurde
  return {
    async sync(agents) {
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
