import { lazy, type ComponentType } from 'react';
import { MahjongPreview } from '../games/mahjong/MahjongGame';
const MahjongGame = lazy(() => import('../games/mahjong/LiveGame').then(module => ({ default: module.LiveGame })));
export interface GameProps { onBack: () => void }
export interface GameEntry {id:string; title:string; description:string; players:string; Component:ComponentType<GameProps>; Preview:ComponentType}
export const games:GameEntry[]=[{id:'mahjong',title:'国标麻将',description:'136 张无花 · 8 番起和',players:'4 人',Component:MahjongGame,Preview:MahjongPreview}];
