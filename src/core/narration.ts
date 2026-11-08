import narracoes from '@/data/narracoes.json';

/**
 * Lê o texto pelo id de etapa e fala via Web Speech API.
 * Isolado para permitir troca por reprodução de áudio gravado no futuro
 * sem alterar quem chama narrate().
 */
export function narrate(id: string): void {
  const text = (narracoes as Record<string, string>)[id];
  if (!text) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'pt-BR';
  utter.rate = 0.95;
  window.speechSynthesis.speak(utter);
}

export function stopNarration(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
