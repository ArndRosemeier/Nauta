import { chromium } from 'playwright';
const flags = process.argv[2].split(' ');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: flags });
const p = await b.newPage();
p.on('console', m => console.log('[c]', m.text().slice(0,200)));
await p.goto('about:blank');
const r = await p.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); if (!a) return 'no adapter'; const d = await a.requestDevice(); return (a.info?.vendor||'') + ' ' + (a.info?.architecture||'') + ' ok ' + !!d; });
console.log(r); await b.close();
