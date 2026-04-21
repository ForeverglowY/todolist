"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me-in-production";
const ROOT = path.join(__dirname, "..");
const dataDir = path.join(ROOT, "data");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "todolist.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  remind_at TEXT,
  due_at TEXT,
  reminded_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
`);

function rowToTodo(r) {
  return {
    id: r.id,
    title: r.title,
    done: !!r.done,
    createdAt: r.created_at,
    remindAt: r.remind_at || null,
    dueAt: r.due_at || null,
    remindedAt: r.reminded_at || null,
  };
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登录" });
  }
  try {
    const payload = jwt.verify(h.slice(7), JWT_SECRET);
    req.userId = payload.uid;
    next();
  } catch {
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body || {};
  const u = String(username || "").trim();
  const p = String(password || "");
  if (!u || !p) return res.status(400).json({ error: "用户名和密码必填" });
  if (u.length < 2) return res.status(400).json({ error: "用户名至少 2 个字符" });
  if (p.length < 6) return res.status(400).json({ error: "密码至少 6 位" });
  try {
    const hash = bcrypt.hashSync(p, 10);
    const createdAt = new Date().toISOString();
    const info = db
      .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run(u, hash, createdAt);
    const token = jwt.sign({ uid: Number(info.lastInsertRowid), u: u }, JWT_SECRET, {
      expiresIn: "30d",
    });
    return res.status(201).json({ token, username: u });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(400).json({ error: "用户名已存在" });
    }
    console.error(e);
    return res.status(500).json({ error: "注册失败" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const u = String((req.body && req.body.username) || "").trim();
  const p = String((req.body && req.body.password) || "");
  const row = db.prepare("SELECT id, password_hash, username FROM users WHERE username = ?").get(u);
  if (!row || !bcrypt.compareSync(p, row.password_hash)) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }
  const token = jwt.sign({ uid: row.id, u: row.username }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, username: row.username });
});

app.get("/api/todos", authMiddleware, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.userId);
  res.json(rows.map(rowToTodo));
});

app.post("/api/todos", authMiddleware, (req, res) => {
  const body = req.body || {};
  const id =
    body.id && String(body.id).trim()
      ? String(body.id).trim()
      : Math.random().toString(16).slice(2) + Date.now().toString(16);
  const title = String(body.title || "").trim();
  if (!title) return res.status(400).json({ error: "标题不能为空" });
  const done = body.done ? 1 : 0;
  const createdAt = body.createdAt || new Date().toISOString();
  const remindAt = body.remindAt != null ? body.remindAt : null;
  const dueAt = body.dueAt != null ? body.dueAt : null;
  const remindedAt = body.remindedAt != null ? body.remindedAt : null;
  try {
    db.prepare(
      `INSERT INTO todos (id, user_id, title, done, created_at, remind_at, due_at, reminded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.userId, title, done, createdAt, remindAt, dueAt, remindedAt);
    const row = db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(id, req.userId);
    return res.status(201).json(rowToTodo(row));
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(400).json({ error: "任务 ID 已存在" });
    console.error(e);
    return res.status(500).json({ error: "创建失败" });
  }
});

app.patch("/api/todos/:id", authMiddleware, (req, res) => {
  const existing = db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: "不存在" });
  const patch = req.body || {};
  const title = patch.title !== undefined ? String(patch.title).trim() : existing.title;
  if (!title) return res.status(400).json({ error: "标题不能为空" });
  const done = patch.done !== undefined ? (patch.done ? 1 : 0) : existing.done;
  const remindAt = patch.remindAt !== undefined ? patch.remindAt : existing.remind_at;
  const dueAt = patch.dueAt !== undefined ? patch.dueAt : existing.due_at;
  const remindedAt = patch.remindedAt !== undefined ? patch.remindedAt : existing.reminded_at;
  db.prepare(
    `UPDATE todos SET title = ?, done = ?, remind_at = ?, due_at = ?, reminded_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(title, done, remindAt, dueAt, remindedAt, req.params.id, req.userId);
  const row = db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
  res.json(rowToTodo(row));
});

app.delete("/api/todos/:id", authMiddleware, (req, res) => {
  const r = db.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?").run(req.params.id, req.userId);
  if (r.changes === 0) return res.status(404).json({ error: "不存在" });
  res.json({ ok: true });
});

app.post("/api/todos/clear-done", authMiddleware, (req, res) => {
  db.prepare("DELETE FROM todos WHERE user_id = ? AND done = 1").run(req.userId);
  res.json({ ok: true });
});

app.use(express.static(ROOT));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Liquid Glass Todo 服务已启动: http://127.0.0.1:${PORT}/`);
  if (JWT_SECRET === "dev-only-change-me-in-production") {
    console.warn("[警告] 未设置 JWT_SECRET，生产环境请在 .env 中配置强随机字符串");
  }
});
