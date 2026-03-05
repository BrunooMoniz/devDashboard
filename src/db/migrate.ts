import { db } from "./index";
import { agents } from "./schema";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// Create tables manually (no migration files needed for SQLite simple setup)
const sqlite = (db as any).session?.client;

function runMigration() {
  const rawDb = require("better-sqlite3")(
    process.env.DB_PATH ||
      require("path").join(process.cwd(), "data", "dashboard.db")
  );
  require("fs").mkdirSync(
    require("path").dirname(
      process.env.DB_PATH ||
        require("path").join(process.cwd(), "data", "dashboard.db")
    ),
    { recursive: true }
  );

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      assigned_agent TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
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

  // Seed agents if empty
  const count = rawDb.prepare("SELECT COUNT(*) as c FROM agents").get() as { c: number };
  if (count.c === 0) {
    const now = Math.floor(Date.now() / 1000);
    const agentDefs = [
      { id: "main", name: "Main", role: "Orchestrator" },
      { id: "pm", name: "PM", role: "Product Manager" },
      { id: "architect", name: "Architect", role: "Tech Lead" },
      { id: "frontend", name: "Frontend", role: "Frontend Developer" },
      { id: "backend", name: "Backend", role: "Backend Developer" },
      { id: "devops", name: "DevOps", role: "DevOps Engineer" },
      { id: "qa", name: "QA", role: "QA Engineer" },
      { id: "reviewer", name: "Reviewer", role: "Code Reviewer" },
    ];
    const insert = rawDb.prepare(
      "INSERT INTO agents (id, name, role, status, last_seen) VALUES (?, ?, ?, 'idle', ?)"
    );
    for (const a of agentDefs) {
      insert.run(a.id, a.name, a.role, now);
    }
    console.log("✓ Agents seeded");
  }

  rawDb.close();
  console.log("✓ Migration complete");
}

runMigration();
