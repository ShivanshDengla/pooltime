import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";

import { useOverview } from '../components/contextOverview';
import Image from "next/image";

export const Menu = () => {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const {currency, toggleCurrency} = useOverview();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openSubMenu, setOpenSubMenu] = useState(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 900);
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const menuItems = [
    {
      label: "App",
      path: "/",
      show: true,
    },
    {
      label: "Account",
      path: "/account",
      show: false,
    },
    {
      label: "Winners",
      icon: <FontAwesomeIcon icon={faCaretDown} width={15} height={15} />,
      path: "/winners",
      show: true,
      subMenu: [
        { label: "Draws", path: "/winners", show: true },
        { label: "Leaderboard", path: "/leaderboard", show: true },
        { label: "Poolers", path: "/poolers", show: true },
        { label: "Claimer Check", path: "/claimercheck", show: true },
      ],
    },
    {
      label: `Change currency to ${currency === 'USD' ? 'ETH' : 'USD'}`,
      onClick: () => {
        console.log('Currency toggle clicked');
        toggleCurrency();
        setIsMenuOpen(false);
      },
      show: true,
      showMobileOnly: true,
    },
  ];

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleSubMenuToggle = (index: any) => {
    if (openSubMenu === index) {
      setOpenSubMenu(null);
    } else {
      setOpenSubMenu(index);
    }
  };

  return (
    <nav
      style={{
        color: "white",
        display: "flex",
        justifyContent: "left",
        fontSize: isMobile ? "30px" : "20px",
      }}
    >
      {isMobile && (
        <div className="top-margin-16" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '5px',
          marginTop: '10px'
        }}>
          <Link href="/">
            <a>
            <Image
              src={`/images/squarepool.png`}
              height={37}
              width={37}
              alt="pool party"
            />
            </a>
          </Link>
          <button
            onClick={handleMenuToggle}
            style={{ border: "none", background: "none", cursor: "pointer" }}
          >
            {isMenuOpen ? (
              <svg
                viewBox="0 0 30 30"
                width="38"
                height="38"
                style={{
                  marginTop: "15px",
                  zIndex: 10005,
                  position: "relative",
                }}
              >
                <path
                  fill="white"
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
                ></path>
              </svg>
            ) : (
              <div className="zindex-1">
                <svg
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 6H21"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 12H21"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 18H21"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </button>
          {isMenuOpen && (
            <div className="overlay">
              <div className="menu-content">
                <ul
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    listStyle: "none",
                    padding: 0,
                  }}
                >
                  {menuItems.map((item, index) =>
                    item.show !== false && (!item.showMobileOnly || isMobile) ? (
                      <li key={index} className={item.label.includes("Change currency") ? "hide-regular-currency-toggle" : ""} style={{ margin: "10px 10px" }}>
                        {item.path ? (
                          <Link href={item.path}>
                            <a
                              style={{
                                color: router.pathname === item.path ? "#af9df4" : "white",
                                textDecoration: "none",
                              }}
                              className={router.pathname === item.path ? "active" : ""}
                            >
                              {item.label}
                            </a>
                          </Link>
                        ) : (
                          <span
                            onClick={item.onClick}
                            style={{ 
                              color: 'white', 
                              textDecoration: 'none' 
                            }}
                          >
                            {item.label}
                          </span>
                        )}
                        {item.label === "Winners" && item.subMenu && (
                          <ul className="submenu" style={{ paddingLeft: "20px", listStyle: "none" }}>
                            {item.subMenu.map((subItem) => (
                              <li key={subItem.path} style={{ margin: "5px 0" }}>
                                <Link href={subItem.path}>
                                  <a
                                    style={{
                                      color: router.pathname === subItem.path ? "#af9df4" : "white",
                                      textDecoration: "none",
                                      fontSize: "30px",
                                      display: "block",
                                      marginLeft: "20px",
                                    }}
                                    className={router.pathname === subItem.path ? "active" : ""}
                                  >
                                    {subItem.label}
                                  </a>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ) : null
                  )}
                </ul>
                {/* Place the button here */}
                <div style={{ textAlign: 'center' }}>
                  <span
                    className="change-currency-button"
                    onClick={() => {
                      console.log('Currency toggle clicked');
                      toggleCurrency();
                      setIsMenuOpen(false);
                    }}
                  >
                    Change currency to {currency === 'USD' ? 'ETH' : 'USD'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!isMobile && (
        <ul style={{ display: "flex", listStyle: "none", padding: 0 }}>
          {menuItems.map((item, index) =>
            item.show !== false && !item.showMobileOnly ? (
              <li key={index} className={`main-menu-item ${item.label.includes("Change currency") ? "hide-regular-currency-toggle" : ""}`} style={{ margin: "0 10px", position: "relative" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                  onMouseOver={() => handleSubMenuToggle(index)}
                >
                  {item.path ? (
                    <Link href={item.path}>
                      <a
                        style={{
                          color: router.pathname === item.path ? "#bfb8d9" : "white",
                          textDecoration: "none",
                        }}
                        className={router.pathname === item.path ? "active" : ""}
                      >
                        {item.label}
                      </a>
                    </Link>
                  ) : (
                    <span
                      className={item.label.includes("Change currency") ? "change-currency-button" : ""}
                      onClick={item.onClick}
                    >
                      {item.label}
                    </span>
                  )}
                </div>
                {openSubMenu === index && item.subMenu && item.show === true && (
                  <div
                    style={{
                      position: "absolute",
                      paddingTop: "10px",
                      paddingBottom: "10px",
                      backgroundColor: "#7b68c4",
                      borderRadius: "8px",
                      transition: "opacity 0.3s",
                      marginTop: "10px",
                    }}
                    onMouseLeave={() => setOpenSubMenu(null)}
                  >
                    {item.subMenu.map(subItem =>
                      subItem.show ? (
                        <div
                          key={subItem.path}
                          style={{
                            padding: "8px 22px 5px 14px",
                            fontSize: "16px",
                          }}
                        >
                          <Link href={subItem.path}>
                            <a
                              onClick={handleMenuToggle}
                              style={{
                                color: router.pathname === subItem.path ? "#bfb8d9" : "white",
                                textDecoration: "none",
                              }}
                              className={router.pathname === subItem.path ? "active" : ""}
                            >
                              {subItem.label}
                            </a>
                          </Link>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </li>
            ) : null
          )}
          {router.pathname === "/boost" && <div className="beta">CANARY</div>}
        </ul>
      )}

      <style jsx global>{`
        a:hover:not(.active) {
          color: #44ebe7;
        }

        .active {
          font-weight: 400;
        }

        .overlay {
          position: fixed;
          top: 0;
          bottom: 0;
          left: 0;
          right: 0;
          background-color: #49495af2;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .menu-content {
          position: relative;
          z-index: 1001;
          padding-bottom: 60px; /* Ensure space at the bottom */
        }

        .close-button {
          position: fixed;
          top: 10px;
          left: 10px;
          border: none;
          background: none;
          cursor: pointer;
          z-index: 1001;
        }

        .change-currency-button {
          position: fixed; /* Fixed position to keep it near the bottom */
          bottom: 30px; /* Distance from the bottom of the screen */
          left: 50%; /* Center horizontally */
          transform: translateX(-50%); /* Adjust to center */
          display: inline-block;
          padding: 10px 20px;
          border: 2px solid #ffffff;
          background-color: #505061;
          color: white;
          border-radius: 10px;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          font-size: 18px;
          white-space: nowrap; /* Prevent word wrap */
          width: auto; /* Auto width based on content */
          max-width: 300px; /* Optional: Set a max-width to keep it from being too wide */
          z-index: 10002; /* Ensure it's above other elements */
        }

        .change-currency-button:hover {
          background-color: #836fff;
        }

        .submenu {
          margin-bottom: 20px;
        }

        .hide-regular-currency-toggle {
          display: none;
        }

        @media (max-width: 900px) {
          nav {
            font-size: 30px; /* Increase font size for mobile */
          }

          .overlay ul {
            padding-left: 0; /* Remove left padding to fit mobile better */
          }

          .overlay ul li.main-menu-item {
            margin: 20px 0; /* Increase margin for main menu items */
          }

          .overlay ul > li {
            margin: 20px 0; /* Increase vertical spacing between menu items */
          }

          .overlay ul a {
            font-size: 50px; /* Larger font size for mobile */
            padding: 10px 0; /* More padding to make clickable area bigger */
          }

          .submenu li {
            margin: 10px 0; /* Smaller margin for submenu items */
          }

          /* Add spacing between "App" and "Winners" */
          .overlay ul li:nth-child(1) {
            margin-bottom: 40px; /* Adjust this value to increase the spacing */
          }
        }
      `}</style>
    </nav>
  );
};

export default Menu;