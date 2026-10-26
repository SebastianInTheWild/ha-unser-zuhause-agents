# Unser Zuhause – Agenten

KI-Agenten (Claude Code), die nach Zeitplan für Home Assistant arbeiten: Automationen sortieren, Fehlerprotokoll auswerten, Energie-Tipps, Automations-Doktor.

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

## Zeitplan

Wann welcher Agent läuft, stellst du in der Seitenleiste unter **Agenten** ein (Weboberfläche „Zeitplan“): feste Zeiten, Wochentage, Abstände oder pausiert. Änderungen gelten nach spätestens 30 Sekunden, ohne Neustart.

## Eigene Agenten

Beim ersten Start legt das Add-on unter `/addon_configs/<slug>_unser_zuhause_agents/agents/` einen Ordner je Agent an (im File editor, über SSH oder Samba erreichbar). Neuer Agent: `_vorlage` kopieren, `prompt.md` und `agent.json` anpassen. Er erscheint ohne Neustart in der Weboberfläche.

Mitgelieferte Agenten kopiert das Add-on nur, wenn es den Ordner noch nicht gibt. Deine Änderungen an Anweisungen bleiben also bei Updates erhalten. Willst du die neue Fassung eines mitgelieferten Agenten, lösche seinen Ordner und starte das Add-on neu. Einen Agenten abschalten: in der Weboberfläche pausieren statt den Ordner zu löschen, sonst kommt er beim nächsten Start wieder.

Merklisten, Sicherungen und Logs liegen in den Add-on-Daten und sind in den HA-Backups enthalten (ohne die Tageslogs).

## Umzug aus der Docker-Variante

1. Add-on installieren, aber noch nicht starten.
2. Nach `/addon_configs/<slug>_unser_zuhause_agents/` kopieren:
   - deine angepassten Agenten-Ordner nach `agents/`
   - den **Inhalt** des alten `daten/`-Ordners und die alte `zeitplan.conf` nach `import/`
3. Alten Container stoppen, sonst laufen die Agenten doppelt.
4. Add-on starten. Es übernimmt `import/` einmalig (Merklisten, Sicherungen, Zeitplan) und löscht den Ordner danach. Im Log steht „Import: alte Daten … übernommen“.

## Dashboard „Agenten“

Wie in der Docker-Variante legt das Add-on das Dashboard **Agenten** mit Status-Sensoren (`sensor.agent_<id>`) und Knöpfen **Jetzt starten** an.
