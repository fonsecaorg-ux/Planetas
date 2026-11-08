// Áudio procedural (Web Audio API) — sem dependências externas.
// Sons sintetizados + narração via Web Speech API.

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      this.ctx = null;
    }
    this.pickVoice();
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

  private beep(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, slide?: number) {
    if (!this.enabled || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, this.ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination);
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
    o.connect(g).connect(this.ctx.destination);
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
