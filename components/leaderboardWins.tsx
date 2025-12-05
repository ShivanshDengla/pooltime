import React, { useEffect, useState, CSSProperties, useRef } from "react";
import {
  TwitterShareButton,
  HeyShareButton,
  WarpShareButton,
} from "./socialShareButtons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAward,
  faArrowUp,
  faArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { GetChainName} from "../utils/getChain";
import { TierColors } from "../constants/constants";
import Image from "next/image";
import PrizeIcon from "./prizeIcon";
import { CropDecimals, NumberWithCommas } from "../utils/tokenMaths";
import { ADDRESS, CONFIG } from "../constants/";
import { ethers } from "ethers";
import TopWinners from "./topWinners";
import WinsListModal from "./winsListModalLeaderboard";
import { PrizeToke } from "../utils/tokenMaths";
import PrizeValue from "./prizeValue";
import PrizeValueIcon from "./prizeValueIcon";

const messageOptions = [
  "Saving with PoolTogether is paying off, I just won! https://pooltime.app",
  "I won a prize playing the PoolTogether prize savings game!! https://pooltime.app",
  "The oracle of randomness has blessed me with a win on PoolTogether!! https://pooltime.app",
];

interface WinProps {
  addressProp: string;
  onClose: () => void;
}

interface AggregateWin {
  network: number;
  draw: number;
  totalPayout: string;
  tiers: number[];
  prizes: number;
  claim_time: string;
  vault: string;
}
interface SelectedWin {
  value: number;
  network: string;
  draw: number;
  tiers: number[];
  prizes: number;
}

const Wins: React.FC<WinProps> = ({ addressProp, onClose }) => {
  const [randomMessage, setRandomMessage] = useState("");

  useEffect(() => {
    // Randomize the message when the modal opens
    {
      const randomIndex = Math.floor(Math.random() * messageOptions.length);
      setRandomMessage(messageOptions[randomIndex]);
    }
  }, []);
  const [wins, setWins] = useState<AggregateWin[]>([]);
  const [winStartIndex, setWinStartIndex] = useState(0);
  const [maxCards, setMaxCards] = useState(3);
  const [showModal, setShowModal] = useState(false);
  
  const [selectedWinValue, setSelectedWinValue] = useState<SelectedWin | null>(
    null
  );
  const [totalAmountWon, setTotalAmountWon] = useState("0");
console.log("leaderboard wins")
  const customizeMessage = (platform: string) => {
    let handle = "";
    switch (platform) {
      case "twitter":
        handle = "@pooltogether_";
        break;
      case "warpcast":
        handle = "Pooltogether";
        break;
      case "hey":
        handle = "@pooltogether";
        break;
      default:
        handle = "@pooltogether";
    }
    return randomMessage.replace("{handle}", handle);
  };

  const handlePrevious = () => {
    if (winStartIndex > 0) {
      setWinStartIndex(winStartIndex - 1);
    }
  };

  const handleNext = () => {
    if (winStartIndex < wins.length - maxCards) {
      setWinStartIndex(winStartIndex + 1);
    }
  };

  const calculateTotalAmountWon = (flatWins: any) => {
    // console.log("calculating total won");
    return flatWins
      .reduce((acc: bigint, win: any) => {
        return acc + BigInt(win.totalPayout);
      }, BigInt(0))
      .toString();
  };
  // console.log("total won", totalAmountWon);

  // const openModal = async (network: string, draw: number, tier: number, claimedIndices: string[]) => {
  //   try {
  //     const response = await fetch(`https://poolexplorer.xyz/${network}-{$ADDRESS[CONFIG.CHAINNAME].PRIZEPOOL}-draw${draw}`);
  //     const data = await response.json();
  //     const tierValue = data.tiers[network][tier];
  //     let totalClaimedValue = 0
  //     if(claimedIndices){
  //     totalClaimedValue = claimedIndices
  //         .filter(val => val !== "-1")
  //         .reduce((sum, value) => sum + Number(value), 0);
  //     }
  //     const value = totalClaimedValue;
  //     setSelectedWinValue({ value, network, tier, draw });
  //     setShowModal(true);
  //   } catch (error) {
  //     console.error("Error fetching win value:", error);
  //   }
  // };

  const displayWinInModal = (win: AggregateWin) => {
    // Assuming the AggregateWin structure will now contain the tier and claimedIndices
    setSelectedWinValue({
      value: Number(win.totalPayout),
      network: win.network.toString(),
      tiers: win.tiers,
      prizes: win.prizes,
      draw: win.draw,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedWinValue(null);
  };
  useEffect(() => {
    const fetchWins = async () => {
      try {
        const fetchPlayer = await fetch(
          "https://poolexplorer.xyz/player-claims?address=" + addressProp
        );
        if (!fetchPlayer.ok) {
          throw new Error(`HTTP ${fetchPlayer.status}`);
        }
        let fetchedPlayer = await fetchPlayer.json();
        // console.log("Raw fetched player data:", fetchedPlayer);
     
  
        // Create an array of all prize pools across all chains
        const allPrizePools = Object.values(ADDRESS).map(chain => chain.PRIZEPOOL.toLowerCase());
  
        fetchedPlayer = fetchedPlayer.filter(
          (player: any) => allPrizePools.includes(player.prizepool.toLowerCase())
        );
  
  
        fetchedPlayer = fetchedPlayer.filter(
          (player: any) => player.payout !== "0"
        );
  
        // Group by network and draw and sum the payout
        const aggregatedWins: { [key: string]: AggregateWin } = {};
        fetchedPlayer.forEach((win: any) => {
          const key = `${win.network}-${win.draw}`;
          if (!aggregatedWins[key]) {
            aggregatedWins[key] = {
              network: win.network,
              draw: win.draw,
              totalPayout: "0",
              vault: win.vault,
              tiers: [],
              prizes: 0,
              claim_time: win.claim_time, // Initialize claim_time with the string from API
            };
          }
  
          // Update the total payout
          aggregatedWins[key].totalPayout = (
            BigInt(aggregatedWins[key].totalPayout) + BigInt(win.payout)
          ).toString();
  
          // Update tiers (only if the tier doesn't exist already in the tiers array)
          if (!aggregatedWins[key].tiers.includes(win.tier)) {
            aggregatedWins[key].tiers.push(win.tier);
            aggregatedWins[key].tiers.sort((a, b) => a - b); // Sort tiers in ascending order
          }
  
          // Update prizes (increment the count for every win entry)
          aggregatedWins[key].prizes += 1;
  
          // Update claim_time to be the latest claim_time if it's more recent
          // const winClaimTime = new Date(win.claim_time);
          // const aggregatedClaimTime = new Date(aggregatedWins[key].claim_time);
          // console.log("aggregated",aggregatedClaimTime,"win claim time",winClaimTime)
          // console.log("parsed win time",Date.parse(win.claim_time))
         // Update claim_time to be the latest claim_time if it's more recent
        const winClaimTime = new Date(win.claim_time).getTime();
        const aggregatedClaimTime = new Date(aggregatedWins[key].claim_time).getTime();
        if (winClaimTime > aggregatedClaimTime) {
          aggregatedWins[key].claim_time = new Date(winClaimTime).toISOString();
        }
      });
        // Flatten and sort the wins by claim_time in descending order
        const flattenedWins: AggregateWin[] = Object.values(aggregatedWins).map(win => {
          return {
            ...win,
            claim_time: new Date(win.claim_time).toLocaleString(), // Convert claim_time to locale string format
          };
        }).sort(
          (a: AggregateWin, b: AggregateWin) => {
            return new Date(b.claim_time).getTime() - new Date(a.claim_time).getTime();
          }
        );
  
        // console.log("Processed and sorted wins:", flattenedWins);
        setWins(flattenedWins);
        setTotalAmountWon(calculateTotalAmountWon(flattenedWins));
      } catch (error) {
        console.error("Error fetching wins:", error);
        // Set empty wins so app continues to work
        setWins([]);
        setTotalAmountWon("0");
      }
    };
  
    fetchWins();
  }, [addressProp]);
  

  
  

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMaxCards(3);
      } else {
        setMaxCards(2);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const totalWins = wins.length;
  let winsText = totalWins === 1 ? "WON " : `${totalWins} WINS `;
console.log("true??",wins.length > 0 && parseInt(totalAmountWon))
  return (
    <WinsListModal showModal={true}
    onClose={onClose}
    wins={wins}
    address={addressProp}
    />)
};

const styles: any = {
  container: {
    backgroundColor: "#b4ccd1",
    padding: "20px",
    borderRadius: "10px",
    marginTop: "10px",
    width: "350px",
    display: "inline-block",
    "@media (min-width: 768px)": {
      display: "inline-flex",
      minWidth: "auto",
    },
  },
  contentContainer: {
    display: "flex",
    alignItems: "center",
  },
  vaultGrid: {
    backgroundColor: "#e5f3f5",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    paddingRight: "5px",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
    padding: "10px",
    width: "100%", // Ensure the grid takes the full width of its parent
  },
  vaultCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "transparent",
    padding: "6px",
    width: "100%", // This will stretch each card to take the full width of the vaultGrid
    boxSizing: "border-box", // Ensure padding doesn't affect the overall width
  },
  // Remove the last entry's bottom border
  lastVaultCard: {
    borderBottom: "none",
  },
  symbol: {
    marginRight: "12px",
    display: "flex",
    alignItems: "center",
  },
  alignBottom: {
    display: "flex",
    alignItems: "center",
  },
  arrowIcon: {
    height: "16px",
    cursor: "pointer",
    paddingTop: "14px",
  },
  earnings: {
    // marginRight: "12px",
    textAlign: "right",
    flex: 1,
  },
  arrowsContainer: {
    display: "flex",
    paddingLeft: "10px",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    height: "100%",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalContent: {
    color: "white",
    maxWidth: "500px",
    width: "85%",
    backgroundColor: "#FFFFFF",
    padding: "20px 20px 0px 20px",
    borderRadius: "25px",
    boxShadow: "0 4px 15px rgba(0, 0, 0, 0.2)",
    position: "relative",
    textAlign: "center",
    backgroundImage:
      "linear-gradient(120deg, rgb(240, 147, 251) 0%, #575df5 100%)",
    overflow: "hidden", // to hide the confetti that falls out of the modal
  },
  modalHeader: {
    position: "relative", // Added this line
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: "10px",
    marginBottom: "20px",
    fontSize: "23px",
    color: "#ceedeb",
  },
  headerText: {
    backgroundColor: "#352347db",
    borderRadius: "7px",
    padding: "10px",
  },
  closeModalButton: {
    background: "none",
    border: "none",
    fontSize: "15px",
    cursor: "pointer",
    color: "#FFF",
    padding: "0px",
    marginLeft: "10px", // give a little space from the text
    marginTop: "-25px",
  },
  modalTier: {
    fontSize: "19px",
  },
  winValue: {
    fontSize: "55px",
  },
  winValueMobile: { fontSize: "45px" },
};

export default Wins;
