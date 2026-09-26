import {it,expect} from 'vitest';
import { createActionRunner } from './actionRunner.js';
it('prevents duplicate writes while allowing distinct row actions',async()=>{
  const states=[];const runner=createActionRunner(s=>states.push(s));let finish,calls=0;
  const first=runner.run('save',()=>{calls++;return new Promise(resolve=>{finish=resolve})});
  expect(await runner.run('save',()=>{calls++})).toMatchObject({ok:false,busy:true});
  expect((await runner.run('other',async()=>42))).toMatchObject({ok:true,value:42});
  expect(calls).toBe(1);finish('saved');expect(await first).toMatchObject({ok:true,value:'saved'});
  expect(states.at(-1).pending).toEqual([]);
});
it('retains a recoverable error until retry succeeds',async()=>{
  const states=[];const runner=createActionRunner(s=>states.push(s));
  expect((await runner.run('save',async()=>{throw new Error('offline')})).ok).toBe(false);
  expect(states.at(-1).errors.save).toBeTruthy();
  await runner.run('save',async()=>true);
  expect(states.at(-1)).toEqual({pending:[],errors:{}});
});
