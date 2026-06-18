#!/usr/bin/env node
/** Patch dashboard.html for Moria theme — backgrounds + sprites */
import { readFileSync, writeFileSync } from 'fs';

const path = '/root/Machine/packages/service/src/gui/dashboard.html';
let html = readFileSync(path, 'utf8');

// 1. Station panel CSS — add background-size and has-background
html = html.replace(
  '.station-panel {\n  background: var(--panel);\n  border: 1px solid rgba(255,255,255,0.08);\n  border-radius: var(--radius);\n  overflow: hidden;\n  transition: transform 0.2s, box-shadow 0.2s;\n}\n.station-panel:hover {\n  transform: translateY(-2px);\n  box-shadow: 0 6px 20px rgba(0,0,0,0.4);\n}',
  '.station-panel {\n  background: var(--panel);\n  border: 1px solid rgba(255,255,255,0.08);\n  border-radius: var(--radius);\n  overflow: hidden;\n  transition: transform 0.2s, box-shadow 0.2s;\n  background-size: cover;\n  background-position: center;\n  min-height: 140px;\n}\n.station-panel.has-background .station-header {\n  background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%);\n}\n.station-panel:hover {\n  transform: translateY(-2px);\n  box-shadow: 0 6px 20px rgba(0,0,0,0.4);\n}'
);

// 2. Agent badge avatar → sprite
html = html.replace(
  '.agent-badge .avatar {\n  width: 24px; height: 24px;\n  border-radius: 50%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 0.7rem;\n  font-weight: 800;\n  color: #fff;\n  flex-shrink: 0;\n}',
  '.agent-badge .sprite {\n  width: 32px; height: 32px;\n  flex-shrink: 0;\n  image-rendering: pixelated;\n  background-size: 64px 32px;\n  background-repeat: no-repeat;\n}\n.agent-badge .sprite.idle {\n  animation: spriteIdle 1.2s steps(2) infinite;\n}\n.agent-badge .sprite.working {\n  animation: spriteWork 1s steps(2) infinite;\n}\n@keyframes spriteIdle {\n  0% { background-position: 0 0; }\n  100% { background-position: -64px 0; }\n}\n@keyframes spriteWork {\n  0% { background-position: 0 0; }\n  100% { background-position: -64px 0; }\n}'
);

// 3. status-busy .avatar → .sprite
html = html.replace(
  '.agent-badge.status-busy .avatar {\n  animation: pulse 1.2s ease infinite;\n}',
  '.agent-badge.status-busy .sprite {\n  animation: spriteWork 1s steps(2) infinite;\n}'
);

// 4. findOrCreateStationPanel — add background + use label
html = html.replace(
  `  const stDef = currentTheme?.stations?.[stationId];
  const displayName = stDef?.name || stationId.replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());

  panel.innerHTML = \`
    <div class="station-header">
      <span class="station-name">\${displayName}</span>
      <span class="station-badge" id="count-\${stationId}">0</span>
    </div>
    <div class="station-slots" id="slots-\${stationId}"></div>
  \`;`,
  `  const stDef = currentTheme?.stations?.[stationId];
  const displayName = stDef?.label || stDef?.name || stationId.replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());

  // Apply background image from theme
  if (stDef?.backgroundImage) {
    panel.style.backgroundImage = \`url(\${stDef.backgroundImage})\`;
    panel.classList.add('has-background');
  }

  panel.innerHTML = \`
    <div class="station-header">
      <span class="station-name">\${displayName}</span>
      <span class="station-badge" id="count-\${stationId}">0</span>
    </div>
    <div class="station-slots" id="slots-\${stationId}"></div>
  \`;`
);

// 5. findOrCreateAgentBadge — use sprites
html = html.replace(
  `  if (agentBadges[agentId]) return agentBadges[agentId];

  const badge = document.createElement('span');
  badge.className = 'agent-badge';
  badge.title = name;

  const initial = name.charAt(0).toUpperCase();
  const color = AGENT_COLORS[parseInt(agentId) % AGENT_COLORS.length];

  badge.innerHTML = \`<span class="avatar" style="background:\${color}">\${initial}</span>\${name}\`;

  agentBadges[agentId] = badge;

  // Track in station
  if (stations[station]) {
    stations[station].agents.add(agentId);
    stations[station].countEl.textContent = stations[station].agents.size;
  }`,
  `  if (agentBadges[agentId]) return agentBadges[agentId];

  const badge = document.createElement('span');
  badge.className = 'agent-badge';
  badge.title = name;

  // Try to get sprite from theme, fall back to avatar
  const spriteCfg = currentTheme?.sprites?.[String(agentId)];
  const idleSrc = spriteCfg?.animations?.idle?.src;
  const workSrc = spriteCfg?.animations?.[spriteCfg?.defaultState]?.src;

  if (idleSrc) {
    badge.dataset.idleSrc = idleSrc;
    badge.dataset.workSrc = workSrc || idleSrc;
    badge.innerHTML = \`<span class="sprite idle" style="background-image:url(\${idleSrc})"></span>\${name}\`;
  } else {
    // Fallback: colored initials
    const initial = name.charAt(0).toUpperCase();
    const color = AGENT_COLORS[parseInt(agentId) % AGENT_COLORS.length];
    badge.innerHTML = \`<span class="avatar" style="background:\${color}">\${initial}</span>\${name}\`;
  }

  agentBadges[agentId] = badge;

  // Track in station
  if (station && stations[station]) {
    stations[station].agents.add(agentId);
    stations[station].countEl.textContent = stations[station].agents.size;
  }`
);

// 6. handlePipelineEvent — animate sprites on alert
html = html.replace(
  `  // Animate
  badge.classList.remove('just-arrived', 'alert-event');
  void badge.offsetWidth; // force reflow
  if (eventType === 'alert') {
    badge.classList.add('alert-event');
  } else {
    badge.classList.add('just-arrived');
  }`,
  `  // Animate
  badge.classList.remove('just-arrived', 'alert-event');
  void badge.offsetWidth; // force reflow
  if (eventType === 'alert') {
    badge.classList.add('alert-event');
    // Switch sprite to working animation
    const sprite = badge.querySelector('.sprite');
    if (sprite) {
      sprite.className = 'sprite working';
      if (badge.dataset.workSrc) {
        sprite.style.backgroundImage = \`url(\${badge.dataset.workSrc})\`;
      }
      setTimeout(() => {
        sprite.className = 'sprite idle';
        if (badge.dataset.idleSrc) {
          sprite.style.backgroundImage = \`url(\${badge.dataset.idleSrc})\`;
        }
      }, 3000);
    }
  } else {
    badge.classList.add('just-arrived');
  }`
);

writeFileSync(path, html);
console.log('✅ dashboard.html patched with Moria theme support');
