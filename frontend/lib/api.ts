const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

/** =======================
 * Jobs / Rebalance (já existia)
 * ======================= */

export type JobStatus = "queued" | "running" | "done" | "error";

export type JobCreateResponse = {
  request_id: string;
  job_id: string;
  status: JobStatus;
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

export type JobStatusResponse = {
  request_id: string;
  job_id: string;
  status: JobStatus;
  result: RebalanceResult | null;
  error: { code: string; message: string } | null;
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
}): Promise<JobCreateResponse> {
  const form = new FormData();
  form.append("file", params.file);

  form.append("cash", String(params.cash));
  form.append("mode", params.mode);
  form.append("no_tesouro", String(params.noTesouro));

  form.append("w_stock", String(params.weights.stocks));
  form.append("w_fii", String(params.weights.fiis));
  form.append("w_bond", String(params.weights.bonds));

  const r = await fetch(`${API_BASE}/api/rebalance/b3/jobs`, {
    method: "POST",
    body: form,
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`create job failed: ${r.status} ${txt}`);
  }

  return (await r.json()) as JobCreateResponse;
}

export async function getJob(jobId: string): Promise<JobStatusResponse> {
  const r = await fetch(`${API_BASE}/api/jobs/${jobId}`, { method: "GET" });

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

  const r = await fetch(`${API_BASE}/api/import`, {
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
  const url = new URL("/api/bd_remote/symbols", API_BASE);
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
  const url = new URL("/api/bd_remote/prices", API_BASE);
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

export type ApiAssetClass = "stocks" | "fiis" | "bonds" | "other";

export type RemoteAsset = {
  ticker: string;
  cls: ApiAssetClass;
  price: number | null;
};

export async function getRemoteAssets(): Promise<{ items: RemoteAsset[] }> {
  const r = await fetch(`${API_BASE}/api/bd_remote/assets`, {
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
  const r1 = await fetch(`${API_BASE}/api/db/portfolios`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ name: payload.name }),
  });

  if (!r1.ok) {
    const txt = await r1.text();
    throw new Error(`create portfolio failed: ${r1.status} ${txt}`);
  }

  const created = (await r1.json()) as CreatePortfolioResponse;

  // 2) replace positions
  const r2 = await fetch(`${API_BASE}/api/db/portfolios/${created.id}/positions/replace`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ positions: payload.positions }),
  });

  if (!r2.ok) {
    const txt = await r2.text();
    throw new Error(`replace positions failed: ${r2.status} ${txt}`);
  }

  // 3) opcional: registrar import_run
  if (payload.import_filename) {
    const r3 = await fetch(`${API_BASE}/api/db/portfolios/${created.id}/import_runs`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ filename: payload.import_filename }),
    });

    if (!r3.ok) {
      const txt = await r3.text();
      throw new Error(`create import_run failed: ${r3.status} ${txt}`);
    }
  }

  return { ok: true, portfolio_id: created.id };
}
