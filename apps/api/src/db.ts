import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

type DatabaseInstance = InstanceType<typeof Database>;

export type StoredResult = {
  id: number;
  repoUrl: string;
  createdAt: string;
  analysisJson: string;
  benchmarkJson: string | null;
};

export function openDb(dbPath: string): DatabaseInstance {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE IF NOT EXISTS analysis_results (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "repo_url TEXT NOT NULL," +
      "created_at TEXT NOT NULL," +
      "analysis_json TEXT NOT NULL," +
      "benchmark_json TEXT" +
    ")"
  );
  return db;
}

export function saveResult(
  db: DatabaseInstance,
  repoUrl: string,
  analysisJson: string,
  benchmarkJson: string | null
): number {
  const stmt = db.prepare(
    "INSERT INTO analysis_results (repo_url, created_at, analysis_json, benchmark_json) VALUES (?, ?, ?, ?)"
  );
  const now = new Date().toISOString();
  const info = stmt.run(repoUrl, now, analysisJson, benchmarkJson);
  return Number(info.lastInsertRowid);
}

export function listResults(db: DatabaseInstance, limit: number): StoredResult[] {
  const stmt = db.prepare(
    "SELECT id, repo_url as repoUrl, created_at as createdAt, analysis_json as analysisJson, benchmark_json as benchmarkJson " +
      "FROM analysis_results ORDER BY id DESC LIMIT ?"
  );
  return stmt.all(limit) as StoredResult[];
}
