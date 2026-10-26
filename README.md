# Unser Zuhause – Agenten

[![Validate](https://github.com/SebastianInTheWild/ha-unser-zuhause-agents/actions/workflows/validate.yml/badge.svg)](https://github.com/SebastianInTheWild/ha-unser-zuhause-agents/actions/workflows/validate.yml)
[![Add-on-Image](https://github.com/SebastianInTheWild/ha-unser-zuhause-agents/actions/workflows/addon.yml/badge.svg)](https://github.com/SebastianInTheWild/ha-unser-zuhause-agents/actions/workflows/addon.yml)

Ein Home-Assistant-Add-on, in dem KI-Agenten (Claude Code) nach Zeitplan für Home Assistant arbeiten. Jeder Agent ist ein Ordner unter `agents/` mit einer Anweisung und einem Zeitplan. Neue Agenten legst du als neuen Ordner an, ohne das Add-on neu zu bauen.

| Agent | Zeit | Was er macht |
|---|---|---|
| `automationen` | 08:00 | Gibt neuen Automationen einen sprechenden Namen, eine Beschreibung, Labels und eine Kategorie. Danach kommt ein Push mit der Übersicht. |
| `log-detektiv` | täglich 07:30 | Liest neue Fehler im HA-Protokoll, gruppiert sie, erklärt Ursache und Lösung, merkt sich harmlose Meldungen. Push bei wichtigen Funden und Dashboard **Log-Detektiv** (Befunde, Verlauf, harmlose Meldungen). |
| `energie-coach` | So 18:00 | Wertet die letzten 7 Tage aus (PV, Akku, Netz, Geräte, Laufzeiten von Trockner & Co.) und schickt 1–2 konkrete Tipps per Push. Erkennt Datenlücken. |
| `automations-doktor` | Sa 09:00 | Prüft alle Automationen (fehlende/ausgefallene Entitäten, Fehler in Läufen, Stillstand) und schreibt den Befund ins Dashboard **Automations-Doktor**, ohne Push. |

## Agent „Automationen sortieren“

- Er bearbeitet nur **neue** Automationen. Beim ersten Start merkt er sich alle vorhandenen als erledigt.
- Automationen mit dem Label **Test** (`SKIP_LABEL`) lässt er aus. Nimmst du das Label weg, kommt die Automation beim nächsten Lauf dran.
- Seinen Plan schreibt er in `/data/automationen/plan.json`, die einzige Datei, die er schreiben darf. `apply` prüft ihn, bevor etwas geändert wird.
- Er ändert nur Name, Beschreibung, Kategorie und Labels, **nie** Auslöser, Bedingungen oder Aktionen. Das Werkzeug prüft das vor und nach dem Speichern.
- Er nimmt bevorzugt Kategorien und Labels, die schon an deinen Automationen hängen. So bleibt alles einheitlich. Passt keine, legt er selbst eine neue Kategorie oder ein neues Label an, aber höchstens 2 pro Lauf (`MAX_NEW`). Das gilt nur für Themen, unter die weitere Automationen passen, und immer mit Icon und Beschreibung. Gibt es den Namen in HA schon, nutzt er den vorhandenen Eintrag. Der Push nennt, was neu angelegt wurde. Ist etwas unklar oder kaputt, vergibt er „Prüfen“.
- Vorhandene Labels nimmt er nie weg.
- Vor jeder Änderung sichert er den alten Stand (`/data/automationen/backups/`).
- Gibt es nichts Neues, startet Claude gar nicht. Dann entstehen auch keine Kosten.

## Installieren

Für amd64 und aarch64 (Home Assistant OS oder Supervised).

1. Einstellungen → Add-ons → Add-on Store → ⋮ → *Repositories* → `https://github.com/SebastianInTheWild/ha-unser-zuhause-agents` hinzufügen.
2. **Unser Zuhause – Agenten** installieren.
3. Unter *Konfiguration* eintragen:
   - **claude_code_oauth_token:** Auf einem Rechner mit Claude Code `claude setup-token` ausführen. Der Token läuft über dein Claude-Abo. Alternativ `anthropic_api_key` (Abrechnung pro Lauf).
   - **notify_persons:** Wer die Pushs bekommt, z. B. `person.sebastian`. Dafür braucht es die Integration [Unser Zuhause](https://github.com/SebastianInTheWild/ha-unser-zuhause-integration).
4. Starten.

Ein HA-Token ist nicht nötig, das Add-on nutzt den Supervisor. Alle Einstellungen stehen in [`unser_zuhause_agents/DOCS.md`](unser_zuhause_agents/DOCS.md).

## Zeitplan

Die Weboberfläche „Zeitplan“ erscheint als **Agenten** in der Seitenleiste (Ingress, nur für Admins). Dort stellst du je Agent feste Zeiten, Wochentage oder Abstände ein oder pausierst ihn. Änderungen gelten nach spätestens 30 Sekunden, ohne Neustart. Eine neu eingetragene Zeit, die heute schon vorbei ist, gilt erst ab morgen. Verpasst das Add-on eine Uhrzeit, weil es aus war, holt es den Lauf am selben Tag nach.

## Daten übernehmen

Merklisten, Sicherungen und Zeitplan aus einer bestehenden Installation übernimmst du über den Ordner `import/` unter `/addon_configs/<slug>_unser_zuhause_agents/`: den Inhalt des Datenordners (ein Unterordner je Agent) und die `zeitplan.conf` dorthin kopieren und das Add-on (neu) starten. Es übernimmt alles einmalig und löscht den Ordner danach.

## Bedienen

- **Sofort starten:** Knopf **Jetzt starten** im Dashboard „Agenten“ (siehe unten).
- **Protokoll:** Tab *Protokoll* des Add-ons, dazu Logs je Agent und Tag in den Add-on-Daten (`/data/<agent>/logs`).
- **Nur ausprobieren:** In der Option `env` `DRY=1` setzen, dann zeigen die Agenten nur, was sie ändern würden. Zum Ausprobieren an bestehenden Automationen zusätzlich `FORCE_IDS=automation.a,automation.b`.

## Dashboard „Agenten“ in Home Assistant

Der Scheduler legt in Home Assistant selbst ein Dashboard **Agenten** an (nur für Admins, in der Seitenleiste). Es zeigt je Agent:

- **Status** als Sensor `sensor.agent_<id>`: läuft, wartet, erfolgreich, fehlgeschlagen, nichts zu tun
- Zeitplan, nächster Lauf, letzter Lauf mit Ergebnis, Dauer und Auslöser (Zeitplan oder von Hand), dazu die letzten Protokollzeilen
- Knopf **Jetzt starten** (`input_button` „Agent <Name>“, mit Rückfrage)

Ein Druck auf den Knopf reiht den Agenten ein. Er startet innerhalb von etwa 30 Sekunden, sobald kein anderer Agent läuft. Die Vorprüfung gilt auch hier: Gibt es nichts zu tun, startet Claude nicht.

- Es gibt keinen offenen Port. Das Add-on fragt Home Assistant über den Supervisor ab.
- Agenten mit `"manual": false` in der `agent.json` bekommen keinen Knopf, ihr Status wird trotzdem angezeigt.
- Auch pausierte Agenten (in der Weboberfläche) lassen sich von Hand starten.
- Das Dashboard wird bei neuen oder geänderten Agenten neu geschrieben. Eigene Änderungen daran gehen dabei verloren.
- In der Option `env`: `CONTROL=off` schaltet die Steuerung ab. `CONTROL_DASHBOARD` ändert die Adresse (Standard `dashboard-agenten`, Home Assistant verlangt einen Bindestrich).

## Eigenen Agenten anlegen

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
| `manual` | `false` = kein Knopf „Jetzt starten“ im Dashboard „Agenten“ |
| `icon` | Symbol im Dashboard „Agenten“, z. B. `mdi:stethoscope` |
| `maxTurns`, `model` | Grenzen für Claude |

Das Werkzeug `app/ha.mjs` kann Zustände lesen (`states`), Pushs schicken (`notify`) und Automationen sortieren (`automations …`). Für neue Aufgaben bekommt es neue Befehle, damit jeder Agent genau das darf, was er braucht, und nicht mehr.

## Lizenz

MIT · Autor: SebastianInTheWild
