import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const dbPath = path.join(__dirname, 'portfolio.db');
const db = new Database(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    bio TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tech TEXT NOT NULL,             -- JSON string array
    repo_url TEXT,
    live_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function readSeed() {
  const seedPath = path.join(__dirname, 'data', 'seed.json');
  const raw = fs.readFileSync(seedPath, 'utf8');
  return JSON.parse(raw);
}

function seedIfEmpty() {
  const metaRow = db.prepare('SELECT * FROM meta WHERE id=1').get();
  const projectsCount = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
  const skillsCount = db.prepare('SELECT COUNT(*) as c FROM skills').get().c;

  if (metaRow && projectsCount > 0 && skillsCount > 0) return;

  const seed = readSeed();

  const metaStmt = db.prepare(
    'INSERT OR REPLACE INTO meta (id, name, tagline, bio) VALUES (1, @name, @tagline, @bio)'
  );
  metaStmt.run(seed.meta);

  db.prepare('DELETE FROM projects').run();
  db.prepare('DELETE FROM skills').run();

  const insertProject = db.prepare(
    'INSERT INTO projects (title, description, tech, repo_url, live_url, sort_order) VALUES (@title, @description, @tech, @repo_url, @live_url, @sort_order)'
  );

  const insertSkill = db.prepare(
    'INSERT INTO skills (name, sort_order) VALUES (@name, @sort_order)'
  );

  for (const p of seed.projects) {
    insertProject.run({
      title: p.title,
      description: p.description,
      tech: JSON.stringify(p.tech || []),
      repo_url: p.repo_url || null,
      live_url: p.live_url || null,
      sort_order: p.sort_order ?? 0,
    });
  }

  for (const [idx, s] of (seed.skills || []).entries()) {
    insertSkill.run({ name: s, sort_order: idx });
  }
}

seedIfEmpty();

app.get('/api/meta', (_req, res) => {
  const row = db.prepare('SELECT * FROM meta WHERE id=1').get();
  res.json(row);
});

app.get('/api/projects', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM projects ORDER BY sort_order ASC, id DESC')
    .all();

  const projects = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    tech: JSON.parse(r.tech || '[]'),
    repo_url: r.repo_url,
    live_url: r.live_url,
  }));

  res.json(projects);
});

app.get('/api/skills', (_req, res) => {
  const rows = db.prepare('SELECT name FROM skills ORDER BY sort_order ASC, id DESC').all();
  res.json(rows.map((r) => r.name));
});

app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) return res.status(400).send('Missing fields');

  const createdAt = new Date().toISOString();

  db.prepare(
    'INSERT INTO contacts (name, email, message, created_at) VALUES (@name, @email, @message, @created_at)'
  ).run({ name, email, message, created_at: createdAt });

  res.json({ ok: true });
});

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Portfolio API listening on http://localhost:${PORT}`);
});

