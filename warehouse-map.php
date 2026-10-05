<?php
require_once __DIR__ . '/auth.php';
auth_session_start();
if (!auth_check()) {
    header('Location: ./');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Warehouse Map</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
  --bg:#0d0f14; --surface:#141720; --surface2:#1c2030; --surface3:#232840;
  --border:#2a3050; --border-bright:#3a4468;
  --text:#e8ecf4; --text-muted:#7b88aa; --text-dim:#4a5570;
  --accent:#4f8ef7; --accent-glow:rgba(79,142,247,0.12);
  --accent2:#f7934f; --accent3:#4ff7a0; --accent4:#f74f7e; --warn:#f7c94f;
  --font-ui:'Syne',sans-serif; --font-mono:'Space Mono',monospace;
  --panel-width: 280px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── TOPBAR ── */
/* Redundant with the app's main topbar (already shows AV Procure) — hidden so the
   map gets the full iframe height. */
#topbar { display: none; }

.logo-mark {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--accent);
  letter-spacing: 3px;
}

.logo-name {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.5px;
}

.logo-page {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  padding-left: 12px;
  border-left: 1px solid var(--border-bright);
}

.topbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.topbar-clock {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

/* ── MAIN LAYOUT ── */
#main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── SIDE PANEL ── */
#panel {
  width: var(--panel-width);
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#panel-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.panel-label {
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 5px;
}

.panel-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  min-height: 20px;
}

.panel-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 3px;
  min-height: 16px;
}

#panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

/* idle state */
#panel-idle {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.idle-line {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}

.idle-line.bright { color: var(--text-dim); }

/* rack list */
.rack-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.1s;
}

.rack-item:hover {
  background: var(--surface2);
}

.rack-item.selected {
  background: rgba(0,255,65,0.08);
  border-left: 2px solid #00ff41;
}

.rack-code {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  min-width: 44px;
}

.rack-item.selected .rack-code { color: var(--accent); }

.rack-name {
  font-size: 11px;
  color: var(--text-muted);
}

/* selected rack detail */
#rack-detail {
  padding: 14px 16px;
  display: none;
  flex-direction: column;
  gap: 8px;
}

.detail-section-label {
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-top: 10px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border);
}

.detail-rack-name {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 1px;
}

.detail-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.shelf-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}

.shelf-code {
  font-family: var(--font-mono);
  color: var(--text);
  font-size: 11px;
}

.shelf-status {
  font-size: 10px;
  color: var(--text-muted);
}

.btn-back {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  margin: 0 0 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-back:hover {
  color: var(--text);
  border-color: var(--border-bright);
  background: var(--surface3);
}

/* ── MAP AREA ── */
#map-wrap {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
  background: var(--bg);
}

#map-container {
  position: relative;
  width: fit-content;
}

#map-svg { display: block; }

/* Shape theming — restyle draw.io whites */
#map-svg rect[fill="#ffffff"],
#map-svg rect[style*="light-dark"] {
  fill: var(--surface2) !important;
  stroke: var(--border-bright) !important;
}

#map-svg ellipse {
  fill: var(--surface2) !important;
  stroke: var(--border-bright) !important;
}

#map-svg path[stroke="#000000"] {
  stroke: var(--border-bright) !important;
  fill: var(--surface2) !important;
}

/* Aisle boundary zones — invisible */
[data-cell-id="A"] path,
[data-cell-id="B"] path,
[data-cell-id="C"] path,
[data-cell-id="D"] path,
[data-cell-id="E"] path,
[data-cell-id="F"] path,
[data-cell-id="G"] path,
[data-cell-id="H"] path,
[data-cell-id="I"] path,
[data-cell-id="J"] path,
[data-cell-id="K"] path,
[data-cell-id="L"] path {
  fill: transparent !important;
  stroke: none !important;
  cursor: pointer;
}

/* Aisle zone active state */
.aisle-active path {
  fill: rgba(0,255,65,0.07) !important;
  stroke: rgba(0,255,65,0.35) !important;
  stroke-width: 1.5 !important;
}

/* Rack shape transitions */
[data-cell-id$="-1"] rect, [data-cell-id$="-2"] rect,
[data-cell-id$="-3"] rect, [data-cell-id$="-4"] rect,
[data-cell-id$="-5"] rect,
[data-cell-id="J-4"] rect,
[data-cell-id="L-1"] ellipse,
[data-cell-id="K-1"] rect {
  transition: fill 0.15s, stroke 0.15s;
}

/* Rack highlighted */
.rack-highlighted rect,
.rack-highlighted ellipse {
  fill: rgba(0,255,65,0.12) !important;
  stroke: #00ff41 !important;
  stroke-width: 2 !important;
  cursor: pointer !important;
}

/* Rack selected */
.rack-selected rect,
.rack-selected ellipse {
  fill: rgba(0,255,65,0.25) !important;
  stroke: #00ff41 !important;
  stroke-width: 2.5 !important;
  filter: drop-shadow(0 0 4px #00ff41) !important;
  cursor: pointer !important;
}

/* Landmark shapes */
[data-cell-id="Workbench"] rect,
[data-cell-id="WarehouseDesk"] path {
  fill: var(--surface) !important;
  stroke: var(--border) !important;
  cursor: default !important;
}

/* Map labels */
.map-label {
  position: absolute;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text);
  letter-spacing: 1px;
  pointer-events: none;
  white-space: nowrap;
  text-shadow: 0 0 6px var(--bg), 0 0 3px var(--bg);
}

/* Tooltip */
#tooltip {
  position: fixed;
  background: var(--surface2);
  border: 1px solid var(--border-bright);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 6px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 500;
}

#tooltip.visible { opacity: 1; }

/* ── FOOTER ── */
#footer {
  height: 30px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 20px;
  flex-shrink: 0;
}

.footer-item {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--text-dim);
  text-transform: uppercase;
}

.footer-item span { color: var(--text-muted); }

#cursor-pos { margin-left: auto; }

.nav-link {
  cursor: pointer;
  color: var(--accent);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-decoration-color: rgba(79,142,247,0.5);
  text-underline-offset: 3px;
  transition: opacity 0.15s;
}
.nav-link:hover { opacity: 0.7; }
button.nav-link {
  background: none;
  border: none;
  padding: 0;
  font-family: var(--font-ui);
  text-align: left;
  line-height: inherit;
}
button.detail-rack-name.nav-link {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;
}
/* Shelf links: button.nav-link would otherwise win on specificity and swap the
   mono face for the UI face — restore the shelf-code typography. */
button.shelf-code.nav-link {
  font-family: var(--font-mono);
  font-size: 11px;
}

@media (max-width: 768px) {
  #topbar { display: none; }
  #footer { display: none; }
  #main { flex-direction: column; }
  #map-wrap { flex: 1; min-height: 0; padding-left: 14px; }
  #panel {
    width: 100%;
    max-height: 120px;
    flex-direction: row;
    align-items: stretch;
    border-right: none;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  #panel-header {
    padding: 8px 12px;
    border-bottom: none;
    border-right: 1px solid var(--border);
    flex-shrink: 0;
    justify-content: center;
    min-width: 110px;
    max-width: 140px;
  }
  .panel-label { font-size: 8px; margin-bottom: 2px; }
  .panel-title { font-size: 13px; }
  .panel-sub { font-size: 10px; margin-top: 2px; }
  #panel-body { flex: 1; overflow-y: auto; padding: 0; }
  #panel-idle { padding: 8px 12px; gap: 3px; }
  .idle-line { font-size: 11px; line-height: 1.4; }
  .rack-item { padding: 7px 12px; }
  #rack-detail { padding: 8px 12px; gap: 5px; }
}
</style>
</head>
<body>

<!-- TOPBAR -->
<div id="topbar">
  <div>
    <div class="logo-mark">AV</div>
    <div class="logo-name">Procure</div>
  </div>
  <div class="logo-page">Warehouse Map</div>
  <div class="topbar-right">
    <span class="topbar-clock" id="clock"></span>
  </div>
</div>

<!-- MAIN -->
<div id="main">

  <!-- SIDE PANEL -->
  <div id="panel">
    <div id="panel-header">
      <div class="panel-label">Location</div>
      <div class="panel-title" id="panel-title">No selection</div>
      <div class="panel-sub" id="panel-sub">Tap a zone on the map</div>
    </div>
    <div id="panel-body">
      <div id="panel-idle">
        <div class="idle-line bright">Select a zone on the map to view its racks and shelves.</div>
        <div class="idle-line" style="margin-top:8px;">Tap an aisle to highlight its racks, then tap a rack to see shelf detail.</div>
      </div>
      <div id="rack-list" style="display:none;"></div>
      <div id="rack-detail"></div>
    </div>
  </div>

  <!-- MAP -->
  <div id="map-wrap">
    <div id="map-container">

      <!-- INLINE SVG from draw.io (cleaned) -->
      <svg id="map-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="789px" height="1101px" viewBox="0 0 789 1101">
        <defs/>
        <rect fill="transparent" width="100%" height="100%" x="0" y="0"/>
        <g>
          <g data-cell-id="0">
            <g data-cell-id="1">
              <g data-cell-id="I"><g transform="translate(0.5,0.5)"><path d="M 298 65 L 508 65 L 508 95 L 298 95 L 298 65 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 300 67 L 300 93 L 300 93 L 506 93 L 506 67 L 300 67" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 298 65 L 508 65 L 508 95 L 298 95 L 298 65 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="J"><g transform="translate(0.5,0.5)"><path d="M 158 100 L 788 100 L 788 180 L 158 180 L 158 100 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 160 102 L 160 178 L 160 178 L 786 178 L 786 102 L 160 102" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 158 100 L 788 100 L 788 180 L 158 180 L 158 100 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="I-1"><g transform="translate(0.5,0.5)"><rect x="308" y="70" width="190" height="20" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="L"><g transform="translate(0.5,0.5)"><path d="M 8 790 L 318 790 L 318 920 L 8 920 L 8 790 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 10 792 L 10 918 L 10 918 L 316 918 L 316 792 L 10 792" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 8 790 L 318 790 L 318 920 L 8 920 L 8 790 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="A"><g transform="translate(0.5,0.5)"><path d="M 595 683 L 758 683 L 758 843 L 595 843 L 595 683 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 597 685 L 597 841 L 597 841 L 756 841 L 756 685 L 597 685" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 595 683 L 758 683 L 758 843 L 595 843 L 595 683 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="B"><g transform="translate(0.5,0.5)"><path d="M 595 522 L 758 522 L 758 682 L 595 682 L 595 522 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 597 524 L 597 680 L 597 680 L 756 680 L 756 524 L 597 524" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 595 522 L 758 522 L 758 682 L 595 682 L 595 522 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="C"><g transform="translate(0.5,0.5)"><path d="M 595 360 L 758 360 L 758 520 L 595 520 L 595 360 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 597 362 L 597 518 L 597 518 L 756 518 L 756 362 L 597 362" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 595 360 L 758 360 L 758 520 L 595 520 L 595 360 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="D"><g transform="translate(0.5,0.5)"><path d="M 595 194.5 L 768 194.5 L 768 360 L 595 360 L 595 194.5 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 597 196.5 L 597 358 L 597 358 L 766 358 L 766 196.5 L 597 196.5" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 595 194.5 L 768 194.5 L 768 360 L 595 360 L 595 194.5 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="E"><g transform="translate(0.5,0.5)"><path d="M 508 190 L 554 190 L 554 700 L 508 700 L 508 190 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 510 192 L 510 698 L 510 698 L 552 698 L 552 192 L 510 192" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 508 190 L 554 190 L 554 700 L 508 700 L 508 190 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="K"><g transform="translate(0.5,0.5)"><path d="M 403 540 L 493 540 L 493 700 L 403 700 L 403 540 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 405 542 L 405 698 L 405 698 L 491 698 L 491 542 L 405 542" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 403 540 L 493 540 L 493 700 L 403 700 L 403 540 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="G"><g transform="translate(0.5,0.5)"><path d="M -0.49 212 L 89.51 212 L 89.51 682 L -0.49 682 L -0.49 212 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 1.51 214 L 1.51 680 L 1.51 680 L 87.51 680 L 87.51 214 L 1.51 214" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M -0.49 212 L 89.51 212 L 89.51 682 L -0.49 682 L -0.49 212 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="H"><g transform="translate(0.5,0.5)"><path d="M 458 180 L 508 180 L 508 530 L 458 530 L 458 180 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 460 182 L 460 528 L 460 528 L 506 528 L 506 182 L 460 182" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 458 180 L 508 180 L 508 530 L 458 530 L 458 180 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="F"><g transform="translate(0.5,0.5)"><path d="M 148 210 L 238 210 L 238 680 L 148 680 L 148 210 Z" fill="none" stroke="none" pointer-events="all"/><path d="M 150 212 L 150 678 L 150 678 L 236 678 L 236 212 L 150 212" fill-opacity="0" fill="transparent" stroke="none" pointer-events="all" style="fill: transparent;"/><path d="M 148 210 L 238 210 L 238 680 L 148 680 L 148 210 Z" fill="none" stroke="none" pointer-events="all"/></g></g>
              <g data-cell-id="L-1"><g transform="translate(0.5,0.5)"><ellipse cx="163" cy="855" rx="145" ry="55" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="G-1"><g transform="translate(0.5,0.5)"><rect x="-61.12" y="308.88" width="211.25" height="55" fill="#ffffff" stroke="#000000" transform="rotate(-90,44.51,336.38)" pointer-events="all"/></g></g>
              <g data-cell-id="K-1"><g transform="translate(0.5,0.5)"><rect x="368" y="592" width="160" height="60" rx="9" ry="9" fill="#ffffff" stroke="#000000" transform="rotate(90,448,622)" pointer-events="all"/></g></g>
              <g data-cell-id="WarehouseDesk"><g transform="translate(0.5,0.5)"><path d="M 78 1020 L 208 1020 L 208 1040 L 98 1040 L 98 1100 L 78 1100 Z" fill="#ffffff" stroke="#000000" stroke-miterlimit="10" pointer-events="all"/></g></g>
              <g data-cell-id="H-1"><g transform="translate(0.5,0.5)"><rect x="448" y="212" width="75" height="22.5" fill="#ffffff" stroke="#000000" transform="rotate(-90,485.5,223.25)" pointer-events="all"/></g></g>
              <g data-cell-id="H-2"><g transform="translate(0.5,0.5)"><rect x="448" y="302" width="75" height="22.5" fill="#ffffff" stroke="#000000" transform="rotate(-90,485.5,313.25)" pointer-events="all"/></g></g>
              <g data-cell-id="H-3"><g transform="translate(0.5,0.5)"><rect x="448" y="392" width="75" height="22.5" fill="#ffffff" stroke="#000000" transform="rotate(-90,485.5,403.25)" pointer-events="all"/></g></g>
              <g data-cell-id="H-4"><g transform="translate(0.5,0.5)"><rect x="448" y="482" width="75" height="22.5" fill="#ffffff" stroke="#000000" transform="rotate(-90,485.5,493.25)" pointer-events="all"/></g></g>
              <g data-cell-id="Workbench"><g transform="translate(0.5,0.5)"><rect x="128" y="0" width="160" height="80" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="A-2"><g transform="translate(0.5,0.5)"><rect x="682" y="804" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="J-4"><g transform="translate(0.5,0.5)"><rect x="528" y="70" width="230" height="110" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="A-1"><g transform="translate(0.5,0.5)"><rect x="601" y="804" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="A-3"><g transform="translate(0.5,0.5)"><rect x="701" y="744" width="76" height="38" fill="#ffffff" stroke="#000000" transform="rotate(90,739,763)" pointer-events="all"/></g></g>
              <g data-cell-id="A-4"><g transform="translate(0.5,0.5)"><rect x="682" y="684" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="A-5"><g transform="translate(0.5,0.5)"><rect x="601" y="684" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="C-2"><g transform="translate(0.5,0.5)"><rect x="682" y="482" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="C-1"><g transform="translate(0.5,0.5)"><rect x="601" y="482" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="C-3"><g transform="translate(0.5,0.5)"><rect x="701" y="422" width="76" height="38" fill="#ffffff" stroke="#000000" transform="rotate(90,739,441)" pointer-events="all"/></g></g>
              <g data-cell-id="C-4"><g transform="translate(0.5,0.5)"><rect x="682" y="362" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="C-5"><g transform="translate(0.5,0.5)"><rect x="601" y="362" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="D-2"><g transform="translate(0.5,0.5)"><rect x="682" y="320.5" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="D-1"><g transform="translate(0.5,0.5)"><rect x="601" y="320.5" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="E-1"><g transform="translate(0.5,0.5)"><rect x="494" y="217" width="76" height="38" fill="#ffffff" stroke="#000000" transform="rotate(90,532,236)" pointer-events="all"/></g></g>
              <g data-cell-id="D-3"><g transform="translate(0.5,0.5)"><rect x="682" y="200.5" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="D-4"><g transform="translate(0.5,0.5)"><rect x="601" y="200.5" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="B-2"><g transform="translate(0.5,0.5)"><rect x="682" y="643" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="B-1"><g transform="translate(0.5,0.5)"><rect x="601" y="643" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="B-3"><g transform="translate(0.5,0.5)"><rect x="701" y="583" width="76" height="38" fill="#ffffff" stroke="#000000" transform="rotate(90,739,602)" pointer-events="all"/></g></g>
              <g data-cell-id="B-4"><g transform="translate(0.5,0.5)"><rect x="682" y="523" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="B-5"><g transform="translate(0.5,0.5)"><rect x="601" y="523" width="76" height="38" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="J-1"><g transform="translate(0.5,0.5)"><rect x="166" y="120" width="40" height="40" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="J-2"><g transform="translate(0.5,0.5)"><rect x="211" y="120" width="40" height="40" fill="#ffffff" stroke="#000000" pointer-events="all"/></g></g>
              <g data-cell-id="G-2"><g transform="translate(0.5,0.5)"><rect x="-61.11" y="528.38" width="211.25" height="55" fill="#ffffff" stroke="#000000" transform="rotate(-90,44.51,555.88)" pointer-events="all"/></g></g>
              <g data-cell-id="F-1"><g transform="translate(0.5,0.5)"><rect x="86.74" y="308.88" width="211.25" height="55" fill="#ffffff" stroke="#000000" transform="rotate(-90,192.37,336.38)" pointer-events="all"/></g></g>
              <g data-cell-id="F-2"><g transform="translate(0.5,0.5)"><rect x="86.75" y="528.38" width="211.25" height="55" fill="#ffffff" stroke="#000000" transform="rotate(-90,192.38,555.88)" pointer-events="all"/></g></g>
            </g>
          </g>
        </g>
      </svg>

      <!-- Map labels overlay -->
      <div class="map-label" style="left:128px; top:30px; width:160px; text-align:center;">WORKBENCH</div>
      <div class="map-label" style="left:308px; top:75px; width:190px; text-align:center;">I — CABLE WALL</div>
      <div class="map-label" style="left:528px; top:115px; width:230px; text-align:center;">J-4 — RACK ALCOVE</div>
      <div class="map-label" style="left:166px; top:165px;">J-1</div>
      <div class="map-label" style="left:211px; top:165px;">J-2</div>
      <div class="map-label" style="left:2px; top:320px; writing-mode:vertical-rl; transform:rotate(180deg);">G-1</div>
      <div class="map-label" style="left:2px; top:530px; writing-mode:vertical-rl; transform:rotate(180deg);">G-2</div>
      <div class="map-label" style="left:148px; top:320px; writing-mode:vertical-rl; transform:rotate(180deg);">F-1</div>
      <div class="map-label" style="left:148px; top:530px; writing-mode:vertical-rl; transform:rotate(180deg);">F-2</div>
      <div class="map-label" style="left:532px; top:230px; text-align:center;">E-1</div>
      <div class="map-label" style="left:601px; top:242px;">D-4</div>
      <div class="map-label" style="left:682px; top:242px;">D-3</div>
      <div class="map-label" style="left:601px; top:322px;">D-1</div>
      <div class="map-label" style="left:682px; top:322px;">D-2</div>
      <div class="map-label" style="left:601px; top:404px;">C-5</div>
      <div class="map-label" style="left:682px; top:404px;">C-4</div>
      <div class="map-label" style="left:601px; top:524px;">C-1</div>
      <div class="map-label" style="left:682px; top:524px;">C-2</div>
      <div class="map-label" style="left:601px; top:565px;">B-5</div>
      <div class="map-label" style="left:682px; top:565px;">B-4</div>
      <div class="map-label" style="left:601px; top:685px;">A-5</div>
      <div class="map-label" style="left:682px; top:685px;">A-4</div>
      <div class="map-label" style="left:80px; top:1055px;">WAREHOUSE DESK</div>
      <div class="map-label" style="left:80px; top:840px; width:170px; text-align:center;">L-1</div>
      <div class="map-label" style="left:368px; top:610px; width:160px; text-align:center;">K-1</div>
    </div>
  </div>
</div>

<!-- FOOTER -->
<div id="footer">
  <div class="footer-item">Aisles: <span>A B C D E F G H I J K L</span></div>
  <div class="footer-item" id="footer-selection">Selection: <span>None</span></div>
  <div class="footer-item" id="cursor-pos">X:<span id="cx">0</span> Y:<span id="cy">0</span></div>
</div>

<!-- TOOLTIP -->
<div id="tooltip"></div>

<script>
// ── Aisle → rack mapping ──────────────────────────────────────────────────
const AISLES = {
  A: { name: 'Aisle A', racks: ['A-1','A-2','A-3','A-4','A-5'] },
  B: { name: 'Aisle B', racks: ['B-1','B-2','B-3','B-4','B-5'] },
  C: { name: 'Aisle C', racks: ['C-1','C-2','C-3','C-4','C-5'] },
  D: { name: 'Aisle D', racks: ['D-1','D-2','D-3','D-4'] },
  E: { name: 'Aisle E', racks: ['E-1'] },
  F: { name: 'Aisle F', racks: ['F-1','F-2'] },
  G: { name: 'Aisle G', racks: ['G-1','G-2'] },
  H: { name: 'Aisle H — Blue Bins', racks: ['H-1','H-2','H-3','H-4'] },
  I: { name: 'Aisle I — Cable Wall', racks: ['I-1'] },
  J: { name: 'Aisle J', racks: ['J-1','J-2','J-4'] },
  K: { name: 'K — Test Table', racks: ['K-1'] },
  L: { name: 'L — Big Table', racks: ['L-1'] },
};

// Rack → shelves (from DB)
const RACK_SHELVES = {
  'A-1':4,'A-2':4,'A-3':4,'A-4':4,'A-5':4,
  'B-1':5,'B-2':4,'B-3':4,'B-4':4,'B-5':4,
  'C-1':4,'C-2':4,'C-3':4,'C-4':5,'C-5':5,
  'D-1':4,'D-2':4,'D-3':4,'D-4':4,
  'E-1':4,
  'F-1':4,'F-2':4,
  'G-1':3,'G-2':3,
  'H-1':4,'H-2':4,'H-3':4,'H-4':4,
  'I-1':4,
  'J-1':4,'J-2':4,'J-4':4,
  'K-1':4,
  'L-1':4,
};

const LANDMARKS = { Workbench: 'WORKBENCH', WarehouseDesk: 'WAREHOUSE DESK' };

let selectedAisle = null;
let selectedRack = null;

// ── Helpers ───────────────────────────────────────────────────────────────
function getEl(cellId) {
  return document.querySelector(`[data-cell-id="${cellId}"]`);
}

function clearHighlights() {
  document.querySelectorAll('.rack-highlighted, .rack-selected')
    .forEach(el => el.classList.remove('rack-highlighted', 'rack-selected'));
  document.querySelectorAll('.aisle-active')
    .forEach(el => el.classList.remove('aisle-active'));
}

function highlightAisle(aisleCode) {
  const aisle = AISLES[aisleCode];
  if (!aisle) return;
  const aisleEl = getEl(aisleCode);
  if (aisleEl) aisleEl.classList.add('aisle-active');
  aisle.racks.forEach(rackCode => {
    const el = getEl(rackCode);
    if (el) el.classList.add('rack-highlighted');
  });
}

function selectRack(rackCode) {
  // Remove highlight from others in same aisle, keep selected
  if (selectedAisle) {
    AISLES[selectedAisle].racks.forEach(r => {
      const el = getEl(r);
      if (el) {
        el.classList.remove('rack-highlighted','rack-selected');
        if (r !== rackCode) el.classList.remove('rack-highlighted');
      }
    });
  }
  const el = getEl(rackCode);
  if (el) {
    el.classList.remove('rack-highlighted');
    el.classList.add('rack-selected');
  }
}

// ── Cross-frame navigation ────────────────────────────────────────────────
function navigateToInv(code) {
  if (window.parent !== window && typeof window.parent.mapNavToInv === 'function') {
    window.parent.mapNavToInv(code);
  } else {
    window.parent.postMessage({ type: 'map-nav-inv', code: code }, window.location.origin);
  }
}

// ── Panel rendering ───────────────────────────────────────────────────────
function showIdle() {
  document.getElementById('panel-title').textContent = 'No selection';
  document.getElementById('panel-sub').textContent = 'Tap a zone on the map';
  document.getElementById('panel-idle').style.display = 'flex';
  document.getElementById('rack-list').style.display = 'none';
  document.getElementById('rack-detail').style.display = 'none';
  document.getElementById('footer-selection').innerHTML = 'Selection: <span>None</span>';
}

function showAislePanel(aisleCode) {
  const aisle = AISLES[aisleCode];
  const titleEl = document.getElementById('panel-title');
  titleEl.textContent = '';
  const aisleBtn = document.createElement('button');
  aisleBtn.className = 'nav-link';
  aisleBtn.title = 'Filter inventory by this aisle';
  aisleBtn.textContent = aisle.name;
  aisleBtn.addEventListener('click', function(e) { e.stopPropagation(); navigateToInv(aisleCode); });
  titleEl.appendChild(aisleBtn);
  document.getElementById('panel-sub').textContent = `${aisle.racks.length} rack${aisle.racks.length !== 1 ? 's' : ''} — select one`;
  document.getElementById('panel-idle').style.display = 'none';
  document.getElementById('rack-detail').style.display = 'none';

  const list = document.getElementById('rack-list');
  list.style.display = 'block';
  list.innerHTML = aisle.racks.map(code => `
    <div class="rack-item" data-rack="${code}">
      <span class="rack-code">${code}</span>
      <span class="rack-name">RACK ${code.split('-').pop()} &nbsp;·&nbsp; ${RACK_SHELVES[code] || 0} SHELVES</span>
    </div>
  `).join('');

  list.querySelectorAll('.rack-item').forEach(item => {
    item.addEventListener('click', () => {
      const code = item.dataset.rack;
      list.querySelectorAll('.rack-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      selectRack(code);
      selectedRack = code;
      showRackDetail(code);
    });
  });

  document.getElementById('footer-selection').innerHTML = `Selection: <span>${aisleCode}</span>`;
}

function showRackDetail(rackCode) {
  document.getElementById('rack-list').style.display = 'none';
  const shelfCount = RACK_SHELVES[rackCode] || 0;
  const aislePart = rackCode.split('-')[0];
  const rackNum = rackCode.split('-')[1];

  // Shelves are tier-3 locations (e.g. A-1-2) and navigate exactly like aisles and racks —
  // mapNavToInv() already resolves a tier-3 code up through its rack and aisle filters.
  const shelves = Array.from({length: shelfCount}, (_,i) => {
    const shelfCode = `${rackCode}-${i+1}`;
    return `
    <div class="shelf-row">
      <button class="shelf-code nav-link" data-shelf="${shelfCode}"
        title="Filter inventory by shelf ${shelfCode}">${shelfCode}</button>
      <span class="shelf-status">— SHELF ${i+1} —</span>
    </div>`;
  }).join('');

  const detail = document.getElementById('rack-detail');
  detail.style.display = 'flex';
  detail.innerHTML = `
    <button class="btn-back" id="back-btn">← Back to Aisle ${aislePart}</button>
    <div style="margin-top:12px;">
      <div class="panel-label">Selected Rack</div>
      <button class="detail-rack-name nav-link" id="rack-nav-btn">${rackCode}</button>
      <div class="detail-meta">Aisle ${aislePart} · Rack ${rackNum} · ${shelfCount} shelves</div>
    </div>
    <div class="detail-section-label">Shelves</div>
    ${shelves}
  `;

  document.getElementById('rack-nav-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    navigateToInv(rackCode);
  });

  detail.querySelectorAll('.shelf-code[data-shelf]').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      navigateToInv(this.dataset.shelf);
    });
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    selectedRack = null;
    selectRack(null);
    clearHighlights();
    highlightAisle(selectedAisle);
    detail.style.display = 'none';
    showAislePanel(selectedAisle);
  });

  document.getElementById('footer-selection').innerHTML = `Selection: <span>${rackCode}</span>`;
}

// ── Event wiring ──────────────────────────────────────────────────────────
const svg = document.getElementById('map-svg');

// Aisle zone clicks
Object.keys(AISLES).forEach(aisleCode => {
  const el = getEl(aisleCode);
  if (!el) return;
  el.style.cursor = 'pointer';
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectedAisle === aisleCode && !selectedRack) {
      // Deselect
      clearHighlights();
      selectedAisle = null;
      showIdle();
      return;
    }
    clearHighlights();
    selectedAisle = aisleCode;
    selectedRack = null;
    highlightAisle(aisleCode);
    showAislePanel(aisleCode);
  });
});

// Rack clicks — selects parent aisle first if needed, then the rack
Object.keys(AISLES).forEach(aisleCode => {
  AISLES[aisleCode].racks.forEach(rackCode => {
    const el = getEl(rackCode);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      // If clicking already-selected rack, do nothing
      if (selectedRack === rackCode) return;
      // If a different aisle was selected, clear it first
      if (selectedAisle && selectedAisle !== aisleCode) {
        clearHighlights();
      }
      // Select parent aisle if not already selected
      if (selectedAisle !== aisleCode) {
        selectedAisle = aisleCode;
        highlightAisle(aisleCode);
        showAislePanel(aisleCode);
      }
      // Now select the rack
      selectedRack = rackCode;
      selectRack(rackCode);
      document.querySelectorAll('.rack-item').forEach(i => {
        i.classList.toggle('selected', i.dataset.rack === rackCode);
      });
      showRackDetail(rackCode);
    });
  });
});

// Landmark tooltips
const tooltip = document.getElementById('tooltip');
Object.entries(LANDMARKS).forEach(([cellId, label]) => {
  const el = getEl(cellId);
  if (!el) return;
  el.addEventListener('mouseenter', (e) => {
    tooltip.textContent = label;
    tooltip.classList.add('visible');
  });
  el.addEventListener('mousemove', (e) => {
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY - 28) + 'px';
  });
  el.addEventListener('mouseleave', () => {
    tooltip.classList.remove('visible');
  });
});

// Click outside to deselect
svg.addEventListener('click', () => {
  clearHighlights();
  selectedAisle = null;
  selectedRack = null;
  showIdle();
});

// Cursor position tracker
document.getElementById('map-wrap').addEventListener('mousemove', (e) => {
  const rect = svg.getBoundingClientRect();
  const scaleX = 789 / rect.width;
  const scaleY = 1101 / rect.height;
  const x = Math.round((e.clientX - rect.left) * scaleX);
  const y = Math.round((e.clientY - rect.top) * scaleY);
  document.getElementById('cx').textContent = x;
  document.getElementById('cy').textContent = y;
});

// Scale map to fill available width; labels stay aligned since zoom affects layout
function fitMap() {
  const wrap = document.getElementById('map-wrap');
  const scale = wrap.clientHeight / 1101;
  document.getElementById('map-container').style.zoom = scale.toFixed(3);
}
fitMap();
window.addEventListener('resize', fitMap);

// Clock
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString('en-US', {hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit'});
}
updateClock();
setInterval(updateClock, 1000);
</script>
</body>
</html>
