#!/usr/bin/env node
// Mitgelieferte Agenten nach /config/agents bringen, ohne eigene Änderungen zu überschreiben:
// Fehlt ein Agent oder eine Datei, wird sie kopiert. Ist eine vorhandene Datei noch genau eine früher
// mitgelieferte Fassung (Hash in agents/.versionen.json), wird sie auf die neue Fassung gebracht.
// Von Hand geänderte Dateien bleiben, wie sie sind.
// Autor: SebastianInTheWild · MIT-Lizenz
//
//   node agents-sync.mjs <mitgeliefert> <ziel>   beim Start des Add-ons (start.sh)
//   node agents-sync.mjs --update <agents>       Hashes der aktuellen Dateien in .versionen.json aufnehmen (vor jedem Release)
//   node agents-sync.mjs --check <agents>        prüfen, ob alle aktuellen Dateien in .versionen.json stehen (CI)

import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSIONS = ".versionen.json";
// Zeilenenden egal (Windows-Editoren)
export const hashOf = (file) => createHash("sha256").update(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);

/** Alle Dateien der Agenten als „agent/datei“. */
function files(dir) {
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of readdirSync(join(dir, d.name), { withFileTypes: true })) if (f.isFile()) out.push(`${d.name}/${f.name}`);
  }
  return out.sort();
}

const loadVersions = (dir) => (existsSync(join(dir, VERSIONS)) ? JSON.parse(readFileSync(join(dir, VERSIONS), "utf8")) : {});

export function sync(src, dst, log = console.log) {
  const known = loadVersions(src);
  mkdirSync(dst, { recursive: true });
  const result = { copied: [], updated: [], kept: [] };
  for (const d of readdirSync(src, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (!existsSync(join(dst, d.name))) {
      cpSync(join(src, d.name), join(dst, d.name), { recursive: true });
      result.copied.push(d.name);
      log(`Agent ${d.name} nach ${dst} kopiert`);
    }
  }
  for (const rel of files(src)) {
    const from = join(src, rel);
    const to = join(dst, rel);
    if (result.copied.includes(rel.split("/")[0])) continue;
    if (!existsSync(to)) {
      copyFileSync(from, to);
      result.updated.push(rel);
      log(`${rel} ergänzt`);
      continue;
    }
    const mine = hashOf(to);
    if (mine === hashOf(from)) continue;
    if ((known[rel] || []).includes(mine)) {
      copyFileSync(from, to);
      result.updated.push(rel);
      log(`${rel} auf die neue Fassung gebracht`);
    } else {
      result.kept.push(rel);
      log(`${rel} von Hand geändert – bleibt (neue Fassung unter ${from})`);
    }
  }
  return result;
}

function main() {
  const [a, b] = process.argv.slice(2);
  if (a === "--update" || a === "--check") {
    const known = loadVersions(b);
    const missing = [];
    for (const rel of files(b)) {
      const h = hashOf(join(b, rel));
      if (!(known[rel] || []).includes(h)) missing.push(rel), (known[rel] = [...(known[rel] || []), h]);
    }
    if (a === "--check") {
      if (missing.length) {
        console.error(`Nicht in ${VERSIONS}: ${missing.join(", ")} – vor dem Release „node app/agents-sync.mjs --update agents“ ausführen`);
        process.exit(1);
      }
      return console.log(`${VERSIONS} vollständig`);
    }
    writeFileSync(join(b, VERSIONS), JSON.stringify(Object.fromEntries(Object.entries(known).sort()), null, 1) + "\n");
    return console.log(missing.length ? `Aufgenommen: ${missing.join(", ")}` : "Nichts Neues");
  }
  if (!a || !b) {
    console.error("node agents-sync.mjs <mitgeliefert> <ziel> | --update <agents> | --check <agents>");
    process.exit(2);
  }
  sync(a, b);
}

if (process.argv[1]?.endsWith("agents-sync.mjs")) main();
