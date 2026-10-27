// Shared helpers for the database scripts (run with tsx, outside Next).
import fs from "node:fs";
import pg from "pg";
import type { SqlConn } from "../../src/lib/database/migrations";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function requireEnv(name: string, hint: string): string {
  const v = env(name);
  if (!v) {
    console.error(`Missing ${name}. ${hint}`);
    process.exit(1);
  }
  return v;
}

// Host and database only: never print users, passwords or query strings.
export function describeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

export async function connect(url: string, label: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url, application_name: `yoru-${label}`, connectionTimeoutMillis: 15_000 });
  await client.connect();
  return client;
}

export function asConn(client: pg.Client): SqlConn {
  return {
    query: async <T,>(sql: string, params?: unknown[]) => (await client.query(sql, params as unknown[])) as unknown as { rows: T[] },
    exec: (sql: string) => client.query(sql),
  };
}

export const flag = (name: string) => process.argv.includes(name);
export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
