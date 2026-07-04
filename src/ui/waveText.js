// Splits text into per-letter spans with a staggered animation-delay, so a
// CSS animation (see .wave-letter in styles.css) visibly travels across the
// word from first letter to last, looping continuously.
export function waveify(el, text, { delayStep = 0.07 } = {}) {
  el.textContent = '';
  el.setAttribute('aria-label', text);
  for (const ch of text) {
    const span = document.createElement('span');
    span.className = 'wave-letter';
    span.style.animationDelay = `${el.childElementCount * delayStep}s`;
    span.textContent = ch === ' ' ? ' ' : ch;
    el.appendChild(span);
  }
}
