import { ModelCacheControl } from '../../shared/ModelCacheControl';
import { mahjongModel } from './modelSpec';
import { useTableFullscreen } from './useTableFullscreen';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Loader, Modal, Switch } from '@mantine/core';
import { createMahjongClient, type GameView, type MahjongClient } from './engine/client';
import { isBackendPreference, type BackendPreference, type Difficulty, type RuntimeProgress } from './engine/types';
import { TileFace, Wall } from './MahjongGame';
import { tileName, type Tile } from './types';
import { enableSound, playSound } from '../../shared/audio';
import { readLocal, writeLocal, removeLocal, getLocalWarning, type LocalRecord } from './localStore';

function parseTile(code:string,index=0):Tile {
 const value=Number(code.slice(1));
 return {id:`${code}-${index}`,suit:code[0]==='W'?'wan':code[0]==='T'?'bamboo':code[0]==='B'?'circle':'honor',value:code[0]==='J'?value+4:value};
}
const names=['东家 AI','月白','竹间','松风'];
const winds=['东','南','西','北'];
const sides=['bottom','right','top','left'];
const difficultyNames:Record<Difficulty,string>={easy:'轻松',normal:'标准',expert:'高手'};
export function LiveGame({onBack}:{onBack:()=>void}) {
 const fullscreen=useTableFullscreen();
 const client=useRef<MahjongClient|null>(null);
 const [view,setView]=useState<GameView|null>(null);
 const [busy,setBusy]=useState(true);
 const [status,setStatus]=useState('正在准备牌桌…');
 const [error,setError]=useState('');
 const [runtime,setRuntime]=useState<RuntimeProgress|null>(null);
 const [resultOpen,setResultOpen]=useState(false);
 const [retry,setRetry]=useState(0);
 const [mode,setMode]=useState<'play'|'spectate'>('play');
 const [autoPlay,setAutoPlay]=useState(false);
 const [sound,setSound]=useState(()=>readLocal('sound',false));
 const [fast,setFast]=useState(()=>readLocal('fast',false));
 const [difficulty,setDifficulty]=useState(()=>readLocal<Difficulty>('difficulty','expert'));
 const [backendPreference,setBackendPreference]=useState<BackendPreference>(()=>readLocal<BackendPreference>('backend','auto'));
 const [backendBusy,setBackendBusy]=useState(false);
 const [records,setRecords]=useState<LocalRecord[]>(()=>readLocal('records',[]));
 const resultSaved=useRef(false);
 const abandonSave=useRef(false);
 const [storageWarning,setStorageWarning]=useState(getLocalWarning);
 function save(key:string,value:unknown){if(!writeLocal(key,value))setStorageWarning(getLocalWarning())}
 function clearSave(){if(!removeLocal('replay'))setStorageWarning(getLocalWarning())}
 useEffect(()=>{
  let cancelled=false;
  const controller=new AbortController();
  setBusy(true);setError('');setView(null);setRuntime(null);
  createMahjongClient(text=>{if(!cancelled)setStatus(text)},progress=>{if(!cancelled)setRuntime(progress)},controller.signal,backendPreference).then(async instance=>{
   if(cancelled){instance.dispose();return;}
   client.current=instance;
   const saved=abandonSave.current?null:readLocal<GameView['replay']|null>('replay',null);
   abandonSave.current=false;
   let initial:GameView;
   initial=saved?await instance.restore(saved):await instance.start();
   if(!cancelled){setMode(initial.replay.mode);setView(initial);setBusy(false)}
  }).catch(reason=>{if(!cancelled){setError(String(reason));setBusy(false)}});
  return ()=>{cancelled=true;controller.abort();client.current?.dispose();client.current=null;};
 },[retry]);
 useEffect(()=>{enableSound(sound)},[sound]);
 useEffect(()=>()=>enableSound(false),[]);
 useEffect(()=>{if(view){if(view.phase==='playing')save('replay',view.replay);else clearSave()}},[view]);
 useEffect(()=>{
  if(!view||busy||backendBusy||error||view.phase==='finished'||mode==='spectate'||!autoPlay)return;
  const timer=setTimeout(()=>{
   if(!client.current)return;
   setBusy(true);setStatus('AI 正在思考…');
   client.current.autoAdvance(difficulty).then(next=>{applyStep(next);setBusy(false)}).catch(reason=>{setError(String(reason));setBusy(false)});
  },fast?80:350);
  return ()=>clearTimeout(timer);
 },[view,busy,backendBusy,error,fast,mode,autoPlay,difficulty]);
 useEffect(()=>{if(view?.phase==='finished'){setAutoPlay(false);setResultOpen(true);if(view.result&&!resultSaved.current){resultSaved.current=true;const next=[{date:new Date().toISOString(),winner:view.result.winner,scores:view.result.scores},...records].slice(0,30);setRecords(next);save('records',next)}}},[view?.phase]);
 function applyStep(next:GameView){
  if(view&&view.phase==='playing'&&next.replay.seed===view.replay.seed&&next.replay.mode===view.replay.mode&&next.replay.actions.length>view.replay.actions.length)playSound(next.phase==='finished'?'chime':'tap');
  setView(next);
 }
 async function switchMode(next:'play'|'spectate'){if(!client.current||busy||mode===next)return;setAutoPlay(false);setBusy(true);setMode(next);setResultOpen(false);resultSaved.current=false;try{setView(await client.current.start(undefined,next))}catch(reason){setError(String(reason))}finally{setBusy(false)}}
 async function nextStep(){if(!client.current||busy)return;setBusy(true);setStatus('正在计算一步…');try{applyStep(await client.current.advance(difficulty))}catch(reason){setError(String(reason))}finally{setBusy(false)}}
 async function switchBackend(next:BackendPreference){if(!client.current||backendBusy)return;const previous=backendPreference;setBackendPreference(next);setBackendBusy(true);try{const actual=await client.current.setBackend(next);save('backend',next);setView(current=>current?{...current,ai:{...current.ai,backend:actual.backend,threads:actual.threads}}:current)}catch(reason){setBackendPreference(previous);setError(String(reason))}finally{setBackendBusy(false)}}
 async function reset(){if(!client.current||busy)return;setAutoPlay(false);setBusy(true);setResultOpen(false);setError('');resultSaved.current=false;try{setView(await client.current.start(undefined,mode))}catch(reason){setError(String(reason))}finally{setBusy(false)}}
 
 return <main ref={fullscreen.target} className={`game-page ${fullscreen.mode!=='none'?'table-fullscreen':''}`} data-fullscreen-mode={fullscreen.mode}><div className="table-heading"><div><button className="back-link" data-testid="back-to-lobby" onClick={()=>{fullscreen.exit();onBack()}}>← 返回大厅</button><h1>国标麻将 <span>复式国标 · 136 张无花</span></h1></div><Button variant="outline" data-testid="reset-table" disabled={busy||!view} onClick={reset}>↻ 重新开局</Button></div>
 <div className="mode-controls"><ModelCacheControl spec={mahjongModel}/><Button variant="outline" data-testid="toggle-fullscreen" aria-pressed={fullscreen.mode!=='none'} onClick={fullscreen.toggle}>{fullscreen.mode==='none'?'全屏':'退出全屏'}</Button>{fullscreen.hint&&<small className="fullscreen-hint" role="status">{fullscreen.hint}</small>}<Button variant="subtle" aria-pressed={sound} onClick={()=>{const next=!sound;setSound(next);save('sound',next);enableSound(next);if(next)playSound('chime')}}>{sound?'音效：开':'音效：关'}</Button><Button data-testid="play-game" variant={mode==='play'?'filled':'outline'} disabled={busy||!!error||!view||mode==='play'} onClick={()=>switchMode('play')}>{mode==='play'?'自动对战':'开始自动新局'}</Button><Button data-testid="watch-game" variant={mode==='spectate'?'filled':'outline'} disabled={busy||!!error||!view||mode==='spectate'} onClick={()=>switchMode('spectate')}>逐步观战</Button></div>{error&&<Alert color="red" title="牌桌暂时无法继续" className="engine-alert"><p>{error}</p><Button size="xs" onClick={()=>setRetry(n=>n+1)}>保留存档并重试</Button><Button size="xs" color="red" variant="outline" onClick={()=>{abandonSave.current=true;clearSave();setRetry(n=>n+1)}}>放弃存档新开局</Button></Alert>}
 {storageWarning&&<Alert color="yellow" title="本地数据提示" role="status">{storageWarning}</Alert>}
 {!view&&!error?<section className="engine-loading" role="status"><Loader color="forest"/><h2>正在加载</h2><p>{status}</p>{runtime&&<div className="ai-load-progress" data-testid="ai-load-progress"><progress aria-label={runtime.stage==='download'?'下载 AI 模型':'准备 AI'} max={runtime.totalBytes>0?runtime.totalBytes:undefined} value={runtime.stage==='download'&&runtime.totalBytes>0?runtime.loadedBytes:undefined}/><small>{runtime.stage==='download'?`kdens3 · ${(runtime.loadedBytes/1048576).toFixed(1)}${runtime.totalBytes>0?` / ${(runtime.totalBytes/1048576).toFixed(1)}`:''} MB`:runtime.stage==='ready'?'AI 已就绪':'正在初始化 AI'}</small></div>}</section>:view&&<div className="table-layout"><section className="table-area" aria-label="麻将牌桌"><div className="mahjong-table live-table" data-testid="mahjong-table"><div className="felt-pattern"/><div className="table-border"/>{sides.map(side=><Wall key={side} side={side}/>)}
 {view.players.filter(player=>player.seat!==0).map(player=><div key={player.seat} className={`seat seat-${sides[player.seat]} ${view.currentPlayer===player.seat?'active-seat':''}`}><span className="avatar">{names[player.seat][0]}</span><div><b>{names[player.seat]} · {winds[player.seat]}</b><small>{player.handCount} 张暗手</small></div></div>)}
 <div className="table-center"><span>{winds[view.wind]}风圈</span><strong>{winds[view.currentPlayer]}</strong><small>余牌 {view.remaining} 张</small></div>
 {view.players.map(player=><div key={player.seat} className={`live-discards live-discards-${sides[player.seat]}`} data-testid={player.seat===0?'discard-pile':`discard-pile-${player.seat}`} aria-label={`${names[player.seat]}弃牌`}>{player.discards.map((code,i)=><div className="discarded-tile" key={`${code}-${i}`} aria-label={tileName(parseTile(code))}><TileFace tile={parseTile(code,i)}/></div>)}</div>)}
 <span className="table-wordmark">闲 局</span></div>
 <div className="meld-summary">{view.players.some(player=>player.packs.length>0)&&view.players.map(player=>player.packs.length>0&&<div key={player.seat} className="player-melds"><span>{names[player.seat]}副露</span>{player.packs.map((pack,i)=><span className="meld-group" key={i}><small>{pack.concealed?'暗杠':pack.type==='CHI'?'吃':pack.type==='PENG'?'碰':'杠'}</small>{(pack.type==='CHI'?[-1,0,1].map(offset=>pack.tile[0]+(Number(pack.tile.slice(1))+offset)):Array(pack.type==='GANG'?4:3).fill(pack.tile)).map((code,j)=><span className="discarded-tile" key={j}>{code==='CONCEALED'||(pack.concealed&&mode==='play'&&player.seat===0&&(j===0||j===3))?<span className="concealed-tile" aria-label="隐藏暗杠牌背"/>:<TileFace tile={parseTile(code,j)}/>}</span>)}</span>)}</div>)}</div>
 {mode==='spectate'&&<div className="spectator-hands">{view.players.map(player=><section data-testid="ai-hand" key={player.seat}><h3>{names[player.seat]} · {winds[player.seat]}家 AI</h3><div>{('hand' in player?(player.hand as string[]):[]).map((code,i)=><span className="discarded-tile" key={i} aria-label={tileName(parseTile(code))}><TileFace tile={parseTile(code,i)}/></span>)}</div></section>)}</div>}</section>
 <aside className="table-sidebar"><h2>对局记录</h2><label className="speed-setting"><input type="checkbox" checked={fast} onChange={event=>{setFast(event.target.checked);save('fast',event.target.checked)}}/> 快速 AI 回合</label><p className="local-record-count">本机 {records.length} 局</p><div className="game-log" aria-label="对局记录">{view.log.slice(-8).map((entry,i)=><p key={i}>{entry}</p>)}</div></aside><div className="action-dock" data-testid="action-dock"><div className="ai-settings-row">{view.ai&&<div className="ai-runtime-info" data-testid="ai-runtime-info" data-difficulty={view.ai.difficulty} data-model={view.ai.model} data-backend={view.ai.backend} data-inference-calls={view.ai.inferenceCalls} data-last-inference-ms={view.ai.lastInferenceMs} data-wasm-threads={view.ai.threads}>{view.ai.model} · {view.ai.inferenceCalls>0?`${difficultyNames[view.ai.difficulty]} · `:''}{view.ai.backend==='webgpu'?'WebGPU':`WASM${view.ai.threads>1?` · ${view.ai.threads} 线程`:''}`} · {view.ai.inferenceCalls>0?`${view.ai.lastInferenceMs.toFixed(1)} ms · ${view.ai.inferenceCalls} 次推理`:'尚未推理'}</div>}<label className="difficulty-control">后端<select data-testid="ai-backend" value={backendPreference} disabled={backendBusy||!!error||view.phase==='finished'} onChange={event=>{const next=event.currentTarget.value;if(isBackendPreference(next))void switchBackend(next)}} aria-label="AI 推理后端" title="自动优先 WebGPU，不可用时回退 WASM；切换会重建推理会话，不重新下载模型"><option value="auto">自动</option><option value="webgpu">WebGPU</option><option value="wasm">WASM</option></select></label><label className="difficulty-control">难度<select data-testid="ai-difficulty" value={difficulty} disabled={busy||!!error||view.phase==='finished'} onChange={event=>{const next=event.currentTarget.value;if(next==='easy'||next==='normal'||next==='expert'){setDifficulty(next);save('difficulty',next)}}} aria-label="AI 难度" title="高手为原版 kdens3；切换后下一步生效"><option value="easy">轻松</option><option value="normal">标准</option><option value="expert">高手</option></select></label></div>{mode==='play'&&<div className="hand-panel"><div className="hand-top"><span><i/>东家 AI</span><small>{view.hand.length} 张手牌</small></div><div className="hand-scroll"><div className="player-hand">{view.hand.map((code,i)=><span className="hand-tile readonly-tile" key={code+i} aria-label={tileName(parseTile(code))}><TileFace tile={parseTile(code,i)}/></span>)}</div></div></div>}<div className="dock-controls"><div className="dock-status" data-testid="turn-status" role="status"><strong>{view.phase==='finished'?'本局已结束':error?'牌桌暂停，请处理错误':mode==='spectate'?(busy?'正在计算一步…':'已暂停'):autoPlay?(busy?'AI 正在计算…':`${names[view.currentPlayer]} 正在行动`):'已暂停'}</strong><small>{mode==='spectate'?'四家明手':'四家 AI 托管'}</small></div>{mode==='play'?<Switch data-testid="auto-play-toggle" checked={autoPlay} disabled={!!error||view.phase==='finished'} onChange={event=>setAutoPlay(event.currentTarget.checked)} label="自动对战" size="md"/>:<Button data-testid="next-step" disabled={busy||view.phase==='finished'||!!error} onClick={nextStep}>计算下一步</Button>}{view.phase==='finished'&&<Button onClick={()=>setResultOpen(true)}>查看结算</Button>}</div></div></div>}
 <Modal withinPortal={false} opened={resultOpen&&!!view?.result} onClose={()=>setResultOpen(false)} title="本局结算" centered><div className="result-panel"><h2>{view?.result?.winner==null?'流局':`${names[view.result.winner]}和牌`}</h2>{view?.result?.scores.map((score,i)=><div className="result-score" key={i}><span>{names[i]} · {winds[i]}家</span><strong>{score>0?'+':''}{score}</strong></div>)}<div className="result-fans">{view?.result?.fans.map((fan,i)=><p key={i}>{fan.name} <span>{fan.points} 番{fan.count>1?` × ${fan.count}`:''}</span></p>)}</div><Button fullWidth disabled={busy} onClick={reset}>再来一局</Button></div></Modal></main>;
}
