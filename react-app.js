import React, { useState, useEffect, useRef } from 'react';

const customStyles = {
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gap: '20px',
    padding: '40px',
    minHeight: '100vh',
    maxWidth: '1920px',
    margin: '0 auto',
    position: 'relative',
  },
  megaTitle: {
    fontSize: 'clamp(60px, 14vw, 240px)',
    fontWeight: 400,
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    lineHeight: 0.8,
    letterSpacing: '-1px',
    color: '#ffffff',
    fontFamily: "'Michroma', sans-serif",
    textTransform: 'uppercase',
  },
  displayType: {
    fontFamily: "'Michroma', sans-serif",
    textTransform: 'uppercase',
    lineHeight: 0.8,
    letterSpacing: '-1px',
    color: '#ffffff',
  },
  monoLabel: {
    fontFamily: "'Space Mono', monospace",
    textTransform: 'uppercase',
    fontSize: '10px',
    letterSpacing: '0.05em',
    display: 'block',
    marginBottom: '8px',
    color: '#7a9c8a',
  },
  card: {
    border: '1px solid rgba(45,90,65,0.2)',
    background: 'rgba(26,58,42,0.4)',
    padding: '24px',
    position: 'relative',
    minHeight: '300px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    transition: 'all 0.3s ease',
  },
  swatchContainer: {
    display: 'flex',
    gap: 0,
    height: '100px',
    width: '100%',
    border: '1px solid #1a3a2a',
  },
  btnPrimary: {
    backgroundColor: '#2d5a41',
    color: '#ffffff',
    border: 'none',
    padding: '12px 24px',
    fontFamily: "'Space Mono', monospace",
    fontSize: '11px',
    textTransform: 'uppercase',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '12px',
    transition: 'background 0.2s',
  },
  dataVisContainer: {
    width: '100%',
    height: '120px',
    display: 'flex',
    alignItems: 'flex-end',
    gap: '2px',
    paddingTop: '20px',
  },
  menuTrigger: {
    position: 'fixed',
    top: '40px',
    right: '40px',
    width: '40px',
    height: '14px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    cursor: 'pointer',
    zIndex: 100,
  },
  menuLine: {
    width: '100%',
    height: '2px',
    backgroundColor: '#4ade80',
  },
};

const MonoLabel = ({ children, style = {} }) => (
  <span style={{ ...customStyles.monoLabel, ...style }}>{children}</span>
);

const StatusDot = () => {
  const dotStyle = {
    width: '8px',
    height: '8px',
    backgroundColor: '#4ade80',
    borderRadius: '50%',
    display: 'inline-block',
    marginRight: '8px',
    animation: 'pulse 2s infinite',
  };
  return <span style={dotStyle}></span>;
};

const Bar = ({ height, onHoverChange }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#4ade80',
        opacity: hovered ? 1 : 0.2,
        height: `${height}%`,
        transition: 'height 0.5s ease, opacity 0.2s',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
  );
};

const ChartVis = () => {
  const generateBars = () =>
    Array.from({ length: 30 }, () => Math.floor(Math.random() * 100) + 1);

  const [bars, setBars] = useState(generateBars);

  const handleClick = () => {
    setBars(generateBars());
  };

  return (
    <div style={customStyles.dataVisContainer} onClick={handleClick} title="Click to randomize">
      {bars.map((h, i) => (
        <Bar key={i} height={h} />
      ))}
    </div>
  );
};

const SwatchItem = ({ color, label }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        position: 'relative',
        cursor: 'crosshair',
        backgroundColor: color,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={{
          position: 'absolute',
          bottom: '-20px',
          left: 0,
          fontSize: '9px',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.2s',
          color: '#7a9c8a',
          fontFamily: "'Space Mono', monospace",
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
};

const CardHover = ({ children, style = {}, className = '' }) => {
  const [hovered, setHovered] = useState(false);
  const cardStyle = {
    ...customStyles.card,
    ...style,
    border: hovered ? '1px solid #4ade80' : (style.border || '1px solid rgba(45,90,65,0.2)'),
    background: hovered ? 'rgba(26,58,42,0.8)' : (style.background || 'rgba(26,58,42,0.4)'),
  };
  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </div>
  );
};

const BtnPrimary = ({ children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{
        ...customStyles.btnPrimary,
        backgroundColor: hovered ? '#4ade80' : '#2d5a41',
        color: hovered ? '#0d1a14' : '#ffffff',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
};

const IconBox = ({ children, label }) => (
  <div
    style={{
      border: '1px solid #1a3a2a',
      height: '80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      background: 'rgba(26,58,42,0.2)',
    }}
  >
    {children}
    <span
      style={{
        ...customStyles.monoLabel,
        marginTop: '10px',
        marginBottom: 0,
      }}
    >
      {label}
    </span>
  </div>
);

const App = () => {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Michroma&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background-color: #0d1a14;
        color: #e0e7e3;
        font-family: 'Space Mono', monospace;
        -webkit-font-smoothing: antialiased;
        overflow-x: hidden;
        font-size: 12px;
        line-height: 1.4;
      }
      @keyframes pulse {
        0% { opacity: 0.3; }
        50% { opacity: 1; }
        100% { opacity: 0.3; }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <div style={{ backgroundColor: '#0d1a14', minHeight: '100vh' }}>
      {/* Menu Trigger */}
      <div style={customStyles.menuTrigger}>
        <div style={customStyles.menuLine}></div>
        <div style={customStyles.menuLine}></div>
      </div>

      <div style={customStyles.gridContainer}>
        {/* Header */}
        <header
          style={{
            gridColumn: '1 / -1',
            marginBottom: '60px',
            position: 'relative',
            borderBottom: '1px solid rgba(45,90,65,0.3)',
            paddingBottom: '40px',
          }}
        >
          <h1 style={customStyles.megaTitle}>
            <span>OVR</span>
            <span>/</span>
            <span>SGT</span>
          </h1>
        </header>

        {/* Meta Group 1 */}
        <div
          style={{
            gridColumn: '1 / 3',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontFamily: "'Space Mono', monospace",
          }}
        >
          <MonoLabel>System Architecture</MonoLabel>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: '12px', color: '#e0e7e3' }}>
            DATA OBSERVABILITY
            <br />
            PIPELINE INTELLIGENCE
          </p>
        </div>

        {/* Meta Group 2 */}
        <div
          style={{
            gridColumn: '5 / 8',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '1px',
              backgroundColor: '#2d5a41',
              display: 'inline-block',
              marginRight: '10px',
              verticalAlign: 'middle',
            }}
          ></div>
          <MonoLabel style={{ display: 'inline' }}>Mission Protocol</MonoLabel>
          <p
            style={{
              marginTop: '10px',
              fontSize: '14px',
              maxWidth: '320px',
              lineHeight: 1.6,
              color: '#b0c4b1',
              fontFamily: "'Space Mono', monospace",
            }}
          >
            ELIMINATING DATA DOWNTIME THROUGH
            <br />
            PROACTIVE ANOMALY DETECTION AND
            <br />
            END-TO-END LINEAGE TRACKING.
          </p>
        </div>

        {/* Meta Group 3 */}
        <div
          style={{
            gridColumn: '10 / 13',
            textAlign: 'right',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontFamily: "'Space Mono', monospace",
          }}
        >
          <MonoLabel>Status</MonoLabel>
          <p style={{ color: '#e0e7e3', fontSize: '12px' }}>
            <StatusDot />
            SYSTEM OPERATIONAL
          </p>
          <div style={{ marginTop: '30px' }}>
            <MonoLabel>VERSION</MonoLabel>
            <p style={{ color: '#ffffff', fontSize: '12px' }}>2.4.0 (STABLE)</p>
          </div>
        </div>

        {/* Mood Section */}
        <section
          style={{
            gridColumn: 'span 12',
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gap: '20px',
            marginTop: '40px',
          }}
        >
          {/* Typography Card */}
          <CardHover style={{ gridColumn: '1 / 5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <MonoLabel>01 // TYPOGRAPHY</MonoLabel>
              <MonoLabel>A-Z</MonoLabel>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <h2
                style={{
                  ...customStyles.displayType,
                  fontSize: '42px',
                  marginBottom: '20px',
                }}
              >
                Aa Bb Cc
              </h2>
              <p
                style={{
                  fontFamily: "'Michroma', sans-serif",
                  fontSize: '14px',
                  marginBottom: '10px',
                  color: '#ffffff',
                }}
              >
                PRIMARY: MICHROMA / 800
              </p>
              <p
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: '12px',
                  borderTop: '1px solid #1a3a2a',
                  paddingTop: '10px',
                  color: '#7a9c8a',
                }}
              >
                SECONDARY: SPACE MONO / 400
                <br />
                Use for tabular data, labels, and technical specifications.
              </p>
            </div>
          </CardHover>

          {/* Color Card */}
          <CardHover style={{ gridColumn: '5 / 8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <MonoLabel>02 // PALETTE</MonoLabel>
              <MonoLabel>RGB</MonoLabel>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
              <div style={customStyles.swatchContainer}>
                <SwatchItem color="#1a3a2a" label="#1A3A2A" />
                <SwatchItem color="#2d5a41" label="#2D5A41" />
                <SwatchItem color="#4ade80" label="#4ADE80" />
              </div>
              <p style={{ marginTop: '20px', fontSize: '11px', color: '#7a9c8a', fontFamily: "'Space Mono', monospace" }}>
                STRICT FOREST MONOCHROME.
                <br />
                ACCENT USED FOR DATA VISUALIZATION.
              </p>
            </div>
          </CardHover>

          {/* UI Card */}
          <CardHover style={{ gridColumn: '8 / 13' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <MonoLabel>03 // INTERFACE</MonoLabel>
              <MonoLabel>UI-KIT</MonoLabel>
            </div>
            <ChartVis />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginTop: '20px',
              }}
            >
              <div>
                <MonoLabel>ACTION</MonoLabel>
                <BtnPrimary>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>+</span>
                  INITIATE TRACE
                </BtnPrimary>
              </div>
              <div style={{ textAlign: 'right' }}>
                <MonoLabel>LATENCY</MonoLabel>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#4ade80', fontFamily: "'Space Mono', monospace" }}>12ms</span>
              </div>
            </div>
          </CardHover>

          {/* Imagery Card */}
          <CardHover
            style={{
              gridColumn: '1 / 7',
              minHeight: '400px',
              background: '#07110c',
              color: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <MonoLabel style={{ color: '#2d5a41' }}>04 // IMAGERY</MonoLabel>
            </div>
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  border: '1px solid #1a3a2a',
                  width: '200px',
                  height: '200px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    border: '1px solid #2d5a41',
                    width: '150px',
                    height: '150px',
                    borderRadius: '50%',
                  }}
                ></div>
              </div>
              <MonoLabel style={{ marginTop: '20px', color: '#2d5a41' }}>TECHNICAL ABSTRACTS</MonoLabel>
            </div>
            <div style={{ position: 'absolute', bottom: '24px', left: '24px' }}>
              <p style={{ color: '#7a9c8a', fontFamily: "'Space Mono', monospace", fontSize: '12px' }}>
                USE HIGH-CONTRAST
                <br />
                FOREST SCHEMATICS
              </p>
            </div>
          </CardHover>

          {/* Semiotics Card */}
          <CardHover style={{ gridColumn: '7 / 13' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <MonoLabel>05 // SEMIOTICS</MonoLabel>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '20px',
                height: '100%',
                alignItems: 'center',
              }}
            >
              <IconBox label="GRID">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18"></rect>
                  <line x1="12" y1="3" x2="12" y2="21"></line>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                </svg>
              </IconBox>
              <IconBox label="ALERT">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </IconBox>
              <IconBox label="ADD">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.5">
                  <path d="M4 12h16"></path>
                  <path d="M12 4v16"></path>
                </svg>
              </IconBox>
              <IconBox label="SCALE">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.5">
                  <polyline points="4 14 10 14 10 20"></polyline>
                  <polyline points="20 10 14 10 14 4"></polyline>
                  <line x1="14" y1="10" x2="21" y2="3"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              </IconBox>
            </div>
          </CardHover>
        </section>

        {/* Footer */}
        <footer
          style={{
            gridColumn: '1 / -1',
            marginTop: '80px',
            borderTop: '1px solid rgba(45,90,65,0.4)',
            paddingTop: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: "'Space Mono', monospace",
          }}
        >
          <div>
            <MonoLabel>Introducing</MonoLabel>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#ffffff' }}>OVR/SGT V.1.0</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <MonoLabel>INGESTION RATE</MonoLabel>
            <span style={{ fontSize: '16px', color: '#4ade80' }}>45.2 TB/S</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;