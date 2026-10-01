import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export class AuditInconclusiveError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuditInconclusiveError";
  }
}

export async function recordAuditEvidence(evidence, run, {
  directory = "test-results", name = "session-budget-live", report = console.log,
} = {}) {
  evidence.startedAt = new Date().toISOString();
  const runId = `${evidence.startedAt.replace(/[:.]/g, "-")}-${crypto.randomUUID()}`;
  evidence.artifact = join(directory, `${name}-${runId}.json`);
  try {
    await run();
    evidence.status = "passed";
  } catch (error) {
    evidence.status = error instanceof AuditInconclusiveError ? "inconclusive" : "failed";
    evidence.error = { name: error?.name ?? "Error", message: error?.message ?? String(error) };
    throw error;
  } finally {
    evidence.completedAt = new Date().toISOString();
    const json = JSON.stringify(evidence, null, 2);
    await mkdir(directory, { recursive: true });
    // Preserve every attempt. The convenience latest file cannot erase an
    // earlier failure or inconclusive result when a later retry succeeds.
    await writeFile(evidence.artifact, json, { flag: "wx" });
    await writeFile(join(directory, `${name}.json`), json);
    report(json);
  }
}
