import { Howl } from 'howler';
import tapUrl from './tap.wav';
import chimeUrl from './chime.wav';
const sounds = {
 tap: new Howl({ src:[tapUrl], volume:0.22, preload:true }),
 chime: new Howl({ src:[chimeUrl], volume:0.18, preload:true }),
};
let enabled=false;
export function enableSound(value:boolean):void {enabled=value;if(!value)Object.values(sounds).forEach(sound=>sound.stop())}
export function playSound(kind:keyof typeof sounds='tap'):void {if(enabled)sounds[kind].play()}
