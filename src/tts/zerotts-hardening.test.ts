import {it,expect,beforeAll,afterAll,beforeEach} from 'vitest';
import {mkdtemp,writeFile,rm,readFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer,type Server} from 'node:http';
import {spawn as realSpawn,type ChildProcess} from 'node:child_process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {EventEmitter} from 'node:events';
import {
  ensureZeroWorker,setZeroWorkerOverridesForTest,clearZeroWorkerOverridesForTest,
  normalizeLoudnessMp3,
} from './zerotts-client.js';

const exec=promisify(execFile);

let scratch:string;
beforeAll(async()=>{
  scratch=await mkdtemp(join(tmpdir(),'zero-hardening-'));
});
beforeEach(async()=>{
  clearZeroWorkerOverridesForTest();
  try{await unlink(join(process.cwd(),'.zerotts-runtime/worker.lock'));}catch{}
});
afterAll(async()=>{
  clearZeroWorkerOverridesForTest();
  delete process.env.ZEROTTS_PORT;
  for(const s of testServers) await new Promise<void>(resolve=>{try{s.close(()=>resolve());}catch{resolve();}});
  await rm(scratch,{recursive:true,force:true});
});

/** Fake "python" child: callers register what the child will do when started. */
function fakeChild(behavior:()=>Promise<void>|void):{child:ChildProcess;started:()=>number;impl:(cmd:string,args:string[],options:any)=>ChildProcess}{
  let started=0;
  const child=new EventEmitter() as unknown as ChildProcess;
  (child as any).unref=()=>{};
  const impl=()=>{
    started++;Promise.resolve().then(behavior).catch(err=>{
      expect.unreachable('fake worker crashed: '+String(err));
    });
    return child;
  };
  return {child,started:()=>started,impl:impl as any};
}

it('classifies "chưa cài" without touching the port',async()=>{
  expect.hasAssertions();
  setZeroWorkerOverridesForTest({installed:()=>false});
  await expect(ensureZeroWorker()).rejects.toMatchObject({diagnosis:'not-installed'});
});

it('reports "port bận" for a foreign service without killing it',async()=>{
  expect.hasAssertions();
  const foreign:Server=await new Promise(resolve=>{
    const s=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('not zerotts');});
    s.listen(0,'127.0.0.1',()=>resolve(s));
  });
  const port=(foreign.address() as any).port;
  process.env.ZEROTTS_PORT=String(port);
  const {started,impl}=fakeChild(()=>{throw new Error('must not spawn a second worker');});
  setZeroWorkerOverridesForTest({installed:()=>true,spawnImpl:impl});
  try{
    await expect(ensureZeroWorker()).rejects.toMatchObject({diagnosis:'port-busy'});
    expect(started()).toBe(0);
  }finally{
    await new Promise<void>(resolve=>foreign.close(()=>resolve()));
  }
});

it('breaks a stale lock once and reports unreachable when the fake worker cannot bind',async()=>{
  expect.hasAssertions();
  process.env.ZEROTTS_PORT='38289';
  process.env.ZEROTTS_WAIT_MS='1500';
  // Dead pid holds the lock (pid checked via /proc semantics by the client).
  await unlink(join(process.cwd(),'.zerotts-runtime/worker.lock')).catch(()=>{});
  const {writeFileSync}=await import('node:fs');
  writeFileSync(join(process.cwd(),'.zerotts-runtime/worker.lock'),JSON.stringify({pid:2147483000,at:Date.now()}));
  let spawnCalls=0;
  let exiting:ChildProcess;
  setZeroWorkerOverridesForTest({installed:()=>true,spawnImpl:(()=>{spawnCalls++;
    exiting=new EventEmitter() as unknown as ChildProcess;
    (exiting as any).unref=()=>{};
    process.nextTick(()=>exiting.emit('exit',0)); // clean exit, never binds
    return exiting;
  }) as any});
  try{
    await expect(ensureZeroWorker()).rejects.toMatchObject({diagnosis:'unreachable'});
    expect(spawnCalls).toBe(1);
    await expect(readFile(join(process.cwd(),'.zerotts-runtime/worker.lock'),'utf8')).rejects.toThrow();
  }finally{
    delete process.env.ZEROTTS_WAIT_MS;
  }
});

it('waits for the loading state instead of spawning a duplicate worker',async()=>{
  // Simulated healthy worker: binds immediately in "loading", flips to ready.
  const port=38001+Math.floor(Math.random()*100);
  process.env.ZEROTTS_PORT=String(port);
  const {started,impl}=fakeChild(async()=>{
    const server=createServer((_req,res)=>{
      // /health only. Token: keep requests minimal; loading→ready after 700ms.
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({
        service:'lc-autogen-zerotts',ready:Date.now()-start>=700,loading:Date.now()-start<700,
        elapsedSec:(Date.now()-start)/1000,revision:'c2bfbd67dc648cac455077333f7cf5c18a2e3bb4',voices:[]}));
    });
    const start=Date.now();
    // Construct server then listen (annotate start before serving).
    await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',()=>resolve()));
    testServers.push(server);
  });
  setZeroWorkerOverridesForTest({installed:()=>true,spawnImpl:impl});
  const conn=await ensureZeroWorker();
  expect(conn.url).toContain(String(port));
  expect(started()).toBe(1); // exactly one spawn, no duplicate
});

it('two concurrent callers before any worker → exactly one spawn (transient refused)',async()=>{
  // Worker needs ~800ms to bind; before that probes get ECONNREFUSED.
  // The second caller must wait through the refused window, not spawn again.
  const port=39001+Math.floor(Math.random()*100);
  process.env.ZEROTTS_PORT=String(port);
  process.env.ZEROTTS_WAIT_MS='20000';
  let spawnCalls=0;
  const server=createServer((_req,res)=>{
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({service:'lc-autogen-zerotts',ready:true,loading:false,elapsedSec:1,revision:'c2bfbd67dc648cac455077333f7cf5c18a2e3bb4',voices:[]}));
  });
  testServers.push(server);
  setZeroWorkerOverridesForTest({installed:()=>true,spawnImpl:(()=>{
    spawnCalls++;
    const child=new EventEmitter() as unknown as ChildProcess;
    (child as any).unref=()=>{};
    setTimeout(()=>{server.listen(port,'127.0.0.1');},800);
    return child;
  }) as any});
  try{
    const [a,b]=await Promise.all([ensureZeroWorker(),ensureZeroWorker()]);
    expect(a.url).toContain(String(port));
    expect(b.url).toContain(String(port));
    expect(spawnCalls).toBe(1);
  }finally{
    delete process.env.ZEROTTS_WAIT_MS;
  }
});

const testServers:Server[]=[];
it('loudness normalization lands all voices on a common loudness window (A9.2 miniature)',async()=>{
  const quiet=join(scratch,'quiet.wav'),loud=join(scratch,'loud.wav');
  await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=300:duration=5','-af',`volume=-30dB`,quiet]);
  await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=800:duration=5','-af',`volume=-4dB`,loud]);
  const out1=join(scratch,'quiet.mp3'),out2=join(scratch,'loud.mp3');
  await normalizeLoudnessMp3(quiet,out1);
  await normalizeLoudnessMp3(loud,out2);
  const volumes=async(file:string)=>{
    const {stderr}=await exec('ffmpeg',['-i',file,'-af','volumedetect','-f','null','-']);
    const mean=Number(stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]);
    const max=Number(stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]);
    return {mean,max};
  };
  const a=await volumes(out1),b=await volumes(out2);
  expect(Math.abs(a.mean-b.mean)).toBeLessThanOrEqual(2);
  expect(Math.max(a.max,b.max)).toBeLessThanOrEqual(-1);
});
