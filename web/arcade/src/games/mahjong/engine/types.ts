export interface Action { id: number; label: string; tile?: string }
export interface Pack { type: 'CHI' | 'PENG' | 'GANG'; tile: string; offer: number; concealed: boolean }
export interface GameView {
  replay: {seed:number; mode:'play'|'spectate'; actions:(number|null)[]};
  phase: 'playing' | 'finished'; hand: string[];
  players: { seat: number; handCount: number; hand?:string[]; discards: string[]; packs: Pack[] }[];
  currentPlayer: number; remaining: number; wind: number;
  actions: Action[]; needsHuman: boolean;
  result: null | { winner: number | null; scores: number[]; fans: { name: string; points: number; count: number }[] };
  log: string[];
}
export interface MahjongClient {
  start(seed?: number, mode?:'play'|'spectate'): Promise<GameView>;
  restore(replay:GameView['replay']):Promise<GameView>;
  action(actionId: number): Promise<GameView>;
  advance(): Promise<GameView>;
  dispose(): void;
}
