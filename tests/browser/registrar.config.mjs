import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import fs from 'node:fs';import path from 'node:path';
export default defineConfig({plugins:[{name:'synthetic-preview',enforce:'pre',load(id){const p=id.replaceAll('\\','/');
if(p.endsWith('/src/hooks/useCollection.js')) return fs.readFileSync('tests/browser/registrar-fixture.js','utf8');
if(p.endsWith('/src/firebase.js')) return 'export const db={},auth={},functions={};';
if(p.includes('/src/data/')&&p.endsWith('.js')){const s=fs.readFileSync(id,'utf8');const names=[...s.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map(m=>m[1]);return names.map(n=>n==='call'?'export const call = new Proxy({}, {get:()=>async()=>({})});':n==='attendanceId'?'export const attendanceId=(s,d)=>s+"_"+d;':'export const '+n+'=async()=>({});').join('\n');}
}},react()],server:{host:'127.0.0.1',port:5187,strictPort:true},cacheDir:'node_modules/.vite-registrar-tests'});
