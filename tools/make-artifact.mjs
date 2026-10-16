// Converts dist-single/cinderdeep.html into a page body suitable for hosting as a claude.ai
// Artifact (the host supplies <html>/<head>/<body>). Run after `npm run build:single`.
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('dist-single/cinderdeep.html', 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/i)[1]
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .replace(/<title>[\s\S]*?<\/title>/i, '')
  .replace(/<link rel="icon"[^>]*>/i, '');
const body = src.match(/<body>([\s\S]*?)<\/body>/i)[1];
const out = `<title>Cinderdeep</title>
<style>html,body{height:100%;margin:0;padding:0;overflow:hidden;background:#000;color:#ece4d4;color-scheme:dark}</style>
${head}
${body}`;
writeFileSync('dist-single/cinderdeep-artifact.html', out);
console.log('wrote dist-single/cinderdeep-artifact.html', (out.length / 1024).toFixed(0) + ' KB');
