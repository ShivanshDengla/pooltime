import React, { useEffect, useState } from "react";
import Layout from "./index"; 
import Image from "next/image";
import PrizeValueIcon from "../components/prizeValueIcon";
import PrizeValue from "../components/prizeValue";
import Wins from "../components/leaderboardWins";

interface Winner {
  p: string;
  draws: string;
  prizes: string;
  won: string;
}

const Leaderboard: React.FC = () => {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [searchQuery, setSearchQuery] = useState(() => {
    // Initialize from sessionStorage if available
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('leaderboard-search') || "";
    }
    return "";
  }); 
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`https://poolexplorer.xyz/prizeleaderboard`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        setWinners(data); 
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
        // Set empty array so app continues to work
        setWinners([]);
      }
    };

    fetchData();
  }, []);

  const handleAddressClick = (address: string) => {
    setSelectedAddress(address);
  };

  const handleCloseModal = () => {
    setSelectedAddress(null);
  };

  const filteredWinners = searchQuery.length === 0
    ? winners
    : winners.filter((winner) =>
        winner.p.toLowerCase().includes(searchQuery.toLowerCase())
      );

  return (
    <Layout>
      <div className="header-container">
        <Image 
          src={`/images/divingboard.png`} 
          height={100} 
          width={100} 
          alt="liquidator" 
          className="header-image"
        />
        <h1 className="header-title">
          <span className="hidden-mobile"></span> LEADERBOARD
        </h1>
      </div>
      <br />
      <center>
        <div className="vault-search-container-leaderboard">
          <input
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);
              // Cache the search input in sessionStorage
              if (typeof window !== 'undefined') {
                sessionStorage.setItem('leaderboard-search', value);
              }
            }}
            className="vaultsearchleaderboard"
            placeholder="Search..."
          />
        </div>
        <br />
        <div className="draw-history">
          <table className="draw-table">
            <thead>
              <tr>
                <th className="hidden-mobile">Rank</th>
                <th>Pooler</th>
                <th className="hidden-mobile">Draws Won</th>
                <th className="hidden-mobile">Prizes Won</th>
                <th style={{ textAlign: "center" }}>Prizes</th>
              </tr>
            </thead>
            <tbody>
              {filteredWinners.map((winner, index) => (
                <tr key={winner.p} onClick={() => handleAddressClick(winner.p)} style={{ cursor: "pointer" }}>
                  <td className="hidden-mobile">{index + 1}</td>
                  <td className="hidden-mobile">{winner.p && `${winner.p.slice(0, 6)}...${winner.p.slice(winner.p.length - 4)}`}</td>
                  <td className="hidden-desktop">
                    {winner.p && `${winner.p.slice(0, 6)}...${winner.p.slice(winner.p.length - 4)}`}
                  </td>
                  <td className="hidden-mobile">{winner.draws}</td>
                  <td className="hidden-mobile">{winner.prizes}</td>
                  <td className="amount" style={{ textAlign: "center" }}>
                    <PrizeValueIcon size={20} />
                    <PrizeValue amount={BigInt(winner.won)} size={20} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </center>
      {selectedAddress && (
        <div style={styles.modalOverlay} onClick={handleCloseModal}>
          <Wins addressProp={selectedAddress} onClose={handleCloseModal} />
        </div>
      )}
      <style jsx>{`
        .header-container {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .header-image {
          flex-shrink: 0;
          height: auto;
          width: auto;
          max-width: 100px;
          max-height: 100px;
        }
        .header-title {
          margin: 20 0 0 10px;
          line-height: 1;
          font-size: 2rem; // Adjust font size as needed
          flex-shrink: 1;
        }
        @media (max-width: 600px) {
          .header-image {
            margin-right: 10px;
          }
          .header-title {
            font-size: 1.5rem; // Adjust for smaller screens
            margin: 0px 0 0 15px;
          }
          .header-container {
            justify-content: flex-start;
            padding: 0 10px;
            margin-top: 20px;
          }
        }
        
      `}</style>
    </Layout>
  );
};

const styles: any = {
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalContent: {
    position: "relative",
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "10px",
    width: "80%",
    maxWidth: "600px",
    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
    zIndex: 1001,
    overflow: "auto",
  },
};

export default Leaderboard;
