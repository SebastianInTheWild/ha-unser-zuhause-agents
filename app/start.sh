#!/bin/sh
# Start im Container: Claude Code bei Bedarf installieren (bleibt in /data/npm), dann den Zeitplan starten.
set -e
# Als Home-Assistant-Add-on: Einstellungen aus /data/options.json, HA über den Supervisor, Agenten unter /config,
# Zeitplan in /data (wird nur über die Weboberfläche gepflegt)
if [ -n "$SUPERVISOR_TOKEN" ] && [ -f /data/options.json ]; then
  eval "$(node "$(dirname "$0")/addon-env.mjs" /data/options.json)"
  export HA_URL="${HA_URL:-http://supervisor/core}" HA_TOKEN="${HA_TOKEN:-$SUPERVISOR_TOKEN}"
  export AGENTS_DIR="${AGENTS_DIR:-/config/agents}" SCHEDULE_FILE="${SCHEDULE_FILE:-/data/zeitplan.conf}" DATA_DIR="${DATA_DIR:-/data}"
  # Mitgelieferte Agenten nur ergänzen, nie überschreiben – eigene Änderungen bleiben erhalten
  mkdir -p "$AGENTS_DIR"
  for d in "$DEFAULTS_DIR"/agents/*/; do
    n=$(basename "$d")
    [ -e "$AGENTS_DIR/$n" ] || { cp -r "$d" "$AGENTS_DIR/$n"; echo "Agent $n nach $AGENTS_DIR kopiert"; }
  done
  [ -e "$SCHEDULE_FILE" ] || cp "$DEFAULTS_DIR/zeitplan.conf" "$SCHEDULE_FILE"
  echo "Add-on: Agenten in $AGENTS_DIR, Zeitplan $SCHEDULE_FILE"
fi
export NPM_CONFIG_PREFIX=/data/npm
export PATH="/data/npm/bin:$PATH"
# Zugangsdaten aus /data/geheim.env (eine Zeile KEY=Wert); Werte aus Portainer haben Vorrang. Änderungen gelten nach Neustart.
SECRETS="${SECRETS_FILE:-/data/geheim.env}"
if [ -f "$SECRETS" ]; then
  while IFS='=' read -r k v || [ -n "$k" ]; do
    case "$k" in '' | \#* | *[!A-Za-z0-9_]* | [0-9]*) continue ;; esac
    v=$(printf '%s' "$v" | tr -d '\r')
    eval "cur=\${$k:-}"
    [ -n "$cur" ] || export "$k=$v"
  done < "$SECRETS"
  echo "Zugangsdaten aus $SECRETS geladen"
fi
if ! command -v claude >/dev/null 2>&1 || [ "${CLAUDE_UPDATE:-0}" = "1" ]; then
  echo "Claude Code wird installiert …"
  npm install -g @anthropic-ai/claude-code --no-fund --no-audit
fi
echo "Claude Code $(claude --version 2>/dev/null || echo '?')"
[ -n "$HA_TOKEN" ] || echo "WARNUNG: HA_TOKEN fehlt – in Portainer unter Environment variables setzen"
[ -n "$CLAUDE_CODE_OAUTH_TOKEN$ANTHROPIC_API_KEY" ] || echo "WARNUNG: CLAUDE_CODE_OAUTH_TOKEN fehlt – auf einem PC mit Claude Code „claude setup-token“ ausführen (Add-on: Tab Konfiguration)"
exec node "$(dirname "$0")/scheduler.mjs"
