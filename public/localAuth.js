(function initSyncNestLocalAuth(globalScope) {
  const STORE_KEY = "syncnest_local_auth_db_v1";
  const TOKEN_PREFIX = "local_syncnest_";
  const MAX_USERS = 2000;

  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { usersById: {}, userIdByUsername: {}, userIdByEmail: {}, sessions: {} };
      const parsed = JSON.parse(raw);
      return {
        usersById: parsed?.usersById && typeof parsed.usersById === "object" ? parsed.usersById : {},
        userIdByUsername: parsed?.userIdByUsername && typeof parsed.userIdByUsername === "object" ? parsed.userIdByUsername : {},
        userIdByEmail: parsed?.userIdByEmail && typeof parsed.userIdByEmail === "object" ? parsed.userIdByEmail : {},
        sessions: parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {}
      };
    } catch {
      return { usersById: {}, userIdByUsername: {}, userIdByEmail: {}, sessions: {} };
    }
  }

  function writeStore(store) {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  function createError(status, message) {
    const error = new Error(String(message || "Request failed."));
    error.status = Number(status) || 500;
    return error;
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

  function hashPassword(password) {
    let hash = 2166136261;
    const text = String(password || "");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function serializeUser(user) {
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

  function issueToken(userId, store) {
    const token = `${TOKEN_PREFIX}${String(userId)}_${Math.random().toString(36).slice(2, 12)}`;
    store.sessions[token] = String(userId);
    return token;
  }

  function readToken(headers) {
    const authorization = String(headers?.Authorization || headers?.authorization || "").trim();
    if (authorization.toLowerCase().startsWith("bearer ")) {
      return authorization.slice(7).trim();
    }
    return String(headers?.["x-syncnest-token"] || "").trim();
  }

  function getUserFromHeaders(store, headers) {
    const token = readToken(headers);
    const userId = token ? String(store.sessions[token] || "") : "";
    if (!userId) return null;
    return store.usersById[userId] || null;
  }

  function createAccount(store, payload) {
    const username = normalizeUsername(payload?.username);
    const email = normalizeEmail(payload?.email);
    const password = String(payload?.password || "");
    const displayName = sanitizeDisplayName(payload?.displayName);

    if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
      throw createError(400, "Username must be 3-24 chars and use letters, numbers, dot, dash, or underscore.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw createError(400, "Enter a valid email.");
    }
    if (!validatePassword(password)) {
      throw createError(400, "Password must be at least 8 characters.");
    }
    if (store.userIdByUsername[username]) {
      throw createError(409, "Username is already taken.");
    }
    if (store.userIdByEmail[email]) {
      throw createError(409, "Email is already registered.");
    }
    if (Object.keys(store.usersById).length >= MAX_USERS) {
      throw createError(429, "Local account limit reached in this browser.");
    }

    const now = Date.now();
    const userId = `usr_local_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const user = {
      id: userId,
      username,
      email,
      displayName: displayName || username,
      passwordHash: hashPassword(password),
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
    store.userIdByUsername[username] = userId;
    store.userIdByEmail[email] = userId;

    const token = issueToken(userId, store);
    writeStore(store);
    return { ok: true, token, user: serializeUser(user) };
  }

  function loginAccount(store, payload) {
    const identifier = String(payload?.identifier || "").trim().toLowerCase();
    const password = String(payload?.password || "");
    const userId = identifier.includes("@")
      ? store.userIdByEmail[identifier]
      : store.userIdByUsername[identifier];
    const user = userId ? store.usersById[userId] : null;
    if (!user || user.passwordHash !== hashPassword(password)) {
      throw createError(401, "Invalid credentials.");
    }

    user.updatedAt = Date.now();
    user.preferences.lastSeenAt = Date.now();
    const token = issueToken(user.id, store);
    writeStore(store);
    return { ok: true, token, user: serializeUser(user) };
  }

  function updatePreferences(store, user, payload) {
    const nextDisplayName = sanitizeDisplayName(payload?.displayName);
    if (nextDisplayName) {
      user.displayName = nextDisplayName;
    }

    if (!user.preferences || typeof user.preferences !== "object") {
      user.preferences = {};
    }

    if (typeof payload?.vibe === "string") {
      const cleanVibe = String(payload.vibe || "").trim().toLowerCase();
      if (cleanVibe === "cinema" || cleanVibe === "pookie") {
        user.preferences.vibe = cleanVibe;
      }
    }
    if (typeof payload?.lastRoomId === "string") {
      user.preferences.lastRoomId = String(payload.lastRoomId || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 40);
    }
    if (typeof payload?.lastMode === "string") {
      const cleanMode = String(payload.lastMode || "").trim().toLowerCase();
      if (["study", "break", "fun", "playyard"].includes(cleanMode)) {
        user.preferences.lastMode = cleanMode;
      }
    }

    user.preferences.lastSeenAt = Date.now();
    user.updatedAt = Date.now();
    writeStore(store);
    return { ok: true, user: serializeUser(user) };
  }

  function handle(path, options) {
    const normalizedPath = String(path || "").split("?")[0];
    const method = String(options?.method || "GET").toUpperCase();
    const headers = options?.headers || {};
    const body = options?.body || {};
    const store = readStore();

    if (normalizedPath === "/api/auth/signup" && method === "POST") {
      return createAccount(store, body);
    }
    if (normalizedPath === "/api/auth/login" && method === "POST") {
      return loginAccount(store, body);
    }
    if (normalizedPath === "/api/auth/logout" && method === "POST") {
      const token = readToken(headers);
      if (token && store.sessions[token]) {
        delete store.sessions[token];
        writeStore(store);
      }
      return { ok: true };
    }

    if (normalizedPath === "/api/auth/me" && method === "GET") {
      const user = getUserFromHeaders(store, headers);
      if (!user) throw createError(401, "Authentication required.");
      user.updatedAt = Date.now();
      user.preferences.lastSeenAt = Date.now();
      writeStore(store);
      return { ok: true, user: serializeUser(user) };
    }

    if (normalizedPath === "/api/user/preferences" && method === "PUT") {
      const user = getUserFromHeaders(store, headers);
      if (!user) throw createError(401, "Authentication required.");
      return updatePreferences(store, user, body);
    }

    throw createError(404, "Not found.");
  }

  function shouldHandle(path) {
    const normalizedPath = String(path || "").split("?")[0];
    return normalizedPath.startsWith("/api/auth/") || normalizedPath === "/api/user/preferences";
  }

  globalScope.SyncNestLocalAuth = {
    shouldHandle,
    handle
  };
})(window);
