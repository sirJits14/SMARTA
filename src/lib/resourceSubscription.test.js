import { describe, it, expect, vi } from 'vitest';
import { startResourceSubscription } from './resourceSubscription.js';
describe('resource subscription',()=>{
  it('separates loading from successful empty results and ignores callbacks after cleanup',()=>{
    let next,fail;const stopSource=vi.fn(),states=[];
    const stop=startResourceSubscription((n,f)=>{next=n;fail=f;return stopSource},s=>states.push(s),[]);
    expect(states).toEqual([{data:[],loading:true,error:null}]);
    next([]);
    expect(states.at(-1)).toEqual({data:[],loading:false,error:null});
    stop();stop();next(['late']);fail(new Error('late'));
    expect(states).toHaveLength(2);expect(stopSource).toHaveBeenCalledTimes(1);
  });
  it('clears data after failure and supports a fresh retry',()=>{
    let fail;const states=[];
    const stop=startResourceSubscription((next,f)=>{fail=f;next(['old']);return ()=>{}},s=>states.push(s),[]);
    const error=new Error('offline');fail(error);
    expect(states.at(-1)).toEqual({data:[],loading:false,error});
    stop();
    startResourceSubscription(next=>{next(['new']);return ()=>{}},s=>states.push(s),[]);
    expect(states.at(-1)).toEqual({data:['new'],loading:false,error:null});
  });
  it('reports synchronous failures',()=>{
    const error=new Error('permission');const states=[];
    const stop=startResourceSubscription(()=>{throw error},s=>states.push(s),[]);
    expect(states.at(-1)).toEqual({data:[],loading:false,error});expect(()=>stop()).not.toThrow();
  });
});
