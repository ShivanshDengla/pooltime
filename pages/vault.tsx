import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { ABI, ADDRESS, PROVIDERS, CONFIG } from "../constants";
import { MyConnect } from "../components/connectButton";
import { Multicall } from "../utils/multicall";
import { useAccount, useSimulateContract } from "wagmi";
import { NumberWithCommas, CropDecimals } from "../utils/tokenMaths";
import { encodeFunctionData } from "viem";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useCapabilities,
  useSendTransaction,
  useSendCalls,
  createConfig,
  useCallsStatus,
} from "wagmi";
// usewitchnetwork
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import PrizeIcon from "../components/prizeIcon";
import PrizeValueIcon from "../components/prizeValueIcon";
import PrizeValue from "../components/prizeValue";
import {
  faCopy,
  faTicket,
  faWallet,
  faExclamationCircle,
  faArrowLeft,
  faGreaterThan,
  faTvAlt,
} from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/router";
import { GetActivePromotionsForVaults } from "../utils/getActivePromotions";
import { DepositSuccessModal } from "../components/depositSuccessModal";
import { VaultRewards } from "../components/vaultRewards";
import { getGeckoPriceForTokenAddress } from "../utils/tokenPrices";
import { GetChainName } from "../utils/getChain";
import { GetAssetPrice } from "../utils/getAssetPrice";
import Layout from "../components/Layout";
import Link from "next/link";
import IconDisplay from "../components/icons";
import { useOverview } from "../components/contextOverview";
import { WHITELIST_REWARDS } from "../constants/address";

import { GetChance } from "../utils/getChance";
import { GetChainIcon } from "../utils/getChain";
import ChainTag from "../components/chainTag";
import { optimism } from "viem/chains";
import VaultSkeleton from "../components/vaultSkeleton";
import { call } from "viem/actions";
import DrawCountdown from "../components/drawCountdown";
import VaultChanceInfo from "../components/vaultChanceInfo";
// import Drip from "./drip";

interface vaultApi {
  name: string;
  vault: string;
  poolers: number;
  symbol: string;
  decimals: number;
  asset: string;
  owner: string;
  liquidationPair: string;
  assetSymbol: string;
  price: number;
  contributed7d: string;
  contributed24h: string;
  contributed28d: string;
  won7d: string;
  prizes7d: string;
  prizesPerDraw7d: string;
  status?: number;
  vp?: number;
}
interface VaultProps {
  vAddress: string;
  vaultChainId: number;
  vaultPropData: Partial<vaultApi>;
}

interface GnosisInfo {
  required: number;
  total: number;
  // Add other relevant properties here, if any
}

interface VaultData {
  name: string;
  address: string;
  symbol: string;
  decimals: number;
  asset: string;
  liquidationPair: string;
  totalAssets: ethers.BigNumber;
  tvl: ethers.BigNumber;
  assetName: string;
  assetSymbol: string;
  owner: string;
  userAssetBalance: ethers.BigNumber;
  userDelegatedBalance: ethers.BigNumber;
  userAssetAllowance: ethers.BigNumber;
  userVaultBalance: ethers.BigNumber;
  price: number;
  contributed7d: string;
  contributed28d: string;
  won7d: string;
  prizes7d: string;
  prizesPerDraw7d: string;
  contributed24h: string;
  poolers: number;
  yieldFeePercentage: ethers.BigNumber;
  gnosis?: GnosisInfo; // gnosis is optional and conforms to GnosisInfo interface
  status?: number;
  vp?: number;
}

interface Tier {
  odds: number;
  duration: number;
  vaultPortion: number;
}

interface Chance {
  winsPerDraw7d: number;
  winsPerDraw30d: number;
  sevenDrawVaultPortion: number;
  tiers: Tier[];
}

const dripUpdate = () => {
  return 1;
};

function CopyToClipboardButton(text: any) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
    })
    .catch((err) => {
      console.error("Could not copy text: ", err);
    });
}

const Vault: React.FC<VaultProps> = ({
  vaultChainId,
  vAddress,
  vaultPropData,
}) => {
  const { chains, switchChain } = useSwitchChain();

  const router = useRouter();
  const queriedVaultAddress = router.isReady
    ? (router.query.address as string)
    : vAddress;
  const queriedChainId = router.isReady
    ? (router.query.chain as string)
    : vaultChainId;

  // Use the queriedVaultAddress if it exists, otherwise fallback to the default prop.
  const activeVaultAddress = queriedVaultAddress || vAddress;
  const activeVaultChain: number =
    Number(queriedChainId) || Number(vaultChainId);
  // console.log("active vault chain", activeVaultChain);
  // console.log("active vualt address", activeVaultAddress);
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const [isInvalidVault, setIsInvalidVault] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [buyAmount, setBuyAmount] = useState<string>("");
  const [redeemAmount, setRedeemAmount] = useState<string>("");
  const [seeAddresses, setSeeAddresses] = useState<boolean>(false);
  const [seeChance, setSeeChance] = useState<boolean>(false);
  const [isChanceModalOpen, setIsChanceModalOpen] = useState<boolean>(false);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isChanceModalOpen) {
      // Prevent scrolling on the body
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      document.body.classList.add('modal-open');
    } else {
      // Restore scrolling
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.body.classList.remove('modal-open');
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.body.classList.remove('modal-open');
    };
  }, [isChanceModalOpen]);

  // const [urlChain, setUrlChain] = useState<string>("");
  // const chainId = useChainId();
  const { address, chainId } = useAccount();
  // console.log("chain id",chainId)

  const [isDepositSuccessModalOpen, setIsDepositSuccessModalOpen] =
    useState(false);
  const [depositHash, setDepositHash] = useState("");
  const [activePromos, setActivePromos] = useState({});
  const [actionCompleted, setActionCompleted] = useState({
    approve: false,
    buy: false,
    redeem: false,
  });
  const [lastActionShown, setLastActionShown] = useState("");
  const [refreshData, setRefreshData] = useState(0);
  // const [apiPricing, setApiPricing] = useState();
  const [assetPrice, setAssetPrice] = useState(0);
  const [prizeTokenPrice, setPrizeTokenPrice] = useState(0);
  const [chance, setChance] = useState<Chance | null>(null);
  const [vaultPortion, setVaultPortion] = useState(0);
  const [batchId, setBatchId] = useState<string | null>(null);

  // const [ vaultChainId, setVaultChainId] = useState()

  const overviewFromContext = useOverview();
  const { data: capabilities } = useCapabilities({
    account: address, // account address
  });
  const {
    data: id,
    isPending: isBatchWaiting,
    isError: isSendingError,
    isSuccess: isSendingSuccess,
    sendCalls: _sendCalls,
  } = useSendCalls();

  const { data: callStatusData, refetch: refetchCallStatus } = useCallsStatus({
    id: id?.id || "",
    query: {
      enabled: !!id,
      refetchInterval: (data) =>
        data.state.data?.status === "success" ? false : 1000,
    },
  });
  useEffect(() => {
    if (callStatusData) {
      if (callStatusData.status === "success") {
        toast("Deposit success!", {
          position: toast.POSITION.BOTTOM_LEFT,
        });
        setBatchId(null); // Reset batch ID after success
        setRefreshData((refresh) => refresh + 1);
      } else if (callStatusData.status === "failure") {
        toast("Deposit failed. Check console for details.", {
          position: toast.POSITION.BOTTOM_LEFT,
        });
        console.error("Deposit error:", callStatusData);
        setBatchId(null); // Reset batch ID after failure
      }
    }
  }, [callStatusData]);

  //  console.log("capable",capabilities)

  const canBatchTransactions = (chainId: number) => {
    return (
      capabilities?.[chainId]?.atomic?.status === "ready" ||
      capabilities?.[chainId]?.atomic?.status === "supported"
    );
  };

  const handleCloseModal = () => {
    setIsDepositSuccessModalOpen(false);
  };
  const handleBatchDeposit = async () => {
    try {
      if (!chainId || !address || !vaultData || parseFloat(buyAmount) <= 0) {
        toast("Invalid batch deposit request", {
          position: toast.POSITION.BOTTOM_LEFT,
        });
        return;
      }

      const amountToApprove = ethers.utils.parseUnits(
        buyAmount,
        vaultData.decimals
      );

      // Encode function data
      const approveData = encodeFunctionData({
        abi: ABI.ERC20,
        functionName: "approve",
        args: [vaultData.address, amountToApprove],
      });

      const depositData = encodeFunctionData({
        abi: ABI.VAULT,
        functionName: "deposit",
        args: [amountToApprove, address],
      });

      // Prepare the batch calls
      const calls = [
        {
          to: vaultData.asset,
          data: approveData,
        },
        {
          to: vaultData.address,
          data: depositData,
        },
      ];

      // Trigger the batch call
      _sendCalls({
        account: address as `0x${string}`,
        chainId: chainId,
        calls: calls,
      });

      // Log the status immediately after triggering
    } catch (err) {
      console.error("Error in batch deposit:", err);
      toast("Error in batch deposit: See console for details", {
        position: toast.POSITION.BOTTOM_LEFT,
      });
    }
  };

  // Use useEffect to monitor the status and data after the call is made
  useEffect(() => {
    if (isSendingSuccess) {
      toast("Deposit processing...", {
        position: toast.POSITION.BOTTOM_LEFT,
      });
    }

    if (isSendingError) {
      console.error("Batch call failed");
      toast("Batch deposit failed: Check console for details", {
        position: toast.POSITION.BOTTOM_LEFT,
      });
    }
  }, [isSendingSuccess, isSendingError, id]);

  const handleShowToast = (action: any) => {
    toast.dismiss();
    // Prevent showing the same toast for the same action again
    if (action === lastActionShown) return;

    switch (action) {
      case "approve":
        toast("Approve success!", { position: toast.POSITION.BOTTOM_LEFT });
        break;
      case "buy":
        toast("Deposit success!", { position: toast.POSITION.BOTTOM_LEFT });
        setIsDepositSuccessModalOpen(true);
        break;
      case "redeem":
        toast("Redeem success!", { position: toast.POSITION.BOTTOM_LEFT });
        break;
      default:
      // No default action
    }

    // Update the last action shown
    setLastActionShown(action);
  };

  const handleBuyAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Check if the new input value is either empty or a valid number format
    if (inputValue === "" || /^\d*\.?\d*$/.test(inputValue)) {
      setBuyAmount(inputValue);
    }
  };

  const handleRedeemAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    // Check if the new input value is either empty or a valid number format
    if (inputValue === "" || /^\d*\.?\d*$/.test(inputValue)) {
      setRedeemAmount(inputValue);
    }
  };

  const {
    data: buyData,
    isPending: buyIsLoading,
    // isSuccess: buyIsSuccess,
    // isError: buyIsError,
    writeContract: writeBuy,
  } = useWriteContract({
    mutation: {
      onSuccess: () => {
        toast("Depositing!", {
          position: toast.POSITION.BOTTOM_LEFT,
        });
      },
    },
  });
  const { data: redeemSimulate, error: redeemError } = useSimulateContract({
    chainId: chainId,
    address: vaultData?.address as any,
    abi: ABI.VAULT,
    functionName: "withdraw",

    args: [
      // "1",
      redeemAmount &&
        parseFloat(redeemAmount) > 0 &&
        ethers.utils.parseUnits(redeemAmount, vaultData?.decimals).toString(),
      address as any,
      address as any,
      0,
      // redeemAmount &&
      //   parseFloat(redeemAmount) > 0 &&
      //   ethers.utils.parseUnits(redeemAmount, vaultData?.decimals).toString(),
    ],
  });
  // console.log("redeem sim",redeemSimulate)
  const {
    data: redeemData,
    isPending: redeemIsLoading,
    // isSuccess: redeemIsSuccess,
    // isError: redeemIsError,
    writeContract: writeRedeem,
  } = useWriteContract({
    mutation: {
      onSuccess: () => {
        toast("Redeeming!", {
          position: toast.POSITION.BOTTOM_LEFT,
        });
      },
    },
  });
  const {
    // isLoading: buyWaitIsLoading,
    isSuccess: buyWaitIsSuccess,
    isFetching: buyWaitIsFetching,
  } = useWaitForTransactionReceipt({ hash: buyData });

  // console.log("Redeem transaction hash:", redeemData?.hash);

  const {
    // isLoading: redeemWaitIsLoading,
    isSuccess: redeemWaitIsSuccess,
    isFetching: redeemWaitIsFetching,
  } = useWaitForTransactionReceipt({ hash: redeemData });

  const {
    data: approveData,
    isPending: approveIsLoading,
    // isSuccess: approveIsSuccess,
    writeContract: writeApprove,
  } = useWriteContract({
    mutation: {
      onSuccess: () => {
        toast("Approving!", {
          position: toast.POSITION.BOTTOM_LEFT,
        });
      },
    },
  });

  const {
    isLoading: approveWaitIsLoading,
    isSuccess: approveWaitIsSuccess,
    isFetching: approveWaitIsFetching,
  } = useWaitForTransactionReceipt({ hash: approveData });

  // const handleRedeem = async () => {
  //   try {
  //     console.log("handling redeem");
  //     if (!chainId || !address) {
  //       toast("error, see console", {
  //         position: toast.POSITION.BOTTOM_LEFT,
  //       });
  //       console.log("error deposit / redeem, wrong chain or address ");
  //       return;
  //     }
  //     if (parseFloat(redeemAmount) > 0) {
  //       if (chainId === activeVaultChain && vaultData) {
  // console.log("trying here ya")
  // const vaultContract = new ethers.Contract(
  //   vaultData.address,
  //   ABI.VAULT,
  //   PROVIDERS[GetChainName(activeVaultChain)]
  // );
  // const amountToCheck = ethers.utils
  //   .parseUnits(redeemAmount, vaultData?.decimals)
  //   .toString();
  // const redeemPreview = await vaultContract.previewRedeem(
  //   amountToCheck
  // );
  // console.log("redeem preview",redeemPreview.toString())
  // if (redeemPreview.lt(amountToCheck)) {
  //   toast("temporary aave utilization issue", {
  //     position: toast.POSITION.BOTTOM_LEFT,
  //   });
  // }
  // else {
  const handleRedeem = async () => {
    try {
      if (!chainId || !address) {
        toast("Error: Wallet not connected or wrong chain.", {
          position: toast.POSITION.BOTTOM_LEFT,
        });
        return;
      }

      if (parseFloat(redeemAmount) > 0 && vaultData) {
        const redeemAmountParsed = ethers.utils.parseUnits(
          redeemAmount,
          vaultData.decimals
        );

        // Ensure chainId matches activeVaultChain
        if (chainId === activeVaultChain) {
          if (!writeRedeem) {
            toast("Redeem error: Contract function not ready.", {
              position: toast.POSITION.BOTTOM_LEFT,
            });
            return;
          }

          // Directly execute the redeem function
          writeRedeem({
            chainId,
            address: vaultData.address as any,
            abi: ABI.VAULT,
            functionName: "withdraw",
            args: [
              redeemAmountParsed.toString(), // Amount to redeem
              address, // Receiver address
              address, // Beneficiary address (can also be msg.sender)
              redeemAmountParsed.toString(), // Amount to redeem
            ],
          });
        } else {
          toast("Error: Please switch to the correct chain.", {
            position: toast.POSITION.BOTTOM_LEFT,
          });
        }
      } else {
        toast("Error: Invalid redeem amount.", {
          position: toast.POSITION.BOTTOM_LEFT,
        });
      }
    } catch (err) {
      console.error("Error during redeem:", err);
      toast("Error during redeem: See console for details.", {
        position: toast.POSITION.BOTTOM_LEFT,
      });
    }
  };

  const handleBuy = () => {
    try {
      if (!chainId || !address) {
        toast("error, see console", {
          position: toast.POSITION.BOTTOM_LEFT,
        });
        return;
      }
      if (parseFloat(buyAmount) > 0) {
        if (chainId === activeVaultChain) {
          if (writeBuy) {
            // use to block vaults
            if (
              vaultData?.address.toLowerCase() ===
              "0x77935f2c72b5eb814753a05921ae495aa283906b"
            ) {
              toast("utilization is too high for new deposits", {
                position: toast.POSITION.BOTTOM_LEFT,
              });
            } else {
              writeBuy({
                chainId: chainId,
                address: vaultData?.address as any,
                abi: ABI.VAULT,
                functionName: "deposit",

                args: [
                  buyAmount &&
                    parseFloat(buyAmount) > 0 &&
                    ethers.utils
                      .parseUnits(buyAmount, vaultData?.decimals)
                      .toString(),
                  address,
                ],

                // onSuccess(data) {
                //   toast("Buying tickets!", {
                //     position: toast.POSITION.BOTTOM_LEFT,
                //   });
                // },
              });
            }
          } else {
            toast("error, see console", {
              position: toast.POSITION.BOTTOM_LEFT,
            });
          }
        } else {
          toast("wrong chain", {
            position: toast.POSITION.BOTTOM_LEFT,
          });
        }
      } else {
      }
    } catch (err) {
      toast("error on deposit, see console", {
        position: toast.POSITION.BOTTOM_LEFT,
      });
    }
  };

  useEffect(() => {
    if (approveWaitIsSuccess && !actionCompleted.approve) {
      setActionCompleted((prev) => ({ ...prev, approve: true }));
      handleShowToast("approve");

      // Automatically trigger the "buy" transaction if the approval succeeds
      if (parseFloat(buyAmount) > 0 && vaultData) {
        handleBuy(); // Trigger the buy function
      }

      setRefreshData((refresh) => refresh + 1);
    }

    if (buyWaitIsSuccess && !actionCompleted.buy) {
      setActionCompleted((prev) => ({ ...prev, buy: true }));
      handleShowToast("buy");
      setRefreshData((refresh) => refresh + 1);
    }

    if (redeemWaitIsSuccess && !actionCompleted.redeem) {
      setActionCompleted((prev) => ({ ...prev, redeem: true }));
      handleShowToast("redeem");
      setRefreshData((refresh) => refresh + 1);
    }
  }, [approveWaitIsSuccess, buyWaitIsSuccess, redeemWaitIsSuccess]);

  useEffect(() => {
    async function fetchData() {
      if (!activeVaultAddress) return;

      try {
        const normalizedActiveVaultAddress = activeVaultAddress.toLowerCase();
        const contract = new ethers.Contract(
          activeVaultAddress,
          ABI.VAULT,
          PROVIDERS[GetChainName(activeVaultChain)]
        );
        const userAddress = address || "";

        // These may be filled from props or API
        let name, symbol, decimals, asset, liquidationPair, owner;
        let price, contributed7d, contributed24h, contributed28d;
        let won7d, prizes7d, prizesPerDraw7d, poolers, gnosis, status, tvl, vp;

        // Try props first
        if (vaultPropData && Object.keys(vaultPropData).length > 0) {
          ({
            name,
            symbol,
            decimals,
            asset,
            liquidationPair,
            owner,
            price,
            contributed7d,
            contributed24h,
            contributed28d,
            won7d,
            prizes7d,
            prizesPerDraw7d,
            poolers,
            status,
            vp,
          } = vaultPropData);
        }

        // Fallback to API
        if (!name || !symbol || !decimals || !asset || !owner || !price) {
          try {
            const apiResponse = await fetch(`https://poolexplorer.xyz/vaults`);
            if (apiResponse.ok) {
              const apiData: any[] = await apiResponse.json();
              const vaultApiData = apiData.find(
                (v) => v.vault.toLowerCase() === normalizedActiveVaultAddress
              );
              if (vaultApiData) {
                ({
                  name,
                  symbol,
                  decimals,
                  asset,
                  liquidationPair,
                  owner,
                  price,
                  contributed7d,
                  contributed24h,
                  contributed28d,
                  won7d,
                  prizes7d,
                  prizesPerDraw7d,
                  poolers,
                  gnosis,
                  status,
                  tvl,
                  vp,
                } = vaultApiData);
                if (tvl) tvl = ethers.BigNumber.from(tvl);
              }
            }
          } catch (apiError) {
            console.error("Vault API fetch failed:", apiError);
          }
        }

        // Fallback to onchain
        let liquidationPairCalled = false;
        const vaultCalls = [];
        if (!name) vaultCalls.push(contract.name());
        if (!symbol) vaultCalls.push(contract.symbol());
        if (!decimals) vaultCalls.push(contract.decimals());
        if (!asset) vaultCalls.push(contract.asset());

        if (liquidationPair === undefined || liquidationPair === null) {
          try {
            liquidationPair = await contract.liquidationPair();
            liquidationPairCalled = true;
          } catch (err) {
            console.warn("No liquidationPair():", err);
            liquidationPair = "";
          }
        }
        if (!owner) vaultCalls.push(contract.owner());
        if (!tvl) vaultCalls.push(contract.totalSupply());

        try {
          const vaultResults = vaultCalls.length
            ? await Multicall(vaultCalls, GetChainName(activeVaultChain))
            : [];

          let i = 0;
          if (!name) name = vaultResults[i++];
          if (!symbol) symbol = vaultResults[i++];
          if (!decimals) decimals = vaultResults[i++];
          if (!asset) asset = vaultResults[i++];
          if (!liquidationPair && !liquidationPairCalled)
            liquidationPair = vaultResults[i++];
          if (!owner) owner = vaultResults[i++];
          if (!tvl) tvl = vaultResults[i++];
        } catch (err) {
          console.error("Vault multicall failed:", err);
        }

        let yieldFeePercentage = ethers.BigNumber.from(0);
        try {
          yieldFeePercentage = await contract.yieldFeePercentage();
        } catch (err) {
          console.warn("yieldFeePercentage() not found, defaulting to 0");
        }

        // Fetch asset + user-specific data
        const assetContract = new ethers.Contract(
          asset,
          ABI.ERC20,
          PROVIDERS[GetChainName(activeVaultChain)]
        );
        const twabControllerContract = new ethers.Contract(
          ADDRESS[GetChainName(activeVaultChain)].TWABCONTROLLER,
          ABI.TWABCONTROLLER,
          PROVIDERS[GetChainName(activeVaultChain)]
        );

        const assetCalls = [
          assetContract.name(),
          assetContract.symbol(),
          twabControllerContract.totalSupplyDelegateBalance(activeVaultAddress),
          // contract.yieldFeePercentage(),
        ];

        if (userAddress) {
          assetCalls.push(
            assetContract.balanceOf(userAddress),
            assetContract.allowance(userAddress, activeVaultAddress),
            contract.balanceOf(userAddress),
            twabControllerContract.delegateBalanceOf(
              activeVaultAddress,
              userAddress
            )
          );
        }

        let assetResults, assetPrice;
        try {
          [assetResults, assetPrice] = await Promise.all([
            Multicall(assetCalls, GetChainName(activeVaultChain)),
            GetAssetPrice(GetChainName(activeVaultChain), asset),
          ]);
        } catch (err) {
          console.error("Asset multicall or price fetch failed:", err);
          return;
        }

        setAssetPrice(assetPrice);

        const assetName = assetResults[0].toString();
        const assetSymbol = assetResults[1].toString();
        const totalAssets = ethers.BigNumber.from(assetResults[2]);
        // const yieldFeePercentage = ethers.BigNumber.from(assetResults[3]);

        let userAssetBalance = ethers.BigNumber.from(0);
        let userAssetAllowance = ethers.BigNumber.from(0);
        let userVaultBalance = ethers.BigNumber.from(0);
        let userDelegatedBalance = ethers.BigNumber.from(0);
        if (userAddress && assetResults.length >= 7) {
          userAssetBalance = ethers.BigNumber.from(assetResults[3]);
          userAssetAllowance = ethers.BigNumber.from(assetResults[4]);
          userVaultBalance = ethers.BigNumber.from(assetResults[5]);
          userDelegatedBalance = ethers.BigNumber.from(assetResults[6]);
        }

        const fetchedData: VaultData = {
          name: name.toString(),
          address: activeVaultAddress,
          symbol: symbol.toString(),
          decimals: Number(decimals),
          asset: asset.toString(),
          liquidationPair: liquidationPair ? liquidationPair.toString() : "",
          totalAssets,
          tvl,
          assetName,
          assetSymbol,
          userVaultBalance,
          userDelegatedBalance,
          userAssetBalance,
          userAssetAllowance,
          owner: owner.toString(),
          price,
          contributed7d,
          contributed24h,
          contributed28d,
          won7d,
          prizes7d,
          prizesPerDraw7d,
          poolers,
          yieldFeePercentage: ethers.BigNumber.isBigNumber(yieldFeePercentage)
            ? yieldFeePercentage
            : ethers.BigNumber.from(yieldFeePercentage),
          gnosis,
          status,
          vp,
        };

        setVaultData((prev) =>
          JSON.stringify(prev) !== JSON.stringify(fetchedData)
            ? fetchedData
            : prev
        );
        setIsLoading(false);
        
      } catch (err) {
        console.error("Error fetching vault data:", err);
        setIsInvalidVault(true);
        setIsLoading(false);
      }
    }

    fetchData();
  }, [activeVaultAddress, address, router.isReady, refreshData]);

  useEffect(() => {
    const defaultPrice =
      overviewFromContext?.overview?.prices?.geckos?.ethereum; // Default to ETH price
    const prizeTokenSymbol = activeVaultChain
      ? ADDRESS[GetChainName(activeVaultChain)]?.PRIZETOKEN?.SYMBOL
      : "weth"; // Default to WETH
    const prizeTokenGeckoId = activeVaultChain
      ? ADDRESS[GetChainName(activeVaultChain)]?.PRIZETOKEN?.GECKO
      : "ethereum"; // Default to ETH Gecko

    // Check if the prize token is something other than WETH
    if (prizeTokenSymbol && prizeTokenSymbol.toLowerCase() !== "weth") {
      const tokenPrice =
        overviewFromContext?.overview?.prices?.geckos?.[prizeTokenGeckoId];
      if (tokenPrice) {
        setPrizeTokenPrice(tokenPrice);
      } else {
        setPrizeTokenPrice(defaultPrice || 0);
      }
    } else {
      // Default to WETH or ETH price if no other token is found
      setPrizeTokenPrice(defaultPrice || 0);
    }
  }, [assetPrice, activeVaultChain]);

  useEffect(() => {
    async function fetchData() {
      const promises = [];

      if (
        overviewFromContext &&
        overviewFromContext.overview &&
        overviewFromContext.overview.prices
      ) {
        if (activeVaultAddress) {
          const promoPromiseA = GetActivePromotionsForVaults(
            [activeVaultAddress],
            true,
            overviewFromContext.overview.prices,
            false,
            "NULL"
          );

          const promoPromiseB = GetActivePromotionsForVaults(
            [activeVaultAddress],
            true,
            overviewFromContext.overview.prices,
            true,
            GetChainName(activeVaultChain)
          );

          const combinedPromoPromise = Promise.all([
            promoPromiseA,
            promoPromiseB,
          ]).then(async ([promosA, promosB]) => {
            // console.log("promos a", promosA, "prom b", promosB);
            const combined = { ...promosA, ...promosB };
            //  if (promosB && Object.keys(promosB).length > 0) {
            //   const prizePoolContract = new ethers.Contract(
            //     ADDRESS[GetChainName(activeVaultChain)].PRIZEPOOL,
            //     ABI.PRIZEPOOL,
            //     PROVIDERS[GetChainName(activeVaultChain)])
            //     const openDraw = await prizePoolContract.getOpenDrawId()
            //     let drawsToGo = 7
            //     if(GetChainName(activeVaultChain) ==="ETHEREUM"){drawsToGo = 1}
            //     const fetchedVaultPortion = await prizePoolContract.getVaultPortion(activeVaultAddress,openDraw - drawsToGo,openDraw)
            //   console.log("vailt portion",fetchedVaultPortion.toString())
            //   setVaultPortion(Number(fetchedVaultPortion)/1e18)

            //  }
            // console.log("combined promo",combined)
            // console.log("set vault portion",vaultPortion)
            setActivePromos(combined);
          });

          promises.push(combinedPromoPromise);
        }
      } else {
      }

      if (activeVaultAddress) {
        if (
          overviewFromContext &&
          overviewFromContext.overview &&
          overviewFromContext.overview.pendingPrize
        ) {
          const chainName = GetChainName(activeVaultChain);
          const tierData =
            overviewFromContext.overview.pendingPrize[chainName]?.prizes
              ?.tierData;

          if (tierData) {
            const numberOfTiers = tierData.length - 2;
            // Use address if available, otherwise use vault address as fallback
            const poolerAddress = address || activeVaultAddress;
            const chancePromise = GetChance(
              activeVaultChain,
              activeVaultAddress,
              poolerAddress,
              numberOfTiers
            ).then((chance) => {
              setChance(chance);
            });
            promises.push(chancePromise);
          }
        } else {
          // Fallback for when overview context is not ready, assuming 2 tiers.
          const poolerAddress = address || activeVaultAddress;
          const chancePromise = GetChance(
            activeVaultChain,
            activeVaultAddress,
            poolerAddress,
            2
          ).then((chance) => {
            setChance(chance);
          });
          promises.push(chancePromise);
        }
      }

      await Promise.all(promises);
    }

    if (activeVaultAddress && router.isReady) {
      fetchData();
    }
  }, [activeVaultAddress, address, router.isReady, overviewFromContext]);

  // vaultData && console.log("contributed",vaultData?.contributed7d, typeof vaultData.contributed7d);
  // console.log("active promos here", activePromos);
  // console.log("active vault here", activeVaultAddress);
  // console.log("vault data", vaultData);
  function averageDaysToWin() {
    if (chance && vaultData) {
      const winsPerDraw7d = chance.winsPerDraw7d;
      const winsPerDraw30d = chance.winsPerDraw30d;

      const userVaultBalance = Number(
        ethers.utils.formatUnits(
          vaultData.userVaultBalance,
          vaultData.decimals
        )
      );
      const totalAssets = Number(
        ethers.utils.formatUnits(vaultData.tvl, vaultData.decimals)
      );

      // Calculate the average number of prizes per draw for this vault portion
      const averagePrizesPerDraw =
        winsPerDraw30d > 0 ? winsPerDraw30d : winsPerDraw7d;
      const vaultPortion = chance.sevenDrawVaultPortion;
      // Calculate the probability of winning in a single draw
      const probabilityOfWinningPerDraw =
        (userVaultBalance / totalAssets) * vaultPortion * averagePrizesPerDraw;
      // Ensure probability is within valid range [0, 1]
      if (probabilityOfWinningPerDraw > 1) {
        return 1;
      }
      if (probabilityOfWinningPerDraw <= 0) {
        // console.log(
        //   "Invalid probability of winning per draw:",
        //   probabilityOfWinningPerDraw
        // );
        return null;
      }

      // Calculate the expected number of draws until the user wins
      const estimatedDrawsUntilWin = 1 / probabilityOfWinningPerDraw;

      // console.log("estimated days to win", estimatedDrawsUntilWin);
      return estimatedDrawsUntilWin;
    }
  }

  const userWinChance = averageDaysToWin();
  const showChanceInfo = !!(vaultData && overviewFromContext?.overview?.pendingPrize);
  
  return (
    <Layout>
      <center>
        {/* <div  
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
          <Image
            src={`/images/squarepool.png`}
            height={90}
            width={90}
            alt="pool party"
          />
          &nbsp;&nbsp;
          <h1 style={{ margin: "0 0 0 10px", lineHeight: "120px" }}>
            POOLTIME
          </h1>
        </div> */}
        {/* <div className="vault-modal-overlay"> */}
        <Link href="/">
          <div className="back-to-vaults" style={{ marginTop: "28px" }}>
            <FontAwesomeIcon
              icon={faArrowLeft}
              size="sm"
              style={{
                color: "white",
                height: "16px",
                marginRight: "8px",
                marginLeft: "5px",
              }}
            />{" "}
            Back to all vaults
          </div>
        </Link>
        {isLoading ? (
          <VaultSkeleton />
        ) : (
          <div className={`vault-view-bubble ${showChanceInfo ? "has-chance" : ""}`}>
          <span
            className="hidden-desktop"
            style={{
              paddingBottom: "5px",
              display: "flex",
              alignItems: "left",
            }}>
            {activeVaultChain !== undefined && (
              <span className="hidden-desktop">
                <ChainTag chainId={activeVaultChain} horizontal={true} />
                <br></br>
              </span>
              // <Image
              //   src={GetChainIcon(activeVaultChain) as any}
              //   alt={GetChainIcon(activeVaultChain)}
              //   width={24}
              //   height={24}
              // />
            )}
          </span>
          {/* <button className="modal-close-button">
          &times;
        </button>      */}
          {/* {vaultData && <h3>{vaultData.name}</h3>} */}

          {/* Desktop two-div layout */}
          <div className="vault-desktop-layout">
            {/* Main vault content div */}
            <div className="vault-main-content">
              <div style={{ paddingBottom: "18px" }}>
                {vaultData && (
                  <>
                    <div>
                      <span
                        className="vault-header"
                        style={{
                          // marginLeft: "45px",
                          // fontSize: "26px",
                          color: "rgb(225, 245, 249)",
                          display: "flex",
                          alignItems: "center",
                        }}>
                        <IconDisplay name={vaultData.name} size={24} />
                        <span className="vault-header-name">
                          {vaultData.name}
                        </span>
                        <div className="chain-bubble hidden-mobile">
                          {GetChainName(activeVaultChain)}&nbsp;
                        </div>{" "}
                      </span>{" "}
                    </div>
                  </>
                )}
              </div>
              <div className="vault-container">
                <div className="vault-content">
                  {/* Show basic vault info immediately when loaded */}
                  {vaultData && vaultData.status === 0 && (
                    <div>
                      <FontAwesomeIcon
                        icon={faExclamationCircle}
                        size="sm"
                        style={{
                          color: "#f24444",
                          height: "18px",
                          marginRight: "8px",
                          marginLeft: "5px",
                        }}
                      />
                      Deposits and withdraws are deprecated
                    </div>
                  )}
                  {vaultData && vaultData.status === 1 && (
                    <div>
                      <FontAwesomeIcon
                        icon={faExclamationCircle}
                        size="sm"
                        style={{
                          color: "#f87806",
                          height: "18px",
                          marginRight: "8px",
                          marginLeft: "5px",
                        }}
                      />
                      This vault is withdraw only
                    </div>
                  )}
                  {vaultData && vaultData.status === 2 && (
                    <div>
                      <FontAwesomeIcon
                        icon={faExclamationCircle}
                        size="sm"
                        style={{
                          color: "#f87806",
                          height: "18px",
                          marginRight: "8px",
                          marginLeft: "5px",
                        }}
                      />
                      This vault is special access only
                    </div>
                  )}

                  {isInvalidVault ? (
                    <div className="error-message">Invalid Vault Address</div>
                  ) : (
                    <>
                      {vaultData ? (
                        <>
                          {/* DEPOSIT AND WITHDRAW */}
                          {vaultData.userVaultBalance &&
                            vaultData.userVaultBalance.gt(0) &&
                            vaultData.status !== 0 && (
                              <>
                                <br></br>
                                <div className="balance-data-row">
                                  <span className="vault-label vault-balance">
                                    <FontAwesomeIcon
                                      icon={faTicket}
                                      size="sm"
                                      style={{
                                        cursor: "pointer",
                                        color: "#21325c",
                                        height: "18px",
                                        marginRight: "10px",
                                        marginLeft: "5px",
                                      }}
                                      onClick={() =>
                                        CopyToClipboardButton(activeVaultAddress)
                                      }
                                    />
                                    <span style={{ fontSize: "19px" }}>
                                      Your Tickets
                                    </span>
                                  </span>
                                  <span className="vault-balance">
                                    <IconDisplay
                                      name={vaultData.assetSymbol}
                                      size={20}
                                    />{" "}
                                    &nbsp;
                                    {NumberWithCommas(
                                      CropDecimals(
                                        ethers.utils.formatUnits(
                                          vaultData.userVaultBalance,
                                          vaultData.decimals
                                        )
                                      )
                                    )}{" "}
                                    <button
                                      className="max-small"
                                      onClick={() =>
                                        setRedeemAmount(
                                          ethers.utils.formatUnits(
                                            vaultData.userVaultBalance,
                                            vaultData.decimals
                                          )
                                        )
                                      }>
                                      max
                                    </button>
                                  </span>
                                </div>
                              </>
                            )}
                          <div className="vault-input-container">
                            {vaultData &&
                              vaultData.userVaultBalance.gt(0) &&
                              vaultData.status !== 0 && (
                                <div className="input-button-group">
                                  <input
                                    type="text"
                                    placeholder="Amount"
                                    className="vault-input-field"
                                    onChange={handleRedeemAmountChange}
                                    value={redeemAmount}
                                  />
                                  {/* <button className="vault-button">REDEEM TICKETS</button> */}

                                  <>
                                    {vaultData.userVaultBalance && !chainId ? (
                                      <button className="button no-cursor">
                                        CONNECT WALLET
                                      </button>
                                    ) : chainId !== activeVaultChain ? (
                                      <button
                                        className="vault-button pointer"
                                        disabled={!switchChain}
                                        onClick={() =>
                                          switchChain({ chainId: activeVaultChain })
                                        }>
                                        SWITCH NETWORKS
                                      </button>
                                    ) : redeemIsLoading ? (
                                      <button className="vault-button">
                                        <div className="spinner-small"></div>
                                        SEE WALLET
                                      </button>
                                    ) : parseFloat(redeemAmount) >
                                      parseFloat(
                                        ethers.utils.formatUnits(
                                          vaultData.userVaultBalance || 0,
                                          vaultData?.decimals || 0
                                        )
                                      ) ? (
                                      <button className="vault-button">
                                        INSUFFICIENT BALANCE
                                      </button>
                                    ) : redeemWaitIsFetching ? (
                                      <button className="vault-button">
                                        <div className="spinner-small"></div>
                                        PROCESSING
                                      </button>
                                    ) : redeemWaitIsFetching ? (
                                      <button className="vault-button">
                                        <div className="spinner-small"></div>
                                        PROCESSING
                                      </button>
                                    ) : parseFloat(
                                        ethers.utils.formatUnits(
                                          vaultData.userVaultBalance || 0,
                                          vaultData.decimals || 0
                                        )
                                      ) >= parseFloat(redeemAmount) ? (
                                      <button
                                        onClick={handleRedeem}
                                        className="vault-button">
                                        REDEEM
                                      </button>
                                    ) : (
                                      <button
                                        onClick={handleRedeem}
                                        className="vault-button no-cursor">
                                        REDEEM
                                      </button>
                                    )}
                                  </>
                                </div>
                              )}
                          </div>
                          {vaultData.userAssetBalance &&
                            vaultData.userAssetBalance.gt(0) &&
                            vaultData.status !== 0 &&
                            vaultData.status !== 1 && (
                              <div className="balance-data-row">
                                <span className="vault-label vault-balance">
                                  <FontAwesomeIcon
                                    icon={faWallet}
                                    size="sm"
                                    style={{
                                      cursor: "pointer",
                                      color: "#21325c",
                                      height: "18px",
                                      marginRight: "10px",
                                      marginLeft: "5px",
                                    }}
                                    onClick={() =>
                                      CopyToClipboardButton(activeVaultAddress)
                                    }
                                  />
                                  <span style={{ fontSize: "19px" }}>
                                    Your{" "}
                                    <span className="hidden-mobile">Deposit</span>{" "}
                                    Tokens
                                  </span>
                                </span>

                                <span className="vault-balance">
                                  <IconDisplay
                                    name={vaultData.assetSymbol}
                                    size={20}
                                  />
                                  &nbsp;
                                  {NumberWithCommas(
                                    CropDecimals(
                                      ethers.utils.formatUnits(
                                        vaultData.userAssetBalance,
                                        vaultData.decimals
                                      )
                                    )
                                  )}{" "}
                                  {/* {vaultData.assetSymbol} */}{" "}
                                  <button
                                    className="max-small"
                                    onClick={() =>
                                      setBuyAmount(
                                        ethers.utils.formatUnits(
                                          vaultData.userAssetBalance,
                                          vaultData.decimals
                                        )
                                      )
                                    }>
                                    max
                                  </button>
                                </span>
                              </div>
                            )}
                          <div className="vault-input-container">
                            {vaultData &&
                              vaultData.userAssetBalance.gt(0) &&
                              vaultData.status !== 0 &&
                              vaultData.status !== 1 && (
                                <div className="input-button-group">
                                  <input
                                    type="text"
                                    placeholder="Amount"
                                    className="vault-input-field"
                                    value={buyAmount}
                                    onChange={handleBuyAmountChange}
                                  />
                                  {/* <button className="vault-button">BUY TICKETS</button> */}
                                  {!chainId ? (
                                    <button className="vault-button no-cursor">
                                      CONNECT WALLET
                                    </button>
                                  ) : chainId !== activeVaultChain ? (
                                    <button
                                      className="vault-button pointer"
                                      disabled={!switchChain}
                                      onClick={() =>
                                        switchChain({ chainId: activeVaultChain })
                                      }>
                                      SWITCH NETWORKS
                                    </button>
                                  ) : buyIsLoading || isBatchWaiting ? (
                                    <button className="vault-button">
                                      <div className="spinner-small"></div>
                                      SEE WALLET
                                    </button>
                                  ) : approveIsLoading ? (
                                    <button className="vault-button">
                                      <div className="spinner-small"></div>
                                      SEE WALLET
                                    </button>
                                  ) : buyWaitIsFetching || approveWaitIsFetching ? (
                                    <button className="vault-button">
                                      <div className="spinner-small"></div>
                                      PROCESSING
                                    </button>
                                  ) : vaultData.userAssetBalance === undefined ? (
                                    ""
                                  ) : parseFloat(buyAmount) >
                                    parseFloat(
                                      ethers.utils.formatUnits(
                                        vaultData.userAssetBalance,
                                        vaultData.decimals || 0
                                      )
                                    ) ? (
                                    <button className="vault-button hover-button no-cursor">
                                      INSUFFICIENT BALANCE
                                    </button>
                                  ) : vaultData.userAssetAllowance &&
                                    vaultData.decimals !== undefined &&
                                    parseFloat(
                                      ethers.utils.formatUnits(
                                        vaultData.userAssetAllowance,
                                        vaultData.decimals
                                      )
                                    ) >= parseFloat(buyAmount) ? (
                                    <>
                                      <button
                                        onClick={handleBuy}
                                        className="vault-button hidden-mobile">
                                        DEPOSIT FOR TICKETS
                                      </button>
                                      <button
                                        onClick={handleBuy}
                                        className="vault-button hidden-desktop">
                                        DEPOSIT
                                      </button>
                                    </>
                                  ) : parseFloat(buyAmount) > 0 ? (
                                    <button
                                      onClick={() => {
                                        if (chainId === activeVaultChain) {
                                          if (
                                            vaultData?.address.toLowerCase() ===
                                              "0x77935f2c72b5eb814753a05921ae495aa283906b" ||
                                            vaultData?.address.toLowerCase() ===
                                              "0xce8293f586091d48a0ce761bbf85d5bcaa1b8d2b"
                                          ) {
                                            toast(
                                              "aave utilization is too high for new deposits",
                                              {
                                                position:
                                                  toast.POSITION.BOTTOM_LEFT,
                                              }
                                            );
                                          } else if (
                                            canBatchTransactions(chainId) &&
                                            parseFloat(buyAmount) > 0
                                          ) {
                                            handleBatchDeposit();
                                          } else {
                                            toast.dismiss();
                                            const args: [string, string] = [
                                              vaultData.address,
                                              ethers.utils
                                                .parseUnits(
                                                  buyAmount,
                                                  vaultData.decimals
                                                )
                                                .toString(),
                                            ];
                                            writeApprove({
                                              address: `0x${vaultData?.asset.substring(
                                                2
                                              )}`,
                                              abi: ABI.ERC20,
                                              functionName: "approve",
                                              args: args,
                                            });
                                          }
                                        } else {
                                          toast(
                                            "please switch to " +
                                              GetChainName(activeVaultChain)
                                          );
                                        }
                                      }}
                                      className="vault-button">
                                      {canBatchTransactions(chainId)
                                        ? "DEPOSIT"
                                        : "APPROVE"}
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        onClick={handleBuy}
                                        className="vault-button hidden-mobile">
                                        DEPOSIT FOR TICKETS
                                      </button>
                                      <button
                                        onClick={handleBuy}
                                        className="vault-button hidden-desktop">
                                        DEPOSIT
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                          </div>
                          {vaultData &&
                            vaultData.userAssetBalance.eq(0) &&
                            vaultData.userVaultBalance.eq(0) &&
                            (address ? (
                              <>
                                <div style={{ textAlign: "center" }}>
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                    }}>
                                    <FontAwesomeIcon
                                      icon={faExclamationCircle}
                                      size="sm"
                                      style={{
                                        color: "#21325c",
                                        height: "18px",
                                        marginRight: "8px",
                                        marginLeft: "5px",
                                      }}
                                    />
                                    To play in this pool you need{" "}
                                    {vaultData.assetSymbol} tokens
                                  </span>
                                </div>
                                <br></br>
                              </>
                            ) : (
                              <>
                                {/* <button onClick={openConnectModal} type="button" className="hover-button"> */}
                                <MyConnect connectText={"CONNECT TO WIN"} />
                             
                              </>
                            ))}
                          
                          {/* SEE PRIZES button */}
                          {showChanceInfo && (
                            <div className="mobile-chance-trigger" style={{ marginTop: "15px", marginBottom: "20px" }}>
                              <button 
                                className="chance-details-button"
                                onClick={() => setIsChanceModalOpen(true)}
                              >
                                SEE PRIZES
                              </button>
                            </div>
                          )}
                         {overviewFromContext && (
    <div className="draw-row">
        <span className="vault-label" style={{ marginTop: "15px"}}>Next draw</span>
        <span className="vault-data metric-value">
            <DrawCountdown
                pendingPrize={
                    overviewFromContext?.overview
                        ?.pendingPrize as any
                }
                chainName={GetChainName(activeVaultChain)}
            />
        </span>{" "}
    </div> 
)}
                          {vaultData.userDelegatedBalance &&
                            vaultData.userDelegatedBalance.gt(
                              vaultData.userVaultBalance
                            ) && (
                              <div className="draw-row">
                                <span className="vault-label">
                                  Delegated To You
                                </span>
                                <span className="vault-data">
                                  <IconDisplay
                                    name={vaultData.name}
                                    size={20}
                                    alignment={"middle"}
                                  />
                                  {/* <Image
                            src={
                              getVaultIcon(
                                activeVaultAddress,
                                GetChainName(activeVaultChain)
                              ) as string
                            }
                            alt="icon"
                            width={16}
                            height={16}
                            layout="fixed"
                            style={{ verticalAlign: "middle" }} // Apply vertical alignment
                          /> */}
                                  &nbsp;
                                  {NumberWithCommas(
                                    CropDecimals(
                                      ethers.utils.formatUnits(
                                        vaultData.userDelegatedBalance.sub(
                                          vaultData.userVaultBalance
                                        ),
                                        vaultData.decimals
                                      )
                                    )
                                  )}
                                </span>
                              </div>
                            )}
                          {address &&
                            activeVaultAddress &&
                            overviewFromContext &&
                            overviewFromContext.overview && (
                              <div className="data-row">
                                <span className="vault-two">
                                  <VaultRewards
                                    chainName={GetChainName(activeVaultChain)}
                                    chainId={activeVaultChain}
                                    address={address}
                                    vaults={[activeVaultAddress]}
                                    prices={overviewFromContext.overview.prices}
                                  />
                                </span>
                              </div>
                            )}
                          {activePromos &&
                            vaultData &&
                            vaultData.vp &&
                            (activePromos as { [key: string]: any[] })[
                              activeVaultAddress.toLowerCase()
                            ] &&
                            (activePromos as { [key: string]: any[] })[
                              activeVaultAddress.toLowerCase()
                            ].length > 0 &&
                            vaultData && (
                              <>
                                {(activePromos as { [key: string]: any[] })[
                                  activeVaultAddress.toLowerCase()
                                ]
                                  // .filter((activePromo) => activePromo.whitelist) // Filter to only include whitelisted promotions
                                  .map((activePromo, index) => {
                                    // console.log("active promo tokens",activePromo.tokensPerSecond,"decimals,",activePromo.decimals)
                                    const tokensPerSecond =
                                      Math.round(activePromo.tokensPerSecond) /
                                      Math.pow(10, activePromo.tokenDecimals);
                                    // console.log("tokens epr second",tokensPerSecond)
                                    const annualTokens =
                                      tokensPerSecond * 60 * 60 * 24 * 365;
                                    const totalAssetsInVault = Number(
                                      ethers.utils.formatUnits(
                                        vaultData.totalAssets,
                                        vaultData.decimals
                                      )
                                    );
                                    const promoTokenPrice = activePromo.price;
                                    const vaultTokenPrice = assetPrice;
                                    // console.log("promo token price",promoTokenPrice,"tokens",annualTokens,"total assets",totalAssetsInVault,"vault token price",vaultTokenPrice)
                                    const annualYieldPercentage =
                                      ((annualTokens * promoTokenPrice) /
                                        (totalAssetsInVault * vaultTokenPrice)) *
                                      100;

                                    type TokenInfo = {
                                      chain: string;
                                      symbol: string;
                                      icon: string;
                                    } | null;
                                    function getPromoTokenInfo(address: string) {
                                      for (const chain in WHITELIST_REWARDS) {
                                        const tokens = WHITELIST_REWARDS[chain];
                                        const tokenInfo = tokens.find(
                                          (token) =>
                                            token.TOKEN.toLowerCase() ===
                                            address.toLowerCase()
                                        );
                                        if (tokenInfo) {
                                          return {
                                            chain,
                                            symbol: tokenInfo.SYMBOL,
                                            icon: tokenInfo.ICON,
                                          };
                                        }
                                      }
                                      return null; // Return null if the token is not found
                                    }

                                    const tokenInfo = getPromoTokenInfo(
                                      activePromo.token
                                    );
                                    let symbol, icon;

                                    if (tokenInfo) {
                                      ({ symbol, icon } = tokenInfo);
                                    } else {
                                      // Handle the case where tokenInfo is null, if necessary
                                      console.error(
                                        "Token info not found for the address:",
                                        activePromo.token
                                      );
                                    }

                                    return (
                                      <div key={index} className="data-row">
                                        <span className="vault-label">Rewards</span>
                                        <span className="vault-data">
                                          <span className="value-container">
                                            {icon && symbol && (
                                              <span className="reward-icon rounded-icon">
                                                <Image
                                                  src={icon}
                                                  width={16}
                                                  height={16}
                                                  alt={symbol}
                                                />
                                              </span>
                                            )}
                                            &nbsp;
                                            {NumberWithCommas(
                                              activePromo.meta
                                                ? (
                                                    annualYieldPercentage *
                                                    (vaultData.vp ?? 1)
                                                  ).toFixed(1)
                                                : annualYieldPercentage.toFixed(1)
                                            )}
                                            %
                                          </span>
                                        </span>
                                      </div>
                                    );
                                  })}
                              </>
                            )}
                          <div className="data-row">
                            <span className="vault-label">
                              Total Deposits{" "}
                              <span className="hidden-mobile">(TVL)</span>
                            </span>

                            <span
                              className="vault-data"
                              style={{ backgroundColor: "#c6c0e2" }}>
                              <span className="vault-align">
                                <IconDisplay
                                  name={vaultData.assetSymbol}
                                  size={18}
                                  alignment={"middle"}
                                />
                                &nbsp;
                                {NumberWithCommas(
                                  CropDecimals(
                                    ethers.utils.formatUnits(
                                      vaultData.tvl.gt(vaultData.totalAssets)
                                        ? vaultData.tvl
                                        : vaultData.totalAssets,
                                      vaultData.decimals
                                    )
                                  )
                                )}{" "}
                                {/* {vaultData.assetSymbol} */}
                              </span>
                            </span>
                          </div>
                          {!seeAddresses && (
                            <>
                              {vaultData.poolers && (
                                <div className="data-row">
                                  <span className="vault-label">Poolers</span>
                                  <span
                                    className="vault-data"
                                    style={{ backgroundColor: "#c6c0e2" }}>
                                    {NumberWithCommas(vaultData.poolers.toFixed(0))}
                                  </span>
                                </div>
                              )}
                              {(() => {
                                return null; // You need to return null or something renderable
                              })()}
                              {(parseFloat(vaultData.contributed7d) > 0 ||
                                parseFloat(vaultData.contributed24h) > 0 ||
                                parseFloat(vaultData.contributed28d) > 0) && (
                                <div className="data-row hidden-mobile">
                                  <span className="vault-label">
                                    {(() => {
                                      // console.log("yes", vaultData);
                                      return null; // You need to return null or something renderable
                                    })()}
                                    {parseFloat(vaultData.contributed24h) >
                                    parseFloat(vaultData.contributed7d) / 3
                                      ? "24h Vault Yield"
                                      : parseFloat(vaultData.contributed7d) > 0
                                      ? "7d Vault Yield"
                                      : parseFloat(vaultData.contributed28d) > 0
                                      ? "28d Vault Yield"
                                      : "No Yield Data Available"}
                                  </span>
                                  <div className="vault-data">
                                    <div className="value-container">
                                      <div className="value-element">
                                        <PrizeValueIcon
                                          size={20}
                                          chainname={GetChainName(activeVaultChain)}
                                        />
                                        <PrizeValue
                                          amount={BigInt(
                                            Math.round(
                                              parseFloat(vaultData.contributed24h) >
                                                parseFloat(
                                                  vaultData.contributed7d
                                                ) /
                                                  3
                                                ? Number(vaultData.contributed24h) *
                                                    1e18 // Use 24h data
                                                : parseFloat(
                                                    vaultData.contributed7d
                                                  ) > 0
                                                ? Number(vaultData.contributed7d) *
                                                  1e18 // Use 7d data
                                                : parseFloat(
                                                    vaultData.contributed28d
                                                  ) > 0
                                                ? Number(vaultData.contributed28d) *
                                                  1e18 // Use 28d data as fallback
                                                : 0 // Fallback to 0 if no contribution data is available
                                            )
                                          )}
                                          size={20}
                                          chainname={GetChainName(activeVaultChain)}
                                        />
                                      </div>
                                      {prizeTokenPrice > 0 && assetPrice > 0 && (
                                        <>
                                          {(() => {
                                            const contributed7d = Number(
                                              vaultData.contributed7d
                                            );
                                            const contributed24h = Number(
                                              vaultData.contributed24h
                                            );
                                            // Determine the effective contribution based on 24h, 7d, or 28d data
                                            const effectiveContribution =
                                              parseFloat(
                                                vaultData.contributed7d
                                              ) === 0 &&
                                              parseFloat(
                                                vaultData.contributed24h
                                              ) === 0
                                                ? parseFloat(
                                                    vaultData.contributed28d
                                                  ) / 4 // Use 28d / 4 if both 7d and 24h are 0
                                                : parseFloat(
                                                    vaultData.contributed7d
                                                  ) === 0
                                                ? parseFloat(
                                                    vaultData.contributed24h
                                                  ) * 7 // Use 24h contribution annualized if 7d is 0
                                                : parseFloat(
                                                    vaultData.contributed24h
                                                  ) >
                                                  parseFloat(
                                                    vaultData.contributed7d
                                                  ) /
                                                    3
                                                ? parseFloat(
                                                    vaultData.contributed24h
                                                  ) * 7 // Use 24h contribution if it's significantly higher than 7d
                                                : parseFloat(
                                                    vaultData.contributed7d
                                                  ); // Otherwise, use the 7d contribution

                                            // Annualize the effective contribution
                                            const annualContribution =
                                              effectiveContribution * (365 / 7);

                                            const totalAssets = Number(
                                              ethers.utils.formatUnits(
                                                vaultData.totalAssets,
                                                vaultData.decimals
                                              )
                                            );
                                            const contributionValue =
                                              annualContribution * prizeTokenPrice;
                                            const totalAssetsValue =
                                              totalAssets * assetPrice;
                                            const percentage =
                                              (contributionValue /
                                                totalAssetsValue) *
                                              100;
                                            // console.log("contributed 24h",contributed24h,"prize tokens price",prizeTokenPrice,"contribution value",contributionValue)
                                            // console.log("apr",percentage)
                                            // console.log("total asset value",totalAssetsValue)
                                            return (
                                              <div className="value-element">
                                                {`(${percentage.toFixed(1)}% APR)`}
                                              </div>
                                            );
                                          })()}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {vaultData.yieldFeePercentage.gt(
                                ethers.BigNumber.from(0)
                              ) && (
                                <div className="data-row">
                                  <span className="vault-label">Yield Fee</span>
                                  <span className="vault-data">
                                    {NumberWithCommas(
                                      CropDecimals(
                                        parseFloat(
                                          ethers.utils.formatUnits(
                                            vaultData.yieldFeePercentage,
                                            7
                                          )
                                        ).toFixed(2)
                                      )
                                    )}
                                    %
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                          {/* TWAB REWARDS  */}
                          {/* {console.log("promos?", activePromos)} */}
                          {/* // rewards per second * seconds in year / total assets * assets price */}
                          <br></br>
                          {seeAddresses && (
                            <span
                              className="vault-two small-font pointer"
                              onClick={() => setSeeAddresses(false)}>
                              - Close contract info
                            </span>
                          )}
                          {!seeAddresses ? (
                            <span
                              className="vault-two small-font pointer"
                              onClick={() => setSeeAddresses(true)}>
                              <>
                                {!vaultData.gnosis
                                  ? "+ Click for more info"
                                  : vaultData.gnosis.required === -1
                                  ? "+ Yield is governed by EOA wallet, click for more info"
                                  : vaultData.gnosis.total === 0 &&
                                    vaultData.gnosis.required === 0
                                  ? "+ This vault is immutable! Click for more info"
                                  : `+ Yield is governed by a ${vaultData.gnosis.required} of ${vaultData.gnosis.total} Gnosis Safe, click for more info`}
                              </>
                            </span>
                          ) : (
                            <>
                              <div className="data-row">
                                <span className="address-label">
                                  Vault Address{" "}
                                </span>
                                <span className="address-data small-font">
                                  <span className="hidden-mobile">
                                    {activeVaultAddress}{" "}
                                  </span>
                                  <span className="hidden-desktop">
                                    {activeVaultAddress.substring(0, 12)}...{" "}
                                  </span>

                                  <FontAwesomeIcon
                                    icon={faCopy}
                                    size="sm"
                                    style={{
                                      cursor: "pointer",
                                      color: "#21325c",
                                      height: "14px",
                                      marginRight: "5px",
                                      marginLeft: "5px",
                                    }}
                                    onClick={() =>
                                      CopyToClipboardButton(activeVaultAddress)
                                    }
                                  />
                                  <a
                                    href={
                                      ADDRESS[GetChainName(activeVaultChain)]
                                        .ETHERSCAN +
                                      "address/" +
                                      activeVaultAddress
                                    }
                                    target="_blank"
                                    rel="noreferrer">
                                    <Image
                                      src="/images/etherscan.svg"
                                      height={14}
                                      width={14}
                                      alt="etherscan"
                                    />
                                  </a>
                                </span>
                              </div>
                              <hr className="condensed-hr" />
                              <div className="address-row">
                                <span className="address-label">Owner</span>
                                <span className="address-data small-font">
                                  <span className="hidden-mobile">
                                    {vaultData.owner}{" "}
                                  </span>
                                  <span className="hidden-desktop">
                                    {vaultData.owner.substring(0, 12)}...{" "}
                                  </span>

                                  <FontAwesomeIcon
                                    icon={faCopy}
                                    size="sm"
                                    style={{
                                      cursor: "pointer",
                                      color: "#21325c",
                                      height: "14px",
                                      marginRight: "5px",
                                      marginLeft: "5px",
                                    }}
                                    onClick={() =>
                                      CopyToClipboardButton(vaultData.owner)
                                    }
                                  />
                                  <a
                                    href={
                                      ADDRESS[GetChainName(activeVaultChain)]
                                        .ETHERSCAN +
                                      "address/" +
                                      vaultData.owner
                                    }
                                    target="_blank"
                                    rel="noreferrer">
                                    <Image
                                      src="/images/etherscan.svg"
                                      height={14}
                                      width={14}
                                      alt="etherscan"
                                    />
                                  </a>
                                </span>
                              </div>
                              <hr className="condensed-hr" />

                              {/* <div className="data-row">
                                    <span className="vault-label">Decimals</span>
                                    <span className="vault-data">{vaultData.decimals}</span>
                                </div> */}

                              {/* <div className="address-row">
    <span className="address-label">Asset</span>
    <span className="address-data small-font">
        {vaultData.asset} &nbsp; &nbsp;
        <a href={"https://optimistic.etherscan.io/address/"+vaultData.asset} target="_blank" rel="noreferrer"><Image src="/images/etherscan.svg" height={14} width={14} alt="etherscan" /></a>
    </span>
</div> */}
                              {/* <hr className="condensed-hr"/> */}

                              <div className="address-row">
                              <span className="address-label">
  Liquidate Pair{" "}
  {Number.isFinite(activeVaultChain) && vaultData?.liquidationPair && (
    <Link
      href={{
        pathname: "/liquidate",
        query: {
          chain: activeVaultChain,
          address: vaultData.liquidationPair,
        },
      }}
    >
      ^
    </Link>
  )}
</span>

                                <span className="address-data small-font">
                                  <span className="hidden-mobile">
                                    {vaultData.liquidationPair}{" "}
                                  </span>
                                  <span className="hidden-desktop">
                                    {vaultData.liquidationPair.substring(0, 12)}...{" "}
                                  </span>

                                  <FontAwesomeIcon
                                    icon={faCopy}
                                    size="sm"
                                    style={{
                                      cursor: "pointer",
                                      color: "#21325c",
                                      height: "14px",
                                      marginRight: "5px",
                                      marginLeft: "5px",
                                    }}
                                    onClick={() =>
                                      CopyToClipboardButton(
                                        vaultData.liquidationPair
                                      )
                                    }
                                  />
                                  <a
                                    href={
                                      ADDRESS[GetChainName(activeVaultChain)]
                                        .ETHERSCAN +
                                      "address/" +
                                      vaultData.liquidationPair
                                    }
                                    target="_blank"
                                    rel="noreferrer">
                                    <Image
                                      src="/images/etherscan.svg"
                                      height={14}
                                      width={14}
                                      alt="etherscan"
                                    />
                                  </a>
                                </span>
                              </div>
                              <hr className="condensed-hr" />

                              <div className="address-row">
                                <span className="address-label">Deposit Token</span>
                                <span className="address-data small-font">
                                  <span className="hidden-mobile">
                                    {vaultData.asset}{" "}
                                  </span>
                                  <span className="hidden-desktop">
                                    {vaultData.asset.substring(0, 12)}...{" "}
                                  </span>

                                  <FontAwesomeIcon
                                    icon={faCopy}
                                    size="sm"
                                    style={{
                                      cursor: "pointer",
                                      color: "#21325c",
                                      height: "14px",
                                      marginRight: "5px",
                                      marginLeft: "5px",
                                    }}
                                    onClick={() =>
                                      CopyToClipboardButton(vaultData.asset)
                                    }
                                  />
                                  <a
                                    href={
                                      ADDRESS[GetChainName(activeVaultChain)]
                                        .ETHERSCAN +
                                      "address/" +
                                      vaultData.asset
                                    }
                                    target="_blank"
                                    rel="noreferrer">
                                    <Image
                                      src="/images/etherscan.svg"
                                      height={14}
                                      width={14}
                                      alt="etherscan"
                                    />
                                  </a>
                                </span>
                              </div>
                            </>
                          )}
                          {/* <div className="data-row">
                                    <span className="vault-label">Asset Symbol</span>
                                    <span className="vault-data"></span>
                                </div> */}
                          {/* <div className="data-row">
                                    <span className="vault-label">Balance</span>
                                    <span className="vault-data">{vaultData.balance}</span>
                                </div> */}
                        </>
                      ) : (
                        <center>
                          <div className="spinner-large" />
                        </center>
                      )}
                    </>
                  )}
                </div>
                </div>
                </div>
                {showChanceInfo && (
                  <div className="vault-chance-content">
                    <h3 className="chance-section-title">
                      {vaultData && vaultData.userVaultBalance.gt(0)
                        ? "Your Chance"
                        : "Prizes"}
                    </h3>
                    {(() => {
                      return null;
                    })()}
                    <VaultChanceInfo
                      chance={chance}
                      vaultData={vaultData}
                      activeVaultChain={activeVaultChain}
                      userWinChance={userWinChance}
                      overviewFromContext={overviewFromContext}
                    />
                  </div>
                )}
                </div>

          <ToastContainer style={{ zIndex: 9999 }} />
          {vaultData && (
            <DepositSuccessModal
              isOpen={isDepositSuccessModalOpen}
              onClose={handleCloseModal}
              symbol={vaultData.assetSymbol}
              amount={buyAmount}
              hash={depositHash}
            />
          )}
          
          {/* Mobile chance info modal */}
          {isChanceModalOpen && (
            <div className="chance-modal-overlay" onClick={() => setIsChanceModalOpen(false)}>
              <div className="chance-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="chance-modal-header">
                  <h3>
                    {vaultData && vaultData.userVaultBalance.gt(0)
                      ? "Your Chance"
                      : "Prizes"}
                  </h3>
                  <button 
                    className="chance-modal-close"
                    onClick={() => setIsChanceModalOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="chance-modal-body">
                  <VaultChanceInfo
                    chance={chance}
                    vaultData={vaultData}
                    activeVaultChain={activeVaultChain}
                    userWinChance={userWinChance}
                    overviewFromContext={overviewFromContext}
                    isModal={true}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        )}
        {/* </div> */}
      </center>
    </Layout>
  );
};

export default Vault;
