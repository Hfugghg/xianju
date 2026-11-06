export type Suit='wan'|'bamboo'|'circle'|'honor';
export interface Tile { id:string; suit:Suit; value:number }
export interface MahjongAction {type:'discard'; tile:Tile}
export function tileName(tile:Tile):string {return tile.suit==='honor'?['东','南','西','北','中','发','白'][tile.value-1]:`${tile.value}${{wan:'万',bamboo:'条',circle:'筒'}[tile.suit]}`}
