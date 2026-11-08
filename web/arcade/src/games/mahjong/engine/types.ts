export type Difficulty = 'easy' | 'normal' | 'expert';
export type BackendPreference = 'auto' | 'webgpu' | 'wasm';
export function isBackendPreference(value: unknown): value is BackendPreference {
  return value === 'auto' || value === 'webgpu' || value === 'wasm';
}
export interface Action {
  id: number;
  label: string;
  tile?: string;
}
export interface Pack {
  type: 'CHI' | 'PENG' | 'GANG';
  tile: string;
  offer: number;
  concealed: boolean;
}
export interface RuntimeProgress {
  stage: 'download' | 'initializing' | 'ready';
  loadedBytes: number;
  totalBytes: number;
  backend?: 'webgpu' | 'wasm';
  threads?: number;
}
export interface GameView {
  ai: {
    difficulty: Difficulty;
    model: 'kdens3';
    backend: 'webgpu' | 'wasm';
    threads: number;
    inferenceCalls: number;
    lastInferenceMs: number;
  };
  replay: { seed: number; mode: 'play' | 'spectate'; policy: 'kdens3-v1'; actions: Record<string, number>[] };
  phase: 'playing' | 'finished';
  hand: string[];
  players: { seat: number; handCount: number; hand?: string[]; discards: string[]; packs: Pack[] }[];
  currentPlayer: number;
  remaining: number;
  wind: number;
  actions: Action[];
  needsHuman: boolean;
  result: null | { winner: number | null; scores: number[]; fans: { name: string; points: number; count: number }[] };
  log: string[];
}
export interface MahjongClient {
  start(seed?: number, mode?: 'play' | 'spectate'): Promise<GameView>;
  restore(replay: GameView['replay']): Promise<GameView>;
  action(actionId: number): Promise<GameView>;
  advance(difficulty?: Difficulty): Promise<GameView>;
  autoAdvance(difficulty?: Difficulty): Promise<GameView>;
  setBackend(preference: BackendPreference): Promise<{ backend: 'webgpu' | 'wasm'; threads: number }>;
  dispose(): void;
}
