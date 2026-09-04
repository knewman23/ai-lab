const V=["the","cat","sat","on","mat","dog","ran","fast"];
const TUNED=[[0,1.6],[1.4,.8],[-1.4,.6],[-.6,-1.4],[1.2,-1],[1.6,.2],[-1.6,0],[.4,-1.6]];
const circ=(r)=>Array.from({length:8},(_,k)=>[r*Math.cos(k*Math.PI/4),r*Math.sin(k*Math.PI/4)]);
const P={tuned:TUNED,collapsed:circ(.1),spread:circ(1.8)};
const S={"cat-sat":[0,1,2,3,0],"dog-ran":[0,5,6,3,0],scrambled:[3,0,4,2,1]};
const R=t=>[[Math.cos(t),-Math.sin(t)],[Math.sin(t),Math.cos(t)]],I=[[1,0],[0,1]];
const mv=(M,v)=>[M[0][0]*v[0]+M[0][1]*v[1],M[1][0]*v[0]+M[1][1]*v[1]];
const d=(a,b)=>a[0]*b[0]+a[1]*b[1], ad=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const H=[{WQ:R(-1),WK:I,WV:I},{WQ:I,WK:I,WV:[[.8,0],[0,.8]]}];
const WO=[[.6,0,.4,0],[0,.6,0,.4]];
const W1=[[1.2,.3],[-.4,1.1],[.9,-1],[-1.1,-.5]],b1=[.1,-.2,0,.15];
const W2=[[.25,-.15,.30,.10],[.10,.35,-.20,.25]],b2=[0,0];
const PE=0.8;
function fwd(E,seq,pos=true,mask=true){
  const x=seq.map((t,p)=>pos?ad(E[t],[PE*Math.cos(p),PE*Math.sin(p)]):[...E[t]]);
  const hs=H.map(h=>{const q=x.map(v=>mv(h.WQ,v)),k=x.map(v=>mv(h.WK,v)),vv=x.map(u=>mv(h.WV,u));
    const W=[],O=[];
    for(let i=0;i<x.length;i++){const lim=mask?i:x.length-1;const s=[];
      for(let j=0;j<=lim;j++)s.push(d(q[i],k[j])/Math.SQRT2);
      const m=Math.max(...s),e=s.map(z=>Math.exp(z-m)),Z=e.reduce((a,b)=>a+b),w=e.map(z=>z/Z);W.push(w);
      let o=[0,0];for(let j=0;j<=lim;j++){o[0]+=w[j]*vv[j][0];o[1]+=w[j]*vv[j][1];}O.push(o);}
    return {W,O,q,k,v:vv};});
  const at=x.map((_,i)=>{const c=[hs[0].O[i][0],hs[0].O[i][1],hs[1].O[i][0],hs[1].O[i][1]];
    return [WO[0].reduce((a,b,n)=>a+b*c[n],0),WO[1].reduce((a,b,n)=>a+b*c[n],0)];});
  const xr=x.map((v,i)=>ad(v,at[i]));
  const ml=xr.map(v=>{const h=W1.map((r,n)=>Math.tanh(r[0]*v[0]+r[1]*v[1]+b1[n]));
    return [W2[0].reduce((a,b,n)=>a+b*h[n],0),W2[1].reduce((a,b,n)=>a+b*h[n],0)];});
  const xf=xr.map((v,i)=>ad(v,ml[i]));
  const lg=E.map(e=>d(xf[4],e));const m=Math.max(...lg),e=lg.map(z=>Math.exp(z-m)),Z=e.reduce((a,b)=>a+b);
  return {hs,at,ml,xf,p:e.map(z=>z/Z),x};
}
const top=f=>[...f.p.map((p,i)=>[p,V[i]])].sort((a,b)=>b[0]-a[0]).slice(0,3).map(t=>`${t[1]} ${t[0].toFixed(2)}`).join(", ");
console.log(`PE_SCALE=${PE}`);
console.log("\nCRIT A: collapsed + PE on -> head1 last-row argmax = 3 (previous position)");
{const r=fwd(P.collapsed,S["cat-sat"]).hs[0].W[4];console.log(`  [${r.map(v=>v.toFixed(3)).join(" ")}] argmax=${r.indexOf(Math.max(...r))} margin over 2nd=${(Math.max(...r)-[...r].sort((a,b)=>b-a)[1]).toFixed(3)}`);}
console.log("\nCRIT B: collapsed + PE OFF -> every row uniform");
{const f=fwd(P.collapsed,S["cat-sat"],false);let worst=0;
 for(const h of f.hs)h.W.forEach((r,i)=>r.forEach(w=>{worst=Math.max(worst,Math.abs(w-1/(i+1)))}));
 console.log(`  max deviation from 1/(i+1) over both heads, all rows = ${worst.toExponential(2)}`);}
console.log("\nCRIT C: tuned + PE on -> head1 last-row argmax = 1 (content beats position)");
for(const k of ["cat-sat","dog-ran","scrambled"]){const r=fwd(P.tuned,S[k]).hs[0].W[4];
  console.log(`  ${k.padEnd(10)} [${r.map(v=>v.toFixed(2)).join(" ")}] argmax=${r.indexOf(Math.max(...r))}`);}
console.log("\nCRIT D: PE off -> the@0 and the@4 have identical q,k,v in both heads");
{const f=fwd(P.tuned,S["cat-sat"],false);let ok=true;
 f.hs.forEach(h=>{["q","k","v"].forEach(f2=>{if(h[f2][0][0]!==h[f2][4][0]||h[f2][0][1]!==h[f2][4][1])ok=false;});});
 console.log("  identical:",ok);}
console.log("\nPredictions and MLP/attn ratio at each preset+sentence:");
for(const pk of ["tuned","collapsed","spread"])for(const sk of Object.keys(S)){
  const f=fwd(P[pk],S[sk]);
  console.log(`  ${pk.padEnd(10)}${sk.padEnd(11)} top3=${top(f).padEnd(34)} |mlp|/|attn|=${(Math.hypot(...f.ml[4])/Math.hypot(...f.at[4])).toFixed(2)}`);}
console.log("\nMask OFF, tuned cat-sat, head1 last row length:",fwd(P.tuned,S["cat-sat"],true,false).hs[0].W[4].length);
console.log("Glyph max length check: max |vector| across all stages/presets =",
  Math.max(...["tuned","collapsed","spread"].flatMap(pk=>Object.keys(S).flatMap(sk=>{
    const f=fwd(P[pk],S[sk]);return [...f.x,...f.at,...f.xf,...f.ml].map(v=>Math.hypot(...v));}))).toFixed(3));
