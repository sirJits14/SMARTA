import {it,expect} from 'vitest';
import { printImagesReady } from './printReadiness.js';
it('requires every expected QR image to be loaded successfully',()=>{
 const loaded={complete:true,naturalWidth:140};
 expect(printImagesReady([loaded],1)).toBe(true);
 expect(printImagesReady([],1)).toBe(false);
 expect(printImagesReady([],0)).toBe(false);
 expect(printImagesReady([loaded,{complete:false,naturalWidth:0}],2)).toBe(false);
 expect(printImagesReady([{complete:true,naturalWidth:0}],1)).toBe(false);
 expect(printImagesReady([loaded,loaded],1)).toBe(false);
});
