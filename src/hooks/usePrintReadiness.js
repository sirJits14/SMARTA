import { useEffect, useState } from 'react';
import { printImagesReady } from '../lib/printReadiness.js';
export function usePrintReadiness(ref, key, count) {
  const [state,setState] = useState({ key:null,count:0,ready:false });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const check = () => setState({key,count,ready:printImagesReady([...node.querySelectorAll('img')],count)});
    const observer = new MutationObserver(check);
    observer.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
    node.addEventListener('load',check,true); node.addEventListener('error',check,true); check();
    return () => {observer.disconnect();node.removeEventListener('load',check,true);node.removeEventListener('error',check,true);};
  },[ref,key,count]);
  return state.key === key && state.count === count && state.ready;
}
