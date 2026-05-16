import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import { analyzeRepoFromUrl, benchmarkRepoFromUrl } from "./repo";
import { openDb, listResults, saveResult } from "./db";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const corsOrigin = process.env.CORS_ORIGIN || "*";
const dbPath = process.env.DB_PATH || "data/analysis.db";

app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: corsOrigin }));

const db = openDb(dbPath);

const bodySchema = z.object({
  repoUrl: z.string().url()
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/history", (_req, res) => {
  const items = listResults(db, 20).map((row) => ({
    id: row.id,
    repoUrl: row.repoUrl,
    createdAt: row.createdAt,
    analysis: JSON.parse(row.analysisJson),
    benchmark: row.benchmarkJson ? JSON.parse(row.benchmarkJson) : null
  }));
  res.json({ items });
});

app.post("/api/analyze", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid repoUrl" });
    return;
  }

  try {
    const context = await analyzeRepoFromUrl(parsed.data.repoUrl);
    const id = saveResult(db, parsed.data.repoUrl, JSON.stringify(context), null);
    res.json({ id, context });
  } catch (error) {
    res.status(500).json({ error: "Analysis failed" });
  }
});

app.post("/api/benchmark", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid repoUrl" });
    return;
  }

  try {
    const result = await benchmarkRepoFromUrl(parsed.data.repoUrl);
    const id = saveResult(
      db,
      parsed.data.repoUrl,
      JSON.stringify(result.context),
      JSON.stringify(result.benchmark)
    );
    res.json({ id, context: result.context, benchmark: result.benchmark });
  } catch (error) {
    res.status(500).json({ error: "Benchmark failed" });
  }
});

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
