# Unser Zuhause – Agenten

[![Validate](https://github.com/SebastianInTheWild/ha-unser-zuhause-agents/actions/workflows/validate.yml/badge.svg?branch=main)](https://github.com/SebastianInTheWild/ha-unser-zuhause-agents/actions/workflows/validate.yml)
[![Add-on-Image](https://github.com/SebastianInTheWild/ha-unser-zuhause-agents/actions/workflows/addon.yml/badge.svg?branch=main)](https://github.com/SebastianInTheWild/ha-unser-zuhause-agents/actions/workflows/addon.yml)
[![Home Assistant Add-on](https://img.shields.io/badge/Home%20Assistant-Add--on-41BDF5?logo=homeassistant&logoColor=white)](unser_zuhause_agents)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.4%2B-41BDF5?logo=homeassistant&logoColor=white)](https://www.home-assistant.io/)
[![Version](https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fraw.githubusercontent.com%2FSebastianInTheWild%2Fha-unser-zuhause-agents%2Fmain%2Funser_zuhause_agents%2Fconfig.yaml&query=%24.version&label=Version&color=41BDF5)](unser_zuhause_agents/CHANGELOG.md)
[![Architekturen](https://img.shields.io/badge/Architektur-amd64%20%7C%20aarch64-41BDF5)](unser_zuhause_agents/config.yaml)
[![Lizenz](https://img.shields.io/github/license/SebastianInTheWild/ha-unser-zuhause-agents)](LICENSE)
[![Letzter Commit](https://img.shields.io/github/last-commit/SebastianInTheWild/ha-unser-zuhause-agents)](https://github.com/SebastianInTheWild/ha-unser-zuhause-agents/commits/main)

Ein Home-Assistant-Add-on, in dem KI-Agenten (Claude Code) nach Zeitplan für Home Assistant arbeiten. Jeder Agent ist ein Ordner unter `agents/` mit einer Anweisung und einem Zeitplan. Neue Agenten legst du als neuen Ordner an, ohne das Add-on neu zu bauen.

[![Add-on-Repository hinzufügen](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FSebastianInTheWild%2Fha-unser-zuhause-agents)
[![Add-on öffnen](https://my.home-assistant.io/badges/supervisor_addon.svg)](https://my.home-assistant.io/redirect/supervisor_addon/?addon=9df7a0b9_unser_zuhause_agents&repository_url=https%3A%2F%2Fgithub.com%2FSebastianInTheWild%2Fha-unser-zuhause-agents)

## Funktionen

| Agent | Zeit | Was er macht |
|---|---|---|
| `automationen` | 08:00 | Gibt neuen Automationen einen sprechenden Namen, eine Beschreibung, Labels und eine Kategorie. Danach kommt ein Push mit der Übersicht. |
| `log-detektiv` | täglich 07:30 | Liest neue Fehler im HA-Protokoll, gruppiert sie, erklärt Ursache und Lösung, merkt sich harmlose Meldungen. Push bei wichtigen Funden und Dashboard **Log-Detektiv** (Befunde, Verlauf, harmlose Meldungen). |
| `energie-coach` | So 18:00 | Wertet die letzten 7 Tage aus (PV, Akku, Netz, Geräte, Laufzeiten von Trockner & Co.) und schickt 1–2 konkrete Tipps per Push. Erkennt Datenlücken. |
| `batterie-waechter` | So 10:00 | Meldet Batterien, die leer sind oder laut Verlauf in den nächsten 30 Tagen leer werden, mit Raum und Batterietyp (aus [Battery Notes](https://github.com/andrew-codechimp/HA-Battery-Notes)), und setzt die passenden Batterien auf die Einkaufsliste (`BATTERY_TODO`). Akkus (Handy, Hausspeicher, Mäher) erkennt er am Verlauf und lässt sie aus. |
| `update-berater` | Fr 18:00 | Liest die Release Notes der offenen Updates (Core, Add-ons, HACS, Firmware), prüft Breaking Changes gegen deine Integrationen und empfiehlt per Push: ✅ sicher, ⚠️ vorher prüfen oder ⏸ abwarten. Er installiert nichts. |
| `geraete-waechter` | täglich 08:30 | Findet Geräte, die offline sind, in 7 Tagen mehrfach wegfielen oder ein schwaches Zigbee-Signal haben, erkennt Muster (gleiche Bridge, gleiche Uhrzeit, leere Batterie) und schlägt Abhilfe vor. Absichtlich abgeschaltete Geräte ignoriert er künftig. |
| `automations-doktor` | Sa 09:00 | Prüft alle Automationen (fehlende/ausgefallene Entitäten, Fehler in Läufen, Stillstand) und schreibt den Befund ins Dashboard **Automations-Doktor**, ohne Push. |
| `doktor-umsetzer` | alle 5 min | Übernimmt Empfehlungen, die du im Dashboard **Automations-Doktor** per Knopf freigibst, in die Automation (mit Sicherung) oder lehnt sie begründet ab, und schickt das Ergebnis per Push. Ohne Freigabe startet Claude nicht. |

### Agent „Automationen sortieren“

- Er bearbeitet nur **neue** Automationen. Beim ersten Start merkt er sich alle vorhandenen als erledigt.
- Automationen mit dem Label **Test** (`SKIP_LABEL`) lässt er aus. Nimmst du das Label weg, kommt die Automation beim nächsten Lauf dran.
- Seinen Plan schreibt er in `/data/automationen/plan.json`, die einzige Datei, die er schreiben darf. `apply` prüft ihn, bevor etwas geändert wird.
- Er gibt jeder Automation ein passendes Icon. Schon sortierte Automationen ohne Icon bekommen beim nächsten Lauf eins nachgesetzt – nur das Icon, sonst bleibt alles.
- Er ändert nur Name, Beschreibung, Kategorie, Labels und Icon, **nie** Auslöser, Bedingungen oder Aktionen. Das Werkzeug prüft das vor und nach dem Speichern.
- Er nimmt bevorzugt Kategorien und Labels, die schon an deinen Automationen hängen. So bleibt alles einheitlich. Passt keine, legt er selbst eine neue Kategorie oder ein neues Label an, aber höchstens 2 pro Lauf (`MAX_NEW`). Das gilt nur für Themen, unter die weitere Automationen passen, und immer mit Icon und Beschreibung. Gibt es den Namen in HA schon, nutzt er den vorhandenen Eintrag. Der Push nennt, was neu angelegt wurde. Ist etwas unklar oder kaputt, vergibt er „Prüfen“.
- Vorhandene Labels nimmt er nie weg.
- Vor jeder Änderung sichert er den alten Stand (`/data/automationen/backups/`).
- Gibt es nichts Neues, startet Claude gar nicht. Dann entstehen auch keine Kosten.

### Weboberfläche „Unser Zuhause – Agents“

Die Weboberfläche erscheint als **Unser Zuhause – Agents** in der Seitenleiste (im Add-on unter *Info* **In Seitenleiste anzeigen** einschalten, nur für Admins). Sie zeigt je Agent Status, Zeitplan, nächsten und letzten Lauf.

- **Zeitplan:** feste Zeiten, Wochentage oder Abstände einstellen oder pausieren. Änderungen gelten nach spätestens 30 Sekunden, ohne Neustart. Eine neu eingetragene Zeit, die heute schon vorbei ist, gilt erst ab morgen. Verpasst das Add-on eine Uhrzeit, weil es aus war, holt es den Lauf am selben Tag nach.
- **Jetzt starten:** reiht den Agenten ein (mit Rückfrage). Er startet innerhalb von etwa 30 Sekunden, sobald kein anderer Agent läuft. Die Vorprüfung gilt auch hier: Gibt es nichts zu tun, startet Claude nicht. Auch pausierte Agenten lassen sich so starten, Agenten mit `"manual": false` und deaktivierte nicht.
- **Deaktivieren:** schaltet einen Agenten ganz ab (`zeitplan.conf`: `<id> = deaktiviert   # vorher: …`). Er läuft weder nach Zeitplan noch von Hand, sein Sensor zeigt „deaktiviert“, im Dashboard „Agenten“ steht er nur noch als Name. Hat er ein eigenes Dashboard (`agent.json` → `dashboard: {url, title, create}`, z. B. Log-Detektiv und Automations-Doktor), entfernt das Add-on es; die Daten bleiben. **Aktivieren** holt den vorherigen Zeitplan zurück, und das Add-on legt das Dashboard mit dem `create`-Befehl aus den gemerkten Daten neu an. Aktive Agenten mit Dashboard bekommen es so auch schon vor dem ersten Lauf.
- **Updates der mitgelieferten Agenten:** Dateien, die du nicht geändert hast, bringt das Add-on beim Start auf die neue Fassung (`agents/.versionen.json` kennt alle früheren Fassungen). Geänderte bleiben und stehen im Protokoll. Vor einem Release `node app/agents-sync.mjs --update agents` ausführen; die CI prüft das.

### Status-Sensoren in Home Assistant

Je Agent schreibt das Add-on einen Sensor `sensor.agent_<id>` nach Home Assistant, z. B. für Automationen („Log-Detektiv fehlgeschlagen → Push“) oder eigene Dashboards:

- **Zustand:** läuft, wartet, erfolgreich, fehlgeschlagen, nichts zu tun, noch nie gelaufen
- **Attribute:** `schedule`, `next_run`, `running_since`, `last_run`, `last_result`, `last_by` (Zeitplan oder von Hand), `last_note`, `last_duration`, `last_check`, `last_push`, `last_push_at`, `last_push_title`, `last_push_message` (letzte Push), `log` (letzte Protokollzeilen)

Die Sensoren sind nicht im Entitätenregister, sie verschwinden bei einem HA-Neustart kurz und werden innerhalb von 15 Sekunden neu geschrieben. In der Option `env` schaltet `CONTROL=off` sie ab.

### Dashboard „Agenten“

Aus den Sensoren baut das Add-on das Dashboard **Agenten** (`/dashboard-agenten`, nur für Admins): je Agent ein Abschnitt mit Status, Zeitplan, letztem Lauf, letzter Push und Protokoll, oben die neueste Push aller Agenten. Ein Tipp auf einen Agenten öffnet die Weboberfläche. Kommen Agenten dazu oder fallen weg, schreibt das Add-on das Dashboard neu – aber nur, solange es niemand in Home Assistant von Hand geändert hat. Wer es löscht, bekommt es frisch angelegt. `DASHBOARD=off` in `env` schaltet es ab.

## Voraussetzungen

- Home Assistant OS oder Supervised ab **2024.4** (Labels und Kategorien), auf amd64 oder aarch64
- Ein Claude-Abo (Token aus `claude setup-token`) oder ein Anthropic-API-Schlüssel
- Für Pushs: die Integration [Unser Zuhause](https://github.com/SebastianInTheWild/ha-unser-zuhause-integration)
- Für den Energie-Coach: ein eingerichtetes Energie-Dashboard (Netz, PV, Akku, Geräte)

## Installation

1. Mit dem Knopf **Add-on-Repository hinzufügen** oben, oder von Hand: Einstellungen → Add-ons → Add-on Store → ⋮ → *Repositories* → `https://github.com/SebastianInTheWild/ha-unser-zuhause-agents` hinzufügen.
2. **Unser Zuhause – Agenten** installieren.
3. Einstellungen eintragen (siehe unten) und starten.
4. Unter *Info* **In Seitenleiste anzeigen** einschalten.

Ein HA-Token ist nicht nötig, das Add-on nutzt den Supervisor.

## Einrichten

### Einstellungen

Im Tab *Konfiguration*, mit Erklärung auf Deutsch und Englisch:

| Option | Standard | Bedeutung |
|---|---|---|
| `claude_code_oauth_token` | – | Token aus `claude setup-token`, läuft über dein Claude-Abo |
| `anthropic_api_key` | – | statt des Tokens: API-Schlüssel, Abrechnung pro Lauf |
| `claude_model` | Standard von Claude Code | ein bestimmtes Modell für alle Agenten |
| `notify_persons` | leer | wer die Pushs bekommt, z. B. `person.sebastian`; leer = keine Pushs |
| `skip_label` | `Test` | Automationen mit diesem Label fasst „Automationen sortieren“ nicht an |
| `ha_token` | – | nur, falls ein Aufruf über den Supervisor abgelehnt wird: eigener langlebiger Zugriffstoken |
| `env` | leer | weitere Einstellungen als `NAME=Wert` (siehe nächste Tabelle) |

### Weitere Einstellungen (`env`)

| Variable | Standard | Bedeutung |
|---|---|---|
| `DRY` | – | `1` = Agenten zeigen nur, was sie ändern würden |
| `FORCE_IDS` | – | mit `DRY=1`: diese Automationen gelten als neu, z. B. `automation.a,automation.b` |
| `MAX_NEW` | `2` | neue Kategorien bzw. Labels pro Lauf von „Automationen sortieren“ |
| `LOG_LEVELS` | `ERROR,CRITICAL` | welche Meldungen der Log-Detektiv auswertet, z. B. `ERROR,CRITICAL,WARNING` |
| `LOG_DASHBOARD` | `log-detektiv` | Adresse des Dashboards „Log-Detektiv“ |
| `DOCTOR_DASHBOARD` | `automations-doktor` | Adresse des Dashboards „Automations-Doktor“ |
| `DOCTOR_QUIET_DAYS` | `60` | so viele Tage ohne Auslösen gelten beim Doktor als Stillstand |
| `DOCTOR_TODO_NAME` | `Doktor-Freigaben` | Name der To-do-Liste für Freigaben |
| `BATTERY_WARN` | `20` | Batterie-Wächter: ab diesem Stand in % gilt eine Batterie als schwach |
| `BATTERY_HORIZON_DAYS` | `30` | Batterie-Wächter: meldet Batterien, die laut Prognose in so vielen Tagen leer sind |
| `BATTERY_REMIND_DAYS` | `14` | Batterie-Wächter: gemeldete Batterien erst nach so vielen Tagen erneut melden |
| `BATTERY_TODO` | `todo.einkaufsliste` (in seiner `agent.json`) | Liste für die Batterien zum Kaufen; leer = keine Liste |
| `BATTERY_EXCLUDE` | – | Batterie-Sensoren, die nicht zählen, z. B. `sensor.auto_battery,sensor.garten_*` |
| `BATTERY_EXCLUDE_PLATFORMS` | `mobile_app` | Integrationen, deren Geräte nicht zählen (Handys) |
| `DEVICE_GRACE_MIN` | `60` | Geräte-Wächter: erst nach so vielen Minuten offline zählt ein Gerät |
| `DEVICE_FLAPS` | `3` | Geräte-Wächter: so viele Ausfälle in 7 Tagen gelten als „fällt immer wieder weg“ |
| `DEVICE_LQI_WEAK` | `40` | Geräte-Wächter: Zigbee-Linkqualität bis zu diesem Wert gilt als schwach |
| `DEVICE_REMIND_DAYS` | `7` | Geräte-Wächter: bekannte Probleme erst nach so vielen Tagen erneut melden |
| `UPDATE_NOTES_MAX` | `6000` | Update-Berater: Zeichen Release Notes je Update in der Übersicht |
| `CONTROL` | an | `off` = keine Status-Sensoren |
| `CONTROL_PREFIX` | `Agent` | Namensanfang der Status-Sensoren |
| `DASHBOARD` | an | `off` = kein Dashboard „Agenten“ |

Der Energie-Coach liest zusätzlich die Laufzeiten von Geräten ohne eigenen Zähler. Welche das sind, steht als `ENERGY_ACTIVITY` in seiner `agent.json`.

Ein Gerät, das der Geräte-Wächter ignoriert, nimmst du im Terminal-Add-on (Schutzmodus aus) so wieder auf: `docker exec -e AGENT_ID=geraete-waechter addon_9df7a0b9_unser_zuhause_agents node /app/ha.mjs devices unignore <device_id>`. Die Liste zeigt derselbe Befehl mit `devices ignored`.

### Bedienen

- **Sofort starten:** Knopf **Jetzt starten** in der Weboberfläche.
- **Protokoll:** Tab *Protokoll* des Add-ons, dazu Logs je Agent und Tag in den Add-on-Daten (`/data/<agent>/logs`).
- **Daten übernehmen:** Merklisten, Sicherungen und Zeitplan aus einer bestehenden Installation: den Inhalt des Datenordners (ein Unterordner je Agent) und die `zeitplan.conf` nach `/addon_configs/<slug>_unser_zuhause_agents/import/` kopieren und das Add-on (neu) starten. Es übernimmt alles einmalig und löscht den Ordner danach.

### Eigenen Agenten anlegen

1. Unter `/addon_configs/<slug>_unser_zuhause_agents/agents/` den Ordner `_vorlage` kopieren, z. B. nach `batterien`. Ordner mit `_` am Anfang werden ignoriert.
2. In `prompt.md` beschreiben, was der Agent tun soll.
3. In `agent.json` die Felder aus der Tabelle einstellen.
4. In der Weboberfläche die Zeit einstellen. Ein Neustart ist nicht nötig.

| Feld | Bedeutung |
|---|---|
| `name`, `description` | Anzeige und Push-Titel bei Fehlern |
| `enabled` | `false` = pausiert |
| `schedule` | Uhrzeiten, z. B. `["08:00", "20:00"]`, mit Wochentagen `["So 18:00"]` oder `["Mo,Mi,Fr 07:30"]`, in Abständen `["alle 5 min"]` |
| `precheck` | Befehl vorab. Gibt er `0` aus, startet Claude nicht (spart Kosten). |
| `init` | Befehl, der nur beim allerersten Lauf ausgeführt wird |
| `allowedTools` | Was der Agent darf, z. B. `Bash(node ha.mjs states:*)`. Alles andere ist gesperrt. |
| `env` | zusätzliche Umgebungsvariablen nur für diesen Agenten |
| `manual` | `false` = kein Knopf „Jetzt starten“ |
| `maxTurns`, `model` | Grenzen für Claude |

Das Werkzeug `app/ha.mjs` kann Zustände lesen (`states`), Pushs schicken (`notify`) und Automationen sortieren (`automations …`). Für neue Aufgaben bekommt es neue Befehle, damit jeder Agent genau das darf, was er braucht, und nicht mehr.

## Neue Version veröffentlichen

1. `version` in `unser_zuhause_agents/config.yaml` erhöhen und oben in `unser_zuhause_agents/CHANGELOG.md` einen Abschnitt `## <version>` anlegen. Die CI prüft, dass beides zusammenpasst.
2. Nach `main` pushen. Der Workflow **Add-on-Image** baut die Images für amd64 und aarch64; erst danach das Update in Home Assistant einspielen.
3. Tag `v<version>` setzen und pushen. Der Workflow **Release** prüft Tag und Version und legt das GitHub-Release mit den Notizen aus dem Changelog an.

## Dazugehörige Repos

- [ha-unser-zuhause](https://github.com/SebastianInTheWild/ha-unser-zuhause) – Dashboard-Strategy
- [ha-unser-zuhause-cards](https://github.com/SebastianInTheWild/ha-unser-zuhause-cards) – Karten
- [ha-unser-zuhause-integration](https://github.com/SebastianInTheWild/ha-unser-zuhause-integration) – Integration (Pushs an Personen, Sammelsensoren)
- [ha-unser-zuhause-blueprints](https://github.com/SebastianInTheWild/ha-unser-zuhause-blueprints) – Automationen (Blueprints)

## Lizenz

MIT · Autor: SebastianInTheWild
