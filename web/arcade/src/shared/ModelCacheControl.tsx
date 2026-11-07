import { useEffect, useState } from 'react';
import { Switch } from '@mantine/core';
import { cacheState, MODEL_CACHE_CHANNEL, setCacheEnabled, type ModelSpec } from './modelCache';
export function ModelCacheControl({spec}:{spec:ModelSpec}){
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(true),[status,setStatus]=useState('未保存');
 useEffect(()=>{
  let active=true;
  const refresh=()=>cacheState(spec).then(state=>{if(active){setEnabled(state.enabled);setStatus(state.saved?'已保存':state.enabled?'等待保存':'未保存');setBusy(false)}}).catch(()=>{if(active){setStatus('存储不可用');setBusy(false)}});
  void refresh();const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(MODEL_CACHE_CHANNEL);
  if(channel)channel.onmessage=event=>{if(event.data?.gameId===spec.gameId)void refresh()};
  const failure=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.gameId===spec.gameId)setStatus('保存失败')};
  window.addEventListener('model-cache-error',failure);
  window.addEventListener('model-cache-update',refresh);
  return()=>{active=false;channel?.close();window.removeEventListener('model-cache-error',failure);window.removeEventListener('model-cache-update',refresh)};
 },[spec]);
 return <div className="model-cache-control"><Switch data-testid="model-cache-toggle" checked={enabled} disabled={busy} label="保存 AI 模型" onChange={async event=>{const next=event.currentTarget.checked;setBusy(true);try{await setCacheEnabled(spec.gameId,next);const state=await cacheState(spec);setEnabled(state.enabled);setStatus(state.saved?'已保存':state.enabled?'等待保存':'未保存')}catch{setStatus('保存失败')}finally{setBusy(false)}}}/><small data-testid="model-cache-status" role="status">{status}</small></div>;
}
