import Head from "next/head";

import { Menu } from "./menu";
import { ReactNode, useState, useEffect } from "react";
import { MyConnect } from "../components/connectButton";
import CurrencyToggle from "../components/currencyToggle";
import { useRouter } from "next/router";
import AllVaults from "./allvaults";
import Image from "next/image";
import Wins from "../components/wins";
import RewardsButton from "../components/rewardsButton";
import { useAccount } from "wagmi";

type LayoutProps = {
  children: ReactNode;
};

const Layout = ({ children }: LayoutProps) => {
  const router = useRouter();
  const {address} = useAccount()
  const isHomePage = router.pathname === "/"; // Check if the current route is the homepage
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 500);
    };
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => {
      window.removeEventListener("resize", checkIsMobile);
    };
  }, []);

  return (
    <div
    style={{
      padding: "0 1rem",
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
    }}
  >      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <meta property="og:image" content="/images/my-og-image.png" />
        <title>PoolTogether PoolTime.App</title>
        <meta content="Your all-in-one front end for PoolTogether V5." name="description" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </Head>
      <div style={{ marginTop: "12px" }}>
        <main>
          <Menu />
          <div className="wallet-connect-button">
          {/* <div style={{ display: 'flex', gap: 12 }}> */}
          <div  style={{ display: 'flex',alignItems:'end'}}>

          <span className="hidden-mobile"><CurrencyToggle/> </span>
            <MyConnect connectText="CONNECT"/>  </div>
            <div style={{ 
              display: "flex", 
              flexDirection: isMobile ? "row-reverse" : "column", 
              alignItems: "flex-end", 
              gap: isMobile ? "6px" : "0" 
            }}>
            {address && <Wins addressProp={address} />}
              {address && <RewardsButton address={address} />}
            </div>
</div>
        
          <div className="hidden-desktop mobile-top-spacer"></div>
          {isHomePage ? <AllVaults /> : children}
        </main>
      </div>
      <div className="footer-container">
  <div className="powered-by-div">
    <div className="sponsor-text-container">
      <span className="sponsor-text-top">Powered By</span>
    </div>
    <div className="sponsor-images-container">
      <a href="https://pooltogether.com" target="_blank" rel="noreferrer">
      <Image
                src="/images/pooltogether.svg"
                className="pooltogether"
                alt="PoolTogether"
                width={60} // Set appropriate width and height for the image
                height={30}
              />
      </a>
      <a href="https://witnet.io" target="_blank" rel="noreferrer">
      <Image
                src="/images/witnet.png"
                className="witnet"
                alt="Witnet"
                width={40}
                height={30}
              />
      </a>
    </div>
  </div>
  <div className="boticon">
    {/* <span title="Github">
      <a href="https://github.com/underethsea" target="_blank" rel="noreferrer">
        <img src="/images/github.png" className="github" alt="github"/>
      </a>
    </span> */}
    {/* <span className="social-text-top">Socials</span> */}
    <span title="Farcaster">
      <a href="https://warpcast.com/~/channel/pool-together" target="_blank" rel="noreferrer">
      <Image
                src="/images/farcaster.svg"
                className="farcaster"
                alt="Farcaster"
                width={30}
                height={30}
              />
      </a>
    </span>
    <span title="Twitter">
      <a href="https://x.com/PoolTogether_" target="_blank" rel="noreferrer">
      <Image
                src="/images/x.png"
                className="twitter"
                alt="Twitter"
                width={20}
                height={20}
              />
      </a>
    </span>
    <span title="Mirror">
      <a href="https://pooltogether.mirror.xyz/" target="_blank" rel="noreferrer">
      <Image
                src="/images/mirror.svg"
                className="mirror"
                alt="Mirror"
                width={20}
                height={20}
              />
      </a>
    </span>
    <span title="Discord">
      <a href="https://pooltogether.com/discord" target="_blank" rel="noreferrer">
      <Image
                src="/images/discord_filled.svg"
                className="discord"
                alt="discord"
                width={30}
                height={30}
              />
      </a>
    </span>
    {/* <span title="Docs">
      <a href="https://docs.pooltogether.com/" target="_blank" rel="noreferrer">
        <img src="/images/docs.png" className="docs" alt="docs"/>
      </a>
    </span> */}
  </div>
</div>
    </div>
  );
};

export default Layout;