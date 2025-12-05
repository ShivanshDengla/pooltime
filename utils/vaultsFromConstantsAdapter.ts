import { Addresses } from "../constants";
import { ADDRESS } from "../constants";

type VaultAPIFormat = {
    vault: string;
    name: string;
    symbol: string;
    decimals: number;
    asset: string;
    owner: string; // Placeholder, as ownership is not defined in `ADDRESS`
    liquidationPair: string;
    assetSymbol: string;
    tvl: string; // Placeholder, default to "0" if unavailable
    poolers: number; // Placeholder, default to 0
    pp: string; // Use the prize pool address
    c: number; // Use the chain ID
  };
  
  const adaptVaults = (addressFile: Addresses): VaultAPIFormat[] => {
    const result: VaultAPIFormat[] = [];
  
  for (const chainKey in addressFile) {
    const chain = addressFile[chainKey];
    const chainID = chain.CHAINID || 0;
    const prizePool = chain.PRIZEPOOL;

    chain.VAULTS.forEach((vault) => {
      if (!vault.VAULT) {
        return; // Skip invalid/empty vaults
      }
      result.push({
        vault: vault.VAULT,
        name: vault.NAME,
        symbol: vault.SYMBOL,
        decimals: vault.DECIMALS,
        asset: vault.ASSET,
        owner: "0x0000000000000000000000000000000000000000", // Placeholder for now
        liquidationPair:
          vault.LIQUIDATIONPAIR ||
          "0x0000000000000000000000000000000000000000",
        assetSymbol: vault.ASSETSYMBOL,
        tvl: "0", // Placeholder, can be updated with real TVL data
        poolers: 0, // Placeholder, can be updated with real data
        pp: prizePool,
        c: chainID,
      });
    });
  }
  
    return result;
  };
  
  // Example usage
  export const vaultsAPIFormatted = adaptVaults(ADDRESS);
  console.log(vaultsAPIFormatted);
  