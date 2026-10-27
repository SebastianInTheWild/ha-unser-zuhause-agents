// Zeitstempel vor jeder Zeile im Protokoll des Add-ons („[27.10.2026, 10:15:35] …“, Ortszeit über TZ).
// Nur für langlebige Prozesse (Zeitplan, Start-Abgleich) – nicht für ha.mjs, dessen Ausgabe Claude als JSON liest.
// Autor: SebastianInTheWild · MIT-Lizenz

export const now = () => new Date().toLocaleString("de-DE", { timeZone: process.env.TZ || undefined });

/** console.log/error/warn bekommen den Zeitstempel vorangestellt (einmal aufrufen). */
export function stampConsole() {
  if (console.stamped) return;
  for (const k of ["log", "error", "warn"]) {
    const orig = console[k].bind(console);
    console[k] = (...args) => orig(`[${now()}]`, ...args);
  }
  console.stamped = true;
}
