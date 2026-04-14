"use client";

import { useEffect } from "react";
import Link from "next/link";

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

export default function NotFound() {
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-404-theme", "true");
    style.textContent = `
      body { background-color: ${DS.bg} !important; color: ${DS.text} !important; }
      main.pt-14 { padding-top: 56px; }
      nav[aria-label="Main navigation"] { background-color: ${DS.bg} !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
      nav[aria-label="Main navigation"] a, nav[aria-label="Main navigation"] span { color: ${DS.text} !important; font-family: ${DS.fontMono} !important; }
      nav[aria-label="Main navigation"] a:hover { color: ${DS.textMuted} !important; }
      nav[aria-label="Main navigation"] .w-2.h-2 { background-color: ${DS.green} !important; }
      nav[aria-label="Main navigation"] .w-px { background-color: ${DS.border} !important; opacity: 0.2; }
      main.pt-14 * { color: #000000 !important; }
      main.pt-14 .mp-white-text { color: #ffffff !important; }
      .notfound-hero::after {
        content: "NOT FOUND";
        position: absolute;
        bottom: -15px;
        right: -10px;
        font-size: 12rem;
        color: #d5d0c8;
        font-weight: 700;
        pointer-events: none;
        line-height: 0.8;
        z-index: 0;
        letter-spacing: -0.05em;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div style={{ width: "100%", maxWidth: 1920, margin: "0 auto", fontFamily: DS.fontPrimary, WebkitFontSmoothing: "antialiased" }}>
      <header className="notfound-hero" style={{ padding: "30px 40px 0", borderBottom: `1px solid ${DS.border}`, position: "relative", overflow: "hidden" }}>
        <h2 style={{ position: "relative", zIndex: 1, fontSize: "8rem", fontWeight: 300, lineHeight: 0.85, textTransform: "uppercase", letterSpacing: "-0.03em", color: DS.text, fontFamily: DS.fontPrimary, textShadow: "3px 3px 0px #d5d0c8", margin: 0, marginBottom: -6 }}>
          404
        </h2>
      </header>

      <div style={{ padding: "60px 40px", textAlign: "center" }}>
        <p style={{ fontFamily: DS.fontMono, fontSize: "1rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: DS.textMuted, marginBottom: 24 }}>
          THIS PAGE DOES NOT EXIST
        </p>
        <Link href="/marketplace" className="mp-white-text" style={{ padding: "14px 32px", fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", backgroundColor: DS.dark, color: DS.bg, border: "none", cursor: "pointer", textDecoration: "none", display: "inline-block" }}>
          GO TO MARKETPLACE
        </Link>
      </div>
    </div>
  );
}
