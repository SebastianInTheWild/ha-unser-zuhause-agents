#!/usr/bin/env python3
"""Prüft die Add-on-Konfiguration und die Agenten auf Stimmigkeit; gibt für Releases die Notizen aus.

  python3 .github/scripts/check_addon.py              Stimmigkeit prüfen (CI)
  python3 .github/scripts/check_addon.py release vX   Tag gegen Version prüfen, Notizen aus CHANGELOG.md ausgeben

Autor: SebastianInTheWild · MIT-Lizenz
"""
import json
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
ADDON = ROOT / "unser_zuhause_agents"
errors = []


def error(msg):
    errors.append(msg)


def changelog_sections():
    """Abschnitte aus CHANGELOG.md: {version: text}, in Reihenfolge."""
    text = (ADDON / "CHANGELOG.md").read_text(encoding="utf-8")
    parts = re.split(r"^## +(\S+)\s*$", text, flags=re.M)
    return {parts[i]: parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}


def check():
    config = yaml.safe_load((ADDON / "config.yaml").read_text(encoding="utf-8"))
    version = str(config.get("version", ""))
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        error(f"config.yaml: version „{version}“ ist keine Version wie 1.2.3")
    sections = list(changelog_sections())
    if not sections or sections[0] != version:
        error(f"CHANGELOG.md: der oberste Abschnitt muss „## {version}“ sein (gefunden: {sections[:1]})")

    # Einstellungen: jede Option im Schema, jede Schema-Option in beiden Übersetzungen mit Name und Erklärung
    schema = {re.sub(r"\?$", "", k) for k in config.get("schema", {})}
    for key in config.get("options", {}):
        if key not in schema:
            error(f"config.yaml: Option „{key}“ fehlt im schema")
    for lang in ("de", "en"):
        path = ADDON / "translations" / f"{lang}.yaml"
        conf = (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("configuration", {})
        if set(conf) != schema:
            error(f"translations/{lang}.yaml: fehlt {sorted(schema - set(conf))}, überzählig {sorted(set(conf) - schema)}")
        for key, entry in conf.items():
            if not (entry or {}).get("name") or not (entry or {}).get("description"):
                error(f"translations/{lang}.yaml: „{key}“ braucht name und description")

    # Agenten: agent.json vollständig, prompt.md vorhanden, zeitplan.conf nennt nur vorhandene Agenten
    agents = set()
    for folder in sorted((ROOT / "agents").iterdir()):
        if not folder.is_dir():
            continue
        try:
            agent = json.loads((folder / "agent.json").read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            error(f"agents/{folder.name}/agent.json: {e}")
            continue
        if not (folder / agent.get("prompt", "prompt.md")).is_file():
            error(f"agents/{folder.name}: prompt.md fehlt")
        for field, kind in (("name", str), ("description", str), ("schedule", list), ("allowedTools", list)):
            if not isinstance(agent.get(field), kind):
                error(f"agents/{folder.name}/agent.json: „{field}“ fehlt oder hat den falschen Typ")
        if not folder.name.startswith("_"):
            agents.add(folder.name)
    for line in (ROOT / "zeitplan.conf").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([\w.-]+)\s*[=:]", line.split("#")[0].strip())
        if m and m.group(1) not in agents:
            error(f"zeitplan.conf: Agent „{m.group(1)}“ gibt es nicht")
    # Jeder Agent steht im README
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for name in sorted(agents):
        if f"`{name}`" not in readme:
            error(f"README.md: Agent `{name}` fehlt")


def release(tag):
    version = str(yaml.safe_load((ADDON / "config.yaml").read_text(encoding="utf-8")).get("version", ""))
    if tag != f"v{version}":
        error(f"Tag {tag} passt nicht zur Version {version} in unser_zuhause_agents/config.yaml (erwartet v{version})")
        return
    notes = changelog_sections().get(version)
    if not notes:
        error(f"CHANGELOG.md: kein Abschnitt „## {version}“")
        return
    print(notes)


if __name__ == "__main__":
    if sys.argv[1:2] == ["release"]:
        release(sys.argv[2] if len(sys.argv) > 2 else "")
    else:
        check()
    for e in errors:
        print(f"::error::{e}", file=sys.stderr)
    if not errors and sys.argv[1:2] != ["release"]:
        print("Add-on-Konfiguration, Übersetzungen, Changelog und Agenten stimmig")
    sys.exit(1 if errors else 0)
