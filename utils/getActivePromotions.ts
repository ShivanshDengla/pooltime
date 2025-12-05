// import { CONFIG, ADDRESS } from "../constants/";
// import { FetchPriceForAsset } from "./tokenPrices";
// import { useOverview } from "../components/contextOverview";

async function fetchPromotions(meta:boolean): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const fetchUrl = meta ? "https://poolexplorer.xyz/metatwabrewards" : "https://poolexplorer.xyz/twabrewards";
    const response = await fetch(fetchUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error("failed to fetch twab rewards from api");
    }
    const result = await response.json();
    return result;
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function calculateTokensPerSecond(
  tokensPerEpoch: string,
  epochDuration: string
): number {
  return parseInt(tokensPerEpoch) / parseInt(epochDuration);
}

// async function fetchPricesForTokens(tokenIds: string[]): Promise<Record<string, any>> {
//     if (tokenIds.length === 0) {
//         return {};
//     }
//     const url = `https://api.coingecko.com/api/v3/simple/price?ids=${tokenIds.join(',')}&vs_currencies=usd`;
//     const response = await fetch(url);
//     const prices: Record<string, any> = await response.json();
//     return prices;
// }

export async function GetActivePromotionsForVaults(
  vaults: any[],
  active = false,
  priceData: any,
  meta = false,
  chainName: string,
): Promise<any[]> {
  // console.log("vaults input:", vaults);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const data = await fetchPromotions(meta);

  let allPromotions: any = [];
  
  // Iterate over each chain in the data
  for (const chain in data) {
    if (data.hasOwnProperty(chain) && data[chain].length > 0) {
      const promotions = data[chain];
      let lowercaseVaultAddresses = vaults.map((vault) => vault.toLowerCase());

      // console.log(`Processing chain: ${chain}, promotions count: ${promotions.length}`);
      // console.log("Lowercase vault addresses:", lowercaseVaultAddresses);

      // Filter active promotions based on currentTimestamp and vault addresses
      const activePromotionsWithTokens = promotions.filter((promo: any) => {
        const promoStart = parseInt(promo.startTimestamp);
        const promoEnd =
          promoStart +
          parseInt(promo.epochDuration) * parseInt(promo.initialNumberOfEpochs);
        let isValidVault = true
        if(!meta){
        const isValidVault = lowercaseVaultAddresses.includes(promo.vault.toLowerCase());}
        const isWithinTimeframe = currentTimestamp >= promoStart && (!active || currentTimestamp < promoEnd);

        // console.log(`Promo vault: ${promo.vault}, is valid vault: ${isValidVault}, is within timeframe: ${isWithinTimeframe}`);

        return isValidVault && isWithinTimeframe;
      });

      // console.log(`Active promotions for chain ${chain}:`, activePromotionsWithTokens);

      // Filter promotions with valid prices from the price data
      const validPromotionsWithPrices = activePromotionsWithTokens
        .map((promo: any) => {
          const price = priceData.assets[chain]?.[promo.token.toLowerCase()];
          // console.log(`Promo token: ${promo.token}, Price found: ${price}`);

          if (price) {
            return {
              ...promo,
              tokenDecimals: promo.tokenDecimals,
              tokensPerSecond: calculateTokensPerSecond(
                promo.tokensPerEpoch,
                promo.epochDuration
              ),
              price: price,
              epochStartedAt: determineEpochStatus(currentTimestamp, promo),
              chain: chain, // Add chain information to the promotion
              meta: meta,
            };
          }
          return null;
        })
        .filter((promo: any) => promo !== null);

      allPromotions = allPromotions.concat(validPromotionsWithPrices);
      // console.log("All promotions with valid prices:", allPromotions);
    }
  }

  // Group promotions by vault addresses
  const promotionsByVault = vaults.reduce((acc, vaultAddress) => {
    let vaultPromotions = allPromotions
    if (meta) {
      vaultPromotions = allPromotions
        .filter((promo: any) => promo.chain === chainName)
        .map((promo: any) => ({ ...promo, vault: vaultAddress })); // ✅ Add vault manually
    }
  
    else{
      vaultPromotions = allPromotions.filter(
        (promo: any) => promo.vault.toLowerCase() === vaultAddress.toLowerCase()
      )
    }

    // console.log(meta ? "meta":"",`Promotions for vault ${vaultAddress}:`, vaultPromotions);

    if (vaultPromotions.length > 0) {
      acc[vaultAddress.toLowerCase()] = vaultPromotions;
    }

    return acc;
  }, {});

  // console.log("Final promotions grouped by vault:", promotionsByVault);
  return promotionsByVault;
}


// Helper function to determine the status of the epoch as a Unix timestamp
function determineEpochStatus(currentTimestamp: any, promo: any) {
  const promoStart = parseInt(promo.startTimestamp);
  const epochDuration = parseInt(promo.epochDuration);
  const promoEnd =
    promoStart + epochDuration * parseInt(promo.initialNumberOfEpochs);

  let currentEpochStart;
  // Check if the current epoch is the first epoch
  if (currentTimestamp < promoStart + epochDuration) {
    currentEpochStart = promoStart; // Return start timestamp for the first epoch
  } else if (currentTimestamp >= promoEnd) {
    currentEpochStart = promoEnd - epochDuration; // Return end timestamp if all epochs are finished
  } else {
    // Calculate the start of the current epoch
    const elapsed = currentTimestamp - promoStart;
    const currentEpochNumber = Math.floor(elapsed / epochDuration);
    currentEpochStart = promoStart + currentEpochNumber * epochDuration;
  }
  // console.log("determine status",promo,currentTimestamp,"epoch start",currentEpochStart)

  return currentEpochStart;
}


