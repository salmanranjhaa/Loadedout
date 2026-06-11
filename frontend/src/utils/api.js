import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";

import { isOnline, queueRequest, initOfflineQueue } from "./offline";

// I handle all API communication with the FastAPI backend
const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";
const FALLBACK_PUBLIC_WEB_ORIGIN = "https://loadedout.online";
const PUBLIC_WEB_ORIGIN = import.meta.env.VITE_PUBLIC_WEB_ORIGIN || FALLBACK_PUBLIC_WEB_ORIGIN;

export function getApiBase() {
  return API_BASE;
}

export function getApiOrigin() {
  try {
    return new URL(API_BASE, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

export function isNativePlatform() {
  try {
    return !!Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export function getGoogleOAuthOrigin() {
  if (!isNativePlatform()) return window.location.origin;
  try {
    const parsed = new URL(PUBLIC_WEB_ORIGIN);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid protocol");
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return FALLBACK_PUBLIC_WEB_ORIGIN;
  }
}

function getToken() {
  return localStorage.getItem("lifeplan_token");
}

function getRefreshToken() {
  return localStorage.getItem("lifeplan_refresh_token");
}

export function setToken(access, refresh) {
  localStorage.setItem("lifeplan_token", access);
  if (refresh) localStorage.setItem("lifeplan_refresh_token", refresh);
}

export function clearToken() {
  localStorage.removeItem("lifeplan_token");
  localStorage.removeItem("lifeplan_refresh_token");
}

// Single-flight refresh: concurrent 401s must share one refresh call, because
// the backend rotates tokens and treats reuse of an old token as theft
// (revoking the whole family and forcing a re-login).
let refreshPromise = null;

async function tryRefreshTokens() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refresh_token = getRefreshToken();
      if (!refresh_token) return false;
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (!data.access_token) return false;
        setToken(data.access_token, data.refresh_token);
        return true;
      } catch {
        // Network failure — keep tokens so we can retry later instead of logging out
        return null;
      } finally {
        setTimeout(() => { refreshPromise = null; }, 0);
      }
    })();
  }
  return refreshPromise;
}

initOfflineQueue();

export function isLoggedIn() {
  return !!getToken();
}

async function request(path, options = {}, _retried = false) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const url = `${API_BASE}${path}`;
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(options.method || "GET");
  const isAuthPath = path.startsWith("/auth/");

  if (!isOnline() && isMutation) {
    queueRequest(url, { ...options, headers });
    return { queued: true };
  }

  try {
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      // Access token expired — refresh once and retry the original request
      if (response.status === 401 && token && !isAuthPath && !_retried) {
        const refreshed = await tryRefreshTokens();
        if (refreshed) {
          return request(path, options, true);
        }
        if (refreshed === false) {
          // Refresh token is definitively dead — session over
          clearToken();
          window.location.reload();
        }
        // refreshed === null: network hiccup; fall through and report the error
      }
      const error = await response.json().catch(() => ({ detail: "Request failed" }));
      const detail = typeof error.detail === "string" ? error.detail : error.message || `HTTP ${response.status}`;
      const err = new Error(detail);
      err.status = response.status;
      throw err;
    }

    return response.json();
  } catch (err) {
    if (isMutation && !err.status && !err.message?.includes("HTTP ")) {
      queueRequest(url, { ...options, headers });
      return { queued: true };
    }
    throw err;
  }
}

export const authAPI = {
  login: (username, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  register: (username, email, password) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    }),
  refresh: (refresh_token) =>
    request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),
  getGoogleLoginUrl: (origin, native = false, mode = "login") =>
    request(`/auth/google/login-url?origin=${encodeURIComponent(origin)}${native ? "&native=1" : ""}&mode=${encodeURIComponent(mode)}`),
  getGoogleConnectUrl: (origin, native = false) =>
    request(`/auth/google/connect-url?origin=${encodeURIComponent(origin)}${native ? "&native=1" : ""}`),
  googleIdToken: (id_token, mode) =>
    request("/auth/google/id-token", {
      method: "POST",
      body: JSON.stringify({ id_token, mode }),
    }),
};

export async function googleNativeSignIn() {
  await GoogleAuth.initialize();
  const user = await GoogleAuth.signIn();
  const idToken = user?.authentication?.idToken;
  if (!idToken) throw new Error("Google Sign-In did not return an ID token");
  return { idToken };
}

export const scheduleAPI = {
  getAll: (day, targetDate) => {
    const params = new URLSearchParams();
    if (day !== undefined && day !== null) params.set("day", String(day));
    if (targetDate) params.set("target_date", targetDate);
    const query = params.toString();
    return request(`/schedule/${query ? `?${query}` : ""}`);
  },
  create: (data) => request("/schedule/", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) => request(`/schedule/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id) => request(`/schedule/${id}`, { method: "DELETE" }),
  googleStatus: () => request("/schedule/google/status"),
  googleSync: (daysBack = 1, daysAhead = 30) =>
    request("/schedule/google/sync", {
      method: "POST",
      body: JSON.stringify({ days_back: daysBack, days_ahead: daysAhead }),
    }),
};

export const mealsAPI = {
  getTemplates: (type) => request(`/meals/templates${type ? `?meal_type=${type}` : ""}`),
  saveTemplate: (data) => request("/meals/templates", { method: "POST", body: JSON.stringify(data) }),
  updateTemplate: (id, data) => request(`/meals/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTemplate: (id) => request(`/meals/templates/${id}`, { method: "DELETE" }),
  logMeal: (data) => request("/meals/log", { method: "POST", body: JSON.stringify(data) }),
  updateLog: (id, data) => request(`/meals/log/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLog: (id) => request(`/meals/log/${id}`, { method: "DELETE" }),
  logManual: (data) => request("/meals/log-manual", { method: "POST", body: JSON.stringify(data) }),
  getToday: (date) => request(`/meals/today${date ? `?date=${date}` : ""}`),
  getHistory: (days) => request(`/meals/history?days=${days || 7}`),
};

export const analyticsAPI = {
  logWeight: (data) => request("/analytics/weight", { method: "POST", body: JSON.stringify(data) }),
  getWeights: (days) => request(`/analytics/weight?days=${days || 30}`),
  getDashboard: () => request("/analytics/dashboard"),
};

export const workoutAPI = {
  analyze: (data) => request("/workout/analyze", { method: "POST", body: JSON.stringify(data) }),
  save: (data) => request("/workout/", { method: "POST", body: JSON.stringify(data) }),
  getAll: (days) => request(`/workout/?days=${days || 30}`),
  getStats: () => request("/workout/stats"),
  delete: (id) => request(`/workout/${id}`, { method: "DELETE" }),
  getTemplates: () => request("/workout/templates"),
  saveTemplate: (data) => request("/workout/templates", { method: "POST", body: JSON.stringify(data) }),
  updateTemplate: (id, data) => request(`/workout/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTemplate: (id) => request(`/workout/templates/${id}`, { method: "DELETE" }),
};

export const prAPI = {
  getAll: () => request("/workout/prs"),
  upsert: (data) => request("/workout/prs", { method: "POST", body: JSON.stringify(data) }),
  bulkSync: (prs) => request("/workout/prs/bulk", { method: "POST", body: JSON.stringify({ prs }) }),
};

export const foodAPI = {
  search: (q, limit = 15) =>
    request(`/food/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};

export const exerciseAPI = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/exercises/?${qs}`);
  },
  get: (id) => request(`/exercises/${id}`),
};

export const budgetAPI = {
  add: (data) => request("/budget/", { method: "POST", body: JSON.stringify(data) }),
  getAll: (period) => request(`/budget/?period=${period || "week"}`),
  getSummary: () => request("/budget/summary"),
  delete: (id) => request(`/budget/${id}`, { method: "DELETE" }),
};

export const aiAPI = {
  chat: (message, history, contextType, context) =>
    request("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, conversation_history: history, context_type: contextType, context }),
    }),
  swapMeal: (mealId, reason, preferences) =>
    request("/ai/swap-meal", {
      method: "POST",
      body: JSON.stringify({ current_meal_id: mealId, reason, preferences }),
    }),
  estimateMacros: (description) =>
    request(`/ai/estimate-macros?description=${encodeURIComponent(description)}`, { method: "POST" }),
};

export const userAPI = {
  getProfile: () => request("/user/profile"),
  updateProfile: (data) => request("/user/profile", { method: "PUT", body: JSON.stringify(data) }),
};

export const chatAPI = {
  getSessions: () => request("/chat/sessions"),
  getSession: (id) => request(`/chat/sessions/${id}`),
  saveSession: (messages, title) => request("/chat/sessions", { method: "POST", body: JSON.stringify({ messages, title }) }),
  deleteSession: (id) => request(`/chat/sessions/${id}`, { method: "DELETE" }),
};


export const inventoryAPI = {
  getAll: () => request("/inventory/"),
  add: (data) => request("/inventory/", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) => request(`/inventory/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id) => request(`/inventory/${id}`, { method: "DELETE" }),
};

export const adminAPI = {
  getOverview: () => request("/admin/overview"),
  getUsers: (q = "", limit = 200) =>
    request(`/admin/users?limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  createUser: (data) => request("/admin/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
};


export function runGoogleAuthPopup(authUrl, expectedMode, timeoutMs = 120000) {
  const popup = window.open(authUrl, "lifeplan_google_auth", "width=520,height=700");
  if (!popup) {
    return Promise.reject(new Error("Popup blocked. Please allow popups and try again."));
  }

  const backendOrigin = getApiOrigin();
  const allowedOrigins = new Set([backendOrigin, window.location.origin]);
  try {
    const authUrlObj = new URL(authUrl);
    const redirectUri = authUrlObj.searchParams.get("redirect_uri");
    if (redirectUri) allowedOrigins.add(new URL(redirectUri).origin);
  } catch {
    // Ignore parse issues and keep fallback origins only.
  }
  // Allow www/non-www variants to avoid popup-origin mismatch when one domain is canonical.
  for (const origin of Array.from(allowedOrigins)) {
    try {
      const u = new URL(origin);
      const altHost = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
      allowedOrigins.add(`${u.protocol}//${altHost}${u.port ? `:${u.port}` : ""}`);
    } catch {
      // Ignore malformed origins.
    }
  }

  return new Promise((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(closePoll);
      clearTimeout(timeout);
      if (!popup.closed) popup.close();
    };
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      cleanup();
      fn(value);
    };
    const onMessage = (event) => {
      if (!allowedOrigins.has(event.origin)) return;
      if (!event.data || event.data.type !== "lifeplan_google_auth") return;
      const payload = event.data.payload || {};
      if (expectedMode && payload.mode !== expectedMode) return;
      if (payload.status === "success") {
        finish(resolve, payload);
      } else {
        finish(reject, new Error(payload.error || "Google authentication failed"));
      }
    };

    const closePoll = setInterval(() => {
      if (popup.closed) {
        finish(reject, new Error("Google authentication window was closed"));
      }
    }, 500);
    const timeout = setTimeout(() => {
      finish(reject, new Error("Google authentication timed out"));
    }, timeoutMs);

    window.addEventListener("message", onMessage);
  });
}

function parseGooglePayloadFromAppUrl(url) {
  try {
    const parsed = new URL(url);
    const hashParams = new URLSearchParams((parsed.hash || "").replace(/^#/, ""));
    const encoded = hashParams.get("google_oauth") || parsed.searchParams.get("google_oauth");
    if (!encoded) return null;
    const decodedBase64 = atob(decodeURIComponent(encoded));
    let decodedJson = decodedBase64;
    try {
      decodedJson = decodeURIComponent(escape(decodedBase64));
    } catch {
      // Keep ASCII fallback for environments where escape/unescape is unavailable.
    }
    const payload = JSON.parse(decodedJson);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

async function runGoogleAuthNative(authUrl, expectedMode, timeoutMs = 120000) {
  return new Promise(async (resolve, reject) => {
    let done = false;
    let timeout;
    let browserCloseGraceTimeout;
    let appUrlListener;
    let browserFinishedListener;

    const cleanup = async () => {
      if (timeout) clearTimeout(timeout);
      if (browserCloseGraceTimeout) clearTimeout(browserCloseGraceTimeout);
      try {
        if (appUrlListener) await appUrlListener.remove();
      } catch {}
      try {
        if (browserFinishedListener) await browserFinishedListener.remove();
      } catch {}
      try {
        await Browser.close();
      } catch {}
    };

    const finish = async (fn, value) => {
      if (done) return;
      done = true;
      await cleanup();
      fn(value);
    };

    try {
      appUrlListener = await CapacitorApp.addListener("appUrlOpen", (event) => {
        if (browserCloseGraceTimeout) clearTimeout(browserCloseGraceTimeout);
        const payload = parseGooglePayloadFromAppUrl(event?.url || "");
        if (!payload) return;
        if (expectedMode && payload.mode !== expectedMode) return;

        if (payload.status === "success") {
          finish(resolve, payload);
        } else {
          finish(reject, new Error(payload.error || "Google authentication failed"));
        }
      });

      browserFinishedListener = await Browser.addListener("browserFinished", () => {
        // On Android, browser may close just before deep-link callback reaches app.
        browserCloseGraceTimeout = setTimeout(() => {
          finish(reject, new Error("Google authentication window was closed"));
        }, 3000);
      });

      await Browser.open({ url: authUrl, presentationStyle: "fullscreen" });

      timeout = setTimeout(() => {
        finish(reject, new Error("Google authentication timed out"));
      }, timeoutMs);
    } catch (err) {
      finish(reject, new Error(err?.message || "Unable to open Google authentication"));
    }
  });
}

export function runGoogleAuthFlow(authUrl, expectedMode, timeoutMs = 120000) {
  if (isNativePlatform()) {
    return runGoogleAuthNative(authUrl, expectedMode, timeoutMs);
  }
  return runGoogleAuthPopup(authUrl, expectedMode, timeoutMs);
}
