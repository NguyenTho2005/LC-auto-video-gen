import {it,expect,beforeAll,afterAll} from 'vitest';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {cachedSpeech,setAsrTimingClientForTest,clearAsrTimingClientForTest,speechFingerprint} from './voice.js';
import {loadConfig} from '../config.js';
import {buildFakeAsrResult,FakeAsrClient} from '../asr/fake-asr-client.js';
import type {AsrClient} from '../asr/types.js';

const exec=promisify(execFile);
let dir:string;
beforeAll(async()=>{
  dir=await mkdtemp(join(tmpdir(),'zero-asr-timing-'));
});
afterAll(async()=>{
  clearAsrTimingClientForTest();
  await rm(dir,{recursive:true,force:true});
});

async function fakeMp3(path:string){
  await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=1', '-c:a','libmp3lame','-b:a','128k',path]);
}

it('ZeroTTS without provider timings gets real ASR timings aligned to display text (high)',async()=>{
  const cfg=loadConfig({provider:'zerotts',voiceId:'quangminh'});
  const client={generate:async(_t:string,out:string)=>{await fakeMp3(out);}}; // returns void like ZeroTtsClient
  setAsrTimingClientForTest(new FakeAsrClient(buildFakeAsrResult('Xin chào thế giới hôm nay.')));
  const out=join(dir,'scene1.mp3');
  const res=await cachedSpeech('Xin chào thế giới hôm nay.',out,cfg,1,client as any,undefined,undefined);
  expect(res.accuracy).toBe('high');
  expect(res.words.length).toBeGreaterThan(0);
  expect(res.words[0].text).toContain('Xin');
});

it('falls back to estimated low timings when ASR is unavailable',async()=>{
  const cfg=loadConfig({provider:'zerotts',voiceId:'quangminh'});
  const client={generate:async(_t:string,out:string)=>{await fakeMp3(out);}};
  const failing:AsrClient={transcribe:async()=>{throw new Error('asr down');}};
  setAsrTimingClientForTest(failing);
  const out=join(dir,'scene2.mp3');
  const res=await cachedSpeech('Xin chào thế giới.',out,cfg,1,client as any,undefined,undefined);
  expect(res.accuracy).toBe('low');
  expect(res.words.length).toBeGreaterThan(0);
});

it('ZEROTTS_WORD_TIMING=off keeps legacy low behaviour',async()=>{
  const prev=process.env.ZEROTTS_WORD_TIMING;
  process.env.ZEROTTS_WORD_TIMING='off';
  try{
    const cfg=loadConfig({provider:'zerotts',voiceId:'quangminh'});
    const client={generate:async(_t:string,out:string)=>{await fakeMp3(out);}};
    setAsrTimingClientForTest(new FakeAsrClient(buildFakeAsrResult('Xin chào.')));
    const out=join(dir,'scene3.mp3');
    const res=await cachedSpeech('Xin chào.',out,cfg,1,client as any,undefined,undefined);
    expect(res.accuracy).toBe('low');
  }finally{
    if(prev===undefined) delete process.env.ZEROTTS_WORD_TIMING; else process.env.ZEROTTS_WORD_TIMING=prev;
  }
});

it('cache fingerprint changes with normalizeLoudness flag',()=>{
  const a=loadConfig({provider:'edge-tts',voiceId:'vi-VN-NamMinhNeural'});
  const b={...a, normalizeLoudness:true};
  expect(speechFingerprint('Xin chào',a,1)).not.toBe(speechFingerprint('Xin chào',b,1));
  const z=loadConfig({provider:'zerotts',voiceId:'quangminh'});
  expect(speechFingerprint('Xin chào',z,1)).toBeDefined();
});
