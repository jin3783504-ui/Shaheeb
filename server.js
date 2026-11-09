const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const ROOM_PASSWORD = process.env.ROOM_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const MAX_AGE = 60 * 60 * 1000;
const UPLOAD_DIR = path.join(__dirname, "uploads");

if (!ROOM_PASSWORD || ROOM_PASSWORD.length < 12 || !SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error("Set ROOM_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters) in your hosting environment.");
  process.exit(1);
}
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));
const sessionMiddleware = session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: __dirname, table: "sessions" }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

const participants = new Map(); // sessionID -> { lastSeen }
const messages = [];
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.mimetype);
    cb(ok ? null : new Error("Only common photo and video formats are allowed."), ok);
  }
});

function activeCount() {
  const now = Date.now();
  for (const [id, p] of participants) if (now - p.lastSeen > 10 * 60 * 1000) participants.delete(id);
  return participants.size;
}
function requireMember(req, res, next) {
  if (!req.session.member) return res.status(401).json({ error: "Please join with the secret password." });
  next();
}
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/status", (req, res) => res.json({ joined: !!req.session.member, waiting: activeCount() < 2 }));

app.post("/api/join", (req, res) => {
  const password = String(req.body.password || "");
  if (!crypto.timingSafeEqual(Buffer.from(password.padEnd(ROOM_PASSWORD.length).slice(0, ROOM_PASSWORD.length)), Buffer.from(ROOM_PASSWORD)) || password.length !== ROOM_PASSWORD.length) {
    return res.status(403).json({ error: "Secret password is incorrect." });
  }
  activeCount();
  if (!participants.has(req.sessionID) && participants.size >= 2) {
    return res.status(403).json({ error: "Both participant slots are occupied. Try again later." });
  }
  req.session.member = true;
  participants.set(req.sessionID, { lastSeen: Date.now() });
  req.session.save(() => res.json({ ok: true }));
});
app.post("/api/logout", requireMember, (req, res) => {
  participants.delete(req.sessionID);
  req.session.destroy(() => res.json({ ok: true }));
});
app.get("/api/messages", requireMember, (req, res) => {
  const now = Date.now();
  res.json(messages.filter(m => now - m.createdAt < MAX_AGE));
});
app.post("/api/upload", requireMember, upload.single("media"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a photo or video first." });
  const item = { id: crypto.randomUUID(), type: req.file.mimetype.startsWith("image/") ? "photo" : "video",
    name: req.file.originalname, url: "/media/" + req.file.filename, createdAt: Date.now() };
  messages.push(item);
  io.emit("new-message", item);
  res.json(item);
});
app.use("/media", requireMember, express.static(UPLOAD_DIR));

io.use((socket, next) => {
  const s = socket.request.session;
  if (!s || !s.member) return next(new Error("Not authorized"));
  next();
});
io.on("connection", socket => {
  const sid = socket.request.sessionID;
  if (!participants.has(sid) && activeCount() >= 2) return socket.disconnect(true);
  participants.set(sid, { lastSeen: Date.now() });
  socket.on("heartbeat", () => { if (participants.has(sid)) participants.get(sid).lastSeen = Date.now(); });
  socket.on("chat-message", text => {
    const body = String(text || "").trim().slice(0, 2000);
    if (!body) return;
    const item = { id: crypto.randomUUID(), type: "text", text: body, createdAt: Date.now() };
    messages.push(item);
    io.emit("new-message", item);
  });
  socket.on("disconnect", () => { /* Keep slot briefly for reconnect; heartbeat timeout releases it. */ });
});

// Expire chat and uploaded media after one hour.
setInterval(() => {
  const cutoff = Date.now() - MAX_AGE;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].createdAt < cutoff) {
      const item = messages[i];
      if (item.url) {
        const filename = path.basename(item.url);
        fs.promises.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
      }
      messages.splice(i, 1);
    }
  }
  activeCount();
}, 60 * 1000).unref();

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message || "Upload failed." });
});
server.listen(PORT, () => console.log(`Life Marriage Connect running on port ${PORT}`));
