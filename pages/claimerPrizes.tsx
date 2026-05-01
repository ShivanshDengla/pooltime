import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { ethers } from "ethers";
import { ABI, ADDRESS, PROVIDERS } from "../constants";
import Layout from "./index";
import { NumberWithCommas, CropDecimals } from "../utils/tokenMaths";
import { useOverview } from "../components/contextOverview";
import ChainTag from "../components/chainTag";
import IconDisplay from "../components/icons";
import {
  useAccount,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// ---------- Types ----------
interface WinItem {
  v: string; // vault
  p: string; // winner
  t: number; // tier
  i: number[]; // prize indices
}

interface ClaimItem {
  v: string; // vault
  w: string; // winner
  t: number; // tier
  p: string; // payout ("0" means canary)
  m: string; // miner/fee recipient
  f: string; // fee
  i: number; // prize index
}

interface ClaimableBatch {
  key: string;
  chainName: string;
  chainId: number;
  prizePool: string;
  claimer: string;
  drawId: number;
  vaultAddress: string;
  vaultName: string;
  assetSymbol: string;
  tier: number;
  isCanary: boolean;
  winners: string[];
  prizeIndices: number[][]; // per-winner indices
  claimCount: number;
  prizeSize: ethers.BigNumber;
  maxFee: ethers.BigNumber;
  feePerClaim: ethers.BigNumber;
  totalFee: ethers.BigNumber;
  totalPrize: ethers.BigNumber;
  prizeTokenPrice: number;
  prizeTokenDecimals: number;
  prizeTokenSymbol: string;
  feeUSD: number;
  prizeUSD: number;
}

// ---------- Helpers ----------
const formatAmount = (amount: ethers.BigNumber, decimals: number, maxDp = 6): string => {
  try {
    return NumberWithCommas(CropDecimals(ethers.utils.formatUnits(amount, decimals)));
  } catch {
    return "-";
  }
};

const formatUSD = (amount: number): string => {
  return `$${NumberWithCommas(CropDecimals(amount.toFixed(2)))}`;
};

const vaultLookup = (chainName: string, vaultAddress: string) => {
  const cfg = ADDRESS[chainName];
  if (!cfg) return null;
  const all = [...(cfg.VAULTS || []), ...(cfg.BOOSTERS || [])];
  return (
    all.find((v: any) =>
      v.VAULT && v.VAULT.toLowerCase() === vaultAddress.toLowerCase()
    ) || null
  );
};

// ---------- Row ----------
const ClaimableBatchRow: React.FC<{
  batch: ClaimableBatch;
  currentAccount?: string;
  currentChainId?: number;
  onClaim: (batch: ClaimableBatch) => void;
  onSwitch: (chainId: number) => void;
  pendingKey?: string | null;
}> = React.memo(({ batch, currentAccount, currentChainId, onClaim, onSwitch, pendingKey }) => {
  const isProfitable = batch.feeUSD > 0;
  const isPending = pendingKey === batch.key;

  const actionLabel = !currentAccount
    ? "CONNECT"
    : currentChainId !== batch.chainId
    ? "SWITCH NETWORK"
    : isPending
    ? "CLAIMING…"
    : "CLAIM";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentAccount) {
      toast("Connect wallet first", { position: toast.POSITION.BOTTOM_LEFT });
      return;
    }
    if (currentChainId !== batch.chainId) {
      onSwitch(batch.chainId);
      return;
    }
    if (isPending) return;
    onClaim(batch);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 2fr 0.6fr 0.7fr 1fr 1fr 1fr",
        gap: "6px",
        backgroundColor: "white",
        borderRadius: "20px",
        padding: "12px",
        marginBottom: "16px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, .1)",
        alignItems: "center",
        cursor: "default",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 6px 12px rgba(0, 0, 0, .15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 6px rgba(0, 0, 0, .1)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginRight: "-8px", marginBottom: "10px" }}>
        <ChainTag chainId={batch.chainId} horizontal={false} />
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "40px", display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
            <IconDisplay name={batch.assetSymbol} size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "bold", color: "#173d5a", fontSize: "15px" }}>
              {batch.vaultName || batch.vaultAddress.substring(0, 8)}
            </div>
            <div style={{ fontSize: "14px", color: "#666" }}>
              {batch.assetSymbol} · Draw #{batch.drawId}
            </div>
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center", color: "#173d5a", fontSize: "14px" }}>
        {batch.isCanary ? (
          <span style={{ color: "#8a6fdf", fontWeight: 600 }}>
            Canary {batch.tier}
          </span>
        ) : (
          <>Tier {batch.tier}</>
        )}
      </div>
      <div style={{ textAlign: "right", color: "#173d5a", fontSize: "15px" }}>
        {batch.claimCount}
      </div>
      <div style={{ textAlign: "right", color: "#173d5a", fontSize: "14px" }}>
        <div>
          {formatAmount(batch.totalPrize, batch.prizeTokenDecimals)} {batch.prizeTokenSymbol}
        </div>
        {batch.prizeUSD > 0 && (
          <div style={{ fontSize: "12px", color: "#888" }}>{formatUSD(batch.prizeUSD)}</div>
        )}
      </div>
      <div
        style={{
          textAlign: "right",
          color: isProfitable ? "#28a745" : "#dc3545",
          fontWeight: "bold",
          fontSize: "14px",
        }}
      >
        <div>
          {formatAmount(batch.totalFee, batch.prizeTokenDecimals)} {batch.prizeTokenSymbol}
        </div>
        {batch.feeUSD > 0 && (
          <div style={{ fontSize: "12px", fontWeight: 500 }}>{formatUSD(batch.feeUSD)}</div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleClick}
          disabled={isPending}
          style={{
            padding: "8px 16px",
            borderRadius: "10px",
            border: "none",
            backgroundColor: isPending ? "#999" : "#1a4160",
            color: "white",
            fontWeight: 600,
            fontSize: "12px",
            cursor: isPending ? "default" : "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            minWidth: "120px",
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
});

ClaimableBatchRow.displayName = "ClaimableBatchRow";

const ClaimableBatchCard: React.FC<{
  batch: ClaimableBatch;
  currentAccount?: string;
  currentChainId?: number;
  onClaim: (batch: ClaimableBatch) => void;
  onSwitch: (chainId: number) => void;
  pendingKey?: string | null;
}> = React.memo(({ batch, currentAccount, currentChainId, onClaim, onSwitch, pendingKey }) => {
  const isProfitable = batch.feeUSD > 0;
  const isPending = pendingKey === batch.key;

  const actionLabel = !currentAccount
    ? "CONNECT"
    : currentChainId !== batch.chainId
    ? "SWITCH"
    : isPending
    ? "CLAIMING…"
    : "CLAIM";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentAccount) {
      toast("Connect wallet first", { position: toast.POSITION.BOTTOM_LEFT });
      return;
    }
    if (currentChainId !== batch.chainId) {
      onSwitch(batch.chainId);
      return;
    }
    if (isPending) return;
    onClaim(batch);
  };

  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "16px",
        padding: "16px",
        marginBottom: "12px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, .1)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 6px 12px rgba(0, 0, 0, .15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 6px rgba(0, 0, 0, .1)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
        <ChainTag chainId={batch.chainId} horizontal={false} />
        <div style={{ marginLeft: "-15px", flex: 1, display: "flex", alignItems: "center", gap: "6px" }}>
          <IconDisplay name={batch.assetSymbol} size={16} />
          <div>
            <div style={{ fontWeight: "bold", color: "#173d5a", fontSize: "14px" }}>
              {batch.vaultName || batch.vaultAddress.substring(0, 8)}
            </div>
            <div style={{ fontSize: "12px", color: "#666" }}>
              Draw #{batch.drawId} · {batch.isCanary ? `Canary ${batch.tier}` : `Tier ${batch.tier}`}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          fontSize: "12px",
          textAlign: "center",
          marginTop: "12px",
        }}
      >
        <div>
          <div style={{ color: "#666", marginBottom: "2px" }}>Prizes</div>
          <div style={{ color: "#173d5a", fontWeight: 500 }}>{batch.claimCount}</div>
        </div>
        <div>
          <div style={{ color: "#666", marginBottom: "2px" }}>Prize Value</div>
          <div style={{ color: "#173d5a", fontWeight: 500 }}>
            {formatAmount(batch.totalPrize, batch.prizeTokenDecimals)} {batch.prizeTokenSymbol}
          </div>
          {batch.prizeUSD > 0 && (
            <div style={{ fontSize: "11px", color: "#888" }}>{formatUSD(batch.prizeUSD)}</div>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: "14px",
          padding: "8px 10px",
          backgroundColor: "#f8f9fa",
          borderRadius: "8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "11px", color: "#666" }}>Your Fee</div>
          <div
            style={{
              color: isProfitable ? "#28a745" : "#dc3545",
              fontWeight: "bold",
              fontSize: "13px",
            }}
          >
            {formatAmount(batch.totalFee, batch.prizeTokenDecimals)} {batch.prizeTokenSymbol}
          </div>
        </div>
        <button
          onClick={handleClick}
          disabled={isPending}
          style={{
            padding: "7px 12px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: isPending ? "#999" : "#1a4160",
            color: "white",
            fontWeight: 600,
            fontSize: "11px",
            cursor: isPending ? "default" : "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            minWidth: "86px",
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
});

ClaimableBatchCard.displayName = "ClaimableBatchCard";

// ---------- Page ----------
const ClaimerPrizesPage: React.FC = () => {
  const [batches, setBatches] = useState<ClaimableBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const [hideCanary, setHideCanary] = useState(false);
  const [onlyProfitable, setOnlyProfitable] = useState(false);
  const [includePreviousDraws, setIncludePreviousDraws] = useState(false);

  const overviewFromContext = useOverview();
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const {
    data: claimHash,
    writeContract: writeClaim,
    reset: resetClaim,
  } = useWriteContract({
    mutation: {
      onSuccess: () =>
        toast("Submitting claim…", { position: toast.POSITION.BOTTOM_LEFT }),
      onError: (err: any) => {
        console.warn("claim error", err);
        toast("Claim failed to submit", { position: toast.POSITION.BOTTOM_LEFT });
        setPendingKey(null);
      },
    },
  });

  const { isSuccess: claimMined } =
    useWaitForTransactionReceipt({ hash: claimHash });

  // ---------- Price helpers ----------
  const getPrizeTokenPrice = useCallback(
    (chainName: string): number => {
      const gecko = ADDRESS[chainName]?.PRIZETOKEN?.GECKO;
      if (!gecko || !overviewFromContext?.overview?.prices?.geckos) return 0;
      return overviewFromContext.overview.prices.geckos[gecko] || 0;
    },
    [overviewFromContext?.overview?.prices?.geckos]
  );

  // ---------- Fetch all claimable batches ----------
  const fetchClaimable = useCallback(async () => {
    console.log("Fetching claimable prizes across chains…");
    setLoading(true);
    setError(null);

    try {
      const chainNames = Object.keys(ADDRESS);
      const perChainResults: ClaimableBatch[] = [];

      await Promise.all(
        chainNames.map(async (chainName) => {
          try {
            const cfg = ADDRESS[chainName];
            if (!cfg?.PRIZEPOOL || !cfg?.CLAIMER || !PROVIDERS[chainName]) return;

            const chainId = cfg.CHAINID as number;
            const provider = PROVIDERS[chainName];

            const prizePool = new ethers.Contract(cfg.PRIZEPOOL, ABI.PRIZEPOOL as any, provider);
            const claimer = new ethers.Contract(cfg.CLAIMER, ABI.CLAIMER as any, provider);

            // Last awarded draw
            let lastDrawId: number;
            try {
              const d: ethers.BigNumber = await prizePool.getLastAwardedDrawId();
              lastDrawId = Number(d.toString());
            } catch (e) {
              console.warn(`[${chainName}] could not read getLastAwardedDrawId`, e);
              return;
            }
            if (!lastDrawId || lastDrawId === 0) return;
            const drawIdsToScan: number[] = [lastDrawId];
            if (includePreviousDraws) {
              const maxLookback = 7;
              for (
                let drawId = lastDrawId - 1;
                drawId > 0 && drawIdsToScan.length < maxLookback;
                drawId -= 1
              ) {
                drawIdsToScan.push(drawId);
              }
            }

            for (const drawId of drawIdsToScan) {
              try {
                // Finalized draws are not claimable.
                const finalized: boolean = await prizePool
                  .isDrawFinalized(drawId)
                  .catch(() => false);
                if (finalized) continue;

                const winsUrl = `https://poolexplorer.xyz/${chainId}-${cfg.PRIZEPOOL.toLowerCase()}-draw${drawId}`;
                const claimsUrl = `https://poolexplorer.xyz/claims-${chainId}-${cfg.PRIZEPOOL.toLowerCase()}-draw${drawId}`;

                const [winsRes, claimsRes] = await Promise.all([
                  fetch(winsUrl).catch(() => null),
                  fetch(claimsUrl).catch(() => null),
                ]);

                if (!winsRes || !winsRes.ok) continue;
                const winsData = await winsRes.json().catch(() => null);
                if (!winsData?.wins || !Array.isArray(winsData.wins)) continue;

                const wins: WinItem[] = winsData.wins;

                // Build claimed set: `${vault}-${winner}-${tier}-${idx}`
                const claimedSet = new Set<string>();
                if (claimsRes && claimsRes.ok) {
                  try {
                    const claims: ClaimItem[] = await claimsRes.json();
                    for (const c of claims) {
                      claimedSet.add(
                        `${c.v.toLowerCase()}-${c.w.toLowerCase()}-${c.t}-${c.i}`
                      );
                    }
                  } catch (e) {
                    console.warn(`[${chainName}] could not parse claims`, e);
                  }
                }

                // Compute unclaimed, grouped by (vault, tier)
                const groups = new Map<
                  string,
                  { vault: string; tier: number; winners: Map<string, number[]> }
                >();

                for (const w of wins) {
                  const vault = w.v.toLowerCase();
                  const winner = w.p.toLowerCase();
                  const unclaimedIdx = (w.i || []).filter(
                    (idx) => !claimedSet.has(`${vault}-${winner}-${w.t}-${idx}`)
                  );
                  if (unclaimedIdx.length === 0) continue;

                  const gKey = `${vault}-${w.t}`;
                  if (!groups.has(gKey)) {
                    groups.set(gKey, { vault, tier: w.t, winners: new Map() });
                  }
                  const group = groups.get(gKey)!;
                  const existing = group.winners.get(winner) || [];
                  group.winners.set(winner, existing.concat(unclaimedIdx));
                }

                if (groups.size === 0) continue;

                // Read pooled on-chain info for every distinct tier we need.
                const distinctTiers = Array.from(
                  new Set(Array.from(groups.values()).map((g) => g.tier))
                );

                const [numberOfTiers, ...tierReads] = await Promise.all([
                  prizePool.numberOfTiers().catch(() => 0),
                  ...distinctTiers.flatMap((t) => [
                    prizePool.getTierPrizeSize(t).catch(() => ethers.constants.Zero),
                    claimer.computeMaxFee(t).catch(() => ethers.constants.Zero),
                  ]),
                ]);

                const tierInfoByTier = new Map<
                  number,
                  { prizeSize: ethers.BigNumber; maxFee: ethers.BigNumber }
                >();
                distinctTiers.forEach((t, idx) => {
                  const prizeSize = tierReads[idx * 2] as ethers.BigNumber;
                  const maxFee = tierReads[idx * 2 + 1] as ethers.BigNumber;
                  tierInfoByTier.set(t, { prizeSize, maxFee });
                });

                const numTiers = Number(numberOfTiers || 0);
                const prizeTokenDecimals = Number(cfg.PRIZETOKEN?.DECIMALS || 18);
                const prizeTokenSymbol = cfg.PRIZETOKEN?.SYMBOL || "PRIZE";
                const prizeTokenPrice = getPrizeTokenPrice(chainName);

                // computeFeePerClaim for each group (needs claim count)
                const groupArr = Array.from(groups.values());
                const feePerClaimResults = await Promise.all(
                  groupArr.map((g) => {
                    const tierInfo = tierInfoByTier.get(g.tier);
                    const count = Array.from(g.winners.values()).reduce(
                      (sum, idx) => sum + idx.length,
                      0
                    );
                    if (!tierInfo || count === 0) return ethers.constants.Zero;
                    return claimer
                      .computeFeePerClaim(tierInfo.maxFee, count)
                      .catch(() => ethers.constants.Zero);
                  })
                );

                groupArr.forEach((g, idx) => {
                  const tierInfo = tierInfoByTier.get(g.tier);
                  if (!tierInfo) return;

                  const winners = Array.from(g.winners.keys());
                  const prizeIndices = winners.map((w) => g.winners.get(w)!);
                  const claimCount = prizeIndices.reduce(
                    (s, arr) => s + arr.length,
                    0
                  );
                  if (claimCount === 0) return;

                  const prizeSize = tierInfo.prizeSize;
                  const feePerClaim =
                    (feePerClaimResults[idx] as ethers.BigNumber) ||
                    ethers.constants.Zero;
                  const totalFee = feePerClaim.mul(claimCount);
                  const totalPrize = prizeSize.mul(claimCount);

                  // In PoolTogether V5, canary tiers are the last two tiers:
                  // numTiers-1 (lower canary) and numTiers-2 (upper canary).
                  const isCanary =
                    numTiers > 0 &&
                    (g.tier === numTiers - 1 || g.tier === numTiers - 2);

                  const vaultInfo = vaultLookup(chainName, g.vault);
                  const vaultName =
                    vaultInfo?.NAME ||
                    vaultInfo?.SYMBOL ||
                    `${g.vault.substring(0, 6)}…${g.vault.slice(-4)}`;
                  const assetSymbol =
                    vaultInfo?.ASSETSYMBOL || vaultInfo?.SYMBOL || "";

                  const feeUSD =
                    prizeTokenPrice *
                    Number(ethers.utils.formatUnits(totalFee, prizeTokenDecimals));
                  const prizeUSD =
                    prizeTokenPrice *
                    Number(ethers.utils.formatUnits(totalPrize, prizeTokenDecimals));

                  perChainResults.push({
                    key: `${chainName}-${g.vault}-${g.tier}-${drawId}`,
                    chainName,
                    chainId,
                    prizePool: cfg.PRIZEPOOL,
                    claimer: cfg.CLAIMER,
                    drawId,
                    vaultAddress: g.vault,
                    vaultName,
                    assetSymbol,
                    tier: g.tier,
                    isCanary,
                    winners,
                    prizeIndices,
                    claimCount,
                    prizeSize,
                    maxFee: tierInfo.maxFee,
                    feePerClaim,
                    totalFee,
                    totalPrize,
                    prizeTokenPrice,
                    prizeTokenDecimals,
                    prizeTokenSymbol,
                    feeUSD,
                    prizeUSD,
                  });
                });
              } catch (drawErr) {
                console.warn(`Failed to process draw ${drawId} on ${chainName}`, drawErr);
              }
            }
          } catch (e) {
            console.warn(`Failed to process chain ${chainName}`, e);
          }
        })
      );

      perChainResults.sort((a, b) => {
        if (a.feeUSD !== b.feeUSD) return b.feeUSD - a.feeUSD;
        return b.claimCount - a.claimCount;
      });

      setBatches(perChainResults);
    } catch (e) {
      console.error("Failed to fetch claimable prizes", e);
      setError("Failed to load claimable prizes");
    } finally {
      setLoading(false);
    }
  }, [getPrizeTokenPrice, includePreviousDraws]);

  useEffect(() => {
    if (!hasFetched.current && overviewFromContext?.overview) {
      hasFetched.current = true;
      fetchClaimable();
    }
  }, [overviewFromContext?.overview, fetchClaimable]);

  // React to successful claim: toast + refresh
  const successShown = useRef(false);
  useEffect(() => {
    if (claimHash && !claimMined) {
      successShown.current = false;
    }
    if (claimMined && !successShown.current) {
      successShown.current = true;
      toast("Claim confirmed!", { position: toast.POSITION.BOTTOM_LEFT });
      setPendingKey(null);
      setTimeout(() => {
        hasFetched.current = true;
        fetchClaimable();
      }, 1500);
      resetClaim();
    }
  }, [claimMined, claimHash, fetchClaimable, resetClaim]);

  // ---------- Actions ----------
  const handleClaim = useCallback(
    (batch: ClaimableBatch) => {
      if (!address) return;
      if (!writeClaim) return;

      console.log("Claiming", {
        chain: batch.chainName,
        vault: batch.vaultAddress,
        tier: batch.tier,
        winners: batch.winners,
        prizeIndices: batch.prizeIndices,
        claimer: batch.claimer,
      });

      setPendingKey(batch.key);

      try {
        // Gas estimation per empirical heuristic: ~325k + 169k per additional claim.
        const gas = BigInt(325_000 + 169_000 * Math.max(0, batch.claimCount - 1));

        writeClaim({
          address: batch.claimer as `0x${string}`,
          abi: ABI.CLAIMER as any,
          functionName: "claimPrizes",
          args: [
            batch.vaultAddress as `0x${string}`,
            batch.tier,
            batch.winners as `0x${string}`[],
            batch.prizeIndices,
            address as `0x${string}`,
            BigInt(0),
          ],
          gas,
        });
      } catch (e) {
        console.error("claim submit error", e);
        toast("Could not submit claim", { position: toast.POSITION.BOTTOM_LEFT });
        setPendingKey(null);
      }
    },
    [address, writeClaim]
  );

  const handleSwitch = useCallback(
    (targetChainId: number) => {
      if (!switchChain) return;
      switchChain({ chainId: targetChainId });
    },
    [switchChain]
  );

  // ---------- Derived view ----------
  const visibleBatches = useMemo(() => {
    let out = batches;
    if (hideCanary) out = out.filter((b) => !b.isCanary);
    if (onlyProfitable) out = out.filter((b) => b.feeUSD > 0);
    return out;
  }, [batches, hideCanary, onlyProfitable]);

  const pricingTimestamp = useMemo(() => {
    if (!overviewFromContext?.overview?.prices?.timestamp) return null;
    try {
      const date = new Date(overviewFromContext.overview.prices.timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${Math.floor(diffHours / 24)}d ago`;
    } catch {
      return null;
    }
  }, [overviewFromContext?.overview?.prices?.timestamp]);

  // ---------- Render ----------
  if (loading) {
    return (
      <Layout>
        <div style={{ textAlign: "center", padding: "40px" }}>
          <div className="spinner-large" />
          <p style={{ color: "#fff", fontSize: "16px", marginTop: "20px" }}>
            Loading claimable prizes…
          </p>
          <p style={{ color: "#ccc", fontSize: "12px", marginTop: "10px" }}>
            Scanning every chain&apos;s most recent awarded draw
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
          <button onClick={fetchClaimable}>Retry</button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
        <div style={{ marginBottom: "30px", textAlign: "center" }}>
          <h1
            style={{
              color: "#f0f9fa",
              fontSize: "3rem",
              textAlign: "center",
              marginTop: "20px",
              textTransform: "uppercase",
              letterSpacing: "3px",
              textShadow: "2px 2px 4px rgba(0, 0, 0, 0.5)",
              marginBottom: "20px",
            }}
            className="hidden-mobile"
          >
            Claimer
          </h1>
          <h1
            style={{
              color: "#f0f9fa",
              fontSize: "2rem",
              textAlign: "center",
              marginTop: "20px",
              textTransform: "uppercase",
              letterSpacing: "2px",
              textShadow: "2px 2px 4px rgba(0, 0, 0, 0.5)",
              marginBottom: "20px",
            }}
            className="hidden-desktop"
          >
            Claimer
          </h1>
        </div>

        <div style={{ marginBottom: "20px", textAlign: "center" }}>
          <p style={{ color: "#fff", fontSize: "14px" }}>
            {visibleBatches.length} claimable batch
            {visibleBatches.length === 1 ? "" : "es"}
          </p>
          {pricingTimestamp && (
            <p style={{ color: "#ccc", fontSize: "12px", marginTop: "5px" }}>
              Prices updated {pricingTimestamp}
            </p>
          )}
          <p
            style={{
              color: "#f24444",
              fontSize: "12px",
              marginTop: "10px",
              fontWeight: "bold",
            }}
          >
            This application is for expert operators only, use at your own risk.
          </p>
          <p style={{ color: "#ccc", fontSize: "12px", marginTop: "6px" }}>
            When you claim, you earn the VRGDA fee paid by the prize pool as the
            fee recipient. Winners always receive their prize minus the fee.
          </p>
          {pricingTimestamp && (
            <p style={{ color: "#ccc", fontSize: "12px", marginTop: "6px" }}>
              USD values use the last cached price snapshot ({pricingTimestamp}).
              On-chain claimability is live; only the USD estimate can be stale.
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "16px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <label style={{ color: "white", fontSize: "13px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hideCanary}
              onChange={(e) => setHideCanary(e.target.checked)}
              style={{ marginRight: "6px", verticalAlign: "middle" }}
            />
            Hide canary tiers (all shown by default)
          </label>
          <label style={{ color: "white", fontSize: "13px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={onlyProfitable}
              onChange={(e) => setOnlyProfitable(e.target.checked)}
              style={{ marginRight: "6px", verticalAlign: "middle" }}
            />
            Only batches with a fee
          </label>
          <label style={{ color: "white", fontSize: "13px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={includePreviousDraws}
              onChange={(e) => {
                setIncludePreviousDraws(e.target.checked);
                hasFetched.current = true;
                setTimeout(() => fetchClaimable(), 0);
              }}
              style={{ marginRight: "6px", verticalAlign: "middle" }}
            />
            Include previous unfinalized draws (up to 7 recent draws)
          </label>
          <button
            onClick={() => {
              hasFetched.current = true;
              fetchClaimable();
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

        {visibleBatches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <p style={{ color: "#fff" }}>
              {includePreviousDraws
                ? "No unclaimed prizes found on recent unfinalized draws."
                : "No unclaimed prizes found on the most recent draw."}
            </p>
          </div>
        ) : (
          <>
          <div
            style={{
              backgroundColor: "#ecf0f6",
              borderRadius: "12px",
              padding: "20px",
              overflowX: "auto",
            }}
            className="hidden-mobile"
          >
            <div
              className="vault-table-header-row"
              style={{
                display: "grid",
                gridTemplateColumns: "auto 2fr 0.6fr 0.7fr 1fr 1fr 1fr",
                gap: "6px",
                padding: "12px",
              }}
            >
              <div></div>
              <div>Vault</div>
              <div style={{ textAlign: "center" }}>Tier</div>
              <div style={{ textAlign: "right" }}>Prizes</div>
              <div style={{ textAlign: "right" }}>Prize Value</div>
              <div style={{ textAlign: "right" }}>Your Fee</div>
              <div style={{ textAlign: "right" }}>Action</div>
            </div>

            {visibleBatches.map((batch) => (
              <ClaimableBatchRow
                key={batch.key}
                batch={batch}
                currentAccount={address}
                currentChainId={chainId}
                onClaim={handleClaim}
                onSwitch={handleSwitch}
                pendingKey={pendingKey}
              />
            ))}
          </div>
          <div
            className="hidden-desktop"
            style={{
              backgroundColor: "#ecf0f6",
              borderRadius: "12px",
              padding: "15px",
            }}
          >
            {visibleBatches.map((batch) => (
              <ClaimableBatchCard
                key={batch.key}
                batch={batch}
                currentAccount={address}
                currentChainId={chainId}
                onClaim={handleClaim}
                onSwitch={handleSwitch}
                pendingKey={pendingKey}
              />
            ))}
          </div>
          </>
        )}
      </div>

      <ToastContainer style={{ zIndex: 9999 }} />
    </Layout>
  );
};

export default ClaimerPrizesPage;
