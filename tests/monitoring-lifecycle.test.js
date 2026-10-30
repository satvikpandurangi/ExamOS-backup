import {test} from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {fixture} from './exam-fixture.mjs';

test('replacement/disconnect during an awaited sample cannot publish stale pixels or inherit consent',async()=>{
  const f=await fixture(), clients=[];
  const connect=async(auth)=>{
    const s=io(f.base,{auth,reconnection:false,transports:['websocket']});clients.push(s);
    await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject)});return s;
  };
  const call=(s,n,p)=>s.timeout(3000).emitWithAck(n,p);
  try{
    const sid=(await f.request('/sessions',{name:'Isolated connection race'},f.token)).data.id;
    const d=await f.enroll('Protocol fixture, no native capture');
    const teacher=await connect({role:'teacher',token:f.token});
    const first=await connect({token:d.token});
    assert.equal((await call(first,'heartbeat',{})).screenConsented,false);
    await call(first,'consent',{sessionId:sid,accept:true});
    const previews=[];teacher.on('preview',p=>previews.push(p));
    let unblock,entered;
    const held=new Promise(r=>unblock=r), ready=new Promise(r=>entered=r);
    const query=f.db.query.bind(f.db);
    f.db.query=async(sql,args)=>{
      const result=await query(sql,args);
      if(sql.startsWith('INSERT INTO events') && args?.[4]==='telemetry_unavailable'){
        entered();await held;
      }
      return result;
    };
    // Explicit protocol codec marker; never asserted to be a webcam/screen photograph.
    first.emit('sample',{sessionId:sid,app:'[unavailable]',jpeg:'/9j/cHJvdG9jb2w='});
    await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('sample did not reach barrier')),3000))]);
    const replacement=await connect({token:d.token});
    unblock();
    const state=await call(replacement,'heartbeat',{});
    assert.equal(state.screenConsented,false);assert.equal(state.cameraConsented,false);
    await new Promise(r=>setTimeout(r,100));
    assert.equal(previews.length,0,'Disconnected sample must not be forwarded after its database await');
    assert.equal((await f.request('/sessions/'+sid+'/events',null,f.token)).data.some(e=>e.kind==='rule_alert'),false,'Unavailable metadata is technical, not a rule alert');
    await call(replacement,'consent',{sessionId:sid,accept:true});
    assert.equal((await call(replacement,'heartbeat',{})).screenConsented,true);
    await f.request('/devices/'+d.id+'/revoke',{},f.token);
    assert.equal(f.online.has(d.id),false);
    await new Promise(r=>setTimeout(r,50));assert.equal(previews.length,0);
  }finally{for(const s of clients)s.disconnect();await f.close();}
});
