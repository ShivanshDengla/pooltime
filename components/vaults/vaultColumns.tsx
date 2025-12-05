import React from "react";
import { Column } from "react-table";
import IconDisplay from "../icons";
import { CropDecimals, NumberWithCommas } from "../../utils/tokenMaths";
import { ethers } from "ethers";
import PrizeValueIcon from "../prizeValueIcon";
import PrizeValue from "../prizeValue";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faStar,
  faTicket,
} from "@fortawesome/free-solid-svg-icons";
import VaultRow from "./vaultRow";

interface YieldTooltipProps {
  vaultAPR?: number;
  apr?: number;
  total?: number;
  symbol?: string;
}
type VaultData = {
  name: string;
  poolers: number;
  totalSupply: string;
  depositsDollarValue?: string;
  depositsEthValue?: string;
  vault: string;
  decimals: number;
  symbol: string;
  contributed7d: string; // add this line
  contributed24h: string;
  apr: number;
  vaultAPR?: string;
  won7d: string;
  asset: string;
  assetBalance: ethers.BigNumber;
  vaultBalance: ethers.BigNumber;
  assetSymbol: string;
  status?: number;
  c: number;
  formattedAssetBalance?: string;
  numericAssetBalance?: number;
  formattedVaultBalance?: string;
  numericVaultBalance?: number;
  depositsEthBigInt: number;
};

const safeGt = (val: any) => {
  if (!val) return false;
  if (typeof val.gt === "function") return val.gt(0);
  const n = Number(val);
  return Number.isFinite(n) && n > 0;
};
const VaultYieldTooltip: React.FC<YieldTooltipProps> = ({
  vaultAPR,
  apr,
  total,
  symbol,
}) => {
  return total && total > 0 && isFinite(total) && total < 1000000 ? (
    <>
      <div className="vault-tooltip-container">
        <span className="mobile-vault-header">
          APR
          <br />
        </span>
        {total > 0.01 && (
          <>
            {total.toFixed(1)}%&nbsp;
            {apr && apr > 0.0001 ? (
              <FontAwesomeIcon
                icon={faStar}
                style={{ color: "#1a4160", height: "16px" }}
              />
            ) : (
              <FontAwesomeIcon
                icon={faCircleInfo}
                style={{ color: "#1a4160", height: "16px" }}
              />
            )}
            <div className="vault-tooltip-text">
              {(() => {
                const vaultAPRNum = vaultAPR ? Number(vaultAPR) : 0;
                return vaultAPRNum > 0.001 && isFinite(vaultAPRNum) ? (
                  <div className="vault-tooltip-row">
                    <div>{vaultAPRNum.toFixed(1)}%</div>
                    <div>Avg Prize Yield</div>
                  </div>
                ) : null;
              })()}
              {(() => {
                const aprNum = apr ? Number(apr) : 0;
                return aprNum > 0.0001 && isFinite(aprNum) ? (
                  <div className="vault-tooltip-row">
                    <div>{(aprNum * 100).toFixed(1)}%</div>
                    <div>{symbol} Incentives</div>
                  </div>
                ) : null;
              })()}
              {(() => {
                const vaultAPRNum = vaultAPR ? Number(vaultAPR) : 0;
                const aprNum = apr ? Number(apr) : 0;
                return aprNum > 0.0001 && vaultAPRNum > 0.001 && isFinite(aprNum) && isFinite(vaultAPRNum) ? (
                  <>
                    <hr className="vault-tooltip-hr" />
                    <div className="vault-tooltip-row">
                      <div>{total.toFixed(1)}%</div>
                      <div>Total</div>
                    </div>
                  </>
                ) : null;
              })()}
            </div>
          </>
        )}
      </div>
    </>
  ) : (
    ""
  );
};

export const getVaultColumns = (showStats: boolean): Column<VaultData>[] => [
  {
    Header: "Vault",
    id: "vaults",
    accessor: "name",
    Cell: ({ row }) => {
      const { name, poolers, c, vaultAPR, apr } = row.original;
      return (
        <VaultRow
          name={name}
          poolers={poolers}
          chainId={c}
          vaultAPR={vaultAPR}
          apr={apr}
          showStats={showStats}
        />
      );
    },
  },
  {
    Header: <div style={{ margin: "0px 0px 0px 30px" }}>Your Tokens</div>,
    id: "tokens",
    accessor: (row: any) => {
      const vb = row.vaultBalance;
      const hasBalance = safeGt(vb);
      return hasBalance ? parseFloat(row.formattedVaultBalance || "0") : 0;
    },
    Cell: ({ row }: { row: any }) => {
      const { assetBalance, decimals, assetSymbol, status, formattedAssetBalance } = row.original;
      const assetBalanceDisplay =
        safeGt(assetBalance) && status !== 1 ? (
          <div className="token-container-outer">
            <span className="hidden-mobile">
              <div className="token-container">
                <div className="token-icon-box">
                  <IconDisplay name={assetSymbol} size={20} />
                  {NumberWithCommas(
                    CropDecimals(formattedAssetBalance as string)
                  )}
                </div>
                &nbsp;<div className="animated deposit-button">DEPOSIT</div>
              </div>
            </span>
            <span className="hidden-desktop">
              <div className="token-container-mobile">
                <div className="animated deposit-button-mobile">DEPOSIT</div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                  }}
                  className="hidden-desktop">
                  <span style={{ textAlign: "right" }}>
                    <div className="token-icon-box hidden-desktop">
                      <IconDisplay name={assetSymbol} size={20} />
                      &nbsp;
                      {NumberWithCommas(
                        CropDecimals(formattedAssetBalance as string)
                      )}
                    </div>
                  </span>
                </div>
              </div>
            </span>
          </div>
        ) : (
          ""
        );
      return (
        <div>
          <div className="token-cell">
            {safeGt(assetBalance) && <>{assetBalanceDisplay}</>}
          </div>
        </div>
      );
    },
  },
  {
    Header: <div style={{ margin: "0px 0px 0px 30px" }}>Your Tickets</div>,
    id: "tickets",
    accessor: (row) => {
      const vb = row.vaultBalance;
      return safeGt(vb) ? parseFloat(row.formattedVaultBalance || "0") : 0;
    },
    Cell: ({ value, row }: any) => {
        let display =
        value > 0 ? (
          <>
            <span className="mobile-vault-header">
              Your Tickets
              <br />
            </span>
            <div style={{ display: "flex" }} className="tickets-container">
              <span className="column-tickets" style={{ textAlign: "right" }}>
                <FontAwesomeIcon
                  icon={faTicket}
                  size="sm"
                  style={{
                    color: "#1a4160",
                    height: "17px",
                    marginRight: "3px",
                  }}
                />
                &nbsp;
                {NumberWithCommas(
                  CropDecimals(row.original.formattedVaultBalance)
                )}
              </span>
            </div>
          </>
        ) : (
          ""
        );
      return <div>{display}</div>;
    },
  },
  {
    Header: <div style={{ margin: "0px 30px 0px 0px" }}>Yield</div>,
    id: "yieldAndVaultAPR",
    accessor: (row) => (Number(row.vaultAPR) || 0) + (row.apr || 0) * 100,
    Cell: ({ cell: { value }, row: { original } }: any) => {
        const { vaultAPR, apr, incentiveSymbol } = original;
      return (
        <div className="hidden-mobile">
          <VaultYieldTooltip
            vaultAPR={vaultAPR}
            apr={apr}
            total={value}
            symbol={incentiveSymbol}
          />
        </div>
      );
    },
  },
  {
    Header: "Deposits & TVL",
    id: "depositsAndTVL",
    accessor: (row) => row,
    Cell: ({ value }: { value: any }) => {
        const { totalSupply, depositsEthValue, depositsEthBigInt } = value;
      return (
        <div style={{ textAlign: "right" }}>
          <div>
            {totalSupply || "0"}
            <div className="hidden-desktop" style={{ display: "inline-block", marginLeft: "4px" }}>TVL</div>
          </div>

<div className="vaults-font-small hidden-mobile">
  {depositsEthValue > 0 && (
    <>
      <PrizeValueIcon size={16} />
      <PrizeValue
        amount={
          // Check if depositsEthBigInt is a finite number, truncate to integer, 
          // and convert to string. Fallback to '0' string if invalid (Infinity/NaN).
          BigInt(
            Number.isFinite(depositsEthBigInt)
              ? Math.trunc(depositsEthBigInt).toString()
              : '0'
          )
        }
        size={16}
        rounded={true}
      />
    </>
  )}
</div>
        </div>
      );
    },
  }
  ,
];
