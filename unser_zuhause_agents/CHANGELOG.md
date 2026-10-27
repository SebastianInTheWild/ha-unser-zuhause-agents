# Changelog

## 1.4.1

- Das Add-on legt das Dashboard **Agenten** (`/dashboard-agenten`) selbst an: je Agent ein Abschnitt mit Status, Zeitplan, letztem Lauf, letzter Push und Protokoll, oben die neueste Push aller Agenten; ein Tipp auf einen Agenten öffnet die Weboberfläche
- Kommen Agenten dazu oder fallen weg, wird es neu geschrieben – außer es wurde in Home Assistant von Hand geändert; `DASHBOARD=off` schaltet es ab
- Weboberfläche und Seitenleiste heißen jetzt **Unser Zuhause – Agents**

## 1.4.0

- Die Status-Sensoren `sensor.agent_<id>` zeigen die letzte Push des Agenten: `last_push` (Zeit), `last_push_at` (ISO, zum Sortieren), `last_push_title` und `last_push_message`
- Gespeichert in `last-push.json` im Datenordner des Agenten, auch Pushs bei fehlgeschlagenen Läufen

## 1.3.0

- Neuer Agent **Batterie-Wächter** (So 10:00): meldet bald leere Batterien mit Raum, Prognose und Batterietyp und setzt die Batterien auf die Einkaufsliste
- Neuer Agent **Update-Berater** (Fr 18:00): liest die Release Notes offener Updates und empfiehlt einspielen, vorher prüfen oder abwarten
- Neuer Agent **Geräte-Wächter** (täglich 08:30): findet Geräte, die offline sind, immer wieder wegfallen oder schwaches Signal haben, und erkennt Muster
- Bestehende Installationen bekommen die neuen Agenten beim Start automatisch dazu
- Mindestversion Home Assistant 2024.4 (Labels und Kategorien)
- README: alle Agenten und Einstellungen mit Standardwerten, Voraussetzungen, Ein-Klick-Knöpfe, dazugehörige Repos
- Prüfungen bei jedem Push und wöchentlich: Image bauen und starten, ShellCheck, Übersetzungen, Changelog und Agenten; GitHub-Releases aus dem Changelog

## 1.2.0

- Einstellungen im Tab *Konfiguration* mit Namen und Erklärung, auf Deutsch und Englisch
- Changelog im Add-on und im Update-Dialog
- Versionsnummer unten in der Weboberfläche und im Protokoll

## 1.1.0

- Knopf **Jetzt starten** je Agent in der Weboberfläche
- Das Dashboard „Agenten“ und die Knöpfe „Agent …“ in Home Assistant entfallen; die Status-Sensoren `sensor.agent_<id>` bleiben
- Icon und Logo

## 1.0.0

- Erste Fassung als Home-Assistant-Add-on: Agenten Automationen sortieren, Log-Detektiv, Energie-Coach, Automations-Doktor und Doktor-Umsetzer
- Zeitplan über die Weboberfläche in der Seitenleiste
- Zugriff auf Home Assistant über den Supervisor, ohne eigenen Token
- Einmalige Datenübernahme über den Ordner `import/`
