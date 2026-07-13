/**
 * Letterbox backend
 * ------------------
 * A small Express API that gives the Letterbox app real accounts
 * (unique usernames, hashed passwords, JWT sessions) and a real,
 * shared place for letters to live so two different people on two
 * different devices can actually exchange them.
 *
 * Storage: a single JSON file (data.json) next to this script. That
 * keeps the project dependency-free and easy to run anywhere, but it
 * has a real limitation — see the README section "About storage"
 * before you rely on this for anything you don't want to lose.
 */

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data.json");
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";
const PORT = process.env.PORT || 4000;

if (!process.env.JWT_SECRET) {
  console.warn(
    "⚠️  JWT_SECRET is not set — using an insecure default. Set a real JWT_SECRET " +
    "environment variable before deploying this anywhere real."
  );
}

/* ---------------------------- tiny JSON "database" ---------------------------- */
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], letters: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

/* ---------------------------------- app setup ---------------------------------- */
const app = express();
app.use(cors()); // open CORS so the frontend (hosted separately, or an artifact) can call this API
app.use(express.json({ limit: "10mb" })); // handwriting snapshots are base64 images

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing auth token." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.uid;
    req.username = payload.username;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired session — please log in again." });
  }
}

/* ------------------------------------ auth ------------------------------------- */
// Sign up: usernames are enforced unique (case-insensitive) so two people
// can never register the same one — this is the actual "unique ID" check.
app.post("/api/auth/signup", async (req, res) => {
  const { username, password } = req.body || {};
  const uname = (username || "").trim();

  if (uname.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters." });
  if (!/^[a-zA-Z0-9_.-]+$/.test(uname)) {
    return res.status(400).json({ error: "Username can only use letters, numbers, dots, dashes, and underscores." });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters." });
  }

  const db = readDB();
  const taken = db.users.some((u) => u.username.toLowerCase() === uname.toLowerCase());
  if (taken) return res.status(409).json({ error: "That username is already taken — try another." });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), username: uname, passwordHash, createdAt: new Date().toISOString() };
  db.users.push(user);
  writeDB(db);

  const token = jwt.sign({ uid: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, username: user.username });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  const db = readDB();
  const user = db.users.find((u) => u.username.toLowerCase() === (username || "").trim().toLowerCase());
  if (!user) return res.status(401).json({ error: "Wrong username or password." });

  const ok = await bcrypt.compare(password || "", user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Wrong username or password." });

  const token = jwt.sign({ uid: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, username: user.username });
});

app.get("/api/me", authenticate, (req, res) => {
  res.json({ username: req.username });
});

// Handy for the frontend to check "does this recipient exist" before sending.
app.get("/api/users/:username/exists", (req, res) => {
  const db = readDB();
  const exists = db.users.some((u) => u.username.toLowerCase() === req.params.username.toLowerCase());
  res.json({ exists });
});

/* ----------------------------------- letters ------------------------------------ */
app.post("/api/letters", authenticate, (req, res) => {
  const {
    toUsername, mode, text, image,
    fontId, stampId, sealColor, sealSymbol, paperId, accessories,
    deliverAt,
  } = req.body || {};

  if (!toUsername || !toUsername.trim()) return res.status(400).json({ error: "Recipient username is required." });
  if (!deliverAt || isNaN(Date.parse(deliverAt))) return res.status(400).json({ error: "A valid delivery time is required." });
  if (mode === "typed" && !(text || "").trim()) return res.status(400).json({ error: "The letter is empty." });
  if (mode === "handwritten" && !image) return res.status(400).json({ error: "The handwritten page is empty." });

  const db = readDB();
  const recipient = db.users.find((u) => u.username.toLowerCase() === toUsername.trim().toLowerCase());
  if (!recipient) return res.status(404).json({ error: `No user named "${toUsername}" exists.` });

  const letter = {
    id: uuidv4(),
    fromUsername: req.username,
    toUsername: recipient.username,
    mode,
    text: mode === "typed" ? text : "",
    image: mode === "handwritten" ? image : null,
    fontId: fontId || null,
    stampId: stampId || "bird",
    sealColor: sealColor || "#8C2A34",
    sealSymbol: sealSymbol || "✦",
    paperId: paperId || "cream",
    accessories: Array.isArray(accessories) ? accessories : [],
    sentAt: new Date().toISOString(),
    deliverAt: new Date(deliverAt).toISOString(),
  };
  db.letters.push(letter);
  writeDB(db);
  res.status(201).json({ letter });
});

app.get("/api/letters/inbox", authenticate, (req, res) => {
  const db = readDB();
  const mine = db.letters
    .filter((l) => l.toUsername.toLowerCase() === req.username.toLowerCase())
    .sort((a, b) => new Date(a.deliverAt) - new Date(b.deliverAt));
  res.json({ letters: mine });
});

app.get("/api/letters/sent", authenticate, (req, res) => {
  const db = readDB();
  const mine = db.letters
    .filter((l) => l.fromUsername.toLowerCase() === req.username.toLowerCase())
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  res.json({ letters: mine });
});

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`Letterbox API listening on port ${PORT}`);
});
