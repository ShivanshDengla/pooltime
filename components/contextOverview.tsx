// src/context/OverviewContext.tsx
import React, { ReactNode, createContext, useState, useEffect, useContext } from 'react';

interface OverviewProviderProps {
  children: ReactNode;
}

type Currency = 'USD' | 'ETH'; // Add more currencies as needed

interface TierData {
  tier: number;
  value: number;
  count: number;
  liquidity: number;
}

interface Prizes {
  drawPeriodSeconds: number;
  nextDrawId: number;
  numberOfTiers: number;
  prizePoolPrizeBalance: string;
  tierData: TierData[];
}

interface ChainOverview {
  total: string;
  prizes: Prizes;
}

interface PendingPrize {
  [chain: string]: ChainOverview;
}

interface Prices {
  geckos: {
    [key: string]: number;
  };
  assets: {
    [chain: string]: {
      [asset: string]: number;
    };
  };
  timestamp?: string;
}

interface Overview {
  pendingPrize: PendingPrize;
  prices: Prices;
}

interface OverviewContextProps {
  overview: Overview | null;
  currency: Currency;
  toggleCurrency: () => void;
  isLoading: boolean;
}

const OverviewContext = createContext<OverviewContextProps | null>(null);

export const OverviewProvider: React.FC<OverviewProviderProps> = ({ children }) => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      const timeoutMs = 2000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const overviewFetch = await fetch(`https://poolexplorer.xyz/overview`, {
          signal: controller.signal,
        });
        if (!overviewFetch.ok) {
          throw new Error(`HTTP ${overviewFetch.status}`);
        }
        const overviewReceived = await overviewFetch.json();
        setOverview(overviewReceived);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Failed to fetch overview:', error);
        }
        // Set empty fallback data so app continues to work
        setOverview({
          pendingPrize: {},
          prices: {
            geckos: {},
            assets: {},
          },
        });
      } finally {
        clearTimeout(timer);
        setIsLoading(false);
      }
    };

    fetchOverview();
  }, []);

  const toggleCurrency = () => {
    setCurrency((prevCurrency) => (prevCurrency === 'USD' ? 'ETH' : 'USD'));
  };

  return (
    <OverviewContext.Provider value={{ overview, currency, toggleCurrency, isLoading }}>
      {children}
    </OverviewContext.Provider>
  );
};

// Hook to use the overview context
export const useOverview = () => {
  const context = useContext(OverviewContext);
  if (!context) {
    throw new Error('useOverview must be used within an OverviewProvider');
  }
  return context;
};
