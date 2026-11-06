import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Loader, Modal } from '@mantine/core';
import { createMahjongClient, type GameView, type MahjongClient } from './engine/client';
import { TileFace, Wall } from './MahjongGame';
import { tileName, type Tile } from './types';
import { enableSound, playSound } from '../../shared/audio';
import { readLocal, writeLocal, removeLocal, getLocalWarning, type LocalRecord } from './localStore';

function parseTile(code:string,index=0):Tile {
 const value=Number(code.slice(1));
 return {id:`${code}-${index}`,suit:code[0]==='W'?'wan':code[0]==='T'?'bamboo':code[0]==='B'?'circle':'honor',value:code[0]==='J'?value+4:value};
}
const names=['你','月白','竹间','松风'];
const winds=['东','南','西','北'];
const sides=['bottom','right','top','left'];
export function LiveGame({onBack}:{onBack:()=>void}) {
 const client=useRef<MahjongClient|null>(null);
 const [view,setView]=useState<GameView|null>(null);
 const [busy,setBusy]=useState(true);
 const [status,setStatus]=useState('正在准备牌桌…');
 const [error,setError]=useState('');
 const [selected,setSelected]=useState<number|null>(null);
 const [resultOpen,setResultOpen]=useState(false);
 const [retry,setRetry]=useState(0);
 const [mode,setMode]=useState<'play'|'spectate'>('play');
 const [sound,setSound]=useState(()=>readLocal('sound',false));
 const [fast,setFast]=useState(()=>readLocal('fast',false));
 const [records,setRecords]=useState<LocalRecord[]>(()=>readLocal('records',[]));
 const resultSaved=useRef(false);
 const abandonSave=useRef(false);
 const [storageWarning,setStorageWarning]=useState(getLocalWarning);
 function save(key:string,value:unknown){if(!writeLocal(key,value))setStorageWarning(getLocalWarning())}
 function clearSave(){if(!removeLocal('replay'))setStorageWarning(getLocalWarning())}
 useEffect(()=>{
  let cancelled=false;
  setBusy(true);setError('');setView(null);
  createMahjongClient(text=>{if(!cancelled)setStatus(text)}).then(async instance=>{
   if(cancelled){instance.dispose();return;}
   client.current=instance;
   const saved=abandonSave.current?null:readLocal<GameView['replay']|null>('replay',null);
   abandonSave.current=false;
   let initial:GameView;
   initial=saved?await instance.restore(saved):await instance.start();
   if(!cancelled){setMode(initial.replay.mode);setView(initial);setBusy(false)}
  }).catch(reason=>{if(!cancelled){setError(String(reason));setBusy(false)}});
  return ()=>{cancelled=true;client.current?.dispose();client.current=null;};
 },[retry]);
 useEffect(()=>{enableSound(sound)},[sound]);
 useEffect(()=>{if(view){if(view.phase==='playing')save('replay',view.replay);else clearSave()}},[view]);
 useEffect(()=>{
  if(!view||busy||error||view.phase==='finished'||view.needsHuman||mode==='spectate')return;
  const timer=setTimeout(()=>{
   if(!client.current)return;
   setBusy(true);setStatus('AI 正在思考…');
   client.current.advance().then(next=>{setView(next);setBusy(false)}).catch(reason=>{setError(String(reason));setBusy(false)});
  },fast?80:350);
  return ()=>clearTimeout(timer);
 },[view,busy,error,fast,mode]);
 useEffect(()=>{if(view?.phase==='finished'){setResultOpen(true);if(view.result&&!resultSaved.current){resultSaved.current=true;const next=[{date:new Date().toISOString(),winner:view.result.winner,scores:view.result.scores},...records].slice(0,30);setRecords(next);save('records',next)}}},[view?.phase]);
 async function switchMode(next:'play'|'spectate'){if(!client.current||busy)return;setBusy(true);setMode(next);setSelected(null);setResultOpen(false);resultSaved.current=false;try{setView(await client.current.start(undefined,next))}catch(reason){setError(String(reason))}finally{setBusy(false)}}
 async function nextStep(){if(!client.current||busy)return;setBusy(true);setStatus('正在计算一步…');try{setView(await client.current.advance())}catch(reason){setError(String(reason))}finally{setBusy(false)}}
 async function act(id:number){if(!client.current||busy)return;setBusy(true);setSelected(null);playSound(view?.actions.find(action=>action.id===id)?.label==='出牌'?'tap':'chime');try{setView(await client.current.action(id))}catch(reason){setError(String(reason))}finally{setBusy(false)}}
 async function reset(){if(!client.current||busy)return;setBusy(true);setSelected(null);setResultOpen(false);setError('');resultSaved.current=false;try{setView(await client.current.start(undefined,mode))}catch(reason){setError(String(reason))}finally{setBusy(false)}}
 const playAction=selected===null?undefined:view?.actions.find(action=>action.tile===view.hand[selected]&&action.label.startsWith('出'));
 const otherActions=view?.actions.filter(action=>!action.label.startsWith('出'))??[];
 const humanReady=!!view?.needsHuman&&!busy&&view.phase==='playing'&&!error;
 return <main className="game-page"><div className="table-heading"><div><button className="back-link" data-testid="back-to-lobby" onClick={onBack}>← 返回大厅</button><h1>国标麻将 <span>复式国标 · 136 张无花</span></h1></div><Button variant="outline" data-testid="reset-table" disabled={busy||!view} onClick={reset}>↻ 重新开局</Button></div>
 <div className="mode-controls"><Button variant="subtle" aria-pressed={sound} onClick={()=>{const next=!sound;setSound(next);save('sound',next);enableSound(next);if(next)playSound('chime')}}>{sound?'音效：开':'音效：关'}</Button><Button variant={mode==='play'?'filled':'outline'} disabled={busy||!!error||!view} onClick={()=>switchMode('play')}>人机对战</Button><Button data-testid="watch-game" variant={mode==='spectate'?'filled':'outline'} disabled={busy||!!error||!view} onClick={()=>switchMode('spectate')}>逐步观战</Button>{mode==='spectate'&&<Button data-testid="next-step" disabled={busy||!view||view.phase==='finished'||!!error} onClick={nextStep}>计算下一步</Button>}</div>{error&&<Alert color="red" title="牌桌暂时无法继续" className="engine-alert"><p>{error}</p><Button size="xs" onClick={()=>setRetry(n=>n+1)}>保留存档并重试</Button><Button size="xs" color="red" variant="outline" onClick={()=>{abandonSave.current=true;clearSave();setRetry(n=>n+1)}}>放弃存档新开局</Button></Alert>}
 {storageWarning&&<Alert color="yellow" title="本地数据提示" role="status">{storageWarning}</Alert>}
 {!view&&!error?<section className="engine-loading" role="status"><Loader color="forest"/><h2>给好局一点时间</h2><p>{status}</p><small>首次打开需要准备浏览器运行环境。</small></section>:view&&<div className="table-layout"><section className="table-area" aria-label="麻将牌桌"><div className="mahjong-table live-table" data-testid="mahjong-table"><div className="felt-pattern"/><div className="table-border"/>{sides.map(side=><Wall key={side} side={side}/>)}
 {view.players.filter(player=>player.seat!==0).map(player=><div key={player.seat} className={`seat seat-${sides[player.seat]} ${view.currentPlayer===player.seat?'active-seat':''}`}><span className="avatar">{names[player.seat][0]}</span><div><b>{names[player.seat]} · {winds[player.seat]}</b><small>{player.handCount} 张暗手</small></div></div>)}
 <div className="table-center"><span>{winds[view.wind]}风圈</span><strong>{winds[view.currentPlayer]}</strong><small>余牌 {view.remaining} 张</small></div>
 {view.players.map(player=><div key={player.seat} className={`live-discards live-discards-${sides[player.seat]}`} data-testid={player.seat===0?'discard-pile':`discard-pile-${player.seat}`} aria-label={`${names[player.seat]}弃牌`}>{player.discards.map((code,i)=><div className="discarded-tile" key={`${code}-${i}`} aria-label={tileName(parseTile(code))}><TileFace tile={parseTile(code,i)}/></div>)}</div>)}
 <span className="table-wordmark">闲 局</span></div>
 <div className="meld-summary">{view.players.some(player=>player.packs.length>0)&&view.players.map(player=>player.packs.length>0&&<div key={player.seat} className="player-melds"><span>{names[player.seat]}副露</span>{player.packs.map((pack,i)=><span className="meld-group" key={i}><small>{pack.concealed?'暗杠':pack.type==='CHI'?'吃':pack.type==='PENG'?'碰':'杠'}</small>{(pack.type==='CHI'?[-1,0,1].map(offset=>pack.tile[0]+(Number(pack.tile.slice(1))+offset)):Array(pack.type==='GANG'?4:3).fill(pack.tile)).map((code,j)=><span className="discarded-tile" key={j}>{code==='CONCEALED'||(pack.concealed&&mode==='play'&&player.seat===0&&(j===0||j===3))?<span className="concealed-tile" aria-label="隐藏暗杠牌背"/>:<TileFace tile={parseTile(code,j)}/>}</span>)}</span>)}</div>)}</div>
 {mode==='spectate'&&<div className="spectator-hands">{view.players.map(player=><section data-testid="ai-hand" key={player.seat}><h3>{names[player.seat]} · {winds[player.seat]}家</h3><div>{('hand' in player?(player.hand as string[]):[]).map((code,i)=><span className="discarded-tile" key={i} aria-label={tileName(parseTile(code))}><TileFace tile={parseTile(code,i)}/></span>)}</div></section>)}</div>}<div className="hand-panel"><div className="hand-top"><span><i/>你 · 东家 {view.currentPlayer===0?'· 当前回合':''}</span><small>{view.hand.length} 张手牌</small></div><div className="hand-scroll"><div className="player-hand">{view.hand.map((code,i)=>{const tile=parseTile(code,i);return <button className={`hand-tile${selected===i?' selected':''}`} key={tile.id} data-testid="hand-tile" disabled={!humanReady} aria-label={`选择${tileName(tile)}`} aria-pressed={selected===i} onClick={()=>setSelected(i)}><TileFace tile={tile}/></button>})}</div></div><div className="hand-actions"><p aria-live="polite">{view.phase==='finished'?'本局结束，可查看结算或重新开局。':humanReady?'轮到你了。选择手牌出牌，或选择下方可用动作。':status}</p><Button data-testid="discard-tile" disabled={!humanReady||!playAction} onClick={()=>playAction&&act(playAction.id)}>出牌 ↑</Button></div><div className="legal-actions">{otherActions.map(action=><Button key={action.id} variant={action.label.includes('胡')?'filled':'outline'} disabled={!humanReady} onClick={()=>act(action.id)}>{action.label}{action.tile?` · ${action.label==='吃'?[-1,0,1].map(offset=>tileName(parseTile(action.tile![0]+(Number(action.tile!.slice(1))+offset)))).join(' / '):tileName(parseTile(action.tile))}`:''}</Button>)}{view.phase==='finished'&&<Button onClick={()=>setResultOpen(true)}>查看结算</Button>}</div></div></section>
 <aside className="table-sidebar"><span className="eyebrow">TABLE NOTES</span><h2>坐定，<br/>好局慢慢来。</h2><div className="note-divider"/><div className="table-tip"><div><b>复式国标 · 136 张无花</b><p>起和 8 番。吃、碰、杠、胡等操作会按当前局面显示。</p></div></div><label className="speed-setting"><input type="checkbox" checked={fast} onChange={event=>{setFast(event.target.checked);save('fast',event.target.checked)}}/> 快速 AI 回合</label><p className="local-record-count">本机已记录 {records.length} 局 · 基础启发式 AI</p><div className="game-log" aria-label="对局记录">{view.log.slice(-8).map((entry,i)=><p key={i}>{entry}</p>)}</div></aside></div>}
 <Modal opened={resultOpen&&!!view?.result} onClose={()=>setResultOpen(false)} title="本局结算" centered><div className="result-panel"><h2>{view?.result?.winner==null?'流局':`${names[view.result.winner]}和牌`}</h2>{view?.result?.scores.map((score,i)=><div className="result-score" key={i}><span>{names[i]} · {winds[i]}家</span><strong>{score>0?'+':''}{score}</strong></div>)}<div className="result-fans">{view?.result?.fans.map((fan,i)=><p key={i}>{fan.name} <span>{fan.points} 番{fan.count>1?` × ${fan.count}`:''}</span></p>)}</div><Button fullWidth disabled={busy} onClick={reset}>再来一局</Button></div></Modal></main>;
}
