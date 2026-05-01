import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import Layout from "./index";
import { ADDRESS } from "../constants";
import { NumberWithCommas, CropDecimals } from "../utils/tokenMaths";
import { useOverview } from "../components/contextOverview";
import ChainTag from "../components/chainTag";

interface ClaimerStat {
  address: string;
  claimCount: number;
  totalFeeUSD: number;
  totalPayoutUSD: number;
  totalFeeByToken: Record<string, ethers.BigNumber>;
  chains: number[];
  drawsCovered: number;
}

interface ClaimItem {
  p?: string; // payout
  m?: string; // fee recipient/miner
  f?: string; // fee
}

const formatUSD = (amount: number): string => {
  return `$${NumberWithCommas(CropDecimals(amount.toFixed(2)))}`;
};

const getRelativeTime = (iso?: string | null): string | null => {
  if (!iso) return null;
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return null;
  }
};

const ClaimerCheckPage: React.FC = () => {
  const [rows, setRows] = useState<ClaimerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookbackDraws, setLookbackDraws] = useState(14);
  const [minClaims, setMinClaims] = useState(1);
  const [query, setQuery] = useState("");
  const hasFetched = useRef(false);
  const overviewFromContext = useOverview();

  const getPrizeTokenPrice = useCallback(
    (chainName: string): number => {
      const gecko = ADDRESS[chainName]?.PRIZETOKEN?.GECKO;
      if (!gecko || !overviewFromContext?.overview?.prices?.geckos) return 0;
      return overviewFromContext.overview.prices.geckos[gecko] || 0;
    },
    [overviewFromContext?.overview?.prices?.geckos]
  );

  const fetchClaimerStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const chainNames = Object.keys(ADDRESS);
      const statsMap = new Map<string, ClaimerStat>();

      await Promise.all(
        chainNames.map(async (chainName) => {
          const cfg = ADDRESS[chainName];
          if (!cfg?.PRIZEPOOL || !cfg?.CHAINID) return;

          try {
            // Use poolexplorer's latest draw id marker to avoid extra RPC dependencies.
            const historyUrl = `https://poolexplorer.xyz/${cfg.CHAINID}-${cfg.PRIZEPOOL.toLowerCase()}-drawhistory`;
            const historyRes = await fetch(historyUrl).catch(() => null);
            const historyJson = historyRes && historyRes.ok ? await historyRes.json().catch(() => null) : null;
            const maxDrawInHistory = Array.isArray(historyJson)
              ? Math.max(
                  0,
                  ...historyJson.map((h: any) => Number(h?.drawId || h?.draw || 0)).filter((n: number) => Number.isFinite(n))
                )
              : 0;
            if (!maxDrawInHistory) return;

            const startDraw = Math.max(1, maxDrawInHistory - lookbackDraws + 1);
            const prizeTokenPrice = getPrizeTokenPrice(chainName);
            const prizeTokenDecimals = Number(cfg.PRIZETOKEN?.DECIMALS || 18);
            const prizeTokenSymbol = cfg.PRIZETOKEN?.SYMBOL || "PRIZE";

            const draws = Array.from(
              { length: maxDrawInHistory - startDraw + 1 },
              (_, i) => startDraw + i
            );

            await Promise.all(
              draws.map(async (drawId) => {
                const claimsUrl = `https://poolexplorer.xyz/claims-${cfg.CHAINID}-${cfg.PRIZEPOOL.toLowerCase()}-draw${drawId}`;
                const res = await fetch(claimsUrl).catch(() => null);
                if (!res || !res.ok) return;
                const claims = (await res.json().catch(() => null)) as ClaimItem[] | null;
                if (!claims || !Array.isArray(claims) || claims.length === 0) return;

                for (const claim of claims) {
                  const claimer = (claim.m || "").toLowerCase();
                  if (!claimer) continue;

                  const fee = ethers.BigNumber.from(claim.f || "0");
                  const payout = ethers.BigNumber.from(claim.p || "0");
                  const feeUsd =
                    Number(ethers.utils.formatUnits(fee, prizeTokenDecimals)) *
                    prizeTokenPrice;
                  const payoutUsd =
                    Number(ethers.utils.formatUnits(payout, prizeTokenDecimals)) *
                    prizeTokenPrice;

                  if (!statsMap.has(claimer)) {
                    statsMap.set(claimer, {
                      address: claimer,
                      claimCount: 0,
                      totalFeeUSD: 0,
                      totalPayoutUSD: 0,
                      totalFeeByToken: {},
                      chains: [],
                      drawsCovered: 0,
                    });
                  }

                  const row = statsMap.get(claimer)!;
                  row.claimCount += 1;
                  row.totalFeeUSD += feeUsd;
                  row.totalPayoutUSD += payoutUsd;
                  row.chains = Array.from(new Set([...row.chains, cfg.CHAINID]));
                  row.drawsCovered += 1;
                  row.totalFeeByToken[prizeTokenSymbol] =
                    row.totalFeeByToken[prizeTokenSymbol]
                      ? row.totalFeeByToken[prizeTokenSymbol].add(fee)
                      : fee;
                }
              })
            );
          } catch (chainErr) {
            console.warn(`Failed to fetch chain ${chainName}`, chainErr);
          }
        })
      );

      const out = Array.from(statsMap.values()).sort(
        (a, b) => b.totalFeeUSD - a.totalFeeUSD
      );
      setRows(out);
    } catch (e) {
      console.error("Failed to load claimer stats", e);
      setError("Failed to load claimer bot stats");
    } finally {
      setLoading(false);
    }
  }, [getPrizeTokenPrice, lookbackDraws]);

  useEffect(() => {
    if (!hasFetched.current && overviewFromContext?.overview) {
      hasFetched.current = true;
      fetchClaimerStats();
    }
  }, [overviewFromContext?.overview, fetchClaimerStats]);

  const pricingAge = useMemo(
    () => getRelativeTime(overviewFromContext?.overview?.prices?.timestamp || null),
    [overviewFromContext?.overview?.prices?.timestamp]
  );

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.claimCount < minClaims) return false;
      if (!q) return true;
      return r.address.includes(q);
    });
  }, [rows, minClaims, query]);

  if (loading) {
    return (
      <Layout>
        <div style={{ textAlign: "center", padding: "40px" }}>
          <div className="spinner-large" />
          <p style={{ color: "#fff", fontSize: "16px", marginTop: "20px" }}>
            Loading claimer bot performance...
          </p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ color: "red" }}>{error}</p>
          <button onClick={fetchClaimerStats}>Retry</button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
        <div style={{ marginBottom: "24px", textAlign: "center" }}>
          <h1
            style={{
              color: "#f0f9fa",
              fontSize: "3rem",
              marginTop: "20px",
              textTransform: "uppercase",
              letterSpacing: "3px",
              textShadow: "2px 2px 4px rgba(0, 0, 0, 0.5)",
              marginBottom: "20px",
            }}
            className="hidden-mobile"
          >
            Claimer Check
          </h1>
          <h1
            style={{
              color: "#f0f9fa",
              fontSize: "2rem",
              marginTop: "20px",
              textTransform: "uppercase",
              letterSpacing: "2px",
              textShadow: "2px 2px 4px rgba(0, 0, 0, 0.5)",
              marginBottom: "20px",
            }}
            className="hidden-desktop"
          >
            Claimer Check
          </h1>
          <p style={{ color: "#fff", fontSize: "14px" }}>
            {visibleRows.length} bots found from recent claims
          </p>
          <p style={{ color: "#ccc", fontSize: "12px", marginTop: "6px" }}>
            This shows fees earned by fee recipients from claim transactions.
            This is an estimate of gross bot revenue, not net profit (gas and infra costs are not included).
          </p>
          {pricingAge && (
            <p style={{ color: "#ccc", fontSize: "12px", marginTop: "6px" }}>
              USD conversion snapshot age: {pricingAge}
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "12px",
            marginBottom: "18px",
            flexWrap: "wrap",
          }}
        >
          <label style={{ color: "white", fontSize: "13px" }}>
            Lookback draws:&nbsp;
            <select
              value={lookbackDraws}
              onChange={(e) => setLookbackDraws(Number(e.target.value))}
              style={{ borderRadius: "6px", padding: "4px 8px" }}
            >
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>
          <label style={{ color: "white", fontSize: "13px" }}>
            Min claims:&nbsp;
            <input
              type="number"
              min={1}
              value={minClaims}
              onChange={(e) => setMinClaims(Math.max(1, Number(e.target.value || 1)))}
              style={{ width: "80px", borderRadius: "6px", padding: "4px 8px" }}
            />
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by address..."
            style={{
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.1)",
              color: "white",
              padding: "6px 10px",
              minWidth: "230px",
            }}
          />
          <button
            onClick={() => {
              hasFetched.current = true;
              fetchClaimerStats();
            }}
            style={{
              background: "transparent",
              color: "#E1F5F9",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: "8px",
              padding: "4px 12px",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            ⟲ Refresh
          </button>
        </div>

        {visibleRows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <p style={{ color: "#fff" }}>No claimer stats found for current filters.</p>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: "#ecf0f6",
              borderRadius: "12px",
              padding: "20px",
              overflowX: "auto",
            }}
          >
            <div
              className="vault-table-header-row"
              style={{
                display: "grid",
                gridTemplateColumns: "0.4fr 2fr 0.8fr 1fr 1fr 1fr",
                gap: "6px",
                padding: "12px",
              }}
            >
              <div style={{ textAlign: "right" }}>#</div>
              <div>Claimer</div>
              <div style={{ textAlign: "right" }}>Claims</div>
              <div style={{ textAlign: "right" }}>Gross Fees</div>
              <div style={{ textAlign: "right" }}>Winners Paid</div>
              <div style={{ textAlign: "right" }}>Chains</div>
            </div>

            {visibleRows.map((row, idx) => (
              <div
                key={row.address}
                style={{
                  display: "grid",
                  gridTemplateColumns: "0.4fr 2fr 0.8fr 1fr 1fr 1fr",
                  gap: "6px",
                  backgroundColor: "white",
                  borderRadius: "20px",
                  padding: "12px",
                  marginBottom: "12px",
                  boxShadow: "0 4px 6px rgba(0, 0, 0, .1)",
                  alignItems: "center",
                }}
              >
                <div style={{ textAlign: "right", color: "#173d5a" }}>{idx + 1}</div>
                <div>
                  <div style={{ fontWeight: 600, color: "#173d5a" }}>
                    {row.address.slice(0, 8)}...{row.address.slice(-6)}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>{row.address}</div>
                </div>
                <div style={{ textAlign: "right", color: "#173d5a" }}>
                  {NumberWithCommas(row.claimCount.toString())}
                </div>
                <div style={{ textAlign: "right", color: "#28a745", fontWeight: 700 }}>
                  {formatUSD(row.totalFeeUSD)}
                </div>
                <div style={{ textAlign: "right", color: "#173d5a" }}>
                  {formatUSD(row.totalPayoutUSD)}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px", flexWrap: "wrap" }}>
                  {row.chains.slice(0, 4).map((chainId) => (
                    <ChainTag key={`${row.address}-${chainId}`} chainId={chainId} horizontal={false} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ClaimerCheckPage;
