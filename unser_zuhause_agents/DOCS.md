# Unser Zuhause – Agenten

KI-Agenten (Claude Code), die nach Zeitplan für Home Assistant arbeiten: Automationen sortieren, Fehlerprotokoll auswerten, Energie-Tipps, Automations-Doktor, Batterie-Wächter, Update-Berater und Geräte-Wächter.

## Einrichten

1. **Claude-Token:** Auf einem Rechner mit Claude Code `claude setup-token` ausführen und den Token unter *Konfiguration* bei `claude_code_oauth_token` eintragen. Alternativ `anthropic_api_key` (Abrechnung pro Lauf).
2. **Pushs:** Unter `notify_persons` die Personen eintragen, z. B. `person.sebastian`. Dafür braucht es die Integration [Unser Zuhause](https://github.com/SebastianInTheWild/ha-unser-zuhause-integration).
3. Add-on starten. Einen Token für Home Assistant brauchst du nicht, das Add-on nutzt den Zugang des Supervisors.

## Einstellungen

| Option | Bedeutung |
|---|---|
| `claude_code_oauth_token` | Token aus `claude setup-token` (Claude-Abo) |
| `anthropic_api_key` | statt des Tokens: API-Schlüssel |
| `claude_model` | ein bestimmtes Modell für alle Agenten (optional) |
| `notify_persons` | wer die Pushs bekommt |
| `skip_label` | Automationen mit diesem Label fasst der Agent „Automationen“ nicht an (Standard `Test`) |
| `ha_token` | nur falls ein Aufruf über den Supervisor abgelehnt wird: eigener langlebiger Zugriffstoken |
| `env` | weitere Variablen als `NAME=Wert`, z. B. `LOG_LEVELS=error,warning` oder `CONTROL=off` |

## Weboberfläche „Unser Zuhause – Agents“

Im Add-on unter *Info* **In Seitenleiste anzeigen** einschalten. Unter **Unser Zuhause – Agents** siehst du dann je Agent Status, nächsten und letzten Lauf und kannst

- den Zeitplan einstellen: feste Zeiten, Wochentage, Abstände oder pausiert. Änderungen gelten nach spätestens 30 Sekunden, ohne Neustart.
- mit **Jetzt starten** einen Agenten sofort laufen lassen. Er startet innerhalb von etwa 30 Sekunden, sobald kein anderer Agent läuft.
- mit **Deaktivieren** einen Agenten ganz abschalten: Er läuft weder nach Zeitplan noch von Hand. Hat er ein eigenes Dashboard (Log-Detektiv, Automations-Doktor), entfernt das Add-on es aus Home Assistant; die Daten bleiben. **Aktivieren** holt den vorherigen Zeitplan und das Dashboard zurück.

## Dashboards der Agenten

Agenten mit eigenem Dashboard (in `agent.json` unter `dashboard`) bekommen es vom Add-on angelegt, sobald sie aktiv sind – auch vor ihrem ersten Lauf, dann mit den gemerkten Daten oder leer.

## Eigene Agenten

Beim ersten Start legt das Add-on unter `/addon_configs/<slug>_unser_zuhause_agents/agents/` einen Ordner je Agent an (im File editor, über SSH oder Samba erreichbar). Neuer Agent: `_vorlage` kopieren, `prompt.md` und `agent.json` anpassen. Er erscheint ohne Neustart in der Weboberfläche.

Mitgelieferte Agenten bringt das Add-on bei Updates auf die neue Fassung – aber nur Dateien, die du nicht geändert hast. Deine Änderungen an Anweisungen bleiben erhalten (das Protokoll nennt sie). Willst du trotzdem die neue Fassung, lösche die Datei oder den Ordner und starte das Add-on neu. Einen Agenten abschalten: in der Weboberfläche **deaktivieren** statt den Ordner zu löschen, sonst kommt er beim nächsten Start wieder.

Merklisten, Sicherungen und Logs liegen in den Add-on-Daten und sind in den HA-Backups enthalten (ohne die Tageslogs).

## Daten übernehmen

Merklisten, Sicherungen und Zeitplan aus einer bestehenden Installation: den Inhalt des Datenordners (ein Unterordner je Agent) und die `zeitplan.conf` nach `/addon_configs/<slug>_unser_zuhause_agents/import/` kopieren und das Add-on (neu) starten. Es übernimmt alles einmalig und löscht `import/` danach. Im Protokoll steht dann „Import: alte Daten … übernommen“.

## Status-Sensoren

Je Agent schreibt das Add-on einen Sensor `sensor.agent_<id>` (läuft, wartet, erfolgreich, fehlgeschlagen, nichts zu tun) mit Zeitplan, nächstem und letztem Lauf und der letzten Push (`last_push`, `last_push_at`, `last_push_title`, `last_push_message`) als Attributen, z. B. für Automationen. `CONTROL=off` in `env` schaltet sie ab.

## Dashboard „Agenten“

Das Add-on legt das Dashboard **Agenten** (`/dashboard-agenten`, nur Admins) an: je Agent ein Abschnitt mit Status, Zeitplan, letztem Lauf, letzter Push und Protokoll, oben die neueste Push aller Agenten. Es passt sich an, wenn Agenten dazukommen oder wegfallen. Von Hand geänderte Dashboards überschreibt es nicht; gelöscht wird es neu angelegt. `DASHBOARD=off` in `env` schaltet es ab.
