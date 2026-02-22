const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "accounts.json");
const TOKEN_SECRET = String(
  process.env.SYNCNEST_AUTH_SECRET
  || process.env.AUTH_SECRET
  || "syncnest-local-dev-secret-change-me"
);
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let cache = null;

function createError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function ensureStore() {
  if (cache) return cache;

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    cache = {
      usersById: parsed?.usersById && typeof parsed.usersById === "object" ? parsed.usersById : {},
      userIdByUsername: parsed?.userIdByUsername && typeof parsed.userIdByUsername === "object" ? parsed.userIdByUsername : {},
      userIdByEmail: parsed?.userIdByEmail && typeof parsed.userIdByEmail === "object" ? parsed.userIdByEmail : {},
      updatedAt: Number(parsed?.updatedAt) || Date.now()
    };
  } catch {
    cache = {
      usersById: {},
      userIdByUsername: {},
      userIdByEmail: {},
      updatedAt: Date.now()
    };
  }

  return cache;
}

function persistStore() {
  const store = ensureStore();
  store.updatedAt = Date.now();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const payload = JSON.stringify(store, null, 2);
  const tmpPath = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpPath, payload, "utf8");
  fs.renameSync(tmpPath, DATA_FILE);
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 24);
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

function sanitizeDisplayName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function validatePassword(password) {
  const text = String(password || "");
  return text.length >= 8 && text.length <= 128;
}

function buildPasswordHash(password, saltHex = "") {
  const salt = saltHex || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password || ""), Buffer.from(salt, "hex"), 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, hashedRecord) {
  if (!hashedRecord || typeof hashedRecord !== "object") return false;
  const candidate = buildPasswordHash(password, String(hashedRecord.salt || ""));
  const expected = String(hashedRecord.hash || "");
  if (!expected || candidate.hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate.hash, "hex"), Buffer.from(expected, "hex"));
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signTokenPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(String(encodedPayload || ""))
    .digest("base64url");
}

function issueAuthToken(userId) {
  const now = Date.now();
  const payload = {
    uid: String(userId || ""),
    iat: now,
    exp: now + TOKEN_TTL_MS
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signTokenPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expected = signTokenPayload(encodedPayload);
  if (signature.length !== expected.length) return null;
  const signatureMatches = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!signatureMatches) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return null;
    if (!payload.uid || Number(payload.exp) < Date.now()) return null;
    return {
      userId: String(payload.uid),
      issuedAt: Number(payload.iat) || 0,
      expiresAt: Number(payload.exp) || 0
    };
  } catch {
    return null;
  }
}

function serializePublicUser(user) {
  return {
    id: String(user.id || ""),
    username: String(user.username || ""),
    email: String(user.email || ""),
    displayName: String(user.displayName || ""),
    createdAt: Number(user.createdAt) || Date.now(),
    updatedAt: Number(user.updatedAt) || Date.now(),
    preferences: {
      vibe: String(user.preferences?.vibe || "cinema"),
      lastRoomId: String(user.preferences?.lastRoomId || ""),
      lastMode: String(user.preferences?.lastMode || ""),
      lastSeenAt: Number(user.preferences?.lastSeenAt) || 0
    }
  };
}

function createAccount({ username, email, password, displayName }) {
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);
  const cleanDisplayName = sanitizeDisplayName(displayName);

  if (!/^[a-z0-9._-]{3,24}$/.test(cleanUsername)) {
    throw createError(400, "Username must be 3-24 chars and use letters, numbers, dot, dash, or underscore.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw createError(400, "Enter a valid email.");
  }
  if (!validatePassword(password)) {
    throw createError(400, "Password must be at least 8 characters.");
  }

  const store = ensureStore();
  if (store.userIdByUsername[cleanUsername]) {
    throw createError(409, "Username is already taken.");
  }
  if (store.userIdByEmail[cleanEmail]) {
    throw createError(409, "Email is already registered.");
  }

  const now = Date.now();
  const userId = `usr_${now.toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
  const passwordRecord = buildPasswordHash(password);
  const user = {
    id: userId,
    username: cleanUsername,
    email: cleanEmail,
    displayName: cleanDisplayName || cleanUsername,
    password: passwordRecord,
    createdAt: now,
    updatedAt: now,
    preferences: {
      vibe: "cinema",
      lastRoomId: "",
      lastMode: "",
      lastSeenAt: now
    }
  };

  store.usersById[userId] = user;
  store.userIdByUsername[cleanUsername] = userId;
  store.userIdByEmail[cleanEmail] = userId;
  persistStore();

  return user;
}

function loginAccount({ identifier, password }) {
  const cleanIdentifier = String(identifier || "").trim().toLowerCase();
  const store = ensureStore();
  const userId = cleanIdentifier.includes("@")
    ? store.userIdByEmail[cleanIdentifier]
    : store.userIdByUsername[cleanIdentifier];
  if (!userId) {
    throw createError(401, "Invalid credentials.");
  }

  const user = store.usersById[userId];
  if (!user || !verifyPassword(password, user.password)) {
    throw createError(401, "Invalid credentials.");
  }

  return user;
}

function getUserById(userId) {
  const store = ensureStore();
  const id = String(userId || "").trim();
  return id ? store.usersById[id] || null : null;
}

function updateUserPreferences(userId, payload = {}) {
  const user = getUserById(userId);
  if (!user) {
    throw createError(404, "Account not found.");
  }

  const nextDisplayName = sanitizeDisplayName(payload.displayName);
  if (nextDisplayName) {
    user.displayName = nextDisplayName;
  }

  if (!user.preferences || typeof user.preferences !== "object") {
    user.preferences = {};
  }

  if (typeof payload.vibe === "string") {
    const cleanVibe = String(payload.vibe || "").trim().toLowerCase();
    if (cleanVibe === "cinema" || cleanVibe === "pookie") {
      user.preferences.vibe = cleanVibe;
    }
  }
  if (typeof payload.lastRoomId === "string") {
    user.preferences.lastRoomId = String(payload.lastRoomId || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 40);
  }
  if (typeof payload.lastMode === "string") {
    const cleanMode = String(payload.lastMode || "").trim().toLowerCase();
    if (["study", "break", "fun", "playyard"].includes(cleanMode)) {
      user.preferences.lastMode = cleanMode;
    }
  }

  user.preferences.lastSeenAt = Date.now();
  user.updatedAt = Date.now();
  persistStore();
  return user;
}

module.exports = {
  createAccount,
  loginAccount,
  issueAuthToken,
  verifyAuthToken,
  getUserById,
  updateUserPreferences,
  serializePublicUser,
  createAuthError: createError
};
