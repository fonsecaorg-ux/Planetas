// Áudio procedural (Web Audio API) — sem dependências externas.
// Sons sintetizados + narração via Web Speech API.

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private voice: SpeechSynthesisVoice | null = null;
  private ambientNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private ambientStarted = false;

  constructor() {
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Nó mestre: permite capturar o áudio do jogo na gravação de tela
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    this.pickVoice();
  }

  /** Stream com o áudio do jogo, para incluir na gravação de vídeo. */
  captureStream(): MediaStream | null {
    if (!this.ctx || !this.master) return null;
    const dest = this.ctx.createMediaStreamDestination();
    this.master.connect(dest);
    return dest.stream;
  }

  private pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    this.voice = voices.find((v) => v.lang.startsWith('pt')) || voices[0] || null;
    // voices podem carregar assincronamente
    window.speechSynthesis.onvoiceschanged = () => {
      const vs = window.speechSynthesis.getVoices();
      this.voice = vs.find((v) => v.lang.startsWith('pt')) || vs[0] || null;
    };
  }

  setEnabled(v: boolean) { this.enabled = v; }

  private maybeStartAmbient() {
    if (this.ambientStarted || !this.ctx || !this.enabled) return;
    this.ambientStarted = true;
    this.ctx.resume().then(() => { if (this.ambientStarted) this._startAmbient(); });
  }

  private _startAmbient() {
    if (!this.ctx) return;
    // Drone de baixa frequência com batimento (duas frequências ligeiramente diferentes)
    for (const freq of [55, 55.35, 110]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = freq > 100 ? 0.006 : 0.011;
      osc.connect(gain).connect(this.master ?? this.ctx.destination);
      osc.start();
      this.ambientNodes.push({ osc, gain });
    }
  }

  ambient() {
    if (!this.ctx) return;
    this.ctx.resume().then(() => {
      if (!this.ambientStarted) {
        this.ambientStarted = true;
        this._startAmbient();
      }
    });
  }

  stopAmbient() {
    const t = this.ctx?.currentTime ?? 0;
    for (const { osc, gain } of this.ambientNodes) {
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      osc.stop(t + 0.85);
    }
    this.ambientNodes = [];
    this.ambientStarted = false;
  }

  arrival(type: string) {
    if (type === 'star') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        setTimeout(() => this.beep(f, 0.22, 'sine', 0.1), i * 90));
    } else if (type === 'planet') {
      this.beep(660, 0.28, 'sine', 0.1);
      setTimeout(() => this.beep(880, 0.32, 'sine', 0.08), 160);
    } else if (type === 'dwarf') {
      this.beep(550, 0.22, 'sine', 0.07);
      setTimeout(() => this.beep(660, 0.18, 'sine', 0.05), 180);
    } else {
      this.beep(528, 0.2, 'sine', 0.08);
    }
  }

  grandeMissao() {
    [440, 554, 659, 880].forEach((f, i) =>
      setTimeout(() => this.beep(f, 0.18, 'triangle', 0.12), i * 110));
  }

  quizResult(stars: 1 | 2 | 3) {
    if (stars === 3) {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => this.beep(f, 0.22, 'sine', 0.12), i * 100));
      setTimeout(() => this.beep(1047, 0.4, 'sine', 0.1), 420);
    } else if (stars === 2) {
      this.beep(660, 0.22, 'sine', 0.1);
      setTimeout(() => this.beep(880, 0.3, 'sine', 0.1), 160);
    } else {
      this.beep(440, 0.3, 'sine', 0.08);
    }
  }

  private beep(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, slide?: number) {
    if (!this.enabled || !this.ctx) return;
    this.maybeStartAmbient();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, this.ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master ?? this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  click() { this.beep(880, 0.06, 'square', 0.08); }
  hover() { this.beep(660, 0.04, 'sine', 0.04); }
  success() {
    this.beep(660, 0.1, 'sine', 0.12);
    setTimeout(() => this.beep(990, 0.15, 'sine', 0.12), 100);
  }
  error() {
    this.beep(220, 0.15, 'sawtooth', 0.12);
    setTimeout(() => this.beep(180, 0.2, 'sawtooth', 0.12), 120);
  }
  transition() { this.beep(440, 0.12, 'triangle', 0.1, 880); }
  launch() {
    if (!this.enabled || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 1.5);
    g.gain.setValueAtTime(0.15, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.5);
    o.connect(g).connect(this.master ?? this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + 1.5);
  }
  speak(text: string) {
    if (!this.enabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    u.rate = 0.95;
    if (this.voice) u.voice = this.voice;
    window.speechSynthesis.speak(u);
  }
  stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}
