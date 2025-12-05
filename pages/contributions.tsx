import React, { useEffect, useState } from "react";
import { GetContributePrizeTokenEvents } from "../utils/getContributePrizeTokenEvents";
import Image from "next/image";
import Layout from "./index";
import { ethers } from "ethers";
import { GetChainName } from "../utils/getChain";
import { CropDecimals, PrizeToke } from "../utils/tokenMaths";
import donut from "public/images/pooltogether.png";
import { ADDRESS } from "../constants/address";
import PrizeValueIcon from "../components/prizeValueIcon";
import PrizeValue from "../components/prizeValue";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  LineController,
} from "chart.js";
import { ChartData, ChartOptions, ChartDataset, TickOptions } from "chart.js";
import { Bar } from "react-chartjs-2";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretUp } from "@fortawesome/free-solid-svg-icons";
import IconDisplay from "../components/icons";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LogarithmicScale,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend
);

interface Vault {
  vault: string;
  name: string;
  icon?: string;
}

interface DrawContribution {
  drawId: number;
  totalContribution: string;
}

interface CustomChartData
  extends ChartData<"bar" | "line", (number | null)[], string> {
  datasets: (ChartDataset<"bar", number[]> | ChartDataset<"line", number[]>)[];
}

interface CustomChartOptions extends ChartOptions<"bar"> {}

const Contributions: React.FC = () => {
  const [contributions, setContributions] = useState<any[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [chartData, setChartData] = useState<CustomChartData>({
    labels: [],
    datasets: [],
  });
  const [chartOptions, setChartOptions] = useState<CustomChartOptions>({});
  const [selectedChain, setSelectedChain] = useState<number>(10);
  const [selectedChainName, setSelectedChainName] = useState<string>(
    GetChainName(10)
  );
  const [expandedDraws, setExpandedDraws] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchVaults = async () => {
      try {
        const response = await fetch("https://poolexplorer.xyz/vaults");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data: Vault[] = await response.json();
        setVaults(data);
      } catch (error) {
        console.error("Error fetching vault data:", error);
        // Set empty array so app continues to work
        setVaults([]);
      }
    };

    fetchVaults();
  }, []);

  const getVaultName = (vaultAddress: string) => {
    const vault = vaults.find(
      (v) => v.vault.toLowerCase() === vaultAddress.toLowerCase()
    );
    if (vault) {
      return {
        name: vault.name,
      };
    } else {
      return {
        name: "Unknown Vault",
      };
    }
  };

  const chainOptions = Object.keys(ADDRESS).map((chainName) => (
    <option key={ADDRESS[chainName].CHAINID} value={ADDRESS[chainName].CHAINID}>
      {GetChainName(ADDRESS[chainName].CHAINID)}
    </option>
  ));

  const handleChainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const chainId = parseInt(e.target.value);
    const chainName = GetChainName(chainId);
    setSelectedChain(chainId);
    setSelectedChainName(chainName);
  };

  useEffect(() => {
    const fetchData = async () => {
      const contributions = await GetContributePrizeTokenEvents(selectedChain);

      const groupedContributions = contributions.reduce(
        (
          acc: Record<
            string,
            {
              drawId: number;
              amount: ethers.BigNumber;
              vaults: string[];
              vaultContributions: Record<string, ethers.BigNumber>;
              count: number;
              vaultPercentages?: Record<string, string>;
            }
          >,
          { drawId, amount, vault }
        ) => {
          if (!acc[drawId]) {
            acc[drawId] = {
              drawId,
              amount: ethers.BigNumber.from(0),
              vaults: [],
              vaultContributions: {},
              count: 0,
            };
          }
          acc[drawId].amount = acc[drawId].amount.add(amount);
          if (!acc[drawId].vaults.includes(vault)) {
            acc[drawId].vaults.push(vault);
          }
          if (acc[drawId].vaultContributions[vault]) {
            acc[drawId].vaultContributions[vault] =
              acc[drawId].vaultContributions[vault].add(amount);
          } else {
            acc[drawId].vaultContributions[vault] =
              ethers.BigNumber.from(amount);
          }
          acc[drawId].count++;
          return acc;
        },
        {}
      );

      Object.keys(groupedContributions).forEach((drawId) => {
        const draw = groupedContributions[drawId];
        const totalAmount = draw.amount;
        draw.vaultPercentages = {}; // Initialize vaultPercentages

        Object.keys(draw.vaultContributions).forEach((vault) => {
          const vaultAmount = draw.vaultContributions[vault];
          const percentage = vaultAmount.mul(100).div(totalAmount);
          draw.vaultPercentages![vault] = percentage.toString();
        });
      });

      const sortedContributions = Object.values(groupedContributions).sort(
        (a, b) => b.drawId - a.drawId
      );
      const filteredContributions = sortedContributions.filter((result) =>
        result.amount.gt(0)
      );
      setContributions(filteredContributions);

      // Automatically open the most recent draw
      if (filteredContributions.length > 0) {
        setExpandedDraws(new Set([filteredContributions[0].drawId]));
      }

      console.log("contributions", filteredContributions);
    };

    fetchData();
  }, [selectedChain]);

  useEffect(() => {
    if (contributions.length > 0) {
      const drawContributions: DrawContribution[] = contributions.map(
        ({ drawId, amount }) => ({
          drawId,
          totalContribution: ethers.utils.formatUnits(amount, 18),
        })
      );

      const sortedDrawContributions = drawContributions.sort(
        (a, b) => a.drawId - b.drawId
      );
      const totalContributedValue = sortedDrawContributions.reduce(
        (acc, { totalContribution }) =>
          acc.add(ethers.utils.parseUnits(totalContribution, 18)),
        ethers.BigNumber.from(0)
      );
      const averageContribution = totalContributedValue.div(
        sortedDrawContributions.length
      );
      let cumulativeTotal = ethers.BigNumber.from(0);
      let cumulativeAverages: number[] = [];

      for (let i = 0; i < sortedDrawContributions.length; i++) {
        cumulativeTotal = cumulativeTotal.add(
          ethers.utils.parseUnits(
            sortedDrawContributions[i].totalContribution,
            18
          )
        );
        cumulativeAverages.push(
          parseFloat(ethers.utils.formatUnits(cumulativeTotal.div(i + 1), 18))
        );
      }

      const newChartData: CustomChartData = {
        labels: sortedDrawContributions.map((item) => `Draw ${item.drawId}`),
        datasets: [
          {
            type: "bar",
            label: `${PrizeToke(BigInt(totalContributedValue.toString()))} ${
              ADDRESS[selectedChainName].PRIZETOKEN.SYMBOL
            } Prize Generated`,
            data: sortedDrawContributions.map((item) =>
              parseFloat(CropDecimals(item.totalContribution))
            ),
            backgroundColor: "#d194e0",
            borderColor: "rgba(54, 162, 235, 1)",
            borderWidth: 0,
          },
          {
            type: "line",
            label: `${PrizeToke(
              BigInt(averageContribution.toString())
            )} Average`,
            data: cumulativeAverages,
            borderColor: "#31fad9",
            borderWidth: 1,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            pointHitRadius: 0,
            pointHoverRadius: 0,
          },
        ],
      };
      const newChartOptions: CustomChartOptions = {
        scales: {
          x: {
            ticks: {
              color: "white",
              autoSkip: true,
              maxTicksLimit: 20,
              maxRotation: 45,
              minRotation: 45,
              callback: (
                tickValue: string | number,
                index: number,
                ticks: any[]
              ) => {
                return tickValue.toString();
              },
            } as any, // Type assertion to override TypeScript warning for the entire ticks object
          },
          y: {
            type: "logarithmic",
            ticks: {
              color: "white",
              autoSkip: true,
              maxTicksLimit: 5,
              callback: (value: string | number) => {
                return value.toString();
              },
            } as any, // Type assertion to override TypeScript warning for the entire ticks object
          },
        },
        plugins: {
          datalabels: {
            display: false,
          },
          tooltip: {
            enabled: true,
            callbacks: {
              label: function (context: any) {
                return `${context.parsed.y} ${ADDRESS[selectedChainName].PRIZETOKEN.SYMBOL}`;
              },
            },
          },
          legend: {
            labels: {
              color: "white",
            },
          },
        },
      };

      setChartData(newChartData);
      setChartOptions(newChartOptions);
    }
  }, [contributions, selectedChainName]);

  const toggleDrawDetails = (drawId: number) => {
    setExpandedDraws((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(drawId)) {
        newSet.delete(drawId);
      } else {
        newSet.add(drawId);
      }
      return newSet;
    });
  };

  return (
    <Layout>
      <center>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
          <Image
            src={`/images/machine.png`}
            height={120}
            width={120}
            alt="generator"
            layout="fixed"
          />
          <h1 style={{ margin: "0 0 0 10px", lineHeight: "120px" }}>
            PRIZE MACHINE
          </h1>
        </div>

        <div style={{ marginBottom: "20px" }}>
          {/* <label htmlFor="chainSelector">Select Chain: </label> */}
          <select
            id="chainSelector"
            onChange={handleChainChange}
            value={selectedChain}
            className="select-chain">
            {chainOptions}
          </select>
        </div>

        {contributions.length > 0 ? (
          <>
            <div className="hidden-desktop" style={{ maxWidth: "310px" }}>
              <br />
              <Bar
                data={chartData as ChartData<"bar", number[], string>}
                options={chartOptions}
              />
            </div>
            <div className="hidden-mobile" style={{ maxWidth: "510px" }}>
              <Bar
                data={chartData as ChartData<"bar", number[], string>}
                options={chartOptions}
              />
            </div>
            <div className="win-container">
              <div style={{ maxWidth: "800px" }}>
                <table className="claims-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Draw</th>
                      <th style={{ textAlign: "left" }}>Vaults</th>
                      <th
                        style={{ textAlign: "right" }}
                        className="hidden-mobile">
                        Contributions
                      </th>
                      <th style={{ textAlign: "right" }}>Yield</th>
                      <th
                        className="hidden-mobile"
                        style={{ textAlign: "right" }}>
                        Avg Size
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contributions.map(
                      (
                        {
                          drawId,
                          amount,
                          vaults,
                          vaultContributions,
                          vaultPercentages,
                          count,
                        },
                        index
                      ) => (
                        <React.Fragment key={drawId}>
                          <tr onClick={() => toggleDrawDetails(drawId)}>
                            <td style={{ textAlign: "left" }}>
                              <span className="hidden-mobile">Draw</span>{" "}
                              {drawId}
                              <FontAwesomeIcon
                                icon={
                                  expandedDraws.has(drawId)
                                    ? faCaretUp
                                    : faCaretDown
                                }
                                height={20}
                                width={20}
                                style={{ marginLeft: "10px" }}
                              />
                            </td>
                            <td style={{ textAlign: "left" }}>
                              &nbsp;&nbsp;{vaults.length}
                              {vaults.map((vault: any, index: any) => {
                                const { name } = getVaultName(vault);
                                const vaultAmount = PrizeToke(
                                  vaultContributions[vault]
                                );
                                const percentage = vaultPercentages[vault];
                                return (
                                  <a
                                    key={index}
                                    href={`${ADDRESS[selectedChainName].ETHERSCAN}address/${vault}`}>
                                    <span
                                      title={`${name} ${vaultAmount} ${ADDRESS[selectedChainName].PRIZETOKEN.SYMBOL} (${percentage}%)`}>
                                      {/* <Image
                                      src={icon}
                                      height={16}
                                      width={16}
                                      alt="Vault Icon"
                                    /> */}
                                    </span>
                                  </a>
                                );
                              })}
                            </td>
                            <td
                              style={{ textAlign: "right" }}
                              className="hidden-mobile">
                              {count}&nbsp;&nbsp;
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <PrizeValueIcon size={14} />
                              <PrizeValue amount={amount} size={12} />
                            </td>
                            <td
                              className="hidden-mobile"
                              style={{ textAlign: "right" }}>
                              <PrizeValueIcon size={14} />

                              <PrizeValue amount={amount.div(count)} />
                            </td>
                          </tr>
                          {expandedDraws.has(drawId) && (
                            <tr>
                              <td colSpan={5}>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Vault</th>
                                      <th className="hidden-mobile">
                                        Percentage
                                      </th>
                                      <th>Contributed</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {vaults
                                      .slice()

                                      .sort((a: any, b: any) =>
                                        vaultContributions[b]
                                          .sub(vaultContributions[a])
                                          .gt(0)
                                          ? 1
                                          : -1
                                      )

                                      .map((vault: string, index: number) => {
                                        const { name } = getVaultName(vault);

                                        return (
                                          <tr key={index}>
                                            <td>
                                              <IconDisplay name={name} />
                                              &nbsp;{name.substring(0, 18)}
                                            </td>
                                            <td className="hidden-mobile">
                                              {vaultPercentages[vault]}%
                                            </td>

                                            <td>
                                              <PrizeValueIcon size={16} />
                                              <PrizeValue
                                                amount={
                                                  vaultContributions[vault]
                                                }
                                                size={20}
                                              />
                                            </td>
                                          </tr>
                                        );
                                      })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="loading-animation">
              <div className="loading-image">
                <Image src={donut} alt="Loading" priority={true} />
              </div>
            </div>
          </>
        )}
      </center>
    </Layout>
  );
};

export default Contributions;
