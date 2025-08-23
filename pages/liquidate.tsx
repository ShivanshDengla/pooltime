// pages/liquidate.tsx
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/router";
import { ethers } from "ethers";
import { ABI, ADDRESS, PROVIDERS } from "../constants";
import Layout from "./index";
import { NumberWithCommas, CropDecimals } from "../utils/tokenMaths";
import { GetChainName } from "../utils/getChain";
import { encodeFunctionData } from "viem";
import {
  useAccount,
  useCapabilities,
  useSendCalls,
  useCallsStatus,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";

// ---------- Types ----------
interface ERC20Meta {
  address: string;
  symbol: string;
  decimals: number;
}
interface PairInfo {
  pairAddress: string;
  tokenIn: ERC20Meta;   // expected PRIZE token
  tokenOut: ERC20Meta;  // VAULT token
  maxOut: ethers.BigNumber;
}

// ---------- Helpers ----------
async function loadERC20Meta(
  provider: ethers.providers.Provider,
  address: string
): Promise<ERC20Meta> {
  const erc = new ethers.Contract(address, ABI.ERC20 as any, provider);
  const [symbol, decimals] = await Promise.all([
    erc.symbol().catch(() => "TKN"),
    erc.decimals().catch(() => 18),
  ]);
  return { address, symbol: String(symbol), decimals: Number(decimals) };
}

function fmt(amount: ethers.BigNumber | string | number, decimals = 18) {
  try {
    const s =
      typeof amount === "string" || typeof amount === "number"
        ? String(amount)
        : ethers.utils.formatUnits(amount, decimals);
    return NumberWithCommas(CropDecimals(s));
  } catch {
    return String(amount);
  }
}

function toUnits(amount: string, decimals: number) {
  if (!amount || Number.isNaN(Number(amount))) return ethers.constants.Zero;
  try {
    return ethers.utils.parseUnits(amount, decimals);
  } catch {
    return ethers.constants.Zero;
  }
}

function slippageMultiplier(bpsOrPct: number) {
  const pct = bpsOrPct > 5 ? bpsOrPct / 100 : bpsOrPct;
  return 1 + pct / 100;
}

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

// --- Debug helpers ---
const DEBUG = true; // flip to false to silence logs in prod
const dlog = (...args: any[]) => DEBUG && console.log("[liquidate]", ...args);
const dgroup = (label: string, fn: () => void) => {
  if (!DEBUG) return fn();
  console.groupCollapsed(`[liquidate] ${label}`);
  try { fn(); } finally { console.groupEnd(); }
};

// ---------- Component ----------
const LiquidatePage: React.FC = () => {
  const router = useRouter();

  // /liquidate?chain=100&pair=0x...
  const { chain: chainParamRaw, pair: pairParamRaw, address: addressParam } =
    router.query as { chain?: string; pair?: string; address?: string };
  const pairParam =
    (pairParamRaw as string) || (addressParam as string) || undefined;

  // wallet + batching
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: capabilities } = useCapabilities({ account: address });
  const { data: batchId, isPending: isBatching, sendCalls } = useSendCalls();
  const { data: callStatus } = useCallsStatus({
    id: (batchId as any)?.id || "",
    query: {
      enabled: !!batchId,
      refetchInterval: (data) =>
        (data as any).state.data?.status === "success" ? false : 1000,
    },
  });

  // derive chain from query
  const chainNameFromUrl = useMemo(() => {
    if (!chainParamRaw) return undefined;
    const maybeNum = Number(chainParamRaw);
    if (!Number.isNaN(maybeNum) && maybeNum > 0) return GetChainName(maybeNum);
    return String(chainParamRaw).toUpperCase();
  }, [chainParamRaw]);

  const targetChainIdFromUrl = useMemo(() => {
    const maybeNum = Number(chainParamRaw);
    return !Number.isNaN(maybeNum) && maybeNum > 0 ? maybeNum : undefined;
  }, [chainParamRaw]);

  const provider = useMemo(() => {
    if (!chainNameFromUrl) return undefined;
    return PROVIDERS[chainNameFromUrl];
  }, [chainNameFromUrl]);

  const routerAddress = useMemo(() => {
    if (!chainNameFromUrl) return undefined;
    try {
      return ADDRESS[chainNameFromUrl].LIQUIDATIONROUTER as string;
    } catch {
      return undefined;
    }
  }, [chainNameFromUrl]);

  // log initial wiring
  useEffect(() => {
    console.groupCollapsed("Liquidation:init");
    console.log("query", { chainParamRaw, pairParamRaw, addressParam });
    console.log("derived", { chainNameFromUrl, pairParam, routerAddress, targetChainIdFromUrl });
    console.groupEnd();
  }, [chainParamRaw, pairParamRaw, addressParam, chainNameFromUrl, pairParam, routerAddress, targetChainIdFromUrl]);

  // state
  const [pairInfo, setPairInfo] = useState<PairInfo | null>(null);
  const [amountOutStr, setAmountOutStr] = useState<string>("");
  const [amountInRequired, setAmountInRequired] =
    useState<ethers.BigNumber | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [slipPct] = useState<number>(0.5);

  // refresh nonce to poke effects
  const [refreshNonce, setRefreshNonce] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  // pricing / underlying
  const [underlyingAddr, setUnderlyingAddr] = useState<string | null>(null);
  const [priceInUSD, setPriceInUSD] = useState<number>(0);
  const [priceOutUSD, setPriceOutUSD] = useState<number>(0);

  // source/vault link detection
  const [vaultSourceAddr, setVaultSourceAddr] = useState<string | null>(null);
  const [isVaultFromSource, setIsVaultFromSource] = useState<boolean>(false);

  // profitability ETA (computeTimeForPrice)
  const [profitUnix, setProfitUnix] = useState<number | null>(null);
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  // override checkbox
  const [forceAtLoss, setForceAtLoss] = useState<boolean>(false);

  // writers (defined once)
  const {
    data: approveHash,
    isPending: approving,
    writeContract: writeApprove,
  } = useWriteContract({
    mutation: {
      onSuccess: () =>
        toast("Approving prize token…", { position: toast.POSITION.BOTTOM_LEFT }),
      onError: () =>
        toast("Approve failed", { position: toast.POSITION.BOTTOM_LEFT }),
    },
  });
  const { isSuccess: approveMined, isFetching: approveMining } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    data: swapHash,
    isPending: swapping,
    writeContract: writeSwap,
  } = useWriteContract({
    mutation: {
      onSuccess: () =>
        toast("Submitting liquidation…", { position: toast.POSITION.BOTTOM_LEFT }),
      onError: () =>
        toast("Liquidation tx failed to submit", { position: toast.POSITION.BOTTOM_LEFT }),
    },
  });
  const { isSuccess: swapMined, isFetching: swapMining } =
    useWaitForTransactionReceipt({ hash: swapHash });

  const canBatch = useMemo(() => {
    if (!capabilities || !chainId) return false;
    return (
      (capabilities as any)?.[chainId]?.atomic?.status === "ready" ||
      (capabilities as any)?.[chainId]?.atomic?.status === "supported"
    );
  }, [capabilities, chainId]);

  // -------- load pair: tokens, maxOut, source (parallel) --------
  useEffect(() => {
    const loadPair = async () => {
      if (!provider || !pairParam) return;
      try {
        const pair = new ethers.Contract(
          pairParam,
          ABI.LIQUIDATIONPAIR as any,
          provider
        );

        const [tokenInAddr, tokenOutAddr, maxOut, sourceAddr] = await Promise.all([
          pair.tokenIn(),
          pair.tokenOut(),
          pair.callStatic.maxAmountOut(),
          pair.source().catch(() => ethers.constants.AddressZero),
        ]);

        const [inMeta, outMeta] = await Promise.all([
          loadERC20Meta(provider, tokenInAddr),
          loadERC20Meta(provider, tokenOutAddr),
        ]);

        setPairInfo({
          pairAddress: String(pairParam),
          tokenIn: inMeta,
          tokenOut: outMeta,
          maxOut,
        });
        setAmountOutStr(ethers.utils.formatUnits(maxOut, outMeta.decimals));

        // vault detection via source -> VAULT.twabController()
        if (ethers.utils.isAddress(sourceAddr)) {
          setVaultSourceAddr(sourceAddr);
          try {
            const vault = new ethers.Contract(sourceAddr, ABI.VAULT as any, provider);
            const twab = await vault.twabController();
            setIsVaultFromSource(ethers.utils.isAddress(twab));
          } catch {
            setIsVaultFromSource(false);
          }
        } else {
          setVaultSourceAddr(null);
          setIsVaultFromSource(false);
        }
      } catch (err) {
        console.error("Failed to load pair:", err);
        toast("Failed to load liquidation pair", {
          position: toast.POSITION.BOTTOM_LEFT,
        });
      }
    };
    loadPair();
  }, [provider, pairParam]);

  // -------- VAULT.asset() (tokenOut is expected vault share) --------
  useEffect(() => {
    const loadUnderlying = async () => {
      if (!pairInfo || !provider) return;
      try {
        const vault = new ethers.Contract(
          pairInfo.tokenOut.address,
          ABI.VAULT as any,
          provider
        );
        const assetAddr: string = await vault.asset();
        setUnderlyingAddr(assetAddr);
      } catch (e) {
        console.warn("failed to read VAULT.asset()", e);
        setUnderlyingAddr(null);
      }
    };
    loadUnderlying();
  }, [pairInfo, provider]);

  // -------- prices (PoolExplorer) --------
  const fetchPriceFromPoolExplorer = useCallback(async (chain: string, addr: string) => {
    try {
      const res = await fetch("https://poolexplorer.xyz/prices", { cache: "no-store" });
      const json = await res.json();
      const price = json?.assets?.[chain]?.[addr.toLowerCase()] || 0;
      return Number(price) || 0;
    } catch (e) {
      console.warn("price fetch failed", e);
      return 0;
    }
  }, []);

  const loadPrices = useCallback(async () => {
    if (!pairInfo || !chainNameFromUrl) return;
    const pInPromise = fetchPriceFromPoolExplorer(
      chainNameFromUrl,
      pairInfo.tokenIn.address
    );
    const pOutPromise = underlyingAddr
      ? fetchPriceFromPoolExplorer(chainNameFromUrl, underlyingAddr)
      : Promise.resolve(0);
    const [pIn, pOut] = await Promise.all([pInPromise, pOutPromise]);

    dgroup("Prices loaded", () => {
      dlog("tokenIn", pairInfo?.tokenIn.address);
      dlog("underlying", underlyingAddr);
      dlog("priceInUSD", pIn);
      dlog("priceOutUSD", pOut);
    });

    setPriceInUSD(pIn || 0);
    setPriceOutUSD(pOut || 0);
  }, [pairInfo, chainNameFromUrl, underlyingAddr, fetchPriceFromPoolExplorer]);

  useEffect(() => {
    loadPrices();
  }, [loadPrices, refreshNonce]);

  // -------- quote computeExactAmountIn(out) --------
  const refreshQuote = useCallback(async () => {
    if (!pairInfo || !provider) return;
    const amountOut = toUnits(amountOutStr, pairInfo.tokenOut.decimals);
    if (amountOut.lte(0)) {
      setAmountInRequired(null);
      return;
    }
    try {
      setLoadingQuote(true);
      const pair = new ethers.Contract(
        pairInfo.pairAddress,
        ABI.LIQUIDATIONPAIR as any,
        provider
      );
      const need: ethers.BigNumber = await pair.callStatic.computeExactAmountIn(
        amountOut
      );

      dgroup("Quote computeExactAmountIn", () => {
        dlog("amountOutStr", amountOutStr);
        dlog("amountOut(units)", amountOut.toString());
        dlog("amountInRequired", need.toString());
      });

      setAmountInRequired(ethers.BigNumber.from(need));
    } catch (e) {
      console.error("quote failed:", e);
      setAmountInRequired(null);
    } finally {
      setLoadingQuote(false);
    }
  }, [pairInfo, provider, amountOutStr]);

  useEffect(() => {
    refreshQuote();
  }, [refreshQuote, refreshNonce]);

  // -------- allowance & balance --------
  const [allowance, setAllowance] = useState<ethers.BigNumber | null>(null);
  const [prizeBal, setPrizeBal] = useState<ethers.BigNumber | null>(null);

  const loadAllowances = useCallback(async () => {
    if (!provider || !address || !routerAddress || !pairInfo) return;
    try {
      const erc = new ethers.Contract(
        pairInfo.tokenIn.address,
        ABI.ERC20 as any,
        provider
      );
      const [allow, bal] = await Promise.all([
        erc.allowance(address, routerAddress),
        erc.balanceOf(address),
      ]);
      setAllowance(allow);
      setPrizeBal(bal);
    } catch (e) {
      console.warn("allowance/balance load:", e);
    }
  }, [provider, address, routerAddress, pairInfo]);

  useEffect(() => {
    loadAllowances();
  }, [loadAllowances, swapMined, approveMined, refreshNonce]);

  // -------- derived displays & math --------
  const amountOut = useMemo(
    () =>
      pairInfo
        ? toUnits(amountOutStr, pairInfo.tokenOut.decimals)
        : ethers.constants.Zero,
    [amountOutStr, pairInfo]
  );

  const amountInTokens = useMemo(
    () =>
      amountInRequired && pairInfo
        ? Number(
            ethers.utils.formatUnits(amountInRequired, pairInfo.tokenIn.decimals)
          )
        : 0,
    [amountInRequired, pairInfo]
  );

  const amountOutTokens = useMemo(
    () =>
      pairInfo
        ? Number(ethers.utils.formatUnits(amountOut, pairInfo.tokenOut.decimals))
        : 0,
    [amountOut, pairInfo]
  );

  const valueInUSD = useMemo(
    () => amountInTokens * (priceInUSD || 0),
    [amountInTokens, priceInUSD]
  );
  const valueOutUSD = useMemo(
    () => amountOutTokens * (priceOutUSD || 0),
    [amountOutTokens, priceOutUSD]
  );
  const valueDeltaUSD = useMemo(
    () => valueOutUSD - valueInUSD,
    [valueOutUSD, valueInUSD]
  );

  const isValueProfitable = valueOutUSD > 0 && valueInUSD > 0 && valueOutUSD >= valueInUSD;
  const isProfitableOrOverride = (isValueProfitable || (forceAtLoss && !!amountInRequired));

  const amountInMax = useMemo(() => {
    if (!amountInRequired || !pairInfo) return ethers.constants.Zero;
    const mult = slippageMultiplier(slipPct);
    const asFloat =
      Number(
        ethers.utils.formatUnits(amountInRequired, pairInfo.tokenIn.decimals)
      ) * mult;
    return ethers.utils.parseUnits(
      asFloat.toFixed(pairInfo.tokenIn.decimals),
      pairInfo.tokenIn.decimals
    );
  }, [amountInRequired, pairInfo, slipPct]);

  // flags for action button
  const onRightChain = useMemo(() => {
    if (!chainNameFromUrl || chainId == null) return true;
    return GetChainName(chainId) === chainNameFromUrl;
  }, [chainId, chainNameFromUrl]);

  const hasWallet = !!address;
  const hasRouter = !!routerAddress;
  const amountsValid =
    !!(amountInRequired && amountInRequired.gt(0)) &&
    !!(amountOut && amountOut.gt(0));
  const hasBalance =
    !!(prizeBal && amountInRequired && prizeBal.gte(amountInRequired));
  const processing =
    approving || approveMining || swapping || swapMining || isBatching || loadingQuote;

  const needsApprove = useMemo(() => {
    if (!amountInRequired || !allowance) return true;
    try {
      return allowance.lt(amountInRequired);
    } catch {
      return true;
    }
  }, [allowance, amountInRequired]);

  // single-button decision (with debug)
  const action = useMemo(() => {
    dgroup("Action decision", () => {
      const labelPreview =
        (!hasWallet || !hasRouter) ? "CONNECT WALLET" :
        (!onRightChain && targetChainIdFromUrl) ? "SWITCH NETWORKS" :
        (!amountsValid) ? "ENTER VALID AMOUNTS" :
        (!(isValueProfitable || (forceAtLoss && !!amountInRequired))) ? "NOT PROFITABLE" :
        (!hasBalance) ? "NOT ENOUGH PRIZE TOKEN" :
        (processing) ? "PROCESSING" :
        (needsApprove && canBatch) ? "APPROVE + SWAP" :
        (needsApprove) ? "APPROVE" : "SWAP";
      dlog({
        hasWallet, hasRouter, onRightChain, amountsValid,
        isValueProfitable, forceAtLoss, hasBalance,
        processing, needsApprove, canBatch, labelPreview
      });
    });

    if (!hasWallet || !hasRouter)
      return { label: "CONNECT WALLET", disabled: true as const };

    if (!onRightChain && targetChainIdFromUrl)
      return { label: "SWITCH NETWORKS", disabled: false as const, type: "switch" as const };

    if (!amountsValid) return { label: "ENTER VALID AMOUNTS", disabled: true as const };

    if (!isProfitableOrOverride) return { label: "NOT PROFITABLE", disabled: true as const };

    if (!hasBalance) return { label: "NOT ENOUGH PRIZE TOKEN", disabled: true as const };

    if (processing) return { label: "PROCESSING", disabled: true as const };

    if (needsApprove && canBatch)
      return { label: "APPROVE + SWAP", disabled: false as const, type: "batch" as const };

    if (needsApprove)
      return { label: "APPROVE", disabled: false as const, type: "approve" as const };

    return { label: "SWAP", disabled: false as const, type: "swap" as const };
  }, [
    hasWallet,
    hasRouter,
    onRightChain,
    targetChainIdFromUrl,
    amountsValid,
    isProfitableOrOverride,
    hasBalance,
    processing,
    needsApprove,
    canBatch,
    isValueProfitable,
    forceAtLoss,
    amountInRequired,
  ]);

  // -------- actions --------
  const refreshMaxOut = async () => {
    if (!pairInfo || !provider) return;
    try {
      const pair = new ethers.Contract(
        pairInfo.pairAddress,
        ABI.LIQUIDATIONPAIR as any,
        provider
      );
      const freshMax: ethers.BigNumber = await pair.callStatic.maxAmountOut();
      setAmountOutStr(
        ethers.utils.formatUnits(freshMax, pairInfo.tokenOut.decimals)
      );
    } catch (e) {
      console.warn("maxAmountOut refresh failed", e);
    }
  };

  const doApproveOnly = async () => {
    if (!pairInfo || !routerAddress || !writeApprove || !amountInRequired) return;
    writeApprove({
      address: pairInfo.tokenIn.address as `0x${string}`,
      abi: ABI.ERC20 as any,
      functionName: "approve",
      args: [routerAddress, amountInMax as any],
    });
  };

  const doSwapOnly = async () => {
    if (!pairInfo || !routerAddress || !writeSwap || !address) return;
    const deadline = Math.floor(Date.now() / 1000) + 120;
    writeSwap({
      address: routerAddress as `0x${string}`,
      abi: ABI.LIQUIDATIONROUTER as any,
      functionName: "swapExactAmountOut",
      args: [pairInfo.pairAddress, address, amountOut as any, amountInMax as any, deadline],
    });
  };

  const doBatchApproveAndSwap = async () => {
    if (!address || !routerAddress || !pairInfo || !canBatch) return;
    try {
      const deadline = Math.floor(Date.now() / 1000) + 120;
      const approveData = encodeFunctionData({
        abi: ABI.ERC20 as any,
        functionName: "approve",
        args: [routerAddress, amountInMax],
      });
      const swapData = encodeFunctionData({
        abi: ABI.LIQUIDATIONROUTER as any,
        functionName: "swapExactAmountOut",
        args: [pairInfo.pairAddress, address, amountOut, amountInMax, deadline],
      });

      sendCalls({
        account: address as `0x${string}`,
        chainId: chainId!,
        calls: [
          { to: pairInfo.tokenIn.address as `0x${string}`, data: approveData },
          { to: routerAddress as `0x${string}`, data: swapData },
        ],
      });
      toast("Submitting batched approve + liquidation…", {
        position: toast.POSITION.BOTTOM_LEFT,
      });
    } catch (e) {
      console.error("batch error", e);
      toast("Batch failed; see console", {
        position: toast.POSITION.BOTTOM_LEFT,
      });
    }
  };

  const onClickAction = async () => {
    if (action.disabled) { dlog("Action click ignored (disabled)"); return; }
    dlog("Action click", action);
    if (action.type === "switch" && targetChainIdFromUrl) {
      return switchChain?.({ chainId: targetChainIdFromUrl });
    }
    if (action.type === "batch") return doBatchApproveAndSwap();
    if (action.type === "approve") return doApproveOnly();
    if (action.type === "swap") return doSwapOnly();
  };

  useEffect(() => {
    if (approveMined) {
      toast("Approve confirmed. Now swapping…", {
        position: toast.POSITION.BOTTOM_LEFT,
      });
      doSwapOnly();
    }
  }, [approveMined]);

  // On success, auto-refresh data (and once more shortly after)
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refreshMaxOut(), loadPrices(), loadAllowances()]);
    await refreshQuote();
  }, [refreshMaxOut, loadPrices, loadAllowances, refreshQuote]);

  useEffect(() => {
    const success = (callStatus as any)?.status === "success" || swapMined;
    if (success) {
      toast("Liquidation complete!", { position: toast.POSITION.BOTTOM_LEFT });
      refreshAll();
      setTimeout(refreshAll, 2500); // small follow-up to reflect new on-chain state
    } else if ((callStatus as any)?.status === "failure") {
      toast("Liquidation failed", { position: toast.POSITION.BOTTOM_LEFT });
    }
  }, [callStatus, swapMined, swapHash, refreshAll]);

  // -------- computeTimeForPrice (breakeven) --------
  const refreshETA = useCallback(async () => {
    if (!pairInfo || !provider) { dlog("ETA: skip (no pair/provider)"); setProfitUnix(null); return; }
    if (!priceInUSD || !priceOutUSD) { dlog("ETA: skip (missing prices)", { priceInUSD, priceOutUSD }); setProfitUnix(null); return; }

    try {
      const outUSD = valueOutUSD;
      if (outUSD <= 0 || priceInUSD <= 0) {
        dlog("ETA: skip (non-positive outUSD or priceInUSD)", { outUSD, priceInUSD });
        setProfitUnix(null);
        return;
      }
      // tokens of tokenIn needed so USD_in == USD_out
      const neededInTokens = outUSD / priceInUSD;

      // Avoid huge strings; precision to ~8 decimals is fine for ETA:
      const decimals = Math.min(pairInfo.tokenIn.decimals, 8);
      const targetUnits = ethers.utils.parseUnits(
        neededInTokens.toFixed(decimals),
        pairInfo.tokenIn.decimals
      );

      dgroup("ETA: inputs", () => {
        dlog("pair", pairInfo.pairAddress);
        dlog("tokenIn", { address: pairInfo.tokenIn.address, decimals: pairInfo.tokenIn.decimals, symbol: pairInfo.tokenIn.symbol });
        dlog("tokenOut", { address: pairInfo.tokenOut.address, decimals: pairInfo.tokenOut.decimals, symbol: pairInfo.tokenOut.symbol });
        dlog("prices", { priceInUSD, priceOutUSD });
        dlog("amountOutTokens", amountOutTokens);
        dlog("valueOutUSD", outUSD);
        dlog("neededInTokens(breakeven)", neededInTokens);
        dlog("targetUnits(parseUnits)", targetUnits.toString());
      });

      const pair = new ethers.Contract(
        pairInfo.pairAddress,
        ABI.LIQUIDATIONPAIR as any,
        provider
      );
      const tsBN: ethers.BigNumber = await pair.computeTimeForPrice(
        targetUnits
      );
      const ts = Number(tsBN.toString());

      dgroup("ETA: result", () => {
        dlog("computeTimeForPrice =>", tsBN.toString(), new Date(ts * 1000).toISOString());
        dlog("now", nowSec, new Date(nowSec * 1000).toISOString());
        dlog("isProfitableAlready?", isValueProfitable);
      });

      setProfitUnix(Number.isFinite(ts) && ts > 0 ? ts : null);
    } catch (e) {
      console.warn("[liquidate] computeTimeForPrice failed", e);
      setProfitUnix(null);
    }
  }, [pairInfo, provider, priceInUSD, priceOutUSD, valueOutUSD, amountOutTokens, isValueProfitable]);

  useEffect(() => {
    // debounce a bit to avoid spam when inputs change rapidly
    const t = setTimeout(() => {
      refreshETA();
    }, 200);
    return () => clearTimeout(t);
  }, [refreshETA, amountOutStr]);

  // live countdown tick (with logs)
  useEffect(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
      dlog("ETA: cleared previous tick");
    }
    if (profitUnix && profitUnix > Math.floor(Date.now() / 1000)) {
      dlog("ETA: start tick");
      tickRef.current = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    } else {
      dlog("ETA: not starting tick (no profitUnix or already past)");
    }
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
        dlog("ETA: cleanup tick");
      }
    };
  }, [profitUnix]);

  const profitableInLabel = useMemo(() => {
    if (profitUnix == null) {
      dlog("ETA: label -> '—' (null profitUnix)");
      return "—";
    }
    if (profitUnix <= nowSec) {
      dlog("ETA: label -> 'now'", { profitUnix, nowSec });
      return "now";
    }
    const label = formatDuration(profitUnix - nowSec);
    dlog("ETA: label", { profitUnix, nowSec, label });
    return label;
  }, [profitUnix, nowSec]);

  const vaultBackUrl = useMemo(() => {
    if (!isVaultFromSource || !vaultSourceAddr) return null;
    const c = targetChainIdFromUrl || chainId || 10;
    return `https://pooltime.xyz/vault?chain=${c}&address=${vaultSourceAddr}`;
  }, [isVaultFromSource, vaultSourceAddr, targetChainIdFromUrl, chainId]);

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          {vaultBackUrl ? (
            <a href={vaultBackUrl} target="_blank" rel="noreferrer">
              <div className="back-to-vaults" style={{ marginTop: 12 }}>
                ← Back to vault
              </div>
            </a>
          ) : null}
        </div>

        <div className="vault-view-bubble">
          <div>
            <span className="vault-header-name">
              <span style={{ color: "#E1F5F9", padding: 10 }}>
                Liquidate {chainNameFromUrl ? "on " + chainNameFromUrl : ""}
              </span>
            </span>
          </div>

          <div className="vault-container">
            <div className="vault-content">
              {!pairInfo ? (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <div className="spinner-large" />
                </div>
              ) : (
                <>
                  <div className="data-row">
                    <span className="vault-label">Pair</span>
                    <span className="vault-data small-font">
                      <span className="hidden-mobile">
                        {pairInfo.pairAddress}
                      </span>
                      <span className="hidden-desktop">
                        {pairInfo.pairAddress.substring(0, 12)}...
                      </span>
                    </span>
                  </div>

                  <div className="data-row">
                    <span className="vault-label">Token In</span>
                    <span className="vault-data">
                      {fmt(amountInRequired ?? 0, pairInfo.tokenIn.decimals)}{" "}
                      {pairInfo.tokenIn.symbol}
                    </span>
                  </div>

                  <div className="data-row">
                    <span className="vault-label">Token Out</span>
                    <span className="vault-data">
                      {fmt(amountOut, pairInfo.tokenOut.decimals)}{" "}
                      {pairInfo.tokenOut.symbol}
                    </span>
                  </div>

                  <div className="data-row">
                    <span className="vault-label">Value In (USD)</span>
                    <span className="vault-data">
                      ${NumberWithCommas(CropDecimals(valueInUSD.toFixed(2)))}
                    </span>
                  </div>

                  <div className="data-row">
                    <span className="vault-label">Value Out (USD)</span>
                    <span className="vault-data">
                      ${NumberWithCommas(CropDecimals(valueOutUSD.toFixed(2)))}
                    </span>
                  </div>

                  <div className="data-row">
                    <span className="vault-label">
                      Net (USD)
                      <button
                        aria-label="Refresh"
                        title="Refresh"
                        className="refresh-icon-btn"
                        onClick={() => {
                          dlog("Manual refresh clicked");
                          bumpRefresh();
                          refreshAll();
                        }}
                      >
                        ⟲
                      </button>
                    </span>
                    <span
                      className="vault-data"
                      style={{
                        backgroundColor: isValueProfitable ? "#c6e2c6" : "#f4d0d0",
                      }}
                    >
                      {valueDeltaUSD >= 0 ? "+" : "-"}$
                      {NumberWithCommas(
                        CropDecimals(Math.abs(valueDeltaUSD).toFixed(2))
                      )}
                    </span>
                  </div>

                  {/* Profitable In (live countdown if in future) */}
                  {/* <div className="data-row">
                    <span className="vault-label">Profitable ETA</span>
                    <span className="vault-data">{profitableInLabel}</span>
                  </div> */}

                  {/* SINGLE centered action button below the Net row */}
                  <div
                    className="liquidate-action-row"
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "center",
                      marginTop: 16,
                      paddingTop: 8,
                    }}
                  >
                    <button
                      className={`vault-button liquidate-action-btn${
                        action.disabled ? " no-cursor" : ""
                      }`}
                      style={{
                        textTransform: "uppercase",
                        position: "relative",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: 0,
                      }}
                      disabled={action.disabled}
                      onClick={onClickAction}
                    >
                      {action.label}
                    </button>
                  </div>

                  {/* Swap-at-loss override (centered to match button row) */}
                  {!isValueProfitable && amountsValid ? (
                    <div className="override-row">
                      <label className="small-font override-label">
                        <input
                          type="checkbox"
                          checked={forceAtLoss}
                          onChange={(e) => setForceAtLoss(e.target.checked)}
                          className="override-checkbox"
                        />
                        Swap at a LOSS
                      </label>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>

        <ToastContainer style={{ zIndex: 9999 }} />

        {/* defensively override any inherited weird positioning */}
        <style jsx>{`
          .liquidate-action-row { width: 100%; }
          .liquidate-action-btn {
            position: relative !important;
            float: none !important;
          }
          .refresh-icon-btn {
            margin-left: 8px;
            border: none;
            background: transparent;
            cursor: pointer;
            height: 20px;
            width: 20px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            line-height: 1;
            opacity: 0.9;
            padding: 0;
            vertical-align: middle;
          }
          .refresh-icon-btn:hover { opacity: 1; }

          /* Center the override row exactly under the action button */
          .override-row {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 8px;
          }
          .override-label {
            display: inline-flex;
            align-items: center;
            margin: 0;
            padding: 0;
          }
          .override-checkbox {
            margin: 0 8px 0 0;
            vertical-align: middle;
          }
        `}</style>
      </div>
    </Layout>
  );
};

export default LiquidatePage;
