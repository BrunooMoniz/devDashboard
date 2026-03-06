import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import path from "path";
import { mkdirSync } from "fs";

const DB_DIR = path.join(process.cwd(), "data");
mkdirSync(DB_DIR, { recursive: true });

const DB_URL =
  process.env.DB_URL ?? `file:${path.join(DB_DIR, "dashboard.db")}`;

const client = createClient({ url: DB_URL });
export const db = drizzle(client, { schema });

const AGENTS = [
  { id: "main", name: "Atlas", role: "Orchestrator", emoji: "🧠", model: "claude-sonnet-4-6" },
  { id: "pm", name: "Iris", role: "Product Manager", emoji: "📋", model: "claude-haiku-4-5" },
  { id: "architect", name: "Orion", role: "Tech Lead", emoji: "🏗️", model: "claude-sonnet-4-6" },
  { id: "frontend", name: "Pixel", role: "Frontend Developer", emoji: "🎨", model: "claude-haiku-4-5" },
  { id: "backend", name: "Forge", role: "Backend Developer", emoji: "⚙️", model: "claude-haiku-4-5" },
  { id: "devops", name: "Vega", role: "DevOps Engineer", emoji: "🚀", model: "claude-haiku-4-5" },
  { id: "qa", name: "Lyra", role: "QA Engineer", emoji: "🔍", model: "claude-haiku-4-5" },
  { id: "reviewer", name: "Argus", role: "Code Reviewer", emoji: "👁️", model: "claude-haiku-4-5" },
];

let initPromise: Promise<void> | null = null;

async function initDB() {
  // Migrations para colunas adicionadas depois do deploy inicial
  const migrations = [
    "ALTER TABLE agents ADD COLUMN emoji TEXT DEFAULT '🤖'",
    "ALTER TABLE agents ADD COLUMN model TEXT DEFAULT 'claude-sonnet-4-6'",
    "ALTER TABLE tasks ADD COLUMN approval_type TEXT",
    "ALTER TABLE tasks ADD COLUMN approval_reason TEXT",
    "ALTER TABLE tasks ADD COLUMN approved_by TEXT",
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      session_key TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_ping DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // BUG 3 fix: migrate chat_messages.created_at from integer to text ISO strings
    // SQLite allows storing TEXT in INTEGER columns (dynamic typing), no DDL change needed.
    // Fix existing rows that have millisecond timestamps stored as integers (year +58146):
    `UPDATE chat_messages SET created_at = datetime(CAST(created_at AS INTEGER) / 1000, 'unixepoch') || 'Z'
      WHERE CAST(created_at AS INTEGER) > 9999999999`,
  ];
  for (const sql of migrations) {
    try { await client.execute(sql); } catch {}
  }

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      parent_id TEXT,
      assigned_agent TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      tags TEXT DEFAULT '[]',
      architecture TEXT,
      review_cycles INTEGER NOT NULL DEFAULT 0,
      approval_comment TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'comment',
      content TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      emoji TEXT DEFAULT '🤖',
      model TEXT DEFAULT 'claude-sonnet-4-6',
      status TEXT NOT NULL DEFAULT 'idle',
      current_task TEXT,
      last_seen INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // SQLite indexes for performance
  try { await client.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)"); } catch {}
  try { await client.execute("CREATE INDEX IF NOT EXISTS idx_logs_agent ON logs(agent_id)"); } catch {}
  try { await client.execute("CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)"); } catch {}
  try { await client.execute("CREATE INDEX IF NOT EXISTS idx_chat_agent ON chat_messages(agent_id)"); } catch {}

  // Seed agents
  const result = await client.execute("SELECT COUNT(*) as c FROM agents");
  const count = Number(result.rows[0]?.c ?? 0);
  if (count === 0) {
    const now = Math.floor(Date.now() / 1000);
    for (const a of AGENTS) {
      await client.execute({
        sql: "INSERT OR IGNORE INTO agents (id, name, role, emoji, model, status, last_seen) VALUES (?, ?, ?, ?, ?, 'idle', ?)",
        args: [a.id, a.name, a.role, a.emoji, a.model, now],
      });
    }
  } else {
    // Update names/emojis if agents already exist
    for (const a of AGENTS) {
      await client.execute({
        sql: "UPDATE agents SET name=?, emoji=?, model=? WHERE id=?",
        args: [a.name, a.emoji, a.model, a.id],
      });
    }
  }
}

export function ensureDB(): Promise<void> {
  if (!initPromise) initPromise = initDB();
  return initPromise;
}

// Auto-init on import
ensureDB().catch(console.error);
