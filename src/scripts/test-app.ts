#!/usr/bin/env ts-node

import fetch from "node-fetch";

interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

async function api<T = any>(
  baseUrl: string,
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: any = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    // leave json undefined; return raw text under error if needed
  }

  return {
    ok: res.ok,
    status: res.status,
    data: json,
    error: !res.ok
      ? json?.error || json?.message || text || `HTTP ${res.status}`
      : undefined,
  };
}

function extractToken(payload: any): string | null {
  if (!payload) return null;
  return payload?.auth?.token || payload?.token || payload?.data?.token || null;
}

async function main() {
  const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
  const ts = Math.floor(Date.now() / 1000);
  const username = process.env.TEST_USERNAME || `test_${ts}`;
  const email = process.env.TEST_EMAIL || `${username}@test.com`;
  const password = process.env.TEST_PASSWORD || "testPassword123";
  const displayName = `${username} - E2E Test`;

  console.log("🧪 Running unified E2E test against:", BASE_URL);

  // 1) Register
  console.log("\n1) Registering user...");
  const registerBody = {
    username,
    email,
    password,
    displayName,
  };
  const reg = await api(BASE_URL, "POST", "/api/auth/register", registerBody);
  if (!reg.ok) {
    console.error("❌ Register failed:", reg.error);
    process.exit(1);
  }
  const regToken = extractToken(reg.data);
  if (!regToken) {
    console.warn("⚠️ No token in register response, will login");
  }

  // 2) Login (to ensure flow works regardless of register response format)
  console.log("\n2) Logging in user...");
  const login = await api(BASE_URL, "POST", "/api/auth/login", {
    username,
    password,
  });
  if (!login.ok) {
    console.error("❌ Login failed:", login.error);
    process.exit(1);
  }
  const token = extractToken(login.data) || regToken;
  if (!token) {
    console.error("❌ No token after login");
    process.exit(1);
  }
  console.log(
    "✅ Authenticated. Token (first 24):",
    token.slice(0, 24) + "..."
  );

  // 3) Check balance
  console.log("\n3) Checking balance...");
  const balanceRes = await api<{ data?: any }>(
    BASE_URL,
    "GET",
    "/api/balance",
    undefined,
    token
  );
  if (!balanceRes.ok) {
    console.error("❌ Balance failed:", balanceRes.error);
    process.exit(1);
  }
  const bal = (balanceRes.data as any)?.data || {};
  console.log("✅ Address:", bal.address);
  console.log("✅ Balance:", bal.balance, "ETH");
  console.log("✅ Network:", bal.network);

  // 4) Auth methods
  console.log("\n4) Getting auth methods...");
  const methods = await api(
    BASE_URL,
    "GET",
    "/api/auth/methods",
    undefined,
    token
  );
  if (!methods.ok) {
    console.error("❌ Auth methods failed:", methods.error);
    process.exit(1);
  }
  console.log(
    "✅ Auth methods:",
    JSON.stringify(methods.data?.data || methods.data, null, 2)
  );

  // 5) Hierarchy summary (if protected, requires token)
  console.log("\n5) Fetching system summary...");
  const summary = await api(
    BASE_URL,
    "GET",
    "/api/hierarchy/summary",
    undefined,
    token
  );
  if (!summary.ok) {
    console.error("❌ Summary failed:", summary.error);
    process.exit(1);
  }
  console.log("✅ System summary received");

  // Done
  console.log("\n🎉 Unified E2E test completed successfully for:", username);
}

main().catch((err) => {
  console.error("💥 Test crashed:", err);
  process.exit(1);
});
