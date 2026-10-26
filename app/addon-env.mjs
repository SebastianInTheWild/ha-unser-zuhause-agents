#!/usr/bin/env node
// Add-on: wandelt die Einstellungen aus /data/options.json in export-Zeilen für start.sh um.
// Werte, die schon als Umgebungsvariable gesetzt sind, bleiben (wie bei geheim.env).
// Autor: SebastianInTheWild · MIT-Lizenz

import { readFileSync } from "node:fs";

const opts = JSON.parse(readFileSync(process.argv[2] || "/data/options.json", "utf8"));
const vars = {
  CLAUDE_CODE_OAUTH_TOKEN: opts.claude_code_oauth_token,
  ANTHROPIC_API_KEY: opts.anthropic_api_key,
  CLAUDE_MODEL: opts.claude_model,
  NOTIFY_PERSONS: [].concat(opts.notify_persons || []).join(","),
  SKIP_LABEL: opts.skip_label,
};
// Eigener Token (optional): dann direkt an Home Assistant statt über den Supervisor
if (opts.ha_token) Object.assign(vars, { HA_URL: "http://homeassistant:8123", HA_TOKEN: opts.ha_token });
// Weitere Variablen als „NAME=Wert“, z. B. LOG_LEVELS=error,warning
for (const line of [].concat(opts.env || [])) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(String(line));
  if (m) vars[m[1]] = m[2];
}
const quote = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
for (const [k, v] of Object.entries(vars)) {
  if (v === undefined || v === null || v === "" || process.env[k]) continue;
  console.log(`export ${k}=${quote(v)}`);
}
