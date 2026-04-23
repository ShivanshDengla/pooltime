// src/context/RewardsContext.tsx
import React, { ReactNode, createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { ethers } from "ethers";
import { vaultsAPIFormatted } from "../utils/vaultsFromConstantsAdapter";
import { VaultData, groupVaultsByChain } from "../utils/vaultHelpers";
import { GetChainName } from "../utils/getChain";
import { GetVaultBalances } from "../utils/getVaultBalances";
import { GetActivePromotionsForVaults } from "../utils/getActivePromotions";
import { GetUsersAwards } from "../utils/getUserRewards";
import { WHITELIST_REWARDS } from "../constants/address";

interface RewardsProviderProps {
  children: ReactNode;
}

interface ClaimableReward {
  token: string;
  symbol: string;
  amount: string;
  decimals: number;
  promotionId: number;
  completedEpochs: number[];
  chainId: number;
  meta?: boolean;
}

interface RewardsData {
  vaults: VaultData[];
  ticketVaults: VaultData[];
  promotionsByVault: Record<string, any[]>;
  claimableByVault: Record<string, ClaimableReward[]>;
  isLoading: boolean;
  lastUpdated: number;
}

interface RewardsContextProps {
  rewardsData: Record<string, RewardsData>;
  fetchRewards: (address: string, overview: any) => Promise<void>;
  invalidateRewards: (address: string) => void;
  getRewardsForAddress: (address: string) => RewardsData | null;
}

const RewardsContext = createContext<RewardsContextProps | null>(null);

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;

export const RewardsProvider: React.FC<RewardsProviderProps> = ({ children }) => {
  const [rewardsData, setRewardsData] = useState<Record<string, RewardsData>>({});
  const [vaultsCache, setVaultsCache] = useState<VaultData[]>([]);
  const fetchingAddressesRef = useRef<Set<string>>(new Set());

  // Fetch vault list once and cache it
  useEffect(() => {
    let cancelled = false;
    const fetchVaults = async () => {
      if (vaultsCache.length > 0) return; // Already cached
      
      let vaultList: VaultData[] = vaultsAPIFormatted as any;
      try {
        const resp = await fetch("https://poolexplorer.xyz/vaults");
        if (resp.ok) {
          vaultList = await resp.json();
        }
      } catch (err) {
        console.error("Failed to fetch vault list for rewards context", err);
      } finally {
        if (!cancelled) {
          setVaultsCache(vaultList);
        }
      }
    };
    fetchVaults();
    return () => {
      cancelled = true;
    };
  }, [vaultsCache.length]);

  const fetchRewards = useCallback(async (address: string, overview: any) => {
    if (!address || !overview?.prices?.assets) {
      return;
    }

    // Check if we're already fetching for this address
    if (fetchingAddressesRef.current.has(address)) {
      return;
    }

    // Check if we have fresh cached data
    const cached = rewardsData[address];
    if (cached && Date.now() - cached.lastUpdated < CACHE_DURATION) {
      return; // Use cached data
    }

    // Mark as fetching
    fetchingAddressesRef.current.add(address);

    try {
      // Set loading state
      setRewardsData(prev => ({
        ...prev,
        [address]: {
          ...(prev[address] || {
            vaults: [],
            ticketVaults: [],
            promotionsByVault: {},
            claimableByVault: {},
          }),
          isLoading: true,
        },
      }));

      const vaults = vaultsCache.length > 0 ? vaultsCache : vaultsAPIFormatted as any;

      // Fetch balances for the address to determine ticket holdings
      const validVaults = vaults.filter(
        (vault: any) =>
          typeof vault?.vault === "string" && ethers.utils.isAddress(vault.vault)
      );
      const grouped = groupVaultsByChain(validVaults);
      const balanceResults = await Promise.all(
        grouped.map(async ({ chainId, vaults: chainVaults }) => {
          const vaultAddresses = chainVaults.map((vault) => vault.vault);
          const assetAddresses = chainVaults.map((vault) => vault.asset);
          const balances = await GetVaultBalances(
            address,
            vaultAddresses,
            assetAddresses,
            GetChainName(chainId)
          );
          return { chainVaults, balances };
        })
      );

      const flattened = balanceResults.flatMap(({ chainVaults, balances }) =>
        chainVaults.map((vault) => {
          const balance = balances[vault.vault.toLowerCase()];
          const formattedVaultBalance = balance?.vaultBalance
            ? ethers.utils.formatUnits(balance.vaultBalance, vault.decimals)
            : "0";
          const numericVaultBalance = parseFloat(formattedVaultBalance);

          return {
            ...vault,
            vaultBalance: balance?.vaultBalance,
            formattedVaultBalance,
            numericVaultBalance,
          };
        })
      );

      const ticketVaults = flattened
        .filter(
          (vault) => vault.vaultBalance && !vault.vaultBalance.isZero()
        )
        .sort(
          (a, b) => (b.numericVaultBalance || 0) - (a.numericVaultBalance || 0)
        );

      if (ticketVaults.length === 0) {
        setRewardsData(prev => ({
          ...prev,
          [address]: {
            vaults: validVaults,
            ticketVaults: [],
            promotionsByVault: {},
            claimableByVault: {},
            isLoading: false,
            lastUpdated: Date.now(),
          },
        }));
        fetchingAddressesRef.current.delete(address);
        return;
      }

      // Fetch active promotions and claimable rewards
      const vaultAddresses = ticketVaults
        .map((v) => v.vault)
        .filter((vaultAddr) => ethers.utils.isAddress(vaultAddr));
      const promosResult = await GetActivePromotionsForVaults(
        vaultAddresses,
        true,
        overview.prices,
        false,
        ""
      );
      const promos = (promosResult as unknown) as Record<string, any[]>;

      const claimables: Record<string, ClaimableReward[]> = {};
      const groupedTicketVaults = groupVaultsByChain(ticketVaults);
      const tokenSymbolMap = Object.values(WHITELIST_REWARDS)
        .flat()
        .reduce((acc: any, tokenObj: any) => {
          acc[tokenObj.TOKEN.toLowerCase()] = tokenObj.SYMBOL;
          return acc;
        }, {});

      // Process all chains in parallel
      const rewardPromises = groupedTicketVaults.map(async ({ chainId, vaults: chainVaults }) => {
        const chainName = GetChainName(chainId);
        const vaultAddrs = chainVaults.map((v) => v.vault);
        try {
          const rewards = await GetUsersAwards(
            chainName,
            address,
            vaultAddrs,
            overview.prices,
            true
          );
          return { chainId, rewards, chainVaults };
        } catch (err) {
          console.error("Failed to fetch user rewards for chain", chainName, err);
          return { chainId, rewards: { completed: [] }, chainVaults };
        }
      });

      const rewardResults = await Promise.all(rewardPromises);

      // Process results and build claimables
      rewardResults.forEach(({ chainId, rewards, chainVaults }) => {
        rewards.completed.forEach((reward: any) => {
          const tokenAddr = reward.token?.toLowerCase();
          if (!tokenAddr) return;
          let amountBN: any =
            reward.totalRewards ?? reward.rewardAmount ?? 0;

          // Handle rewardAmount arrays
          if (Array.isArray(amountBN)) {
            amountBN = amountBN.reduce((acc: any, val: any) => {
              try {
                return acc.add(val);
              } catch {
                return acc;
              }
            }, ethers.BigNumber.from(0));
          }

          try {
            amountBN = ethers.BigNumber.from(amountBN);
          } catch {
            amountBN = ethers.BigNumber.from(0);
          }

          const amountStr = ethers.utils.formatUnits(
            amountBN,
            reward.decimals ?? 18
          );
          if (parseFloat(amountStr) <= 0) return;
          const vaultKey = reward.vault.toLowerCase();
          if (!claimables[vaultKey]) claimables[vaultKey] = [];
          claimables[vaultKey].push({
            token: tokenAddr,
            symbol:
              tokenSymbolMap[tokenAddr] ||
              `${tokenAddr.slice(0, 4)}...${tokenAddr.slice(-4)}`,
            amount: amountStr,
            decimals: reward.decimals ?? 18,
            promotionId: reward.promotionId,
            completedEpochs: reward.completedEpochs || [],
            chainId,
            meta: reward.meta,
          });
        });
      });

      setRewardsData(prev => ({
        ...prev,
        [address]: {
          vaults: validVaults,
          ticketVaults,
          promotionsByVault: promos || {},
          claimableByVault: claimables,
          isLoading: false,
          lastUpdated: Date.now(),
        },
      }));
    } catch (err) {
      console.error("Failed to fetch rewards", err);
      setRewardsData(prev => ({
        ...prev,
        [address]: {
          ...(prev[address] || {
            vaults: [],
            ticketVaults: [],
            promotionsByVault: {},
            claimableByVault: {},
          }),
          isLoading: false,
          lastUpdated: Date.now(),
        },
      }));
    } finally {
      fetchingAddressesRef.current.delete(address);
    }
  }, [vaultsCache, rewardsData]);

  const invalidateRewards = useCallback((address: string) => {
    setRewardsData(prev => {
      const next = { ...prev };
      if (next[address]) {
        delete next[address];
      }
      return next;
    });
  }, []);

  const getRewardsForAddress = useCallback((address: string): RewardsData | null => {
    return rewardsData[address] || null;
  }, [rewardsData]);

  return (
    <RewardsContext.Provider value={{ rewardsData, fetchRewards, invalidateRewards, getRewardsForAddress }}>
      {children}
    </RewardsContext.Provider>
  );
};

// Hook to use the rewards context
export const useRewards = () => {
  const context = useContext(RewardsContext);
  if (!context) {
    throw new Error('useRewards must be used within a RewardsProvider');
  }
  return context;
};

