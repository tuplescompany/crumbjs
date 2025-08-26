#!/usr/bin/env node
import { execSync } from "node:child_process";
import semver from "semver";

const pkg = process.argv[2] || "@crumbjs/core";
const cutoff = process.argv[3] || "0.9.0"; // todo lo < cutoff será objetivo
const dryRun = process.argv.includes("--dry-run");

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

function tryExec(cmd) {
  try {
    if (dryRun) {
      console.log(`[dry-run] ${cmd}`);
      return { ok: true, out: "" };
    }
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString();
    return { ok: true, out };
  } catch (e) {
    return { ok: false, err: e?.stderr?.toString() || e?.message || String(e) };
  }
}

console.log(`Package: ${pkg}`);
console.log(`Cutoff: < ${cutoff} (solo 0.x)`);
if (dryRun) console.log("Modo: DRY RUN (no cambia nada)\n");

let versions;
try {
  const raw = sh(`npm view ${pkg} versions --json`);
  versions = JSON.parse(raw);
  if (!Array.isArray(versions)) throw new Error("Respuesta inesperada de npm view");
} catch (e) {
  console.error(`No pude obtener versiones: ${e.message}`);
  process.exit(1);
}

const targets = versions
  .filter(v => semver.valid(v))
  // solo la rama 0.x
  .filter(v => semver.satisfies(v, "0.x"))
  // todo lo menor a cutoff
  .filter(v => semver.lt(v, cutoff))
  // por las dudas, orden ascendente
  .sort(semver.compare);

if (targets.length === 0) {
  console.log("No hay versiones para procesar.");
  process.exit(0);
}

console.log(`Encontré ${targets.length} versiones candidatas:\n${targets.join(", ")}\n`);

const warnMsg = `⚠️ Esta versión es obsoleta. Usa >= ${cutoff}.`;
let unpublished = 0;
let deprecated = 0;

for (const v of targets) {
  const spec = `${pkg}@${v}`;
  console.log(`→ Intentando unpublish ${spec} ...`);
  const res = tryExec(`npm unpublish ${spec}`);
  if (res.ok) {
    console.log(`✔ Unpublished ${spec}`);
    unpublished++;
    continue;
  }

  // Si no se pudo (p.ej., 72h rule), deprecamos
  const msg = res.err || "";
  const likely72h =
    msg.includes("cannot unpublish") ||
    msg.includes("Unpublish is not permitted") ||
    msg.includes("too_old") ||
    msg.includes("older than");

  if (!likely72h) {
    console.warn(`  Unpublish falló: ${msg.trim() || "error desconocido"}`);
    console.log(`  Intento deprecate ${spec} ...`);
  } else {
    console.log("  No se puede unpublish (72h / política npm). Deprecando...");
  }

  const dep = tryExec(`npm deprecate "${spec}" "${warnMsg}"`);
  if (dep.ok) {
    console.log(`✔ Deprecated ${spec}`);
    deprecated++;
  } else {
    console.error(`✖ No pude deprecar ${spec}: ${dep.err?.trim() || "error desconocido"}`);
  }
}

console.log("\nSummary:");
console.log(`  Unpublished: ${unpublished}`);
console.log(`  Deprecated : ${deprecated}`);
console.log("Finished.");
