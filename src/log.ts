// Local journal of what the app did: no codes, no challenges, no secrets.

import * as db from "./db";

export type LogKind =
  | "code"
  | "enrolled"
  | "replaced"
  | "confirmed"
  | "rolled-back"
  | "removed"
  | "unknown-account";

export interface LogEntry {
  id?: number;
  time: string;
  kind: LogKind;
  account: string;
  service?: string;
}

const LIMIT = 200;

export async function addLog(entry: Omit<LogEntry, "id" | "time">): Promise<void> {
  await db.put("log", { ...entry, time: new Date().toISOString() });
  const keys = await db.keys("log");
  if (keys.length > LIMIT) await db.remove("log", IDBKeyRange.upperBound(keys[keys.length - LIMIT - 1]));
}

export async function listLog(): Promise<LogEntry[]> {
  return (await db.getAll<LogEntry>("log")).reverse();
}

export function clearLog(): Promise<void> {
  return db.clear("log");
}
