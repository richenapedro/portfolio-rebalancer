const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

// se vier "" (prod), usa a origem atual (https://app...)
// se vier "http://127.0.0.1:8000" (dev), usa direto
// se vier "/api" (evite), vira "https://app.../api"
const ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

const BASE =
  RAW_BASE.startsWith("http")
    ? RAW_BASE
    : RAW_BASE.startsWith("/")
      ? `${ORIGIN}${RAW_BASE}`
      : ORIGIN;

/** =======================
 * Jobs / Rebalance (já existia)
 * ======================= */

export type JobStatus = "queued" | "running" | "done" | "error";

export type HoldingOut = {
  ticker: string;
  asset_type: string;
  quantity: number;
  price: number;
  value: number;
  weight: number;
};

export type TradeOut = {
  side: "BUY" | "SELL";
  ticker: string;
  quantity: number;
  price: number;
  notional: number;
};

export type RebalanceResponse = {
  request_id?: string | null;
  summary: {
    cash_before: number;
    cash_after: number;
    total_value_before: number;
    total_value_after: number;
    n_trades: number;
  };
  trades: TradeOut[];
  holdings_before: HoldingOut[];
  holdings_after: HoldingOut[];
  warnings: string[];
};

export type JobCreateResponse = {
  request_id: string;
  job_id: string;
  status: JobStatus;
};

export type JobStatusResponse = {
  job_id: string;
  status: JobStatus;
  result: RebalanceResponse | null; // ✅ alinhado
  error: { code: string; message: string } | null;
  request_id: string;
};


export type RebalanceResult = {
  summary: {
    cash_before: number;
    cash_after: number;
    total_value_before: number;
    total_value_after: number;
    n_trades: number;
  };
  trades: Array<{
    side: "BUY" | "SELL";
    ticker: string;
    quantity: number;
    price: number;
    notional: number;
  }>;
};

export type AllocationWeights = {
  stocks: number;
  fiis: number;
  bonds: number;
};

export async function createRebalanceB3Job(params: {
  file: File;
  cash: number;
  mode: "BUY" | "SELL" | "TRADE";
  noTesouro: boolean;
  weights: AllocationWeights;
  notesByTicker?: Record<string, number>; // ✅ novo
}): Promise<JobCreateResponse> {

  const form = new FormData();
  form.append("file", params.file);

  form.append("cash", String(params.cash));
  form.append("mode", params.mode);
  form.append("no_tesouro", String(params.noTesouro));

  form.append("w_stock", String(params.weights.stocks));
  form.append("w_fii", String(params.weights.fiis));
  form.append("w_bond", String(params.weights.bonds));
  // ✅ notes_json: dict { TICKER: note }
  if (params.notesByTicker && Object.keys(params.notesByTicker).length > 0) {
    form.append("notes_json", JSON.stringify(params.notesByTicker));
  }

  const r = await fetch(`${BASE}/api/rebalance/b3/jobs`, {
    method: "POST",
    body: form,
    credentials: "include",
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`create job failed: ${r.status} ${txt}`);
  }

  return (await r.json()) as JobCreateResponse;
}

export async function getJob(jobId: string): Promise<JobStatusResponse> {
  const r = await fetch(`${BASE}/api/jobs/${jobId}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`get job failed: ${r.status} ${txt}`);
  }

  return (await r.json()) as JobStatusResponse;
}

/** =======================
 * Import B3 (já existia)
 * ======================= */

export type ImportResponse = {
  meta: {
    filename: string;
    n_positions: number;
    n_prices: number;
    n_targets: number;
  };
  warnings: string[];
  positions: Array<{
    ticker: string;
    asset_type: string;
    quantity: number;
    price: number;
  }>;
  prices: Record<string, number>;
  targets: Record<string, number>;
  weights_current?: {
    stocks: number;
    fiis: number;
    bonds: number;
  };
};

export async function importB3(params: { file: File; noTesouro: boolean }): Promise<ImportResponse> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("no_tesouro", String(params.noTesouro));

  const r = await fetch(`${BASE}/api/import`, {
    method: "POST",
    body: form,
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`import failed: ${r.status} ${txt}`);
  }

  return (await r.json()) as ImportResponse;
}

/** =======================
 * BD Remote (autocomplete / prices / assets)
 * ======================= */

export async function searchSymbols(q: string, limit = 8): Promise<string[]> {
  const url = new URL("/api/bd_remote/symbols", BASE);
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));

  const r = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!r.ok) throw new Error(`searchSymbols failed: ${r.status}`);
  return (await r.json()) as string[];
}

export async function getRemotePrices(tickers: string[]): Promise<Record<string, number | null>> {
  const url = new URL("/api/bd_remote/prices", BASE);
  url.searchParams.set("tickers", tickers.join(","));

  const r = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`getRemotePrices failed: ${r.status} ${txt}`);
  }

  return (await r.json()) as Record<string, number | null>;
}

export type ApiAssetClass = "STOCK" | "FII" | "BOND" | "OTHER";

export type RemoteAsset = {
  ticker: string;
  cls: ApiAssetClass;
  price: number | null;
};

export async function getRemoteAssets(): Promise<{ items: RemoteAsset[] }> {
  const r = await fetch(`${BASE}/api/bd_remote/assets`, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`getRemoteAssets failed: ${r.status} ${txt}`);
  }

  return (await r.json()) as { items: RemoteAsset[] };
}

/** =======================
 * Portfolio DB (SQLite via backend)
 * ======================= */

export type SavePortfolioPosition = {
  ticker: string;
  quantity: number;
  price: number;
  cls: ApiAssetClass;
  note: number;
  source: "import" | "manual";
};

export type SavePortfolioPayload = {
  name: string;
  positions: SavePortfolioPosition[];
  import_filename?: string | null; // opcional (debug)
};

export type SavePortfolioResponse = {
  ok: boolean;
  portfolio_id: number;
};

type CreatePortfolioResponse = {
  id: number;
  name: string;
  created_at: string;
};

export async function savePortfolio(payload: SavePortfolioPayload): Promise<SavePortfolioResponse> {
  // 1) cria portfolio
  const r1 = await fetch(`${BASE}/api/db/portfolios`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ name: payload.name }),
    credentials: "include",
  });

  if (!r1.ok) {
    const txt = await r1.text();
    throw new Error(`create portfolio failed: ${r1.status} ${txt}`);
  }

  const created = (await r1.json()) as CreatePortfolioResponse;

  // 2) replace positions
  const r2 = await fetch(`${BASE}/api/db/portfolios/${created.id}/positions/replace`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ positions: payload.positions }),
    credentials: "include",
  });

  if (!r2.ok) {
    const txt = await r2.text();
    throw new Error(`replace positions failed: ${r2.status} ${txt}`);
  }

  // 3) opcional: registrar import_run
  if (payload.import_filename) {
    const r3 = await fetch(`${BASE}/api/db/portfolios/${created.id}/import_runs`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ filename: payload.import_filename }),
      credentials: "include",
    });

    if (!r3.ok) {
      const txt = await r3.text();
      throw new Error(`create import_run failed: ${r3.status} ${txt}`);
    }
  }

  return { ok: true, portfolio_id: created.id };
}

/** =======================
 * Auth
 * ======================= */

export type MeResponse = {
  id: number;
  email: string;
  created_at?: string;
};

async function jsonOrText(r: Response) {
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await r.json()) as unknown;
  return await r.text();
}

// find: export async function authMe(): Promise<MeResponse> {
export async function authMe(): Promise<MeResponse | null> {
  const res = await fetch(`${BASE}/api/auth/me`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 401) return null;

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `authMe failed (${res.status})`);
  }

  return (await res.json()) as MeResponse;
}

export async function authLogin(email: string, password: string): Promise<MeResponse> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  if (!r.ok) {
    const detail = await jsonOrText(r);
    throw new Error(typeof detail === "string" ? detail : `login failed: ${r.status}`);
  }
  return (await r.json()) as MeResponse;
}

export async function authSignup(email: string, password: string): Promise<MeResponse> {
  const r = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  if (!r.ok) {
    const detail = await jsonOrText(r);
    throw new Error(typeof detail === "string" ? detail : `signup failed: ${r.status}`);
  }
  return (await r.json()) as MeResponse;
}

export async function authLogout(): Promise<void> {
  const r = await fetch(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: { accept: "application/json" },
    credentials: "include",
  });
  if (!r.ok) {
    throw new Error(`logout failed: ${r.status}`);
  }
}

export type OAuthExchangePayload = {
  provider: "google" | "facebook";
  id_token?: string;
  access_token?: string;
};

export async function authOAuthExchange(payload: OAuthExchangePayload): Promise<MeResponse> {
  const r = await fetch(`${BASE}/api/auth/oauth/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || `OAuth exchange failed (${r.status})`);
  }
  return (await r.json()) as MeResponse;
}

export async function authOauthExchange(provider: "google", idToken: string) {
  const r = await fetch(`${BASE}/api/auth/oauth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ provider, id_token: idToken }),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || `oauth exchange failed (${r.status})`);
  }

  return (await r.json()) as { id: number; email: string };
}