/**
 * Emergency alarm tone generated with the Web Audio API (no audio file).
 * Browsers only allow sound after a user gesture, so the dashboard asks the
 * officer to enable it once per session.
 */
export function createAlarm() {
  let ctx = null;
  let timer = null;

  function beep() {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }

  return {
    get supported() {
      return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
    },
    get enabled() {
      return ctx?.state === 'running';
    },
    async enable() {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      ctx ??= new Ctor();
      await ctx.resume();
    },
    start() {
      if (!this.enabled || timer) return;
      beep();
      timer = setInterval(beep, 1200);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
