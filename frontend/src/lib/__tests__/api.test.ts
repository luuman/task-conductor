import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the i18n module before importing api
vi.mock("../../i18n", () => ({
  default: { t: (key: string) => key },
}));

import {
  getConfig,
  saveConfig,
  clearConfig,
  getWsUrl,
  request,
  api,
  type ConnectionConfig,
} from "../api";

// ── localStorage helpers ──────────────────────────────────────

const fakeStorage: Record<string, string> = {};

beforeEach(() => {
  Object.keys(fakeStorage).forEach((k) => delete fakeStorage[k]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => fakeStorage[key] ?? null,
    setItem: (key: string, val: string) => { fakeStorage[key] = val; },
    removeItem: (key: string) => { delete fakeStorage[key]; },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── getConfig / saveConfig / clearConfig ──────────────────────

describe("config helpers", () => {
  it("returns null when nothing is saved", () => {
    expect(getConfig()).toBeNull();
  });

  it("saves and retrieves a config", () => {
    const cfg: ConnectionConfig = { type: "tunnel", tunnelUrl: "https://example.com", pin: "1234" };
    saveConfig(cfg);
    const stored = getConfig();
    expect(stored).toEqual(cfg);
  });

  it("clearConfig removes the stored config", () => {
    saveConfig({ type: "tunnel", tunnelUrl: "https://x.com" });
    clearConfig();
    expect(getConfig()).toBeNull();
  });
});

// ── getWsUrl ──────────────────────────────────────────────────

describe("getWsUrl()", () => {
  it("derives ws:// URL from window.location when base is empty (local proxy mode)", () => {
    // In jsdom, window.location is http://localhost by default
    // and import.meta.env.VITE_API_URL is undefined, so getBaseUrl() returns ""
    const url = getWsUrl("/ws/sessions");
    // Should use window.location.protocol -> ws: and host
    expect(url).toMatch(/^wss?:\/\/.+\/ws\/sessions$/);
  });

  it("converts http base to ws for tunnel config", () => {
    saveConfig({ type: "tunnel", tunnelUrl: "https://my-tunnel.dev" });
    // Force non-local by mocking window.location.hostname
    Object.defineProperty(window, "location", {
      value: { ...window.location, hostname: "remote-host.dev", protocol: "https:", host: "remote-host.dev" },
      writable: true,
    });
    const url = getWsUrl("/ws/task/1");
    expect(url).toBe("wss://my-tunnel.dev/ws/task/1");
  });
});

// ── request() ─────────────────────────────────────────────────

describe("request()", () => {
  it("sends GET with auth header and parses JSON", async () => {
    saveConfig({ type: "tunnel", token: "test-token-123" });
    const mockData = { status: "ok" };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await request<{ status: string }>("/health");
    expect(result).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/health");
    expect(opts.headers.Authorization).toBe("Bearer test-token-123");
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("throws on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(request("/auth/check")).rejects.toThrow("401 Unauthorized");
  });
});

// ── api object ────────────────────────────────────────────────

describe("api namespace", () => {
  beforeEach(() => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  it("api.health() calls /health", async () => {
    await api.health();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[0][0]).toContain("/health");
  });

  it("api.chat.models() calls /api/chat/models", async () => {
    await api.chat.models();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/chat/models");
  });

  it("api.projects.list() calls /api/projects", async () => {
    await api.projects.list();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/projects");
  });

  it("api.sessions.list() calls /api/sessions", async () => {
    await api.sessions.list();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/sessions");
  });

  it("api.projects.create() sends POST with body", async () => {
    await api.projects.create({ name: "test", repo_url: "/tmp/test" });
    const fetchMock = vi.mocked(fetch);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual({ name: "test", repo_url: "/tmp/test" });
  });
});
