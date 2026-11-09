import type { BodyData, ProgressState, MissionQuestion } from '@/data/types';
import astronautsData from '@/data/astronauts.json';
import type { ScaleMode } from '@/data/types';
import { addEarthLink } from '@/ui/earthLink';
import questionPool from '@/data/questionPool.json';

export interface HUDCallbacks {
  onSelectBody: (id: string) => void;
  onScaleMode: (m: ScaleMode) => void;
  onTimeSpeed: (v: number) => void;
  onMissionAnswer: (bodyId: string, difficulty: 'easy' | 'medium', correct: boolean) => void;
  onDifficulty: (d: 'easy' | 'medium') => void;
  onCertificate: () => void;
  onCertificateName: (name: string) => void;
  onGrandeMissao: () => void;
  onGrandeMissaoComplete: (score: number, total: number) => void;
  onLeaderboard: () => void;
  onBadges: () => void;
  onDailyChallenge: () => void;
  onProgressMap: () => void;
  onComparePlanet: (currentBodyId: string) => void;
  onProfile: () => void;
  onAstronautSelect: (name: string) => void;
  onBase: () => void;
  onPlaySound: (kind: 'click' | 'success' | 'error' | 'launch' | 'transition' | 'quiz1' | 'quiz2' | 'quiz3') => void;
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
  private mainBodyIds: Set<string> = new Set();
  private selectedQuestions: Map<string, MissionQuestion> = new Map();
  private celebrationShown = false;

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
            <button class="btn" id="leaderboard-btn" title="Ranking de exploradores" style="font-size:0.75rem;padding:4px 8px;">🏆</button>
            <button class="btn" id="badges-btn" title="Conquistas" style="font-size:0.75rem;padding:4px 8px;">🏅</button>
            <button class="btn" id="daily-btn" title="Desafio do dia" style="font-size:0.75rem;padding:4px 8px;">📅</button>
            <button class="btn" id="map-btn" title="Mapa de progresso" style="font-size:0.75rem;padding:4px 8px;">🗺️</button>
            <button class="btn" id="profile-btn" title="Perfil do explorador" style="font-size:0.75rem;padding:4px 8px;">👤</button>
            <select id="astro-select" style="padding:4px 8px;border-radius:6px;background:var(--panel);color:var(--fg);border:1px solid var(--panel-border);font-size:0.75rem;">
              <option value="">Explorador</option>
              ${astronautsData.astronauts.map((a) => `<option value="${a.name}">${a.name} (${a.role})</option>`).join('')}
            </select>
            <div class="panel" style="padding:4px 10px;font-size:0.75rem;" id="progress-pill">Progresso: 0/0</div>
            <div class="scale-toggle">
              <button data-scale="visual" class="${this.scaleMode === 'visual' ? 'active' : ''}">Visual</button>
              <button data-scale="real" class="${this.scaleMode === 'real' ? 'active' : ''}">Escala real</button>
            </div>
            <span id="sync-dot" title="Sincronização na nuvem" style="font-size:0.8rem;opacity:0;transition:opacity 0.4s;"></span>
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
    this.root.querySelector('#leaderboard-btn')?.addEventListener('click', () => this.callbacks.onLeaderboard());
    this.root.querySelector('#badges-btn')?.addEventListener('click', () => this.callbacks.onBadges());
    this.root.querySelector('#daily-btn')?.addEventListener('click', () => this.callbacks.onDailyChallenge());
    this.root.querySelector('#map-btn')?.addEventListener('click', () => this.callbacks.onProgressMap());
    this.root.querySelector('#profile-btn')?.addEventListener('click', () => this.callbacks.onProfile());

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
    this.selectedQuestions.clear();
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

      <div style="margin-top:10px;display:flex;gap:6px;">
        <button class="btn" id="cert-btn" style="flex:1;">📜 Certificado</button>
        <button class="btn" id="compare-btn" title="Comparar com outro planeta" style="padding:6px 10px;">⚖️ Comparar</button>
      </div>
    `;

    card.querySelector('#close-btn')?.addEventListener('click', () => this.callbacks.onCloseCard());
    card.querySelector('#back-btn')?.addEventListener('click', () => this.callbacks.onBack());
    card.querySelector('#cert-btn')?.addEventListener('click', () => this.callbacks.onCertificate());
    card.querySelector('#compare-btn')?.addEventListener('click', () => this.callbacks.onComparePlanet(body.id));

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

  private getQuestionPool(bodyId: string, diff: 'easy' | 'medium'): MissionQuestion[] {
    return (questionPool as Record<string, Record<string, MissionQuestion[]>>)[bodyId]?.[diff] ?? [];
  }

  private renderMission(body: BodyData) {
    const base = body.mission[this.difficulty];
    const extras = this.getQuestionPool(body.id, this.difficulty);
    const pool: MissionQuestion[] = [base, ...extras];
    const key = `${body.id}:${this.difficulty}`;
    if (!this.selectedQuestions.has(key)) {
      this.selectedQuestions.set(key, pool[Math.floor(Math.random() * pool.length)]);
    }
    const q = this.selectedQuestions.get(key)!;

    const qEl = this.root.querySelector('#mission-q') as HTMLElement;
    const optsEl = this.root.querySelector('#mission-opts') as HTMLElement;
    if (!qEl || !optsEl) return;
    qEl.textContent = q.q;
    optsEl.innerHTML = q.options.map((o, i) => `<button class="opt" data-idx="${i}">${o}</button>`).join('');
    optsEl.querySelectorAll('.opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        if ((btn as HTMLElement).dataset.locked === '1') return;
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        const correct = idx === q.answer;
        this.callbacks.onMissionAnswer(body.id, this.difficulty, correct);
        optsEl.querySelectorAll('.opt').forEach((b, i) => {
          b.classList.toggle('correct', i === q.answer);
          if (i === idx && !correct) b.classList.add('wrong');
          (b as HTMLElement).dataset.locked = '1';
        });
        const fb = this.root.querySelector('#mission-feedback') as HTMLElement;
        fb.textContent = correct ? '✅ Correto!' : '❌ Tente novamente.';
        fb.style.color = correct ? '#22c55e' : '#ef4444';
        this.callbacks.onPlaySound(correct ? 'success' : 'error');
        if (correct) this.updateProgressPill();
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
          <button class="btn primary" id="cert-export">📤 Exportar / Compartilhar</button>
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

    const exportBtn = cert.querySelector('#cert-export') as HTMLButtonElement | null;
    exportBtn?.addEventListener('click', async () => {
      if (exportBtn.disabled) return;
      exportBtn.textContent = '⏳ Gerando…';
      exportBtn.disabled = true;
      try {
        const currentName = (cert.querySelector('#cert-name-display') as HTMLElement)?.textContent || name || 'Explorador';
        await this.exportAndShare(currentName, d);
      } catch {
        // Usuário cancelou o compartilhamento ou erro — mantém silêncio
      } finally {
        exportBtn.textContent = '📤 Exportar / Compartilhar';
        exportBtn.disabled = false;
      }
    });
  }

  private async exportAndShare(nome: string, dataPT: string): Promise<void> {
    const W = 1000, H = 580;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Fundo espacial
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, W, H);

    // Estrelas determinísticas
    const sx = [100,230,480,720,900,50,310,560,840,30,170,420,670,920,80,250,500,750,990,140,380,630,870,20,290,540,780,60,200,450];
    const sy = [80,120,200,280,360,440,500,60,140,220,300,380,460,520,100,160,240,320,400,480,70,150,230,310,390,470,110,190,270,350];
    sx.forEach((x, i) => {
      ctx.globalAlpha = 0.25 + (i % 5) * 0.1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, sy[i], 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Borda dourada
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, W - 32, H - 32);
    ctx.strokeStyle = 'rgba(251,191,36,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    // Faixa superior
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(30,60,180,0.5)');
    grad.addColorStop(0.5, 'rgba(50,100,220,0.75)');
    grad.addColorStop(1, 'rgba(30,60,180,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(32, 32, W - 64, 68);

    // Título
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.fillText('CERTIFICADO DE EXPLORADOR', W / 2, 76);

    // Linha decorativa
    ctx.strokeStyle = 'rgba(251,191,36,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(80, 112); ctx.lineTo(W - 80, 112); ctx.stroke();

    ctx.font = '16px Arial, sans-serif';
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('Explorador do Sistema Solar', W / 2, 136);

    ctx.font = '15px Arial, sans-serif';
    ctx.fillStyle = '#8899aa';
    ctx.fillText('Certificamos que', W / 2, 190);

    // Nome do aluno
    ctx.font = `bold ${Math.min(44, Math.max(24, Math.floor(900 / (nome.length || 1))))  }px Georgia, serif`;
    ctx.fillStyle = '#e8eef7';
    ctx.fillText(nome.length > 30 ? nome.slice(0, 30) + '…' : nome, W / 2, 248);

    ctx.font = '17px Arial, sans-serif';
    ctx.fillStyle = '#c0d0e8';
    ctx.fillText('concluiu com êxito a exploração do Sistema Solar,', W / 2, 296);
    ctx.fillText('visitando todos os planetas e completando as missões científicas.', W / 2, 322);

    // Separador
    ctx.strokeStyle = 'rgba(125,211,252,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(80, 355); ctx.lineTo(W - 80, 355); ctx.stroke();

    // Planetas (círculos coloridos com anel para Saturno)
    const planets: { color: string; r: number; ring?: boolean }[] = [
      { color: '#ffd700', r: 14 }, { color: '#b5b5b5', r: 6  },
      { color: '#e8c990', r: 8  }, { color: '#3b82f6', r: 9  },
      { color: '#ef4444', r: 7  }, { color: '#d97706', r: 13 },
      { color: '#f59e0b', r: 11, ring: true },
      { color: '#67e8f9', r: 10 }, { color: '#6366f1', r: 10 },
    ];
    const totalPW = planets.reduce((s, p) => s + (p.ring ? p.r * 2 + 20 : p.r * 2) + 12, -12);
    let px = (W - totalPW) / 2;
    const py = 395;
    for (const p of planets) {
      const pr = p.ring ? p.r + 10 : p.r;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px + pr, py, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (p.ring) {
        ctx.strokeStyle = 'rgba(240,210,120,0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(px + pr, py, pr * 1.5, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      px += pr * 2 + 12;
    }

    ctx.font = '14px Courier New, monospace';
    ctx.fillStyle = '#667788';
    ctx.fillText(`Data: ${dataPT}`, W / 2, 470);

    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillStyle = 'rgba(125,211,252,0.6)';
    ctx.fillText('✶ EXPLORADOR DO SISTEMA SOLAR', W / 2, 500);

    // Gerar blob e compartilhar/baixar
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
    const file = new File([blob], 'certificado-sistema-solar.png', { type: 'image/png' });

    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Meu Certificado — Explorador do Sistema Solar',
        text: `${nome} concluiu a exploração de todos os planetas do Sistema Solar! 🚀🪐`,
        files: [file],
      });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'certificado-sistema-solar.png';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
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

  setBodyCount(n: number) {
    this.bodyCount = n;
    // Se já completou ao iniciar a sessão, não exibir a celebração
    if (n > 0 && this.visitedMainCount() >= n) this.celebrationShown = true;
    this.updateProgressPill();
  }

  setMainBodyIds(ids: string[]) { this.mainBodyIds = new Set(ids); }

  updateProgress(p: ProgressState) {
    this.progress = p;
    this.updateProgressPill();
    this.checkCompletion();
  }

  private visitedMainCount(): number {
    if (this.mainBodyIds.size === 0) return this.progress.visited.length;
    return this.progress.visited.filter((id) => this.mainBodyIds.has(id)).length;
  }

  private checkCompletion() {
    if (this.celebrationShown || this.bodyCount === 0) return;
    if (this.visitedMainCount() >= this.bodyCount) {
      this.celebrationShown = true;
      this.showCelebration();
    }
  }

  private showCelebration() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.93);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
      <style>
        @keyframes floatCel{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        .cel-icon{font-size:2rem;animation:floatCel 2s ease infinite;}
      </style>
      <div style="text-align:center;color:#e8eef7;padding:32px;max-width:460px;">
        <div style="font-size:3.5rem;margin-bottom:8px;">🏆</div>
        <h1 style="margin:0 0 8px;font-size:1.7rem;color:#fbbf24;">Sistema Solar Conquistado!</h1>
        <p style="font-size:0.95rem;opacity:0.85;margin:0 0 16px;">Parabéns! Você visitou todos os planetas do sistema solar.</p>
        <div style="font-size:1.5rem;margin:12px 0;letter-spacing:4px;">
          <span class="cel-icon">🪐</span>
          <span class="cel-icon" style="animation-delay:0.3s">🚀</span>
          <span class="cel-icon" style="animation-delay:0.6s">🌟</span>
          <span class="cel-icon" style="animation-delay:0.9s">🌌</span>
        </div>
        <div style="background:rgba(100,180,255,0.1);border-radius:12px;padding:12px 16px;margin:14px 0;border:1px solid rgba(100,200,255,0.3);">
          <div style="font-size:0.9rem;color:#7dd3fc;font-weight:700;">🌌 BÔNUS DESBLOQUEADO</div>
          <div style="font-size:0.82rem;margin-top:4px;opacity:0.9;">Portal Interestelar ativo! Explore exoplanetas além do sistema solar.</div>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px;">
          <button id="cel-quiz" style="padding:10px 22px;background:#6366f1;color:#fff;border:none;border-radius:8px;font-size:0.9rem;cursor:pointer;font-weight:700;">🎯 Grande Missão Final</button>
          <button id="cel-cert" style="padding:10px 22px;background:#fbbf24;color:#000;border:none;border-radius:8px;font-size:0.9rem;cursor:pointer;font-weight:700;">📜 Ver Certificado</button>
          <button id="cel-close" style="padding:10px 22px;background:rgba(255,255,255,0.1);color:#e8eef7;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:0.9rem;cursor:pointer;">Continuar explorando</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#cel-quiz')?.addEventListener('click', () => { overlay.remove(); this.callbacks.onGrandeMissao(); });
    overlay.querySelector('#cel-cert')?.addEventListener('click', () => { overlay.remove(); this.callbacks.onCertificate(); });
    overlay.querySelector('#cel-close')?.addEventListener('click', () => overlay.remove());
  }

  showExoPortal(exoplanets: BodyData[]) {
    const card = this.root.querySelector('#planet-card') as HTMLElement;
    card.classList.add('visible');
    card.innerHTML = `
      ${this.cardHeader('\u{1F30C} Portal Interestelar')}
      <div style="font-size:0.85rem;opacity:0.85;margin:8px 0 12px;line-height:1.5;">
        Parabéns! Você completou o sistema solar. Estes são mundos em outras estrelas — cada um a anos-luz de distância.
      </div>
      <button id="exo-quiz-btn" class="btn" style="width:100%;background:#6366f1;color:#fff;margin-bottom:10px;">🎯 Grande Missão Final</button>
      ${exoplanets.map((ex) => `
        <div class="exo-btn" data-id="${ex.id}" style="border:1px solid rgba(100,200,255,0.25);border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;background:rgba(100,180,255,0.05);">
          <div style="font-weight:700;color:#7dd3fc;">${ex.name}</div>
          <div style="font-size:0.75rem;opacity:0.8;margin-top:3px;">${ex.curiosities[0]}</div>
          <div style="font-size:0.72rem;opacity:0.55;margin-top:2px;">📡 ${(ex.distanceAU / 63241).toFixed(2)} anos-luz</div>
        </div>
      `).join('')}
    `;
    card.querySelector('#close-btn')?.addEventListener('click', () => this.callbacks.onCloseCard());
    card.querySelector('#back-btn')?.addEventListener('click', () => this.callbacks.onBack());
    card.querySelector('#exo-quiz-btn')?.addEventListener('click', () => this.callbacks.onGrandeMissao());
    card.querySelectorAll('.exo-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const ex = exoplanets.find((e) => e.id === id);
        if (ex) this.showPlanet(ex);
      });
    });
  }

  showGrandeMissao(questions: MissionQuestion[]) {
    const TOTAL = questions.length;
    let current = 0;
    let score = 0;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.96);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;box-sizing:border-box;';
    document.body.appendChild(overlay);

    const renderQuestion = () => {
      if (current >= TOTAL) { renderResults(); return; }
      const q = questions[current];
      const pct = Math.round((current / TOTAL) * 100);
      overlay.innerHTML = `
        <div style="max-width:520px;width:100%;color:#e8eef7;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:0.9rem;color:#7dd3fc;font-weight:700;">🎯 Grande Missão Final</span>
            <span style="font-size:0.85rem;opacity:0.7;">Pergunta ${current + 1} / ${TOTAL}</span>
          </div>
          <div style="height:5px;background:rgba(255,255,255,0.1);border-radius:3px;margin-bottom:16px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:#6366f1;border-radius:3px;transition:width 0.3s;"></div>
          </div>
          <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px 20px;margin-bottom:14px;font-size:1rem;line-height:1.5;">${q.q}</div>
          <div id="gm-opts" style="display:flex;flex-direction:column;gap:8px;">
            ${q.options.map((o, i) => `<button class="gm-opt" data-idx="${i}" style="padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e8eef7;font-size:0.9rem;cursor:pointer;text-align:left;">${o}</button>`).join('')}
          </div>
          <div id="gm-fb" style="min-height:24px;margin-top:10px;font-size:0.85rem;text-align:center;"></div>
        </div>
      `;
      overlay.querySelectorAll('.gm-opt').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt((btn as HTMLElement).dataset.idx!);
          const correct = idx === q.answer;
          if (correct) score++;
          overlay.querySelectorAll('.gm-opt').forEach((b, i) => {
            const el = b as HTMLElement;
            el.style.pointerEvents = 'none';
            el.style.background = i === q.answer ? 'rgba(34,197,94,0.3)' : (i === idx && !correct ? 'rgba(239,68,68,0.3)' : '');
            el.style.borderColor = i === q.answer ? '#22c55e' : (i === idx && !correct ? '#ef4444' : 'rgba(255,255,255,0.15)');
          });
          const fb = overlay.querySelector('#gm-fb') as HTMLElement;
          fb.textContent = correct ? '✅ Correto!' : `❌ Errado. Resposta: "${q.options[q.answer]}"`;
          fb.style.color = correct ? '#22c55e' : '#ef4444';
          this.callbacks.onPlaySound(correct ? 'success' : 'error');
          setTimeout(() => { current++; renderQuestion(); }, 1800);
        });
      });
    };

    const renderResults = () => {
      this.callbacks.onGrandeMissaoComplete(score, TOTAL);
      const stars = score >= 9 ? 3 : score >= 6 ? 2 : 1;
      const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      const msgs = ['Continue estudando! Você consegue!', 'Bom trabalho! Continue explorando!', 'Parabéns! Você é um verdadeiro Explorador!'];
      overlay.innerHTML = `
        <div style="max-width:460px;width:100%;color:#e8eef7;text-align:center;">
          <div style="font-size:3rem;margin-bottom:8px;">🏆</div>
          <h2 style="margin:0 0 8px;color:#fbbf24;">Grande Missão Concluída!</h2>
          <div style="font-size:2.5rem;color:#fbbf24;letter-spacing:6px;margin:12px 0;">${starStr}</div>
          <div style="font-size:1.3rem;margin-bottom:6px;"><b>${score}</b> de ${TOTAL} corretas</div>
          <div style="font-size:0.9rem;opacity:0.8;margin-bottom:20px;">${msgs[stars - 1]}</div>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button id="gm-retry" style="padding:10px 20px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">🔄 Tentar novamente</button>
            <button id="gm-cert" style="padding:10px 20px;background:#fbbf24;color:#000;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:700;">📜 Certificado</button>
            <button id="gm-close" style="padding:10px 20px;background:rgba(255,255,255,0.1);color:#e8eef7;border:1px solid rgba(255,255,255,0.2);border-radius:8px;cursor:pointer;font-size:0.9rem;">Fechar</button>
          </div>
        </div>
      `;
      this.callbacks.onPlaySound(`quiz${stars}` as 'quiz1' | 'quiz2' | 'quiz3');
      overlay.querySelector('#gm-retry')?.addEventListener('click', () => { current = 0; score = 0; renderQuestion(); });
      overlay.querySelector('#gm-cert')?.addEventListener('click', () => { overlay.remove(); this.callbacks.onCertificate(); });
      overlay.querySelector('#gm-close')?.addEventListener('click', () => overlay.remove());
    };

    renderQuestion();
  }

  setSyncStatus(status: 'idle' | 'syncing' | 'done' | 'error') {
    const dot = this.root.querySelector('#sync-dot') as HTMLElement | null;
    if (!dot) return;
    const map = {
      idle:   { text: '',       color: 'transparent', opacity: '0' },
      syncing:{ text: '↑☁', color: '#fbbf24',    opacity: '1' },
      done:   { text: '✓☁', color: '#22c55e',    opacity: '1' },
      error:  { text: '✗☁', color: '#ef4444',    opacity: '1' },
    };
    const s = map[status];
    dot.textContent = s.text;
    dot.style.color = s.color;
    dot.style.opacity = s.opacity;
  }

  setDailyStreak(streak: number) {
    const btn = this.root.querySelector('#daily-btn') as HTMLElement | null;
    if (!btn) return;
    btn.textContent = streak > 0 ? `📅${streak}🔥` : '📅';
    btn.title = streak > 0 ? `Desafio do dia — ${streak} dias seguidos!` : 'Desafio do dia';
  }

  showBadgeToast(icon: string, name: string, desc: string) {
    document.getElementById('badge-toast')?.remove();
    if (!document.getElementById('badge-toast-style')) {
      const s = document.createElement('style');
      s.id = 'badge-toast-style';
      s.textContent = '@keyframes fadeInBadge{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
      document.head.appendChild(s);
    }
    const toast = document.createElement('div');
    toast.id = 'badge-toast';
    toast.style.cssText = 'position:fixed;bottom:72px;right:16px;z-index:999;display:flex;align-items:center;gap:10px;background:rgba(8,13,26,0.95);border:1px solid rgba(251,191,36,0.4);border-radius:12px;padding:10px 14px;max-width:280px;animation:fadeInBadge 0.4s ease;';
    toast.innerHTML = `
      <div style="font-size:1.6rem;flex-shrink:0;">${icon}</div>
      <div>
        <div style="font-size:0.65rem;color:#fbbf24;font-weight:700;letter-spacing:0.5px;margin-bottom:2px;">CONQUISTA DESBLOQUEADA!</div>
        <div style="font-size:0.85rem;font-weight:700;">${name}</div>
        <div style="font-size:0.72rem;opacity:0.7;">${desc}</div>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (!toast.isConnected) return;
      toast.style.transition = 'opacity 0.5s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 600);
    }, 4500);
  }

  showBadges(allBadges: Array<{ id: string; icon: string; name: string; desc: string }>, earnedIds: string[]) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.93);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;box-sizing:border-box;';
    const rows = allBadges.map((b) => {
      const earned = earnedIds.includes(b.id);
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:8px;
          background:${earned ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)'};
          border:1px solid ${earned ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'};
          margin-bottom:6px;opacity:${earned ? '1' : '0.35'};">
          <div style="font-size:1.5rem;width:34px;text-align:center;flex-shrink:0;">${b.icon}</div>
          <div style="flex:1;">
            <div style="font-size:0.88rem;font-weight:700;${earned ? 'color:#fbbf24;' : ''}">${b.name}</div>
            <div style="font-size:0.72rem;opacity:0.7;">${b.desc}</div>
          </div>
          ${earned ? '<div style="color:#22c55e;font-size:0.85rem;flex-shrink:0;">✓</div>' : ''}
        </div>`;
    }).join('');
    overlay.innerHTML = `
      <div style="max-width:460px;width:100%;color:#e8eef7;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="margin:0;color:#fbbf24;">🏅 Conquistas</h2>
          <span style="font-size:0.8rem;opacity:0.5;">${earnedIds.length}/${allBadges.length} desbloqueadas</span>
          <button id="bdg-close" style="background:none;border:1px solid rgba(255,255,255,0.2);color:#e8eef7;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.85rem;">✕ Fechar</button>
        </div>
        <div>${rows}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#bdg-close')?.addEventListener('click', () => overlay.remove());
  }

  showDailyChallenge(
    question: MissionQuestion,
    state: { answered: boolean; correct: boolean; streak: number },
    onAnswer: (correct: boolean) => void,
  ) {
    document.getElementById('daily-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'daily-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.96);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;box-sizing:border-box;';
    document.body.appendChild(overlay);

    const renderResult = (s: { correct: boolean; streak: number }) => {
      const nextHours = 24 - new Date().getHours();
      overlay.innerHTML = `
        <div style="max-width:400px;width:100%;color:#e8eef7;text-align:center;">
          <h2 style="margin:0 0 16px;color:#fbbf24;">📅 Desafio do Dia</h2>
          <div style="font-size:3rem;margin:8px 0;">${s.correct ? '✅' : '❌'}</div>
          <div style="font-size:1rem;margin-bottom:8px;">${s.correct ? 'Excelente! Resposta correta!' : 'Quase! Tente amanhã.'}</div>
          ${s.streak > 0 ? `<div style="font-size:1.3rem;color:#fbbf24;margin:10px 0;">${s.streak} ${s.streak === 1 ? 'dia' : 'dias'} seguidos 🔥</div>` : ''}
          <div style="font-size:0.78rem;opacity:0.4;margin-top:10px;">Próximo desafio em ~${nextHours}h</div>
          <button id="dc-close-r" style="margin-top:18px;padding:8px 24px;background:rgba(255,255,255,0.1);color:#e8eef7;border:1px solid rgba(255,255,255,0.2);border-radius:8px;cursor:pointer;">Fechar</button>
        </div>
      `;
      overlay.querySelector('#dc-close-r')?.addEventListener('click', () => overlay.remove());
    };

    if (state.answered) { renderResult(state); return; }

    overlay.innerHTML = `
      <div style="max-width:480px;width:100%;color:#e8eef7;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h2 style="margin:0;color:#fbbf24;">📅 Desafio do Dia</h2>
          ${state.streak > 0 ? `<div style="font-size:0.9rem;color:#fbbf24;">${state.streak} 🔥</div>` : ''}
          <button id="dc-close0" style="background:none;border:1px solid rgba(255,255,255,0.2);color:#e8eef7;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.85rem;">✕</button>
        </div>
        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px 18px;margin-bottom:14px;font-size:1rem;line-height:1.5;">${question.q}</div>
        <div id="dc-opts" style="display:flex;flex-direction:column;gap:8px;">
          ${question.options.map((o, i) => `<button class="dc-opt" data-idx="${i}" style="padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e8eef7;font-size:0.9rem;cursor:pointer;text-align:left;">${o}</button>`).join('')}
        </div>
        <div id="dc-fb" style="min-height:24px;margin-top:10px;font-size:0.85rem;text-align:center;"></div>
      </div>
    `;
    overlay.querySelector('#dc-close0')?.addEventListener('click', () => overlay.remove());
    overlay.querySelectorAll('.dc-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        const correct = idx === question.answer;
        overlay.querySelectorAll('.dc-opt').forEach((b, i) => {
          const el = b as HTMLElement;
          el.style.pointerEvents = 'none';
          el.style.background = i === question.answer ? 'rgba(34,197,94,0.3)' : (i === idx && !correct ? 'rgba(239,68,68,0.3)' : '');
          el.style.borderColor = i === question.answer ? '#22c55e' : (i === idx && !correct ? '#ef4444' : 'rgba(255,255,255,0.15)');
        });
        const fb = overlay.querySelector('#dc-fb') as HTMLElement;
        fb.textContent = correct ? '✅ Correto!' : `❌ Resposta: "${question.options[question.answer]}"`;
        fb.style.color = correct ? '#22c55e' : '#ef4444';
        this.callbacks.onPlaySound(correct ? 'success' : 'error');
        onAnswer(correct);
        const newState = { answered: true, correct, streak: correct ? state.streak + 1 : 0 };
        setTimeout(() => renderResult(newState), 1800);
      });
    });
  }

  showProgressMap(bodies: BodyData[], state: ProgressState) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.95);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;box-sizing:border-box;overflow-y:auto;';
    const relevant = bodies.filter((b) => b.type !== 'belt');
    const total = relevant.length;
    const visitedSet = new Set(state.visited);
    const visitedCount = relevant.filter((b) => visitedSet.has(b.id)).length;
    const rows = relevant.map((b) => {
      const v = visitedSet.has(b.id);
      const rec = state.completedMissions[b.id];
      const easy   = rec?.easy?.correct   ? '✅' : (rec?.easy   ? '❌' : '○');
      const medium = rec?.medium?.correct ? '✅' : (rec?.medium ? '❌' : '○');
      const typeColors: Record<string, string> = { star: '#fbbf24', planet: '#6ab0ff', dwarf: '#a0a0b0', exoplanet: '#c084fc', moon: '#d0d0d0' };
      const dot = typeColors[b.type] ?? '#888';
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 12px;border-radius:8px;
          background:${v ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)'};
          border:1px solid ${v ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)'};margin-bottom:5px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${dot};flex-shrink:0;"></div>
          <div style="flex:1;font-size:0.88rem;font-weight:${v ? '700' : '400'};opacity:${v ? '1' : '0.45'};">${b.name}</div>
          <div style="font-size:0.8rem;color:#9ca3af;min-width:52px;text-align:right;">${v ? '👁️ visitado' : '—'}</div>
          <div style="font-size:0.8rem;min-width:70px;text-align:right;">Fácil ${easy}</div>
          <div style="font-size:0.8rem;min-width:72px;text-align:right;">Médio ${medium}</div>
        </div>`;
    }).join('');
    overlay.innerHTML = `
      <div style="max-width:580px;width:100%;color:#e8eef7;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h2 style="margin:0;color:#6ab0ff;">🗺️ Mapa de Progresso</h2>
          <span style="font-size:0.8rem;opacity:0.5;">${visitedCount}/${total} corpos visitados</span>
          <button id="pm-close" style="background:none;border:1px solid rgba(255,255,255,0.2);color:#e8eef7;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.85rem;">✕ Fechar</button>
        </div>
        <div>${rows}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#pm-close')?.addEventListener('click', () => overlay.remove());
  }

  showComparePicker(allBodies: BodyData[], currentBody: BodyData) {
    document.getElementById('compare-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'compare-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.95);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;box-sizing:border-box;';
    const pickable = allBodies.filter((b) => b.type !== 'belt' && b.id !== currentBody.id);
    overlay.innerHTML = `
      <div style="max-width:520px;width:100%;color:#e8eef7;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h2 style="margin:0;color:#6ab0ff;">⚖️ Comparar — ${currentBody.name}</h2>
          <button id="cp-close" style="background:none;border:1px solid rgba(255,255,255,0.2);color:#e8eef7;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.85rem;">✕</button>
        </div>
        <p style="font-size:0.85rem;opacity:0.6;margin:0 0 12px;">Escolha um corpo para comparar com <b>${currentBody.name}</b>:</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;" id="cp-grid">
          ${pickable.map((b) => `<button class="cp-pick" data-id="${b.id}" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#e8eef7;font-size:0.85rem;cursor:pointer;text-align:left;">
            <span style="display:block;width:10px;height:10px;border-radius:50%;background:${b.color};margin-bottom:4px;"></span>${b.name}</button>`).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#cp-close')?.addEventListener('click', () => overlay.remove());
    overlay.querySelectorAll('.cp-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const otherId = (btn as HTMLElement).dataset.id!;
        const other = allBodies.find((b) => b.id === otherId)!;
        overlay.remove();
        this.showComparison(currentBody, other);
      });
    });
  }

  private showComparison(a: BodyData, b: BodyData) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.96);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;box-sizing:border-box;overflow-y:auto;';
    const fields: Array<[string, (d: BodyData) => string]> = [
      ['🔵 Raio (km)', (d) => d.radiusKm.toLocaleString('pt-BR')],
      ['⚖️ Massa (kg)', (d) => d.massKg],
      ['🌡️ Temperatura (K)', (d) => String(d.temperatureK)],
      ['🏋️ Gravidade (g)', (d) => String(d.gravityRelative)],
      ['🔄 Período orbital (dias)', (d) => d.orbitalPeriodDays > 0 ? String(d.orbitalPeriodDays) : '—'],
      ['⏱️ Rotação (h)', (d) => String(d.rotationPeriodHours)],
      ['🌙 Luas', (d) => String(d.moons)],
      ['📏 Distância (AU)', (d) => String(d.distanceAU)],
      ['💨 Atmosfera', (d) => d.atmosphere],
    ];
    const rows = fields.map(([label, fn]) => {
      const va = fn(a); const vb = fn(b);
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="padding:7px 10px;font-size:0.82rem;opacity:0.7;">${label}</td>
          <td style="padding:7px 10px;font-size:0.85rem;text-align:center;color:#6ab0ff;">${va}</td>
          <td style="padding:7px 10px;font-size:0.85rem;text-align:center;color:#c084fc;">${vb}</td>
        </tr>`;
    }).join('');
    overlay.innerHTML = `
      <div style="max-width:600px;width:100%;color:#e8eef7;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h2 style="margin:0;">⚖️ Comparação</h2>
          <button id="cmp-close" style="background:none;border:1px solid rgba(255,255,255,0.2);color:#e8eef7;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.85rem;">✕ Fechar</button>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="padding:8px 10px;text-align:left;font-size:0.75rem;opacity:0.5;font-weight:400;">Campo</th>
              <th style="padding:8px 10px;text-align:center;color:#6ab0ff;">${a.name}</th>
              <th style="padding:8px 10px;text-align:center;color:#c084fc;">${b.name}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#cmp-close')?.addEventListener('click', () => overlay.remove());
  }

  showProfile(state: ProgressState, allBadges: Array<{ id: string; icon: string; name: string }>, earnedIds: string[]) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.95);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;box-sizing:border-box;';
    const missions = state.completedMissions;
    const totalAnswered = Object.keys(missions).length;
    const totalCorrect  = Object.values(missions).reduce((s, m) => s + (m.easy?.correct ? 1 : 0) + (m.medium?.correct ? 1 : 0), 0);
    const visitedCount  = state.visited.length;
    const name = state.certificateName || 'Explorador';
    const badgeRow = allBadges.map((b) => {
      const earned = earnedIds.includes(b.id);
      return `<span title="${b.name}" style="font-size:1.4rem;opacity:${earned ? '1' : '0.2'};">${b.icon}</span>`;
    }).join('');
    overlay.innerHTML = `
      <div style="max-width:420px;width:100%;color:#e8eef7;text-align:center;">
        <div style="font-size:3rem;margin-bottom:8px;">👤</div>
        <h2 style="margin:0 0 4px;color:#fbbf24;">${name}</h2>
        <div style="font-size:0.78rem;opacity:0.4;margin-bottom:20px;">Explorador do Sistema Solar</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
          ${[
            ['🌍 Corpos visitados', visitedCount],
            ['🎯 Missões respondidas', totalAnswered],
            ['✅ Respostas corretas', totalCorrect],
            ['🏅 Conquistas', `${earnedIds.length}/${allBadges.length}`],
          ].map(([label, val]) => `
            <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;">
              <div style="font-size:1.3rem;font-weight:700;color:#6ab0ff;">${val}</div>
              <div style="font-size:0.72rem;opacity:0.6;margin-top:4px;">${label}</div>
            </div>`).join('')}
        </div>
        <div style="display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin-bottom:20px;">${badgeRow}</div>
        <button id="pf-close" style="padding:8px 24px;background:rgba(255,255,255,0.1);color:#e8eef7;border:1px solid rgba(255,255,255,0.2);border-radius:8px;cursor:pointer;">Fechar</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#pf-close')?.addEventListener('click', () => overlay.remove());
  }

  showLeaderboard(entries: Array<{ id: string; name: string; score: number; updatedAt: number }>, myId: string) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,20,0.93);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;box-sizing:border-box;';

    const rows = entries.length === 0
      ? '<div style="opacity:0.6;font-size:0.9rem;text-align:center;padding:24px;">Firebase não configurado.<br>Configure o .env para ver o ranking.</div>'
      : entries.map((e, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
          const isMe = e.id === myId;
          const date = e.updatedAt ? new Date(e.updatedAt).toLocaleDateString('pt-BR') : '—';
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;
              background:${isMe ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)'};
              border:1px solid ${isMe ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)'};margin-bottom:6px;">
              <div style="font-size:1.2rem;width:28px;text-align:center;flex-shrink:0;">${medal}</div>
              <div style="flex:1;font-size:0.88rem;">${e.name}${isMe ? ' <span style="font-size:0.72rem;opacity:0.6;">(você)</span>' : ''}</div>
              <div style="font-size:0.95rem;font-weight:700;color:#fbbf24;">${e.score} pts</div>
              <div style="font-size:0.7rem;opacity:0.45;min-width:52px;text-align:right;">${date}</div>
            </div>`;
        }).join('');

    overlay.innerHTML = `
      <div style="max-width:480px;width:100%;color:#e8eef7;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="margin:0;color:#fbbf24;">🏆 Ranking de Exploradores</h2>
          <button id="lb-close" style="background:none;border:1px solid rgba(255,255,255,0.2);color:#e8eef7;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.85rem;">✕ Fechar</button>
        </div>
        <div>${rows}</div>
        ${entries.length > 0 ? '<div style="font-size:0.72rem;opacity:0.45;text-align:center;margin-top:10px;">Pontuação = missões corretas em todos os planetas</div>' : ''}
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#lb-close')?.addEventListener('click', () => overlay.remove());
  }

  showNarrativeBubble(astronautName: string, color: string, text: string) {
    document.getElementById('narrative-bubble')?.remove();
    if (!document.getElementById('narrative-bubble-style')) {
      const s = document.createElement('style');
      s.id = 'narrative-bubble-style';
      s.textContent = '@keyframes fadeInBub{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}';
      document.head.appendChild(s);
    }
    const bubble = document.createElement('div');
    bubble.id = 'narrative-bubble';
    bubble.style.cssText = 'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);z-index:998;display:flex;align-items:flex-start;gap:10px;background:rgba(8,13,26,0.92);border:1px solid rgba(255,255,255,0.14);border-radius:14px;padding:11px 14px 11px 14px;max-width:380px;min-width:240px;animation:fadeInBub 0.4s ease;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    bubble.innerHTML = `
      <div style="width:32px;height:32px;border-radius:50%;background:${color};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1rem;margin-top:1px;">👨‍🚀</div>
      <div style="flex:1;">
        <div style="font-size:0.72rem;color:${color};font-weight:700;margin-bottom:3px;letter-spacing:0.5px;">${astronautName}</div>
        <div style="font-size:0.8rem;line-height:1.45;opacity:0.92;">${text}</div>
      </div>
      <button id="nb-close" style="background:none;border:none;color:rgba(255,255,255,0.35);cursor:pointer;font-size:1rem;padding:0 0 0 4px;flex-shrink:0;align-self:flex-start;line-height:1;">✕</button>
    `;
    document.body.appendChild(bubble);
    bubble.querySelector('#nb-close')?.addEventListener('click', () => bubble.remove());
    setTimeout(() => {
      if (!bubble.isConnected) return;
      bubble.style.transition = 'opacity 0.6s';
      bubble.style.opacity = '0';
      setTimeout(() => bubble.remove(), 650);
    }, 5500);
  }

  updateProgressPill() {
    const el = this.root.querySelector('#progress-pill') as HTMLElement | null;
    if (!el) return;
    const visited = this.visitedMainCount();
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
