import { GetActivePromotionsForVaults } from "./getActivePromotions";
import { Multicall } from "./multicall";
import { ethers } from "ethers";
import { ADDRESS } from "../constants/address";
import { ABI } from "../constants/abi";
import { PROVIDERS } from "../constants/providers";
import {CONTRACTS} from "../constants/contracts"
interface Reward {
  promotionId: number;
  rewardAmount: number;
  meta?: boolean;
  completedEpochs?: number[];
  token?: string;
  decimals?: number;
  price?: any;
  vault?: string;
  totalRewards?: any;
}
interface ActiveReward {
  token: string;
  decimals: number;
  price: any;
  epochStarted: number;
  epochDuration: number;
  vault: string;
  promotionId: number;
  accumulatedReward: any;
}

interface UserRewards {
  completed: Reward[];
  active: ActiveReward[];
}

export async function GetUsersAwards(
  chainName: string,
  userAddress: any,
  vaults: any,
  prices: any,
  whitelist = true
) {
  if (!chainName) {
    console.log("no chain for rewards");
    return { completed: [], active: [] };
  }

  let vaultAddresses;
  if (vaults.length > 0) {
    vaultAddresses = vaults;
  } else {
    const vaultsResponse = await fetch(`https://poolexplorer.xyz/vaults`);
    let vaults = await vaultsResponse.json();
    vaultAddresses = vaults.map((vault: any) => vault.vault);
  }

  // Fetch both regular and meta promotions in parallel
  const [activePromotions, activeMetaPromotions] = await Promise.all([
    GetActivePromotionsForVaults(
      vaultAddresses,
      false,
      prices,
      false,
      chainName
    ),
    GetActivePromotionsForVaults(
      vaultAddresses,
      false,
      prices,
      true,
      chainName
    ),
  ]);

  let completedEpochCalls = [];
  let activeEpochCalls = [];
  let completedPromotions = [];
  let activePromotionsData = [];
  let metaCompletedCalls = [];
  let metaCompletedPromotions = [];

  for (let address in activePromotions) {
    let promotions = activePromotions[address];
    for (let promo of promotions) {
      let epochStartedAt = parseInt(promo.epochStartedAt);
      let startTimestamp = parseInt(promo.startTimestamp);
      let epochDuration = parseInt(promo.epochDuration);
      let numberOfEpochs = parseInt(promo.initialNumberOfEpochs);
      let currentTime = Date.now() / 1000;

      if (startTimestamp + epochDuration < currentTime) {
        let completedEpochs = getCompletedEpochs(
          startTimestamp,
          epochDuration,
          numberOfEpochs,
          currentTime
        );
        if (completedEpochs.length > 0) {
          promo.completedEpochs = completedEpochs;
          const twabRewardsContract = new ethers.Contract(
            ADDRESS[chainName].TWABREWARDS,
            ABI.TWABREWARDS,
            PROVIDERS[chainName]
          );
          completedEpochCalls.push(
            twabRewardsContract.getRewardsAmount(
              userAddress,
              promo.promotionId,
              completedEpochs
            )
          );
          completedPromotions.push(promo);
        }
      }

      if (
        currentTime > startTimestamp &&
        currentTime < epochStartedAt + epochDuration
      ) {
        let nowTimeAdjusted = currentTime - 4000;
        let endTimestamp = Math.floor(
          Math.min(epochStartedAt + epochDuration, nowTimeAdjusted)
        );

        if (epochStartedAt < endTimestamp) {
          const twabControllerContract = new ethers.Contract(
            ADDRESS[chainName].TWABCONTROLLER,
            ABI.TWABCONTROLLER,
            PROVIDERS[chainName]
          );
          activeEpochCalls.push(
            twabControllerContract.getTwabBetween(
              address,
              userAddress,
              epochStartedAt,
              endTimestamp
            ),
            twabControllerContract.getTotalSupplyTwabBetween(
              address,
              epochStartedAt,
              endTimestamp
            )
          );
          activePromotionsData.push(promo);
        }
      }
    }
  }

  for (let address in activeMetaPromotions) {
    let promotions = activeMetaPromotions[address];
    for (let promo of promotions) {
      let startTimestamp = parseInt(promo.startTimestamp);
      let epochDuration = parseInt(promo.epochDuration);
      let numberOfEpochs = parseInt(promo.initialNumberOfEpochs);
      let currentTime = Date.now() / 1000;

      const completedEpochs = getCompletedEpochs(
        startTimestamp,
        epochDuration,
        numberOfEpochs,
        currentTime
      );

      if (completedEpochs.length > 0) {
        promo.completedEpochs = completedEpochs;
        const metaRewardsContract = new ethers.Contract(
          ADDRESS[chainName].METAREWARDS,
          ABI.METAREWARDS,
          PROVIDERS[chainName]
        );
     
        metaCompletedCalls.push(
          metaRewardsContract.callStatic.claimRewards(
            promo.vault,
            userAddress,
            promo.promotionId,
            completedEpochs
          )
        );
        metaCompletedPromotions.push(promo);
      }
    }
  }

  let completedRewards = await Multicall(completedEpochCalls, chainName);
  let activeRewardsData = await Multicall(activeEpochCalls, chainName);
  let metaRewardsData = await Multicall(metaCompletedCalls as any, chainName);

  let userRewards = calculateRewards(
    completedPromotions,
    completedRewards,
    activePromotionsData,
    activeRewardsData
  );

  // Append meta rewards to completed with meta: true
  metaCompletedPromotions.forEach((promo: any, index: number) => {
    // const rewardArray = metaRewardsData[index];
    // const rewardAmount = rewardArray.reduce((sum, r) => sum.add(r), ethers.BigNumber.from(0));    
    const rewardAmount = metaRewardsData[index] as any;
    if (rewardAmount.gt(0)) {
      userRewards.completed.push({
        completedEpochs: promo.completedEpochs,
        token: promo.token,
        decimals: promo.decimals,
        price: promo.price,
        vault: promo.vault,
        promotionId: promo.promotionId,
        rewardAmount: rewardAmount,
        totalRewards: rewardAmount,
        meta: true,
      });
    }
  });
// console.log("user rewards debug",userRewards)
  return userRewards;
}

function getCurrentEpoch(startTimestamp: any, epochDuration: any, currentTime: any) {
  if (currentTime < startTimestamp) return 0;
  return Math.floor((currentTime - startTimestamp) / epochDuration) + 1;
}

function getCompletedEpochs(startTimestamp: any, epochDuration: any, numberOfEpochs: any, currentTimestamp: any) {
  let completedEpochs = [];
  for (let epoch = 0; epoch < numberOfEpochs; epoch++) {
    let epochEndTime = startTimestamp + (epoch + 1) * epochDuration;
    if (epochEndTime <= currentTimestamp) {
      completedEpochs.push(epoch);
    } else {
      break;
    }
  }
  return completedEpochs;
}

function calculateRewards(completedPromotions: any, completedRewards: any, activePromotionsData: any, activeRewardsData: any): UserRewards {
  let userRewards: UserRewards = { completed: [], active: [] };

  completedPromotions.forEach((promo: any, index: any) => {
    let filteredCompletedEpochs = [];
    let filteredRewardAmounts = [];
    let totalRewards = ethers.BigNumber.from(0);

    for (let i = 0; i < promo.completedEpochs.length; i++) {
      if (completedRewards[index][i].gt(ethers.BigNumber.from(0))) {
        filteredCompletedEpochs.push(promo.completedEpochs[i]);
        filteredRewardAmounts.push(completedRewards[index][i]);
        totalRewards = totalRewards.add(completedRewards[index][i]);
      }
    }

    if (filteredCompletedEpochs.length > 0) {
      userRewards.completed.push({
        completedEpochs: filteredCompletedEpochs,
        token: promo.token,
        decimals: promo.decimals,
        price: promo.price,
        vault: promo.vault,
        promotionId: promo.promotionId,
        rewardAmount: filteredRewardAmounts as any,
        totalRewards: totalRewards,
      });
    }
  });

  activePromotionsData.forEach((promo: any, index: any) => {
    let userTwab = activeRewardsData[index * 2];
    let totalTwab = activeRewardsData[index * 2 + 1];

    let currentTime = Math.floor(Date.now() / 1000);
    let nowTimeAdjusted = currentTime - 4000;
    let epochEndTime = Math.min(promo.epochStartedAt + promo.epochDuration, nowTimeAdjusted);
    let timeActive = epochEndTime - promo.epochStartedAt;

    let rewardsForEpoch = (promo.tokensPerSecond / 1e18) * timeActive;
    let userShare = userTwab / totalTwab;
    let accumulatedReward = rewardsForEpoch * userShare;

    if (accumulatedReward > 0) {
      userRewards.active.push({
        token: promo.token,
        decimals: promo.decimals,
        price: promo.price,
        epochStarted: promo.epochStartedAt,
        epochDuration: promo.epochDuration,
        vault: promo.vault,
        promotionId: promo.promotionId,
        accumulatedReward: accumulatedReward,
      });
    }
  });

  return userRewards;
}