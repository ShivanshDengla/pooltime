import React, { useEffect, useState } from "react";
import { useOverview } from "./contextOverview";
import Image from "next/image";
import PrizeValueIcon from "./prizeValueIcon";
import PrizeValue from "./prizeValue";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { ADDRESS } from "../constants";

interface PrizeData {
  [key: string]: {
    total: string;
    prizes: {
      drawPeriodSeconds: number;
      nextDrawId: number;
      numberOfTiers: number;
      prizePoolPrizeBalance: string;
      tierData: {
        tier: number;
        value: number;
        count: number;
        liquidity: number;
      }[];
    };
  };
}

const PrizeInPool: React.FC = () => {
  const [prizes, setPrizes] = useState<PrizeData>({});
  const [totalPrize, setTotalPrize] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState(false);
  const overviewFromContext = useOverview();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const fetchPrizes = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      try {
        const response = await fetch("https://poolexplorer.xyz/overview", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const prizeData: PrizeData = data.pendingPrize;

        const total = Object.values(prizeData).reduce((acc, prize) => {
          return acc + parseFloat(prize.prizes.prizePoolPrizeBalance)
        }, 0);

        setPrizes(prizeData);
        setTotalPrize(total);
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          console.error("Error fetching prize data:", error);
        }
        setPrizes({});
        setTotalPrize(0);
      } finally {
        clearTimeout(timer);
      }
    };

    fetchPrizes();
  }, []);

  const toggleModal = () => {
    setIsModalOpen(!isModalOpen);
  };

  const closeModal = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (e.target === e.currentTarget) {
      setIsModalOpen(false);
    }
  };

  // console.log("overview from", overviewFromContext);
  // Show loading state while overview is being fetched
  if (
    !overviewFromContext ||
    overviewFromContext.isLoading ||
    !overviewFromContext.overview ||
    !overviewFromContext.overview.prices ||
    !overviewFromContext.overview.prices.geckos
  ) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        minWidth: '120px',
        height: '40px'
      }}>
        <div className="skeleton-item" style={{ width: '100%', height: '20px' }}></div>
      </div>
    );
  }

  const ethereumPrice = overviewFromContext.overview.prices.geckos.ethereum;
  const totalPrizeInDollars = totalPrize * ethereumPrice;

  const sortedPrizes = Object.entries(prizes).sort(
    ([, a], [, b]) => parseInt(b.prizes.prizePoolPrizeBalance) - parseInt(a.prizes.prizePoolPrizeBalance)
  );

  return (
    <>
      {totalPrizeInDollars > 0 && (
        <div style={{ fontSize: "22px", display: "inline-block" }}>
          <span
            onClick={toggleModal}
            className="prize-box"
          >
            <span className="hidden-mobile" style={{ color: "white" }}>
              PRIZES&nbsp;&nbsp;
            </span>
            <span className="hidden-desktop" style={{ fontSize: "14px", marginBottom: '5px', color: '#afcde4' }}>
              Save To Win
            </span>
            <span
              style={{
                margin: "0",
                fontSize: "27px",
                display: "inline-flex",
                alignItems: "center",
                color: "white",
                textShadow: isMobile ? "none" : "0 0 5px #a3a7ea",
              }}
            >
              <PrizeValueIcon size={22} />
              <PrizeValue
                amount={BigInt(totalPrize * 1e18)}
                size={isMobile ? 24 : 30}
                rounded={true}
              />
              <span className="hidden-mobile" style={{ marginLeft: '8px' }}>
                <FontAwesomeIcon
                  icon={faCircleInfo}
                  style={{ color: "#ebeeef", height: "16px", verticalAlign: "middle" }}
                />
              </span>
            </span>
          </span>
          
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        </div>
      )}

      {isModalOpen && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content">
            <div className="close-button-container">
              <button className="close-button" onClick={toggleModal}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="prize-header">
              <Image
                src="/images/pttrophy.svg"
                width={isMobile ? 22 : 26}
                height={isMobile ? 34 : 40}
                alt="trophy"
              />
              &nbsp;&nbsp;&nbsp;Prizes&nbsp;&nbsp;
              <PrizeValueIcon size={isMobile ? 26 : 32} />
              <PrizeValue amount={BigInt(totalPrize * 1e18)} size={isMobile ? 30 : 40} rounded={true}/>
            </div>
            <div className="total-prize"></div>  
            <div className="grid-container">
              <div className="grid-header">
                <div></div>
                <div style={{ textAlign: "right" }}>Prizes&nbsp;&nbsp;</div>
                <div style={{ textAlign: "right", color:"#f0c8f9" }}>Jackpot&nbsp;&nbsp;</div>
                <div style={{ textAlign: "right" }} className="hidden-mobile">Tier 1&nbsp;&nbsp;</div>
              </div>
              {sortedPrizes.map(([chain, prizeData]) => {
                const tier0 = prizeData.prizes.tierData.find(
                  (tier) => tier.tier === 0
                );
                const tier1 = prizeData.prizes.tierData.find(
                  (tier) => tier.tier === 1
                );
                return (
                  <div key={chain} className="grid-row">
                    <div style={{ textAlign: "left", fontSize: "14px" }}>
                      {ADDRESS[chain]?.ICON && (
                        <div
                          style={{
                            width: "24px",
                            height: "24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "0px",
                          }}
                        >
                          <Image
                            src={ADDRESS[chain].ICON}
                            width={24}
                            height={24}
                            alt={chain}
                          />
                        </div>
                      )}
                      <span className="hidden-mobile" style={{ marginLeft: '10px' }}>
                        {chain}
                        </span>
                        <span className="hidden-desktop" style={{ marginLeft: '10px' }}>
                          {chain==="OPTIMISM" ? "OP" : chain === "ARBITRUM" ? "ARB" : chain}
                        </span>
                    </div>
                    
                    <div style={{ textAlign: "right" }}>
                      <PrizeValueIcon size={isMobile ? 18 : 24} chainname={chain} />
                      <PrizeValue amount={BigInt(Math.round(Number(prizeData.prizes.prizePoolPrizeBalance)*1e18))} size={isMobile ? 18 : 28}  rounded={true}/>
                    </div>
                    <div style={{ textAlign: "right",color:"#e9aaf7" }}>
                      {tier0 && tier0.value > 0.01 && (
                        <>
                          <PrizeValueIcon size={isMobile ? 18 : 24} chainname={chain} />
                          <PrizeValue amount={BigInt(Math.round(tier0.value * 1e18))} size={isMobile ? 18 : 28}  rounded={true}/>
                        </>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }} className="hidden-mobile">
                      {tier1 && tier1.value > 0.01 && (
                        <>
                          <PrizeValueIcon size={isMobile ? 18 : 24} chainname={chain} />
                          <PrizeValue amount={BigInt(Math.round(tier1.value * 1e18))} size={isMobile ? 18 : 28}  rounded={true}/>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`        .prize-box {
          display: inline-flex;
          align-items: center;
          cursor: pointer;
        }
        .modal {
          display: flex;
          justify-content: center;
          align-items: center;
          position: fixed;
          z-index: 5000000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.4);
        }
.prize-header {
  margin-bottom: 20px;
  justify-content: center;
  display: flex;
  font-size: 32px;
  align-items: center;
}
        .modal-content {
          position: relative;
          background-color: #030526;
          padding: 30px;
          border: 1px solid #888;
          color: white;
          border-radius: 25px;
          border: 3px solid white;
          box-shadow: rgba(0, 0, 0, 0.2) 0px 4px 15px;
        }

        .total-prize {
          display: flex;
          align-items: center;
          margin-bottom: 20px;
        }
        .grid-container {
          display: grid;
          grid-template-columns: 0.8fr 1fr 1fr 1fr;
          gap: 17px;
        }
        
        .close-button {
          display: none;
        }

        @media (max-width: 768px) { 
          .modal {
            display: block;
          }
          .prize-box {
            background-color: #315672;
            border-radius: 10px;
            padding: 0px 10px;
            flex-direction: column;
            justify-content: center;
            display: flex;
            height: 100%;
          }
          .prize-header {
            flex-wrap: wrap;
            font-size: 20px;
          }
          .prize-header img {
            width: 20px;
            height: 32px;
          }
          .prize-header .prize-value {
            font-size: 28px !important;
          }
          .prize-header .prize-value-icon img {
            width: 21px !important;
            height: 21px !important;
          }

          .grid-container {
            grid-template-columns: 0.6fr 1.8fr 1.5fr;
          }
          .grid-header div {
            font-size: 13px;
          }
          .grid-row div:first-child {
            font-size: 12px !important;
          }
          .grid-row .prize-value {
            font-size: 22px !important;
          }
          .grid-row .prize-value-icon img {
            width: 16px !important;
            height: 16px !important;
          }

          .modal-content {
            width: 100%;
            height: 100%;
            border-radius: 0;
            border: none;
            padding-top: 60px;
            max-height: 100vh;
            overflow-y: auto;
            -ms-overflow-style: none;  /* IE and Edge */
            scrollbar-width: none;  /* Firefox */
          }
          .modal-content::-webkit-scrollbar {
            display: none;
          }
          .close-button-container {
            position: absolute;
            top: 20px;
            right: 20px;
            z-index: 10;
          }
          .close-button {
            display: flex;
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            justify-content: flex-end;
          }
          .grid-row div:last-child {
            text-align: right;
          }
        }
        .grid-header {
          display: contents;
          font-size: 15px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 10px;
          margin-bottom: 10px;
        }

        .grid-row {
          display: contents;
          padding: 10px 0;
          border-bottom: 1px solid #eee;
        }

        .grid-row div {
          padding: 5px;
        }
        .grid-row div:first-child {
          display: flex;
          align-items: center;
        }
        

        .grid-row div:last-child {
          text-align: right;
        }
        
      `}</style>
    </>
  );
};

export default PrizeInPool;

