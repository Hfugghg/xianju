import type { ComponentType } from 'react';
import { MahjongGame, MahjongPreview } from '../games/mahjong/MahjongGame';
export interface GameProps { onBack: () => void }
export interface GameEntry {id:string; title:string; subtitle:string; description:string; players:string; Component:ComponentType<GameProps>; Preview:ComponentType}
export const games:GameEntry[]=[{id:'mahjong',title:'国标麻将',subtitle:'CHINESE STANDARD MAHJONG',description:'摸一张好牌，赴一场闲局。',players:'四人牌桌',Component:MahjongGame,Preview:MahjongPreview}];
