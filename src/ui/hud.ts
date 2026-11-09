import type { BodyData, ProgressState } from '@/data/types';
import astronautsData from '@/data/astronauts.json';
import type { ScaleMode } from '@/data/types';
import { addEarthLink } from '@/ui/earthLink';

export interface HUDCallbacks {
  onSelectBody: (id: string) => void;
  onScaleMode: (m: ScaleMode) => void;
  onTimeSpeed: (v: number) => void;
  onMissionAnswer: (bodyId: string, difficulty: 'easy' | 'medium', index: number) => void;
  onDifficulty: (d: 'easy' | 'medium') => void;
  onCertificate: () => void;
  onCertificateName: (name: string) => void;
  onAstronautSelect: (name: string) => void;
  onBase: () => void;
  onPlaySound: (kind: 'click' | 'success' | 'error' | 'launch' | 'transition') => void;
  onSpeak: (text: string) => void;
  onReset: () => void;
  onBack: () => void;
  onCloseCard: () => void;
  xrRenderer?: { xr: { getSession: () => XRSession | null } };
}

export class HUD {
  private root: HTMLElement;
  private callbacks: HUDCallbacks;
  private difficulty: 'easy' | 'medium' = 'easy';
  private scaleMode: ScaleMode = 'visual';
  private progress: ProgressState;
  private bodyCount = 10;

  constructor(root: HTMLElement, callbacks: HUDCallbacks, progress: ProgressState) {
    this.root = root;
    this.callbacks = callbacks;
    this.progress = progress;
    this.scaleMode = progress.scaleMode;
    this.render();
  }

  private cardHeader(title: string): string {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <h2 style="margin:0;flex:1;">${title}</h2>
        <button class="btn" id="close-btn" title="Fechar painel" style="padding:0;width:36px;height:36px;min-width:36px;font-size:1rem;">✕</button>
        <button class="btn" id="back-btn" style="font-size:0.8rem;">← Voltar ao mapa</button>
      </div>`;
  }

  private render() {
    this.root.innerHTML = `
      <div class="hud">
        <div class="top-bar">
          <div class="brand interactive">✦ Explorador do Sistema Solar</div>
          <div class="interactive" style="display:flex;gap:8px;align-items:center;">
            <button class="btn" id="base-btn" style="font-size:0.75rem;padding:4px 8px;">🏢 Base</button>
            <select id="astro-select" style="padding:4px 8px;border-radius:6px;background:var(--panel);color:var(--fg);border:1px solid var(--panel-border);font-size:0.75rem;">
              <option value="">Explorador</option>
              ${astronautsData.astronauts.map((a) => `<option value="${a.name}">${a.name} (${a.role})</option>`).join('')}
            </select>
            <div class="panel" style="padding:4px 10px;font-size:0.75rem;" id="progress-pill">Progresso: 0/0</div>
            <div class="scale-toggle">
              <button data-scale="visual" class="${this.scaleMode === 'visual' ? 'active' : ''}">Visual</button>
              <button data-scale="real" class="${this.scaleMode === 'real' ? 'active' : ''}">Escala real</button>
            </div>
          </div>
        </div>

        <div class="side-panel panel planet-card" id="planet-card"></div>

        <div class="time-slider interactive">
          <span>Tempo</span>
          <input type="range" id="time-speed" min="0" max="5" step="0.1" value="${this.progress.timeSpeed}" />
          <span id="time-val">${this.progress.timeSpeed.toFixed(1)}×</span>
        </div>

        <div class="scale-indicator" id="scale-indicator"></div>

        <div class="vr-btn interactive">
          <button class="btn" id="vr-btn">🥽 VR</button>
        </div>

        <div class="cert" id="cert"></div>
      </div>
      <div id="rotate-hint">
        <div id="rotate-hint__icon">📱</div>
        <p>Para a melhor experiência no VR Box, gire o celular para o modo <strong>paisagem</strong>.</p>
      </div>
    `;

    // eventos
    this.root.querySelectorAll('[data-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = (btn as HTMLElement).dataset.scale as ScaleMode;
        this.setScaleMode(m);
        this.callbacks.onScaleMode(m);
      });
    });

    const slider = this.root.querySelector('#time-speed') as HTMLInputElement;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      const val = this.root.querySelector('#time-val') as HTMLElement;
      val.textContent = `${v.toFixed(1)}×`;
      this.callbacks.onTimeSpeed(v);
    });

    this.root.querySelector('#vr-btn')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('xr:enter'));
    });

    const astroSelect = this.root.querySelector('#astro-select') as HTMLSelectElement | null;
    astroSelect?.addEventListener('change', () => {
      const name = astroSelect.value;
      if (name) this.callbacks.onAstronautSelect(name);
    });
    this.root.querySelector('#base-btn')?.addEventListener('click', () => this.callbacks.onBase());

    this.root.querySelector('#cert')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'cert-close') this.hideCertificate();
    });
  }

  setScaleMode(m: ScaleMode) {
    this.scaleMode = m;
    this.root.querySelectorAll('[data-scale]').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.scale === m);
    });
  }

  showPlanet(body: BodyData) {
    const card = this.root.querySelector('#planet-card') as HTMLElement;
    card.classList.add('visible');
    const satList = body.satellites?.map((s) => s.name).join(', ') || '—';
    const typeMap: Record<string, string> = { star: 'Estrela', planet: 'Planeta', dwarf: 'Planeta anão', belt: 'Cinturão', moon: 'Lua', exoplanet: 'Exoplaneta' };
    const typeLabel = typeMap[body.type] ?? 'Corpo celeste';
    const bodyEmoji = body.type === 'star' ? '☀️' : body.type === 'dwarf' ? '🪨' : '🪐';
    const prog = this.progress.completedMissions[body.id];
    const easyDone  = prog?.easy?.correct  ? '✓' : '○';
    const medDone   = prog?.medium?.correct ? '✓' : '○';

    card.innerHTML = `
      ${this.cardHeader(`${bodyEmoji} ${body.name}`)}

      <!-- Faixa colorida com tipo e distância -->
      <div style="display:flex;align-items:center;gap:8px;padding:8px 0 6px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:8px;">
        <span style="background:${body.color};color:#000;font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:20px;">${typeLabel.toUpperCase()}</span>
        <span style="font-size:0.75rem;opacity:0.7;">${body.distanceAU} UA · ${(body.distanceKm / 1e6).toFixed(1)} M km</span>
        <span style="margin-left:auto;font-size:0.75rem;opacity:0.6;">Missões: ${easyDone} Fácil &nbsp; ${medDone} Médio</span>
      </div>

      <dl class="data-grid">
        <dt>🔵 Raio</dt><dd>${body.radiusKm.toLocaleString('pt-BR')} km</dd>
        <dt>⚖️ Massa</dt><dd>${body.massKg} kg</dd>
        <dt>🌡️ Temperatura</dt><dd>${body.temperatureK} K</dd>
        <dt>🏋️ Gravidade</dt><dd>${body.gravityRelative}g</dd>
        <dt>🔄 Período orbital</dt><dd>${body.orbitalPeriodDays > 0 ? body.orbitalPeriodDays + ' dias' : '—'}</dd>
        <dt>⏱️ Rotação</dt><dd>${body.rotationPeriodHours} h</dd>
        <dt>🌙 Luas</dt><dd>${body.moons}</dd>
        <dt>💨 Atmosfera</dt><dd>${body.atmosphere}</dd>
        ${satList !== '—' ? `<dt>🛰️ Satélites</dt><dd>${satList}</dd>` : ''}
      </dl>

      <div style="margin:8px 0;">
        ${body.curiosities.map((c) => `<p style="font-size:0.78rem;opacity:0.8;margin:4px 0;line-height:1.45;">• ${c}</p>`).join('')}
      </div>

      <button class="btn" id="speak-btn" style="margin-top:4px;width:100%;">🔊 Ouvir curiosidades</button>

      <div class="mission" style="margin-top:10px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="font-weight:700;font-size:0.85rem;">🎯 Missão</span>
          <div class="difficulty" style="margin-left:auto;">
            <button data-diff="easy"   class="${this.difficulty === 'easy'   ? 'active' : ''}">${easyDone} Fácil</button>
            <button data-diff="medium" class="${this.difficulty === 'medium' ? 'active' : ''}">${medDone} Médio</button>
          </div>
        </div>
        <div class="q" id="mission-q"></div>
        <div class="opts" id="mission-opts"></div>
        <div id="mission-feedback" style="margin-top:6px;font-size:0.8rem;min-height:20px;"></div>
      </div>

      <div style="margin-top:10px;">
        <button class="btn" id="cert-btn" style="width:100%;">📜 Meu Certificado</button>
      </div>
    `;

    card.querySelector('#close-btn')?.addEventListener('click', () => this.callbacks.onCloseCard());
    card.querySelector('#back-btn')?.addEventListener('click', () => this.callbacks.onBack());
    card.querySelector('#cert-btn')?.addEventListener('click', () => this.callbacks.onCertificate());

    card.querySelectorAll('[data-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.difficulty = (btn as HTMLElement).dataset.diff as 'easy' | 'medium';
        card.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('active', b === btn));
        this.callbacks.onDifficulty(this.difficulty);
        this.renderMission(body);
      });
    });

    this.renderMission(body);
    card.querySelector('#speak-btn')?.addEventListener('click', () => {
      this.callbacks.onSpeak(body.curiosities.join('. '));
    });

    // Botão "Ver a Terra de perto" aparece só no card da Terra
    if (body.id === 'earth') {
      const speakBtn = card.querySelector('#speak-btn');
      if (speakBtn) {
        addEarthLink(speakBtn.parentElement!, { xrRenderer: this.callbacks.xrRenderer as any });
      }
    }
  }

  private renderMission(body: BodyData) {
    const q = body.mission[this.difficulty];
    const qEl = this.root.querySelector('#mission-q') as HTMLElement;
    const optsEl = this.root.querySelector('#mission-opts') as HTMLElement;
    if (!qEl || !optsEl) return;
    qEl.textContent = q.q;
    optsEl.innerHTML = q.options.map((o, i) => `<button class="opt" data-idx="${i}">${o}</button>`).join('');
    optsEl.querySelectorAll('.opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        if ((btn as HTMLElement).dataset.locked === '1') return;
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        this.callbacks.onMissionAnswer(body.id, this.difficulty, idx);
        const correct = idx === q.answer;
        optsEl.querySelectorAll('.opt').forEach((b, i) => {
          b.classList.toggle('correct', i === q.answer);
          if (i === idx && !correct) b.classList.add('wrong');
          (b as HTMLElement).dataset.locked = '1';
        });
        const fb = this.root.querySelector('#mission-feedback') as HTMLElement;
        fb.textContent = correct ? '✅ Correto!' : '❌ Tente novamente.';
        fb.style.color = correct ? '#22c55e' : '#ef4444';
        this.callbacks.onPlaySound(correct ? 'success' : 'error');
        if (correct) {
          this.updateProgressPill();
        }
      });
    });
  }

  hidePlanet() {
    const card = this.root.querySelector('#planet-card') as HTMLElement;
    card.classList.remove('visible');
  }

  showStation() {
    const card = this.root.querySelector('#planet-card') as HTMLElement;
    card.classList.add('visible');
    card.innerHTML = `
      ${this.cardHeader('🛰️ Estação Orbital — Sede do Time')}
      <div class="subtitle">Base de operações da equipe de exploradores</div>
      <p style="font-size:0.85rem;opacity:0.85;">A estação orbita a Terra e serve como centro de comando, laboratório e ponto de encontro da tripulação (Lucas, Rafael e Mariana). Módulos de habitação, painéis solares e cúpula de observação.</p>
      <div style="margin-top:12px;">
        <button class="btn" id="cert-btn">📜 Certificado</button>
      </div>
    `;
    card.querySelector('#close-btn')?.addEventListener('click', () => this.callbacks.onCloseCard());
    card.querySelector('#back-btn')?.addEventListener('click', () => this.callbacks.onBack());
    card.querySelector('#cert-btn')?.addEventListener('click', () => this.callbacks.onCertificate());
  }

  showRocket(r: any) {
    const card = this.root.querySelector('#planet-card') as HTMLElement;
    card.classList.add('visible');
    const crewNames = (r.crew || []).map((id: string) => {
      const a = astronautsData.astronauts.find((x: any) => x.id === id);
      return a ? a.name : id;
    }).join(', ') || '—';
    card.innerHTML = `
      ${this.cardHeader(`🚀 ${r.name}`)}
      <div class="subtitle">${r.type}</div>
      <dl class="data-grid">
        <dt>Altura</dt><dd>${r.heightM} m</dd>
        <dt>Massa</dt><dd>${r.massKg} kg</dd>
        <dt>Empuxo</dt><dd>${r.thrustKN.toLocaleString('pt-BR')} kN</dd>
        <dt>Estágios</dt><dd>${r.stages}</dd>
        <dt>Carga útil</dt><dd>${r.payloadKg.toLocaleString('pt-BR')} kg</dd>
        <dt>Delta-V</dt><dd>${r.deltaVms.toLocaleString('pt-BR')} m/s</dd>
        <dt>Tripulação</dt><dd>${crewNames}</dd>
        <dt>Missão</dt><dd>${r.mission}</dd>
      </dl>
      <div>
        ${r.curiosities.map((c: string) => `<p style="font-size:0.8rem;opacity:0.8;margin:4px 0;">• ${c}</p>`).join('')}
      </div>
      <div style="margin-top:12px;">
        <button class="btn" id="cert-btn">📜 Certificado</button>
      </div>
    `;
    card.querySelector('#close-btn')?.addEventListener('click', () => this.callbacks.onCloseCard());
    card.querySelector('#back-btn')?.addEventListener('click', () => this.callbacks.onBack());
    card.querySelector('#cert-btn')?.addEventListener('click', () => this.callbacks.onCertificate());
  }

  showCertificate(name: string, date: string) {
    const cert = this.root.querySelector('#cert') as HTMLElement;
    cert.classList.add('visible');
    const d = date ? new Date(date).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
    cert.innerHTML = `
      <div class="cert__card interactive">
        <h1>🏅 Certificado</h1>
        <div>Explorador do Sistema Solar</div>
        <div style="margin:12px 0;">
          <input id="cert-name-input" value="${name || 'Explorador'}" style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#e8eef7;font-size:1rem;text-align:center;" />
          <button class="btn" id="cert-name-apply" style="margin-left:6px;">OK</button>
        </div>
        <div class="name" id="cert-name-display">${name || 'Explorador'}</div>
        <div class="cert__seal">🚀🪐✨</div>
        <div>Concluiu a missão de exploração do sistema solar.</div>
        <div class="date">Data: ${d}</div>
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="btn primary" id="cert-export">Exportar imagem</button>
          <button class="btn" id="cert-close">Fechar</button>
        </div>
      </div>
    `;
    const input = cert.querySelector('#cert-name-input') as HTMLInputElement;
    const display = cert.querySelector('#cert-name-display') as HTMLElement;
    const apply = () => {
      const n = input.value.trim() || 'Explorador';
      display.textContent = n;
      this.callbacks.onCertificateName(n);
    };
    cert.querySelector('#cert-name-apply')?.addEventListener('click', apply);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
    cert.querySelector('#cert-close')?.addEventListener('click', () => this.hideCertificate());
  }

  hideCertificate() {
    const cert = this.root.querySelector('#cert') as HTMLElement;
    cert.classList.remove('visible');
  }

  showOnboarding(onDone: (astronautId: string | null) => void) {
    const overlay = document.createElement('div');
    overlay.className = 'cert visible';
    overlay.innerHTML = `
      <div class="cert__card interactive" style="max-width:640px;">
        <h1>🚀 Bem-vindo, Explorador!</h1>
        <div style="text-align:left;font-size:0.9rem;line-height:1.6;">
          <p><b>1.</b> Clique em um planeta para voar até ele.</p>
          <p><b>2.</b> Use o toggle <b>Visual / Escala real</b> para sentir o tamanho verdadeiro do espaço.</p>
          <p><b>3.</b> Responda às missões para ganhar seu certificado.</p>
          <p style="opacity:0.7;font-size:0.8rem;">Arraste para orbitar, scroll para zoom. No celular, toque e arraste.</p>
        </div>
        <div style="margin-top:12px;text-align:left;">
          <label style="font-size:0.85rem;">Escolha seu personagem (os demais o acompanham):</label>
          <select id="onb-astro" style="margin-top:6px;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,0.06);color:#e8eef7;border:1px solid rgba(255,255,255,0.2);width:100%;">
            ${astronautsData.astronauts.map((a) => `<option value="${a.id}">${a.name} — ${a.role}</option>`).join('')}
          </select>
        </div>
        <div style="margin-top:16px;">
          <button class="btn primary" id="onb-start">Começar exploração</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#onb-start')?.addEventListener('click', () => {
      const sel = overlay.querySelector('#onb-astro') as HTMLSelectElement;
      overlay.remove();
      onDone(sel?.value || null);
    });
  }

  setScaleIndicator(text: string) {
    const el = this.root.querySelector('#scale-indicator') as HTMLElement;
    if (el) el.textContent = text;
  }

  setBodyCount(n: number) { this.bodyCount = n; this.updateProgressPill(); }

  updateProgress(p: ProgressState) {
    this.progress = p;
    this.updateProgressPill();
  }

  updateProgressPill() {
    const el = this.root.querySelector('#progress-pill') as HTMLElement | null;
    if (!el) return;
    const visited = this.progress.visited.length;
    const missions = Object.values(this.progress.completedMissions).reduce((sum, m) => {
      return sum + (m.easy?.correct ? 1 : 0) + (m.medium?.correct ? 1 : 0);
    }, 0);
    const pct = this.bodyCount > 0 ? Math.round((visited / this.bodyCount) * 100) : 0;
    el.innerHTML = `
      <span style="font-size:0.7rem;opacity:0.75;">🔭 ${visited}/${this.bodyCount}</span>
      <span style="display:inline-block;width:48px;height:5px;background:rgba(255,255,255,0.12);border-radius:3px;vertical-align:middle;margin:0 4px;overflow:hidden;">
        <span style="display:block;width:${pct}%;height:100%;background:#00d4ff;border-radius:3px;transition:width 0.4s;"></span>
      </span>
      <span style="font-size:0.7rem;opacity:0.75;">🎯 ${missions}</span>
    `;
  }
}
