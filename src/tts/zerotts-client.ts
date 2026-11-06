import axios from 'axios';
import type {AxiosError} from 'axios';
import {existsSync,readFileSync,readSync,openSync,closeSync,mkdirSync,statSync,writeFileSync} from 'node:fs';
import {writeFile,readFile,rm} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import type {TtsClient} from './tts-client.js';
import {ZERO_VOICES,ZEROTTS_REVISION} from './zerotts-settings.js';
const exec=promisify(execFile);
const root=process.cwd();

// ── M9 diagnostics: five disablement causes must never blur together ────────
export type ZeroTtsDiagnosis =
  | 'not-installed'       // model/venv missing
  | 'loading'             // our worker bound the port, model still loading
  | 'unreachable'         // nothing listening on loopback / spawn failed
  | 'port-busy'           // a foreign service owns ZEROTTS_PORT
  | 'synthesis-error';    // worker answered but synthesis failed

export function zeroTtsInstalled():boolean {
 try{const installed=JSON.parse(readFileSync(join(root,'.zerotts-runtime/installed.json'),'utf8'));return installed.revision===ZEROTTS_REVISION&&existsSync(join(root,'.zerotts-venv/bin/python'));}catch{return false;}
}
export function zeroTtsPort():number{const port=Number(process.env.ZEROTTS_PORT||7821);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('ZEROTTS_PORT không hợp lệ.');return port;}

type Connection={url:string;token:string};
type HealthProbe={kind:'ready'}|{kind:'loading';elapsedSec:number}|{kind:'foreign';status?:number}|{kind:'refused'};

function pidAlive(pid:number):boolean{
  try{process.kill(pid,0);return true;}catch(err:any){if(err.code==='EPERM')return true;return false;}
}

async function probeHealth(url:string):Promise<HealthProbe>{
  try{
    const {data}=await axios.get(url+'/health',{timeout:1500,proxy:false});
    if(data&&data.service==='lc-autogen-zerotts'&&data.revision===ZEROTTS_REVISION&&typeof data.ready==='boolean'){
      return data.ready?{kind:'ready'}:{kind:'loading',elapsedSec:Number(data.elapsedSec)||0};
    }
    return {kind:'foreign'};
  }catch(err:any){
    const ax=err as AxiosError;
    if(ax.response)return {kind:'foreign',status:ax.response.status};
    return {kind:'refused'};
  }
}
void probeHealth; // kept internal; tests exercise it through nock on /health

/** Read the last bytes of worker.log safely; the worker never logs narration. */
function workerLogTail(bytes=2000):string|undefined{
  try{
    const logPath=join(root,'.zerotts-runtime/worker.log');
    const size=statSync(logPath).size;
    const start=Math.max(0,size-bytes);
    const buf=Buffer.alloc(size-start);
    const fd=openSync(logPath,'r');
    try{readSync(fd,buf,0,size-start,start);return buf.toString('utf8').trim();}
    finally{closeSync(fd);}
  }catch{return undefined;}
}

function throwZeroError(diagnosis:ZeroTtsDiagnosis,detail:string):never{
  const base:Record<ZeroTtsDiagnosis,string>={
    'not-installed':'ZeroTTS chưa cài model. Chạy npm run zerotts:setup trong thư mục project rồi tải lại web.',
    'loading':'ZeroTTS đang nạp model.',
    'unreachable':'Không kết nối được worker ZeroTTS trên loopback.',
    'port-busy':'Port ZeroTTS bị một dịch vụ khác chiếm (tiến trình lạ không bị xoá/đụng tới). Xem ZEROTTS_PORT hoặc dừng dịch vụ đó.',
    'synthesis-error':'ZeroTTS local không tạo được audio.',
  };
  const err=new Error(`${base[diagnosis]} ${detail}`.trim()) as Error&{diagnosis:ZeroTtsDiagnosis;logTail?:string};
  err.diagnosis=diagnosis;
  err.logTail=workerLogTail();
  throw err;
}

let starting:Promise<Connection>|undefined;
export async function ensureZeroWorker():Promise<Connection>{
  if(starting)return starting;
  starting=startWorker();try{return await starting;}finally{starting=undefined;}
}

const WAIT_MS=()=>Number(process.env.ZEROTTS_WAIT_MS)||180000;
const tokenFrom=()=>readFileSync(join(root,'.zerotts-runtime/worker-token'),'utf8').trim();

/** Injection points for tests (mirrors src/asr setTranscribeClientForTest):
 * fake python/worker without touching the network or the real model. */
export interface ZeroWorkerOverrides{
  installed?:()=>boolean;
  spawnImpl?:(cmd:string,args:string[],options:any)=>any;
  pythonPath?:string;
  workerPath?:string;
}
let overrides:ZeroWorkerOverrides|undefined;
export function setZeroWorkerOverridesForTest(o:ZeroWorkerOverrides|undefined){overrides=o;}
export function clearZeroWorkerOverridesForTest(){overrides=undefined;}

/** Poll a bound worker (loading|ready) until ready or deadline.
 * `transientRefused=true` (lock-wait phase): a refused probe just means the
 * other process has not bound the port yet — keep waiting until deadline.
 * Otherwise (a worker was already observed loading) refused is fatal. */
async function waitReady(url:string,deadline:number,transientRefused=false):Promise<Connection|undefined>{
  while(Date.now()<deadline){
    const probe=await probeHealth(url);
    if(probe.kind==='ready')return {url,token:tokenFrom()};
    if(probe.kind==='refused'&&!transientRefused)return undefined;
    // Our own worker is alive (ready/loading) or something still answers —
    // keep waiting; never spawn a second worker for an occupied port.
    await new Promise(r=>setTimeout(r,500));
  }
  if(transientRefused)return undefined;
  throwZeroError('loading',`Không sẵn sàng sau ${Math.round(WAIT_MS()/1000)}s.`);
}

async function startWorker():Promise<Connection>{
  if(process.env.VITEST&&!overrides)throw new Error('ZeroTTS worker must be mocked in tests.');
  const port=zeroTtsPort();
  const url=`http://127.0.0.1:${port}`;
  const installed=overrides?.installed??zeroTtsInstalled;
  if(!installed())throwZeroError('not-installed','');
  const runtime=join(root,'.zerotts-runtime');mkdirSync(runtime,{recursive:true});
  const tokenFile=join(runtime,'worker-token');
  try{const fd=openSync(tokenFile,'wx',0o600);try{writeFileSync(fd,randomBytes(32).toString('hex'));}finally{closeSync(fd);}}catch(err:any){if(err.code!=='EEXIST')throw err;}
  if(tokenFrom().length<32)throwZeroError('unreachable','Local token không hợp lệ.');
  const deadline=Date.now()+WAIT_MS();

  // Probe-first: an old healthy worker (ready) or a model still loading must
  // never be duplicated ("Address already in use" race fixed by listening-first
  // worker + wait-on-loading).
  const first=await probeHealth(url);
  if(first.kind==='ready')return {url,token:tokenFrom()};
  if(first.kind==='loading'){
    const ready=await waitReady(url,deadline);
    if(ready)return ready;
    throwZeroError('loading','Nạp model vượt 180s.');
  }

  // Exclusive cross-process spawn lock; a stale lock (dead holder pid) is
  // broken exactly once, then re-acquired.
  const lockFile=join(runtime,'worker.lock');
  let acquired=await acquireSpawnLock(lockFile);
  if(acquired===false){
    // Another process is spawning: wait for its worker to bind and report.
    // Refused here is TRANSIENT (worker may not have bound yet), so wait the
    // whole deadline instead of falling through to a second spawn.
    const ready=await waitReady(url,deadline,true);
    if(ready)return ready;
    acquired=await acquireSpawnLock(lockFile);
  }
  if(acquired===null){
    // Holder alive but no worker appeared; wait rather than racing a second spawn.
    const ready=await waitReady(url,deadline,true);
    if(ready)return ready;
    throwZeroError('unreachable','Một tiến trình khác đang khởi động worker nhưng không thành công.');
  }

  try{
    // A worker may have bound the port between the first probe and the lock:
    // check once more before spending a spawn on it.
    const beforeSpawn=await probeHealth(url);
    if(beforeSpawn.kind==='ready')return {url,token:tokenFrom()};
    if(beforeSpawn.kind==='loading'){
      const ready=await waitReady(url,deadline);if(ready)return ready;
      throwZeroError('loading','Nạp model không hoàn tất.');
    }
    if(beforeSpawn.kind==='foreign')throwZeroError('port-busy',`Port=${port} có trình nghe nhưng không phải worker ZeroTTS.`);

    const cmd=overrides?.pythonPath??join(root,'.zerotts-venv/bin/python');
    const script=overrides?.workerPath??join(root,'scripts/zerotts_worker.py');
    const log=openSync(join(runtime,'worker.log'),'a',0o600);
    const spawnFn=overrides?.spawnImpl??spawn;
    const child=spawnFn(cmd,['-u',script,'--port',String(port)],{cwd:root,env:{...process.env,LC_ZEROTTS_TOKEN:tokenFrom()},detached:true,stdio:['ignore',log,log]});
    closeSync(log);child.unref();
    let spawnError=false,bindExit=false;
    child.on('error',()=>{spawnError=true;});
    child.on('exit',(code:number|null)=>{if(code===3)bindExit=true;});
    while(Date.now()<deadline){
      const probe=await probeHealth(url);
      if(probe.kind==='ready')return {url,token:tokenFrom()};
      if(probe.kind==='loading'){
        const ready=await waitReady(url,Math.min(deadline,Date.now()+120000));
        if(ready)return ready;
      }
      if(bindExit)throwZeroError('port-busy',`Worker vừa khởi động thoát vì bind lỗi, port=${port}.`);
      if(spawnError)throwZeroError('unreachable',`Python worker không chạy được (xem worker.log).`);
      await new Promise(r=>setTimeout(r,500));
    }
    throwZeroError('unreachable',`Worker không lắng nghe loopback:${port} sau 180s.`);
  }finally{await releaseSpawnLock(lockFile);}
}

async function acquireSpawnLock(lockFile:string):Promise<boolean|null>{
  // true = acquired; false = holder alive (caller waits on health); null =
  // stale lock broke but re-acquisition raced → treated like holder alive.
  try{
    const fd=openSync(lockFile,'wx',0o600);
    try{writeFileSync(fd,JSON.stringify({pid:process.pid,at:Date.now()}));}finally{closeSync(fd);}
    return true;
  }catch(err:any){
    if(err.code!=='EEXIST')throw err;
    try{
      const {pid}=JSON.parse(await readFile(lockFile,'utf8'));
      if(typeof pid==='number'&&pid!==process.pid&&!pidAlive(pid)){
        await rm(lockFile,{force:true});
        try{
          const fd=openSync(lockFile,'wx',0o600);
          try{writeFileSync(fd,JSON.stringify({pid:process.pid,at:Date.now()}));}finally{closeSync(fd);}
          return true;
        }catch{return null;}
      }
      return false;
    }catch{
      try{await rm(lockFile,{force:true});}catch{/* ignore */}
      return null;
    }
  }
}
async function releaseSpawnLock(lockFile:string){
  try{
    const {pid}=JSON.parse(await readFile(lockFile,'utf8'));
    if(pid===process.pid)await rm(lockFile,{force:true});
  }catch{/* nothing to clean */}
}

/** Live state for /api/studio/options and the web UI. */
export async function zeroTtsDiagnostics():Promise<{
  installed:boolean;state:ZeroTtsDiagnosis|'ready';detail?:string;loadingSec?:number;pidAlive?:boolean;
}>{
  const installed=zeroTtsInstalled();
  if(!installed)return {installed:false,state:'not-installed',detail:'Chạy npm run zerotts:setup để tải model (1,7 GB, lần đầu).'};
  let port=7821;
  try{port=zeroTtsPort();}catch{port=7821;}
  const url=`http://127.0.0.1:${port}`;
  const probe=await probeHealth(url);
  const runningPid=(()=>{try{
    const pid=Number(readFileSync(join(root,'.zerotts-runtime/worker.pid'),'utf8'));
    return Number.isFinite(pid)&&pid>0&&pidAlive(pid);
  }catch{ return false; }})();
  if(probe.kind==='ready')return {installed:true,state:'ready',pidAlive:runningPid};
  if(probe.kind==='loading')return {installed:true,state:'loading',loadingSec:probe.elapsedSec,pidAlive:runningPid};
  if(probe.kind==='foreign')return {installed:true,state:'port-busy',detail:`Port ${port} bận (HTTP ${probe.status??'?'})`,pidAlive:runningPid};
  return {installed:true,state:'unreachable',detail:`Không có worker trên loopback:${port}`,pidAlive:runningPid};
}

/** Local Python SDK bridge; narration never leaves the computer. */
export class ZeroTtsClient implements TtsClient {
  constructor(private opts:{voice:string;connect?:()=>Promise<Connection>}){}
  async generate(text:string,out:string){
   if(!ZERO_VOICES.some(v=>v.id===this.opts.voice))throw new Error('Chọn giọng ZeroTTS hợp lệ.');
   if(!text.trim()||text.length>8000)throw new Error('ZeroTTS cần 1–8000 ký tự cho mỗi cảnh.');
   const {url,token}=await(this.opts.connect||ensureZeroWorker)();const wav=out+'.zerotts.wav';
   try{
    // Timeout follows text length instead of a fixed 300s (PRD M9.5): local
    // RTF ≈ 1.5–1.8, so len(char)×150 ms + slack covers worst cases.
    const response=await axios.post(url+'/synthesize',{text,voice:this.opts.voice},{headers:{Authorization:'Bearer '+token},responseType:'arraybuffer',timeout:Math.max(60000,Math.round(text.length*150)),maxContentLength:40*1024*1024,proxy:false});
    const bytes=Buffer.from(response.data);if(bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WAVE')throw new Error('ZeroTTS trả về audio không hợp lệ.');
    await writeFile(wav,bytes);
    // M9 requirement 3: ZeroTTS output is loudness-normalized by default;
    // Edge/ElevenLabs keep their legacy behaviour unless voice.normalizeLoudness.
    await normalizeLoudnessMp3(wav,out);
   }catch(err:any){
    if(axios.isAxiosError(err))throw withDiagnosis('synthesis-error',`ZeroTTS local không tạo được audio`+(err.response?' (HTTP '+err.response.status+')':'')+'. Hãy thử lại hoặc nghe thử giọng khác.');
    throw err;
   }finally{await rm(wav,{force:true});}
  }
}

export function withDiagnosis(diagnosis:ZeroTtsDiagnosis,message:string):Error&{diagnosis:ZeroTtsDiagnosis}{
  const e=new Error(message) as Error&{diagnosis:ZeroTtsDiagnosis};
  e.diagnosis=diagnosis;return e;
}

/** Two-pass EBU loudness normalization (I=-16 LUFS, TP=-1.5 dBTP); falls back
 * to a single dynamic pass if the measurement JSON cannot be read. Deterministic:
 * a pure function of the input audio. */
export async function normalizeLoudnessMp3(wavIn:string,mp3Out:string){
  let measure:{measured_I:string;measured_TP:string;measured_LRA:string;measured_thresh:string;offset:string}|undefined;
  try{
    const {stderr}=await exec('ffmpeg',['-nostats','-v','info','-y','-i',wavIn,'-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-']);
    const cut=stderr.slice(stderr.lastIndexOf('{'),stderr.lastIndexOf('}')+1);
    if(cut){
      const j=JSON.parse(cut);
      if(j.input_i&&j.input_tp&&j.input_lra&&j.input_thresh)
        measure={measured_I:j.input_i,measured_TP:j.input_tp,measured_LRA:j.input_lra,measured_thresh:j.input_thresh,offset:j.target_offset||'0'};
    }
  }catch{/* single-pass fallback */}
  const args=['-v','error','-y','-i',wavIn,'-c:a','libmp3lame','-b:a','192k'];
  if(measure&&measure.offset)args.push('-af',`loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${measure.measured_I}:measured_TP=${measure.measured_TP}:measured_LRA=${measure.measured_LRA}:measured_thresh=${measure.measured_thresh}:offset=${measure.offset}:linear=true`);
  else if(measure)args.push('-af',`loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${measure.measured_I}:measured_TP=${measure.measured_TP}:measured_LRA=${measure.measured_LRA}:measured_thresh=${measure.measured_thresh}`);
  else args.push('-af','loudnorm=I=-16:TP=-1.5:LRA=11');
  args.push('-ar','44100',mp3Out);
  await exec('ffmpeg',args);
}
