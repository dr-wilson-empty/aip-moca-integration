"use client";

import { useEffect } from "react";
import TaskForm from "@/components/dashboard/TaskForm";
import ProtocolFlow from "@/components/dashboard/ProtocolFlow";
import LiveLog from "@/components/dashboard/LiveLog";
import ChainHistory from "@/components/dashboard/ChainHistory";

/* ─── Design System (shared with marketplace) ─── */
const DS = {
  bg: "#e6e5e0",
  bgHover: "#d9d8d3",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  cyan: "#4dd0e1",
  yellow: "#ffee58",
  white: "#ffffff",
  error: "#c62828",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

export default function DashboardPage() {
  /* Override page + nav to match editorial theme */
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-ds-theme", "true");
    style.textContent = `
      body { background-color: ${DS.bg} !important; color: ${DS.text} !important; }
      main.pt-14 { padding-top: 56px; }

      nav[aria-label="Main navigation"] {
        background-color: ${DS.bg} !important;
        
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      nav[aria-label="Main navigation"] a,
      nav[aria-label="Main navigation"] span {
        color: ${DS.text} !important;
        font-family: ${DS.fontMono} !important;
      }
      nav[aria-label="Main navigation"] a:hover {
        color: ${DS.textMuted} !important;
      }
      nav[aria-label="Main navigation"] a[aria-current="page"] {
        color: ${DS.text} !important;
        font-weight: 700 !important;
      }
      nav[aria-label="Main navigation"] .w-2.h-2 {
        background-color: ${DS.green} !important;
      }
      nav[aria-label="Main navigation"] .w-px {
        background-color: ${DS.border} !important;
        opacity: 0.2;
      }

      main.pt-14 * { color: #000000 !important; }
      main.pt-14 input::placeholder { color: #555555 !important; }
      main.pt-14 .mp-white-text { color: #ffffff !important; }
      main.pt-14 .ds-accent-text { color: ${DS.green} !important; }
      main.pt-14 .ds-error-text { color: ${DS.error} !important; }
      main.pt-14 .ds-muted-text { color: ${DS.textMuted} !important; }
      main.pt-14 .ds-cyan-text { color: ${DS.cyan} !important; }
      main.pt-14 .ds-yellow-text { color: #b8913a !important; }

      main.pt-14 select, main.pt-14 option {
        color: #000000 !important;
        background-color: ${DS.bg} !important;
      }

      ::-webkit-scrollbar-track { background: ${DS.bg} !important; }
      ::-webkit-scrollbar-thumb { background: ${DS.textMuted} !important; }

      .ds-hero-header::after {
        content: "DASHBOARD";
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
      @media (max-width: 900px) {
        .ds-title { font-size: 2.5rem !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1920,
        margin: "0 auto",
        padding: "0 0 40px",
        fontFamily: DS.fontPrimary,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Header — hero style */}
      <header
        className="ds-hero-header"
        style={{
          padding: "30px 40px 0",
          borderBottom: `1px solid ${DS.border}`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <h2
          className="ds-title"
          style={{
            position: "relative",
            zIndex: 1,
            fontSize: "8rem",
            fontWeight: 300,
            lineHeight: 0.85,
            textTransform: "uppercase",
            letterSpacing: "-0.03em",
            color: DS.text,
            fontFamily: DS.fontPrimary,
            textShadow: "3px 3px 0px #d5d0c8",
            margin: 0,
            marginBottom: -6,
          }}
        >
          Protocol
        </h2>
      </header>

      {/* Components */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <TaskForm />
        <ProtocolFlow />
        <LiveLog />
        <ChainHistory />
      </div>
    </div>
  );
}
