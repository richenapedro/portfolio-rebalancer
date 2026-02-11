"use client";

import { useEffect, useState } from "react";
import { createRebalanceB3Job, getJob, JobStatusResponse } from "@/lib/api";

type Mode = "BUY" | "SELL" | "TRADE";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [cash, setCash] = useState<number>(100);
  const [mode, setMode] = useState<Mode>("BUY");
  const [noTesouro, setNoTesouro] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onRun() {
    if (!file) return;

    setErr(null);
    setLoading(true);
    setJob(null);
    setJobId(null);

    try {
      const created = await createRebalanceB3Job({
        file,
        cash,
        mode,
        noTesouro,
      });

      setJobId(created.job_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setLoading(false);
    }
  }

  // polling do job
  useEffect(() => {
    if (!jobId) return;
    const id = jobId; // <-- agora é string aqui dentro

    let cancelled = false;

    async function tick() {
      try {
        const data = await getJob(id); // usa id
        if (cancelled) return;

        setJob(data);

        if (data.status === "done" || data.status === "error") {
          setLoading(false);
          return;
        }

        setTimeout(tick, 1000);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);
        setLoading(false);
      }
    }

    tick();
    return () => {
      cancelled = true;
    };
  }, [jobId]);


  const result = job?.result ?? null;
  const summary = result?.summary;
  const trades = result?.trades ?? [];

  return (
    <main className="p-8 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Portfolio Rebalancer</h1>

      <div className="space-y-4 border rounded p-4">
        <div className="space-y-2">
          <label className="block font-medium">B3 XLSX (Posição)</label>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block"
          />
          {file && (
            <p className="text-sm text-gray-600">
              Selected: <span className="font-mono">{file.name}</span>
            </p>
          )}
        </div>

        <div className="flex gap-6 flex-wrap">
          <div className="space-y-2">
            <label className="block font-medium">Cash</label>
            <input
              type="number"
              value={cash}
              onChange={(e) => setCash(Number(e.target.value))}
              className="border rounded p-2 w-40"
            />
          </div>

          <div className="space-y-2">
            <label className="block font-medium">Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="border rounded p-2 w-40"
            >
              <option value="TRADE">TRADE</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block font-medium">Tesouro</label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={noTesouro}
                onChange={(e) => setNoTesouro(e.target.checked)}
              />
              <span className="text-sm">No Tesouro (exclude)</span>
            </label>
          </div>
        </div>

        <button
          onClick={onRun}
          disabled={!file || loading}
          className="bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
        >
          {loading ? "Running..." : "Run (Jobs)"}
        </button>

        {err && (
          <div className="text-sm text-red-600">
            Error: <span className="font-mono">{err}</span>
          </div>
        )}

        {jobId && (
          <div className="text-sm">
            Job ID: <span className="font-mono">{jobId}</span>
          </div>
        )}

        {job && (
          <div className="text-sm">
            Status: <span className="font-mono">{job.status}</span>{" "}
            {job.request_id && (
              <>
                | Request ID: <span className="font-mono">{job.request_id}</span>
              </>
            )}
          </div>
        )}
      </div>

      {job?.status === "error" && job.error && (
        <div className="border rounded p-4">
          <h2 className="font-semibold">Job Error</h2>
          <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(job.error, null, 2)}</pre>
        </div>
      )}

      {job?.status === "done" && summary && (
        <div className="space-y-4">
          <div className="border rounded p-4">
            <h2 className="font-semibold">Summary</h2>
            <pre className="text-sm whitespace-pre-wrap">
              {JSON.stringify(summary, null, 2)}
            </pre>
          </div>

          <div className="border rounded p-4">
            <h2 className="font-semibold">Trades ({trades.length})</h2>
            <pre className="text-sm whitespace-pre-wrap">
              {JSON.stringify(trades, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </main>
  );
}
