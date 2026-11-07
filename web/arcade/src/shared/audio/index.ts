import { Howl, Howler } from 'howler';
import tapUrl from './tap.wav';
import chimeUrl from './chime.wav';
const sounds = {
  tap: new Howl({ src: [tapUrl], format: ['wav'], volume: 0.4, preload: true }),
  chime: new Howl({ src: [chimeUrl], format: ['wav'], volume: 0.35, preload: true }),
};
let enabled = false;
for (const sound of Object.values(sounds)) {
  sound.on('playerror', () => {
    sound.off('unlock');
    sound.once('unlock', () => {
      if (enabled) sound.play();
    });
  });
}
export function enableSound(value: boolean): void {
  enabled = value;
  if (!value)
    Object.values(sounds).forEach((sound) => {
      sound.off('unlock');
      sound.stop();
    });
  else if (Howler.ctx?.state === 'suspended') void Howler.ctx.resume().catch(() => {});
}
export function playSound(kind: keyof typeof sounds = 'tap'): void {
  if (enabled) sounds[kind].play();
}
