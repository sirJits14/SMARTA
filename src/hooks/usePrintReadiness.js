import { useLayoutEffect, useState } from 'react';
import { printImagesReady } from '../lib/printReadiness.js';
export function usePrintReadiness(ref, key, count) {
  const [state,setState] = useState({ key:null,count:0,node:null,ready:false });
  // Resource recovery can replace the DOM without changing key/count.
  // Check each committed node before exposing print controls.
  useLayoutEffect(() => {
    const node = ref.current;
    const check = () => {
      const ready = !!node && printImagesReady([...node.querySelectorAll('img')],count);
      setState(previous => previous.node === node && previous.key === key && previous.count === count && previous.ready === ready
        ? previous : {node,key,count,ready});
    };
    check();
    if (!node) return;
    const observer = new MutationObserver(check);
    observer.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
    node.addEventListener('load',check,true); node.addEventListener('error',check,true);
    return () => {observer.disconnect();node.removeEventListener('load',check,true);node.removeEventListener('error',check,true);};
  });
  return state.node === ref.current && state.key === key && state.count === count && state.ready;
}
