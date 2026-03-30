import { useState, useMemo, useRef } from "react";

// ── Formatters ─────────────────────────────────────────────────────────────
const fmt  = (n,d=0) => isNaN(n)||!isFinite(n) ? "—" : n.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtD = (n,d=0) => isNaN(n)||!isFinite(n) ? "—" : `$${fmt(n,d)}`;
const fmtP = (n,d=1) => isNaN(n)||!isFinite(n) ? "—" : `${fmt(n,d)}%`;
const clr  = v => v>20?"green":v>10?"yellow":"red";
const COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899"];

// ── Defaults ───────────────────────────────────────────────────────────────
const DEFAULT_PHASE = i => ({
  name:`Phase ${i+1}`, landPrice:5000000, acres:10, closingPct:1.5, buyBrokerPct:3,
  dd:15000, env:10000, surveys:6000, legal:8000,
  lots:24, devMonths:12, holdingMo:3000,
  engineering:4500, grading:3200, utilities:8500, roads:6000, landscape:1200,
  offSite:160000, entitle:40000, permits:3500, ae:30000, pmPct:5, contPct:10,
  avgPrice:95000, absorptionMo:6, premPct:15, premAmt:15000,
  sellBrokerPct:5, mktg:20000, sellerClosingPct:1,
  equityPct:30, rate:8.5, loanMonths:24, origPct:1.5, exitPct:0.5, discountRate:12,
  startMonth:i*6, prefReturn:8, lpSplit:80, gpSplit:20, promote1:70, promote1Hurdle:15, promote2:60,
});

const DEFAULT_SALE = { enabled:false, month:24, price:0, brokerPct:2, closingPct:1 };

// ── Calculations ───────────────────────────────────────────────────────────
function calcPhase(p, allocatedLandCost) {
  const lc = allocatedLandCost !== undefined ? allocatedLandCost : p.landPrice;
  const cA = lc*p.closingPct/100, bB = lc*p.buyBrokerPct/100;
  const tAcq = lc+cA+p.dd+p.env+p.surveys+p.legal+bB;
  const hPL = p.engineering+p.grading+p.utilities+p.roads+p.landscape;
  const hT = hPL*p.lots+p.offSite, sB = p.entitle+p.permits*p.lots+p.ae;
  const hold = p.holdingMo*p.devMonths, dSub = hT+sB+hold;
  const pm = dSub*p.pmPct/100, cont = (dSub+pm)*p.contPct/100, tDev = dSub+pm+cont;
  const tCost = tAcq+tDev;
  const pL = Math.round(p.lots*p.premPct/100), sL = p.lots-pL;
  const gR = sL*p.avgPrice+pL*(p.avgPrice+p.premAmt);
  const sC = gR*(p.sellBrokerPct+p.sellerClosingPct)/100+p.mktg;
  const nR = gR-sC, nP = nR-tCost, marg = nP/gR*100, roi = nP/tCost*100;
  const dPct = 100-p.equityPct, debt = tCost*dPct/100, eq = tCost*p.equityPct/100;
  const fC = debt*p.origPct/100+debt*p.exitPct/100+debt*p.rate/100*p.loanMonths/12;
  const lP = nP-fC, eM = eq>0?(eq+lP)/eq:0;
  const sM = Math.ceil(p.lots/p.absorptionMo), tM = p.devMonths+sM, yrs = tM/12;
  const uIRR = (Math.pow(Math.max(0.001,nR/tCost),1/yrs)-1)*100;
  const lIRR = eq>0?(Math.pow(Math.max(0.001,(eq+lP)/eq),1/yrs)-1)*100:0;
  const npv = nR/Math.pow(1+p.discountRate/100,yrs)-tCost;
  const tRet=eq+lP, pref=eq*(p.prefReturn/100)*yrs, aP=Math.max(0,tRet-eq-pref);
  const aR = eq>0?(Math.pow(Math.max(0.001,tRet/eq),1/yrs)-1)*100:0;
  let lpD=0,gpD=0;
  if(aR<=p.prefReturn){lpD=tRet*(p.lpSplit/100);gpD=tRet*(p.gpSplit/100);}
  else if(aR<=p.promote1Hurdle){lpD=eq*(p.lpSplit/100)+pref*(p.lpSplit/100)+aP*(p.promote1/100);gpD=eq*(p.gpSplit/100)+pref*(p.gpSplit/100)+aP*(1-p.promote1/100);}
  else{lpD=eq*(p.lpSplit/100)+pref*(p.lpSplit/100)+aP*(p.promote2/100);gpD=eq*(p.gpSplit/100)+pref*(p.gpSplit/100)+aP*(1-p.promote2/100);}
  const monthly=[];
  for(let m=0;m<tM;m++){
    let co=0,ri=0;
    if(m===0)co+=tAcq;
    if(m<p.devMonths)co+=tDev/p.devMonths;
    if(m>=p.devMonths){const lts=Math.min(p.absorptionMo,p.lots-(m-p.devMonths)*p.absorptionMo);if(lts>0){const pt=Math.round(lts*p.premPct/100);ri=(lts-pt)*p.avgPrice*(1-(p.sellBrokerPct+p.sellerClosingPct)/100)+pt*(p.avgPrice+p.premAmt)*(1-(p.sellBrokerPct+p.sellerClosingPct)/100)-p.mktg/sM;}}
    const net=ri-co;monthly.push({month:m+1,costOut:co,revIn:ri,net,cumNet:(monthly[m-1]?.cumNet||0)+net});
  }
  return {tAcq,landCost:lc,cA,bB,hPL,hT,sB,hold,pm,cont,tDev,tCost,pL,sL,gR,sC,nR,nP,marg,roi,
    dPct,debt,equity:eq,fC,lP,levRoi:eq>0?lP/eq*100:0,eM,sM,tM,yrs,uIRR,lIRR,npv,
    tRet,pref,aP,aR,lpD,gpD,monthly,cPL:tCost/p.lots,rPL:gR/p.lots};
}

// ── Tiny UI atoms ──────────────────────────────────────────────────────────
function Inp({label,value,onChange,prefix,suffix,step="1",note}){
  return(
    <div style={{marginBottom:6}}>
      <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:2}}>{label}{note&&<span style={{color:"var(--color-text-tertiary)",fontStyle:"italic",marginLeft:4}}>({note})</span>}</div>
      <div style={{display:"flex",alignItems:"center",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",padding:"5px 8px"}}>
        {prefix&&<span style={{color:"var(--color-text-tertiary)",marginRight:4,fontSize:12}}>{prefix}</span>}
        <input type="number" step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value)||0)}
          style={{background:"transparent",color:"var(--color-text-primary)",width:"100%",fontSize:12,outline:"none",border:"none"}}/>
        {suffix&&<span style={{color:"var(--color-text-tertiary)",marginLeft:4,fontSize:11}}>{suffix}</span>}
      </div>
    </div>
  );
}
function Sec({title,children}){return(<div style={{marginBottom:14}}><div style={{fontSize:10,fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--color-text-tertiary)",borderBottom:"0.5px solid var(--color-border-tertiary)",paddingBottom:3,marginBottom:7}}>{title}</div>{children}</div>);}
function SumRow({label,value,hi,sub,indent}){return(<div style={{display:"flex",justifyContent:"space-between",padding:"4px 8px",borderRadius:4,marginBottom:1,background:hi?"rgba(59,130,246,0.15)":sub?"transparent":"var(--color-background-secondary)",marginLeft:indent?12:0,fontWeight:hi?500:400}}><span style={{fontSize:11,color:sub?"var(--color-text-tertiary)":"var(--color-text-secondary)"}}>{label}</span><span style={{fontSize:11,color:hi?"#60a5fa":"var(--color-text-primary)"}}>{value}</span></div>);}
function KPI({label,value,sub,color="blue",sm}){
  const b={blue:"#3b82f6",green:"#10b981",yellow:"#f59e0b",red:"#ef4444"}[color];
  const t={blue:"#60a5fa",green:"#34d399",yellow:"#fbbf24",red:"#f87171"}[color];
  return(<div style={{background:"var(--color-background-secondary)",borderLeft:`3px solid ${b}`,borderRadius:6,padding:"9px 11px"}}><div style={{fontSize:sm?15:21,fontWeight:500,color:t,lineHeight:1.2}}>{value}</div><div style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:2}}>{label}</div>{sub&&<div style={{fontSize:9,color:"var(--color-text-tertiary)"}}>{sub}</div>}</div>);
}
function PhaseBar({phases,calcs,metric,fmt2,title}){
  const vals=phases.map((_,i)=>metric(calcs[i])),max=Math.max(...vals.map(Math.abs),1);
  return(<div style={{background:"var(--color-background-secondary)",borderRadius:10,padding:14}}><div style={{fontSize:12,fontWeight:500,color:"var(--color-text-primary)",marginBottom:10}}>{title}</div>{phases.map((p,i)=>{const v=vals[i],w=Math.abs(v)/max*88,neg=v<0;return(<div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}><div style={{fontSize:10,color:"var(--color-text-secondary)",width:58,textAlign:"right",flexShrink:0}}>{p.name}</div><div style={{flex:1,background:"var(--color-background-primary)",borderRadius:3,height:16,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,width:`${w}%`,background:neg?"#ef4444":COLORS[i]+"cc"}}/></div><div style={{fontSize:10,fontWeight:500,width:76,textAlign:"right",flexShrink:0,color:neg?"#f87171":COLORS[i]}}>{fmt2(v)}</div></div>);})}</div>);
}

// ── Export CSV (text modal) ────────────────────────────────────────────────
function makeCSV(rows){
  const esc=v=>{const s=String(v??"");return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s;};
  return rows.map(r=>r.map(esc).join(",")).join("\n");
}
function ExportModal({title,content,onClose}){
  const ta=useRef();
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-secondary)",borderRadius:12,padding:20,width:"min(580px,92vw)",boxSizing:"border-box"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div>
            <div style={{fontSize:14,fontWeight:500,color:"var(--color-text-primary)"}}>{title}</div>
            <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:2}}>Click inside → Ctrl+A → Ctrl+C to copy. Paste into Notepad, save as .csv or .json.</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--color-text-tertiary)",lineHeight:1}}>×</button>
        </div>
        <textarea ref={ta} readOnly value={content} onClick={e=>e.target.select()}
          style={{width:"100%",height:260,fontSize:10,fontFamily:"monospace",background:"var(--color-background-secondary)",color:"var(--color-text-primary)",border:"1px solid var(--color-border-secondary)",borderRadius:6,padding:8,resize:"vertical",boxSizing:"border-box",outline:"none",display:"block"}}/>
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
          <button onClick={onClose} style={{padding:"6px 18px",borderRadius:6,fontSize:12,fontWeight:500,cursor:"pointer",background:"var(--color-background-secondary)",color:"var(--color-text-primary)",border:"1px solid var(--color-border-secondary)"}}>Close</button>
        </div>
      </div>
    </div>
  );
}
function ExpBtn({label,getContent,filename}){
  const [modal,setModal]=useState(false);
  const [content,setContent]=useState("");
  return(<>
    <button onClick={()=>{setContent(getContent());setModal(true);}} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:500,cursor:"pointer",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",color:"var(--color-text-primary)"}}>
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="4" y="1" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2 4v10a1 1 0 001 1h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
      {label}
    </button>
    {modal&&<ExportModal title={filename} content={content} onClose={()=>setModal(false)}/>}
  </>);
}

// ── Save / Load ────────────────────────────────────────────────────────────
function SaveLoad({phases,onLoad}){
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState("menu"); // menu | viewjson | pastejson
  const [name,setName]=useState("");
  const [saves,setSaves]=useState([]);
  const [jsonTxt,setJsonTxt]=useState("");
  const [pasteTxt,setPasteTxt]=useState("");
  const [toast,setToast]=useState(null);
  const fileRef=useRef();

  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(null),2500);};
  const close=()=>{setOpen(false);setMode("menu");};

  function doSave(){
    const n=name.trim()||`Save ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`;
    setSaves(p=>[...p,{id:Date.now(),name:n,data:JSON.parse(JSON.stringify(phases))}]);
    setName(""); showToast(`Saved "${n}"`);
  }
  function doLoad(entry){onLoad(entry.data.map((p,i)=>({...DEFAULT_PHASE(i),...p})));close();showToast(`Loaded "${entry.name}"`);}
  function openJSON(){setJsonTxt(JSON.stringify({v:1,name:name.trim()||"model",phases},null,2));setMode("viewjson");}
  function doPaste(){
    try{const d=JSON.parse(pasteTxt);if(!d.phases)throw 0;onLoad(d.phases.map((p,i)=>({...DEFAULT_PHASE(i),...p})));close();showToast("Imported!");}
    catch{showToast("Invalid JSON");}
  }
  function onFile(e){
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(!d.phases)throw 0;onLoad(d.phases.map((p,i)=>({...DEFAULT_PHASE(i),...p})));close();showToast(`Loaded "${f.name}"`);}catch{showToast("Invalid file");}};
    r.readAsText(f);e.target.value="";
  }

  const bS=(acc)=>({display:"block",width:"100%",padding:"9px 14px",marginBottom:6,borderRadius:6,fontSize:13,fontWeight:500,cursor:"pointer",textAlign:"left",boxSizing:"border-box",background:acc?"#2563eb":"var(--color-background-secondary)",color:acc?"white":"var(--color-text-primary)",border:acc?"none":"1px solid var(--color-border-secondary)"});

  return(
    <>
      <input ref={fileRef} type="file" accept=".json" onChange={onFile} style={{display:"none"}}/>
      {toast&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"#1e293b",color:"white",padding:"9px 18px",borderRadius:8,fontSize:13,fontWeight:500,zIndex:99999,pointerEvents:"none",whiteSpace:"nowrap"}}>{toast}</div>}

      <button onClick={()=>{setOpen(true);setMode("menu");}} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:500,cursor:"pointer",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",color:"var(--color-text-primary)"}}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 2v4h6V2M5 9h6M5 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        Save / Load
      </button>

      {open&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={close}>
          <div style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-secondary)",borderRadius:12,padding:22,width:340,boxSizing:"border-box",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{fontSize:15,fontWeight:500,color:"var(--color-text-primary)"}}>
                {mode==="menu"?"Save / Load":mode==="viewjson"?"View / Copy JSON":"Paste JSON to Import"}
              </span>
              <button onClick={close} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--color-text-tertiary)",lineHeight:1}}>×</button>
            </div>

            {mode==="menu"&&<>
              <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:4}}>Save name (optional)</div>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Oakwood Estates v1" onKeyDown={e=>e.key==="Enter"&&doSave()}
                style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",fontSize:13,background:"var(--color-background-secondary)",color:"var(--color-text-primary)",border:"1px solid var(--color-border-secondary)",borderRadius:6,outline:"none",marginBottom:12}}/>
              <button onClick={doSave}                  style={bS(true)}>💾  Save to session</button>
              <button onClick={openJSON}                style={bS(false)}>📄  View / copy JSON</button>
              <button onClick={()=>setMode("pastejson")} style={bS(false)}>📋  Paste JSON to import</button>
              <button onClick={()=>fileRef.current.click()} style={bS(false)}>📂  Load from .json file</button>
              {saves.length>0&&<>
                <div style={{borderTop:"1px solid var(--color-border-tertiary)",marginTop:12,paddingTop:12}}>
                  <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:8}}>Session saves ({saves.length})</div>
                  {[...saves].reverse().map(s=>(
                    <div key={s.id} onClick={()=>doLoad(s)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",marginBottom:4,borderRadius:6,cursor:"pointer",border:"1px solid var(--color-border-tertiary)",background:"var(--color-background-secondary)"}}>
                      <div><div style={{fontSize:12,fontWeight:500,color:"var(--color-text-primary)"}}>{s.name}</div></div>
                      <div style={{display:"flex",gap:10,alignItems:"center"}}>
                        <span style={{fontSize:11,color:"#60a5fa"}}>Load</span>
                        <span onClick={e=>{e.stopPropagation();setSaves(p=>p.filter(x=>x.id!==s.id));}} style={{fontSize:18,color:"var(--color-text-tertiary)",cursor:"pointer",lineHeight:1}}>×</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>}
              <div style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:10,lineHeight:1.5}}>Session saves clear on page close. Use <em>View / copy JSON</em> to keep permanently.</div>
            </>}

            {mode==="viewjson"&&<>
              <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:8,lineHeight:1.6}}>Click the box → <strong>Ctrl+A</strong> → <strong>Ctrl+C</strong> to copy. Paste into Notepad, save as <em>.json</em>.</div>
              <textarea readOnly value={jsonTxt} onClick={e=>e.target.select()}
                style={{width:"100%",height:220,fontSize:10,fontFamily:"monospace",background:"var(--color-background-secondary)",color:"var(--color-text-primary)",border:"1px solid var(--color-border-secondary)",borderRadius:6,padding:8,resize:"none",boxSizing:"border-box",outline:"none",display:"block",marginBottom:8}}/>
              <button onClick={()=>setMode("menu")} style={bS(false)}>← Back</button>
            </>}

            {mode==="pastejson"&&<>
              <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:8}}>Paste your saved JSON below and click Import.</div>
              <textarea value={pasteTxt} onChange={e=>setPasteTxt(e.target.value)} placeholder="Paste JSON here…"
                style={{width:"100%",height:220,fontSize:10,fontFamily:"monospace",background:"var(--color-background-secondary)",color:"var(--color-text-primary)",border:"1px solid var(--color-border-secondary)",borderRadius:6,padding:8,resize:"none",boxSizing:"border-box",outline:"none",display:"block",marginBottom:8}}/>
              <button onClick={doPaste}                          style={bS(true)}>Import</button>
              <button onClick={()=>{setMode("menu");setPasteTxt("");}} style={bS(false)}>← Back</button>
            </>}

          </div>
        </div>
      )}
    </>
  );
}

// ── Gantt ──────────────────────────────────────────────────────────────────
function Gantt({phases,calcs}){
  const maxM=Math.max(...phases.map((p,i)=>p.startMonth+calcs[i].tM));
  const months=Array.from({length:maxM},(_,i)=>i+1);
  return(
    <div style={{overflowX:"auto"}}>
      <div style={{minWidth:Math.max(700,maxM*26+150)}}>
        <div style={{display:"grid",gridTemplateColumns:`130px repeat(${maxM},1fr)`,marginBottom:4}}>
          <div style={{fontSize:10,color:"var(--color-text-tertiary)",padding:"3px 6px"}}>Phase</div>
          {months.map(m=><div key={m} style={{fontSize:8,color:"var(--color-text-tertiary)",textAlign:"center",borderLeft:m%3===1?"0.5px solid var(--color-border-tertiary)":"none",paddingTop:1}}>{m%3===1?`Q${Math.ceil(m/3)}`:""}</div>)}
        </div>
        {phases.map((ph,i)=>{
          const c=calcs[i],st=ph.startMonth,dE=st+ph.devMonths,tE=st+c.tM;
          return(<div key={i} style={{marginBottom:5}}>
            <div style={{display:"grid",gridTemplateColumns:`130px repeat(${maxM},1fr)`,alignItems:"center"}}>
              <div style={{fontSize:11,fontWeight:500,padding:"0 6px",display:"flex",alignItems:"center",gap:5,color:"var(--color-text-primary)"}}><div style={{width:9,height:9,borderRadius:2,background:COLORS[i],flexShrink:0}}/>{ph.name}</div>
              {months.map(m=>{const iD=m>st&&m<=dE,iS=m>dE&&m<=tE,fi=m===st+1,la=m===tE;return(<div key={m} style={{height:26,position:"relative"}}>
                {iD&&<div style={{position:"absolute",inset:"3px 0",background:COLORS[i]+"99",borderRadius:fi?"4px 0 0 4px":m===dE?"0 4px 4px 0":"0",borderLeft:fi?`2px solid ${COLORS[i]}`:"none"}}/>}
                {iS&&<div style={{position:"absolute",inset:"3px 0",background:COLORS[i]+"40",borderRadius:la?"0 4px 4px 0":"0",borderRight:la?`2px solid ${COLORS[i]}`:"none",borderTop:`1px dashed ${COLORS[i]}80`,borderBottom:`1px dashed ${COLORS[i]}80`}}/>}
              </div>);})}
            </div>
          </div>);
        })}
        <div style={{display:"flex",gap:14,marginTop:14,paddingLeft:134}}>
          {[["#3b82f699","Development"],["#3b82f640","Sales / Absorption"]].map(([c,l])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"var(--color-text-secondary)"}}><div style={{width:20,height:8,borderRadius:2,background:c}}/>{l}</div>
          ))}
        </div>
        <div style={{marginTop:12,background:"var(--color-background-secondary)",borderRadius:8,padding:"10px 14px",display:"flex",flexWrap:"wrap",gap:20}}>
          {phases.map((ph,i)=><div key={i} style={{fontSize:11}}><span style={{color:COLORS[i],fontWeight:500}}>{ph.name}: </span><span style={{color:"var(--color-text-secondary)"}}>Mo {ph.startMonth+1}–{ph.startMonth+calcs[i].tM} ({calcs[i].tM} mo)</span></div>)}
          <div style={{fontSize:11,marginLeft:"auto"}}><span style={{color:"var(--color-text-secondary)"}}>Total span: </span><span style={{color:"var(--color-text-primary)",fontWeight:500}}>{maxM} mo ({(maxM/12).toFixed(1)} yrs)</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Cash Flow ──────────────────────────────────────────────────────────────
function CashFlow({phases,calcs,portMonthly}){
  const [scope,setScope]=useState("portfolio");
  const rows=scope==="portfolio"?portMonthly:calcs[parseInt(scope)].monthly;
  const peak=Math.min(...rows.map(r=>r.cumNet));
  const be=rows.findIndex(r=>r.cumNet>=0);
  const mA=Math.max(...rows.map(r=>Math.max(Math.abs(r.costOut),Math.abs(r.revIn))),1);
  const mC=Math.max(...rows.map(r=>Math.abs(r.cumNet)),1);
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {[["portfolio","All Phases"],...phases.map((ph,i)=>[String(i),ph.name])].map(([v,l],i)=>(
          <button key={v} onClick={()=>setScope(v)} style={{padding:"4px 11px",borderRadius:20,fontSize:11,fontWeight:500,border:`1px solid ${scope===v?COLORS[Math.max(0,i-1)]:"var(--color-border-secondary)"}`,background:scope===v?COLORS[Math.max(0,i-1)]+"33":"transparent",color:scope===v?COLORS[Math.max(0,i-1)]:"var(--color-text-secondary)",cursor:"pointer"}}>{l}</button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:14}}>
        <KPI label="Peak Equity Drawn" value={fmtD(Math.abs(peak))} color="red" sm/>
        <KPI label="Breakeven Month" value={be>=0?`Mo ${rows[be].month}`:"—"} color="yellow" sm/>
        <KPI label="Final Net Cash" value={fmtD(rows[rows.length-1]?.cumNet||0)} color="green" sm/>
        <KPI label="Total Revenue" value={fmtD(rows.reduce((s,r)=>s+r.revIn,0))} color="blue" sm/>
      </div>
      <div style={{overflowX:"auto",marginBottom:14}}>
        <div style={{minWidth:Math.max(500,rows.length*20),height:180,position:"relative"}}>
          <div style={{position:"absolute",bottom:"38%",left:0,right:0,borderTop:"0.5px solid var(--color-border-secondary)"}}/>
          <div style={{display:"flex",alignItems:"flex-end",height:"100%",gap:1,paddingBottom:16}}>
            {rows.map((r,i)=>{const iH=r.revIn/mA*76,oH=r.costOut/mA*76,nH=Math.abs(r.cumNet)/mC*32,nP=r.cumNet>=0;return(
              <div key={i} style={{flex:1,position:"relative",height:"100%"}}>
                <div style={{position:"absolute",bottom:"16px",width:"100%",display:"flex",justifyContent:"center",alignItems:"flex-end",height:"76%"}}><div style={{width:"42%",height:`${iH}%`,background:"#10b98155",borderRadius:"2px 2px 0 0",minHeight:iH>0?1:0}}/></div>
                <div style={{position:"absolute",bottom:"16px",width:"100%",display:"flex",justifyContent:"flex-end",paddingRight:"5%",alignItems:"flex-end",height:"76%"}}><div style={{width:"42%",height:`${oH}%`,background:"#ef444455",borderRadius:"2px 2px 0 0",minHeight:oH>0?1:0}}/></div>
                <div style={{position:"absolute",bottom:`calc(16px + 38%)`,width:"80%",marginLeft:"10%",height:`${nH}%`,background:nP?"#10b98188":"#ef444488",transform:nP?"translateY(-100%)":"none",borderRadius:2,minHeight:1}}/>
                <div style={{position:"absolute",bottom:2,fontSize:7,color:"var(--color-text-tertiary)",textAlign:"center",width:"100%"}}>{(i+1)%6===0?`M${i+1}`:""}</div>
              </div>
            );})}
          </div>
        </div>
      </div>
      <div style={{overflowX:"auto",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:"var(--color-background-secondary)"}}>
            {["Month","Cost Out","Revenue In","Net CF","Cumulative"].map(h=><th key={h} style={{padding:"5px 9px",textAlign:"right",color:"var(--color-text-secondary)",fontWeight:500,borderBottom:"0.5px solid var(--color-border-tertiary)"}}>{h}</th>)}
          </tr></thead>
          <tbody>{rows.map((r,i)=>(
            <tr key={i} style={{background:i%2===0?"var(--color-background-secondary)":"transparent"}}>
              <td style={{padding:"3px 9px",textAlign:"right",color:"var(--color-text-secondary)"}}>{r.month}</td>
              <td style={{padding:"3px 9px",textAlign:"right",color:"#f87171"}}>{fmtD(r.costOut)}</td>
              <td style={{padding:"3px 9px",textAlign:"right",color:"#34d399"}}>{fmtD(r.revIn)}</td>
              <td style={{padding:"3px 9px",textAlign:"right",color:r.net>=0?"#34d399":"#f87171",fontWeight:500}}>{fmtD(r.net)}</td>
              <td style={{padding:"3px 9px",textAlign:"right",color:r.cumNet>=0?"#34d399":"#f87171",fontWeight:500}}>{fmtD(r.cumNet)}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr style={{background:"rgba(59,130,246,0.1)",fontWeight:500}}>
            <td style={{padding:"5px 9px",color:"var(--color-text-primary)"}}>Total</td>
            <td style={{padding:"5px 9px",textAlign:"right",color:"#f87171"}}>{fmtD(rows.reduce((s,r)=>s+r.costOut,0))}</td>
            <td style={{padding:"5px 9px",textAlign:"right",color:"#34d399"}}>{fmtD(rows.reduce((s,r)=>s+r.revIn,0))}</td>
            <td style={{padding:"5px 9px",textAlign:"right",color:"var(--color-text-primary)"}}>{fmtD(rows.reduce((s,r)=>s+r.net,0))}</td>
            <td style={{padding:"5px 9px",textAlign:"right",color:rows[rows.length-1]?.cumNet>=0?"#34d399":"#f87171"}}>{fmtD(rows[rows.length-1]?.cumNet||0)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Waterfall ──────────────────────────────────────────────────────────────
function Waterfall({phases,calcs,setField}){
  const [pi,setPi]=useState(0);
  const p=phases[pi],c=calcs[pi];
  const shades=["#1d4ed8","#2563eb","#3b82f6","#10b981","#059669","#047857"];
  const stages=[
    {l:"LP return of capital",v:c.equity*(p.lpSplit/100)},
    {l:"GP return of capital",v:c.equity*(p.gpSplit/100)},
    {l:"LP pref return",v:c.pref*(p.lpSplit/100)},
    {l:"GP pref return",v:c.pref*(p.gpSplit/100)},
    {l:"LP promote",v:c.aR>p.prefReturn?c.aP*(p.promote1/100):0},
    {l:"GP promote",v:c.aR>p.prefReturn?c.aP*(1-p.promote1/100):0},
  ].filter(s=>s.v>0);
  const tot=c.lpD+c.gpD;
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {phases.map((ph,i)=><button key={i} onClick={()=>setPi(i)} style={{padding:"4px 11px",borderRadius:20,fontSize:11,fontWeight:500,border:`1px solid ${pi===i?COLORS[i]:"var(--color-border-secondary)"}`,background:pi===i?COLORS[i]+"33":"transparent",color:pi===i?COLORS[i]:"var(--color-text-secondary)",cursor:"pointer"}}>{ph.name}</button>)}
      </div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:"0 0 210px"}}>
          <div style={{background:"var(--color-background-secondary)",borderRadius:10,padding:14}}>
            <div style={{fontSize:12,fontWeight:500,marginBottom:10,color:COLORS[pi]}}>Structure — {p.name}</div>
            <Sec title="Capital Split">
              <Inp label="LP Split %" value={p.lpSplit} onChange={v=>{setField(pi,"lpSplit",v);setField(pi,"gpSplit",100-v);}} suffix="%"/>
              <div style={{fontSize:11,color:"var(--color-text-tertiary)",paddingLeft:4}}>GP Split: {100-p.lpSplit}%</div>
            </Sec>
            <Sec title="Preferred Return">
              <Inp label="Pref Rate" value={p.prefReturn} onChange={v=>setField(pi,"prefReturn",v)} suffix="% p.a." step="0.5"/>
            </Sec>
            <Sec title="Promote Tiers">
              <Inp label="LP % (Tier 1)" value={p.promote1} onChange={v=>setField(pi,"promote1",v)} suffix="%" step="1"/>
              <Inp label="T1 IRR Hurdle" value={p.promote1Hurdle} onChange={v=>setField(pi,"promote1Hurdle",v)} suffix="%" step="0.5"/>
              <Inp label="LP % (Tier 2)" value={p.promote2} onChange={v=>setField(pi,"promote2",v)} suffix="%" step="1"/>
            </Sec>
          </div>
        </div>
        <div style={{flex:"1 1 280px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:7,marginBottom:12}}>
            <KPI label="Total Return" value={fmtD(c.tRet)} color="blue" sm/>
            <KPI label="Ann. Return" value={fmtP(c.aR)} color={clr(c.aR)} sm/>
            <KPI label="LP Distribution" value={fmtD(c.lpD)} color="green" sm/>
            <KPI label="GP Distribution" value={fmtD(c.gpD)} color="yellow" sm/>
          </div>
          <div style={{background:"var(--color-background-secondary)",borderRadius:10,padding:14,marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:500,marginBottom:10}}>Distribution waterfall</div>
            <div style={{display:"flex",gap:3,height:36,borderRadius:6,overflow:"hidden",marginBottom:10}}>
              {stages.map((s,i)=>{const w=s.v/Math.max(tot,1)*100;return w>0.5?<div key={i} title={`${s.l}: ${fmtD(s.v)}`} style={{width:`${w}%`,background:shades[i],display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}><span style={{fontSize:8,color:"white",whiteSpace:"nowrap"}}>{w>8?fmtD(s.v/1e3)+"k":""}</span></div>:null;})}
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {stages.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--color-text-secondary)"}}><div style={{width:9,height:9,borderRadius:2,background:shades[i]}}/>{s.l}</div>)}
            </div>
          </div>
          <div style={{borderRadius:8,border:"0.5px solid var(--color-border-tertiary)",overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:"var(--color-background-secondary)"}}>
                {["Tier","LP","GP","Total"].map(h=><th key={h} style={{padding:"5px 9px",textAlign:h==="Tier"?"left":"right",color:"var(--color-text-secondary)",fontWeight:500,borderBottom:"0.5px solid var(--color-border-tertiary)"}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {[
                  {l:"Return of capital",lp:fmtD(c.equity*(p.lpSplit/100)),gp:fmtD(c.equity*(p.gpSplit/100)),t:fmtD(c.equity)},
                  {l:`Pref (${p.prefReturn}% p.a.)`,lp:fmtD(c.pref*(p.lpSplit/100)),gp:fmtD(c.pref*(p.gpSplit/100)),t:fmtD(c.pref)},
                  {l:`Promote (T1 ${p.promote1}/${100-p.promote1})`,lp:fmtD(c.aR>p.prefReturn?c.aP*p.promote1/100:0),gp:fmtD(c.aR>p.prefReturn?c.aP*(1-p.promote1/100):0),t:fmtD(c.aR>p.prefReturn?c.aP:0)},
                  {l:"Total distributions",lp:fmtD(c.lpD),gp:fmtD(c.gpD),t:fmtD(c.lpD+c.gpD),b:true},
                  {l:"Multiple",lp:`${(c.equity*(p.lpSplit/100))>0?(c.lpD/(c.equity*(p.lpSplit/100))).toFixed(2):0}x`,gp:`${(c.equity*(p.gpSplit/100))>0?(c.gpD/(c.equity*(p.gpSplit/100))).toFixed(2):0}x`,t:""},
                ].map((r,i)=><tr key={i} style={{background:r.b?"rgba(59,130,246,0.1)":i%2===0?"var(--color-background-secondary)":"transparent"}}>
                  <td style={{padding:"4px 9px",color:"var(--color-text-primary)",fontWeight:r.b?500:400}}>{r.l}</td>
                  <td style={{padding:"4px 9px",textAlign:"right",color:"#60a5fa"}}>{r.lp}</td>
                  <td style={{padding:"4px 9px",textAlign:"right",color:"#fbbf24"}}>{r.gp}</td>
                  <td style={{padding:"4px 9px",textAlign:"right",color:"var(--color-text-primary)",fontWeight:r.b?500:400}}>{r.t}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Phase Inputs ───────────────────────────────────────────────────────────
function PhaseInputs({p,pi,c,tA,setField}){
  const [tab,setTab]=useState("Acquisition");
  const tabs=["Acquisition","Development","Revenue","Financing"];
  return(
    <div style={{background:"var(--color-background-primary)",borderRadius:10,border:"0.5px solid var(--color-border-tertiary)",overflow:"hidden"}}>
      <div style={{display:"flex",borderBottom:"0.5px solid var(--color-border-tertiary)",overflowX:"auto"}}>
        {tabs.map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"7px 13px",fontSize:11,fontWeight:500,whiteSpace:"nowrap",background:tab===t?COLORS[pi]:"transparent",color:tab===t?"white":"var(--color-text-secondary)",border:"none",cursor:"pointer"}}>{t}</button>)}
      </div>
      <div style={{padding:14,overflowY:"auto",maxHeight:480}}>
        {tab==="Acquisition"&&<>
          <Sec title="Purchase">
            {pi===0
              ? <Inp label="Land Purchase Price" value={p.landPrice} onChange={v=>setField(0,"landPrice",v)} prefix="$" note="full acquisition cost applied to Phase 1"/>
              : <div style={{padding:"6px 8px",background:"var(--color-background-secondary)",borderRadius:6,fontSize:11,color:"var(--color-text-secondary)",marginBottom:6}}>Land acquisition cost is applied in full to Phase 1. No land cost allocated to this phase.</div>
            }
            <Inp label="Acres (this phase)" value={p.acres} onChange={v=>setField(pi,"acres",v)} step="0.1"/>
            <Inp label="Closing Costs" value={p.closingPct} onChange={v=>setField(pi,"closingPct",v)} suffix="%" step="0.1"/>
            <Inp label="Buyer Broker Fee" value={p.buyBrokerPct} onChange={v=>setField(pi,"buyBrokerPct",v)} suffix="%" step="0.1"/>
          </Sec>
          <Sec title="Due Diligence">
            <Inp label="Feasibility / DD" value={p.dd} onChange={v=>setField(pi,"dd",v)} prefix="$"/>
            <Inp label="Environmental" value={p.env} onChange={v=>setField(pi,"env",v)} prefix="$"/>
            <Inp label="Surveys & Geotech" value={p.surveys} onChange={v=>setField(pi,"surveys",v)} prefix="$"/>
            <Inp label="Legal" value={p.legal} onChange={v=>setField(pi,"legal",v)} prefix="$"/>
          </Sec>
        </>}
        {tab==="Development"&&<>
          <Sec title="Scope">
            <Inp label="Total Lots" value={p.lots} onChange={v=>setField(pi,"lots",v)}/>
            <Inp label="Dev Period" value={p.devMonths} onChange={v=>setField(pi,"devMonths",v)} suffix="months"/>
            <Inp label="Monthly Holding" value={p.holdingMo} onChange={v=>setField(pi,"holdingMo",v)} prefix="$"/>
            <Inp label="Phase Start Month" value={p.startMonth} onChange={v=>setField(pi,"startMonth",v)} note="portfolio offset"/>
          </Sec>
          <Sec title="Hard Costs (per lot)">
            <Inp label="Engineering" value={p.engineering} onChange={v=>setField(pi,"engineering",v)} prefix="$"/>
            <Inp label="Grading" value={p.grading} onChange={v=>setField(pi,"grading",v)} prefix="$"/>
            <Inp label="Utilities" value={p.utilities} onChange={v=>setField(pi,"utilities",v)} prefix="$"/>
            <Inp label="Roads" value={p.roads} onChange={v=>setField(pi,"roads",v)} prefix="$"/>
            <Inp label="Landscaping" value={p.landscape} onChange={v=>setField(pi,"landscape",v)} prefix="$"/>
          </Sec>
          <Sec title="Off-Site & Soft">
            <Inp label="Off-Site Infra" value={p.offSite} onChange={v=>setField(pi,"offSite",v)} prefix="$"/>
            <Inp label="Entitlement" value={p.entitle} onChange={v=>setField(pi,"entitle",v)} prefix="$"/>
            <Inp label="Permits (per lot)" value={p.permits} onChange={v=>setField(pi,"permits",v)} prefix="$"/>
            <Inp label="Architecture & Eng." value={p.ae} onChange={v=>setField(pi,"ae",v)} prefix="$"/>
          </Sec>
          <Sec title="Overhead">
            <Inp label="Project Mgmt" value={p.pmPct} onChange={v=>setField(pi,"pmPct",v)} suffix="%" step="0.5"/>
            <Inp label="Contingency" value={p.contPct} onChange={v=>setField(pi,"contPct",v)} suffix="%" step="0.5"/>
          </Sec>
        </>}
        {tab==="Revenue"&&<>
          <Sec title="Pricing">
            <Inp label="Avg Lot Sale Price" value={p.avgPrice} onChange={v=>setField(pi,"avgPrice",v)} prefix="$"/>
            <Inp label="Premium Lots %" value={p.premPct} onChange={v=>setField(pi,"premPct",v)} suffix="%"/>
            <Inp label="Premium Upcharge" value={p.premAmt} onChange={v=>setField(pi,"premAmt",v)} prefix="$"/>
          </Sec>
          <Sec title="Absorption">
            <Inp label="Lots/Month" value={p.absorptionMo} onChange={v=>setField(pi,"absorptionMo",v)} suffix="lots/mo" step="0.5"/>
          </Sec>
          <Sec title="Sales Costs">
            <Inp label="Broker Commissions" value={p.sellBrokerPct} onChange={v=>setField(pi,"sellBrokerPct",v)} suffix="%" step="0.25"/>
            <Inp label="Marketing" value={p.mktg} onChange={v=>setField(pi,"mktg",v)} prefix="$"/>
            <Inp label="Seller Closing" value={p.sellerClosingPct} onChange={v=>setField(pi,"sellerClosingPct",v)} suffix="%" step="0.25"/>
          </Sec>
        </>}
        {tab==="Financing"&&<>
          <Sec title="Capital Structure">
            <Inp label="Equity %" value={p.equityPct} onChange={v=>setField(pi,"equityPct",v)} suffix="% of cost" step="1"/>
            <div style={{display:"flex",justifyContent:"space-between",padding:"3px 6px",fontSize:11,color:"var(--color-text-tertiary)"}}><span>Debt (LTC)</span><span>{fmtP(c.dPct)}</span></div>
          </Sec>
          <Sec title="Loan Terms">
            <Inp label="Interest Rate" value={p.rate} onChange={v=>setField(pi,"rate",v)} suffix="% p.a." step="0.25"/>
            <Inp label="Loan Term" value={p.loanMonths} onChange={v=>setField(pi,"loanMonths",v)} suffix="months"/>
            <Inp label="Origination Fee" value={p.origPct} onChange={v=>setField(pi,"origPct",v)} suffix="%" step="0.25"/>
            <Inp label="Exit Fee" value={p.exitPct} onChange={v=>setField(pi,"exitPct",v)} suffix="%" step="0.25"/>
          </Sec>
          <Sec title="Returns">
            <Inp label="NPV Discount Rate" value={p.discountRate} onChange={v=>setField(pi,"discountRate",v)} suffix="%" step="0.5"/>
          </Sec>
        </>}
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
const MAIN_TABS=["Portfolio","Phase Detail","Gantt","Cash Flow","Waterfall","Sale"];

export default function App(){
  const [phases,setPhases]=useState(()=>Array.from({length:5},(_,i)=>DEFAULT_PHASE(i)));
  const [mainTab,setMainTab]=useState("Portfolio");
  const [activePhase,setActivePhase]=useState(0);
  const [sale,setSale]=useState(DEFAULT_SALE);
  const setSaleField=(field,val)=>setSale(prev=>({...prev,[field]:val}));

  const setField=(pi,field,val)=>setPhases(prev=>prev.map((p,i)=>i===pi?{...p,[field]:val}:p));
  const handleLoad=loaded=>{setPhases(loaded);setActivePhase(0);};

  const tA=phases.reduce((s,p)=>s+p.acres,0);

  // When a sale is enabled, only include phases that START before the sale month
  const activePhases = sale.enabled
    ? phases.filter(p => p.startMonth < sale.month)
    : phases;
  const activeIndices = sale.enabled
    ? phases.map((_,i)=>i).filter(i => phases[i].startMonth < sale.month)
    : phases.map((_,i)=>i);

  const calcs=useMemo(()=>phases.map((p,i)=>calcPhase(p, i===0 ? undefined : 0)),[phases]);
  const activeCalcs = activeIndices.map(i=>calcs[i]);

  const portMonthly=useMemo(()=>{
    const maxM = sale.enabled
      ? sale.month
      : Math.max(...phases.map((p,i)=>p.startMonth+calcs[i].tM));
    const tLandAcq=calcs[0].tAcq; // land always in phase 1 / month 1
    const rows=[];
    for(let m=1;m<=maxM;m++){
      let co=0,ri=0;
      if(m===1)co+=tLandAcq;
      activePhases.forEach((ph,ii)=>{
        const i=activeIndices[ii];
        const lm=m-ph.startMonth;
        if(lm>=1&&lm<=calcs[i].tM){
          const row=calcs[i].monthly[lm-1];
          if(row){co+=lm===1?Math.max(0,row.costOut-calcs[i].tAcq):row.costOut;ri+=row.revIn;}
        }
      });
      // Add sale proceeds in sale month
      if(sale.enabled && m===sale.month){
        const saleNet=sale.price*(1-(sale.brokerPct+sale.closingPct)/100);
        ri+=saleNet;
      }
      const net=ri-co;rows.push({month:m,costOut:co,revIn:ri,net,cumNet:(rows[m-2]?.cumNet||0)+net,isSaleMonth:sale.enabled&&m===sale.month});
    }
    return rows;
  },[phases,calcs,sale,activePhases,activeIndices]);

  // Sale metrics
  const saleMetrics=useMemo(()=>{
    if(!sale.enabled||!sale.price) return null;
    const saleNet=sale.price*(1-(sale.brokerPct+sale.closingPct)/100);
    const saleCosts=sale.price*(sale.brokerPct+sale.closingPct)/100;
    // costs incurred up to sale month across active phases
    const totalCostToSale=activeCalcs.reduce((s,c)=>s+c.tCost,0);
    const revenueToSale=portMonthly.reduce((s,r)=>s+(r.isSaleMonth?r.revIn-saleNet:r.revIn),0); // lot sales only
    const netProfit=portMonthly[portMonthly.length-1]?.cumNet||0;
    const yrs=sale.month/12;
    const totalEquity=activeCalcs.reduce((s,c)=>s+c.equity,0);
    const totalCost=activeCalcs.reduce((s,c)=>s+c.tCost,0);
    // IRR: totalIn / totalCost annualized
    const totalIn=totalCost+netProfit;
    const saleIRR=totalCost>0?(Math.pow(Math.max(0.001,totalIn/totalCost),1/yrs)-1)*100:0;
    const eqMult=totalEquity>0?(totalEquity+netProfit)/totalEquity:0;
    return{saleNet,saleCosts,netProfit,yrs,saleIRR,eqMult,totalCostToSale,totalEquity};
  },[sale,activeCalcs,portMonthly]);

  const agg=useMemo(()=>{
    const C = sale.enabled ? activeCalcs : calcs;
    const P = sale.enabled ? activePhases : phases;
    const S=k=>C.reduce((s,c)=>s+c[k],0);
    const tc=S("tCost"),gr=S("gR"),nR=S("nR");
    let nP=S("nP");
    const tL=P.reduce((s,p)=>s+p.lots,0);
    const eq=S("equity"),fC=S("fC"),lP=nP-fC;
    // If sale enabled, net profit = final cumulative cash flow
    const adjNP = sale.enabled ? (portMonthly[portMonthly.length-1]?.cumNet||0) : nP;
    const adjLevP = adjNP - fC;
    const maxE = sale.enabled ? sale.month : phases.reduce((mx,p,i)=>Math.max(mx,p.startMonth+calcs[i].tM),0);
    const yrs=maxE/12;
    return{tCost:tc,gR:gr,nP:adjNP,tL,equity:eq,lP:adjLevP,margin:adjNP/Math.max(gr,1)*100,eM:eq>0?(eq+adjLevP)/eq:0,years:yrs,
      uIRR:(Math.pow(Math.max(0.001,(tc+adjNP)/tc),1/yrs)-1)*100,
      lIRR:eq>0?(Math.pow(Math.max(0.001,(eq+adjLevP)/eq),1/yrs)-1)*100:0,
      tAcq:S("tAcq"),tDev:S("tDev"),activeCount:C.length};
  },[calcs,phases,sale,activeCalcs,activePhases,portMonthly]);

  // Export helpers
  const csvPortfolio=()=>{
    const h=["Metric",...phases.map(p=>p.name),"Total"];
    return makeCSV([h,
      ["Total Cost",...calcs.map(c=>c.tCost.toFixed(0)),agg.tCost.toFixed(0)],
      ["Gross Revenue",...calcs.map(c=>c.gR.toFixed(0)),agg.gR.toFixed(0)],
      ["Net Profit",...calcs.map(c=>c.nP.toFixed(0)),agg.nP.toFixed(0)],
      ["Profit Margin %",...calcs.map(c=>c.marg.toFixed(2)),agg.margin.toFixed(2)],
      ["Total Lots",...phases.map(p=>p.lots),agg.tL],
      ["Allocated Land",...calcs.map(c=>c.landCost.toFixed(0)),""],
      ["Cost/Lot",...calcs.map(c=>c.cPL.toFixed(0)),(agg.tCost/agg.tL).toFixed(0)],
      ["Revenue/Lot",...calcs.map(c=>c.rPL.toFixed(0)),(agg.gR/agg.tL).toFixed(0)],
      ["Unlev IRR %",...calcs.map(c=>c.uIRR.toFixed(2)),agg.uIRR.toFixed(2)],
      ["Lev IRR %",...calcs.map(c=>c.lIRR.toFixed(2)),agg.lIRR.toFixed(2)],
      ["Equity Multiple",...calcs.map(c=>c.eM.toFixed(2)),agg.eM.toFixed(2)],
      ["Equity Required",...calcs.map(c=>c.equity.toFixed(0)),agg.equity.toFixed(0)],
      ["Hold (mo)",...calcs.map(c=>c.tM),(agg.years*12).toFixed(0)],
      ["Start Month",...phases.map(p=>p.startMonth),""],
    ]);
  };
  const csvInputs=()=>{
    const F=[["Land Price","landPrice"],["Acres","acres"],["Closing %","closingPct"],["Broker %","buyBrokerPct"],["DD","dd"],["Env","env"],["Surveys","surveys"],["Legal","legal"],["Lots","lots"],["Dev Months","devMonths"],["Holding/mo","holdingMo"],["Engineering","engineering"],["Grading","grading"],["Utilities","utilities"],["Roads","roads"],["Landscape","landscape"],["Off-Site","offSite"],["Entitlement","entitle"],["Permits","permits"],["A&E","ae"],["PM %","pmPct"],["Cont %","contPct"],["Avg Price","avgPrice"],["Absorption","absorptionMo"],["Prem %","premPct"],["Prem $","premAmt"],["Sell Broker %","sellBrokerPct"],["Marketing","mktg"],["Seller Close %","sellerClosingPct"],["Equity %","equityPct"],["Rate %","rate"],["Loan Months","loanMonths"],["Orig %","origPct"],["Exit %","exitPct"],["Discount %","discountRate"],["Start Month","startMonth"],["Pref %","prefReturn"],["LP %","lpSplit"],["GP %","gpSplit"],["T1 LP %","promote1"],["T1 Hurdle","promote1Hurdle"],["T2 LP %","promote2"]];
    return makeCSV([["Input",...phases.map(p=>p.name)],...F.map(([l,k])=>[l,...phases.map(p=>p[k])])]);
  };
  const csvCFPort=()=>makeCSV([["Month","Cost Out","Revenue In","Net CF","Cumulative"],...portMonthly.map(r=>[r.month,r.costOut.toFixed(0),r.revIn.toFixed(0),r.net.toFixed(0),r.cumNet.toFixed(0)])]);
  const csvCFPhase=()=>{const rows=[["Phase","Month","Cost Out","Revenue In","Net CF","Cumulative"]];phases.forEach((ph,i)=>calcs[i].monthly.forEach(r=>rows.push([ph.name,r.month,r.costOut.toFixed(0),r.revIn.toFixed(0),r.net.toFixed(0),r.cumNet.toFixed(0)])));return makeCSV(rows);};
  const csvWF=()=>makeCSV([["Phase","Equity","Pref","Total Return","Ann Ret %","LP Dist","GP Dist","LP Multiple","GP Multiple"],...phases.map((ph,i)=>{const c=calcs[i];return[ph.name,c.equity.toFixed(0),c.pref.toFixed(0),c.tRet.toFixed(0),c.aR.toFixed(2),c.lpD.toFixed(0),c.gpD.toFixed(0),(c.equity*(ph.lpSplit/100))>0?(c.lpD/(c.equity*(ph.lpSplit/100))).toFixed(2):"0",(c.equity*(ph.gpSplit/100))>0?(c.gpD/(c.equity*(ph.gpSplit/100))).toFixed(2):"0"];})]);
  const csvGantt=()=>makeCSV([["Phase","Start","Dev End","Total End","Dev Mo","Sales Mo","Total Mo","Yrs"],...phases.map((ph,i)=>[ph.name,ph.startMonth,ph.startMonth+ph.devMonths,ph.startMonth+calcs[i].tM,ph.devMonths,calcs[i].sM,calcs[i].tM,calcs[i].yrs.toFixed(2)])]);

  const tBg=t=>mainTab===t?"#2563eb":"transparent";
  const tCl=t=>mainTab===t?"white":"var(--color-text-secondary)";

  return(
    <div style={{fontFamily:"var(--font-sans)",background:"var(--color-background-tertiary)",minHeight:"100vh",color:"var(--color-text-primary)"}}>
      {/* Header */}
      <div style={{borderBottom:"0.5px solid var(--color-border-tertiary)",padding:"11px 16px",display:"flex",flexWrap:"wrap",alignItems:"center",gap:10,justifyContent:"space-between",background:"var(--color-background-primary)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:15,fontWeight:500}}>Land Development Model</span>
          <span style={{fontSize:10,background:"#1d4ed8",color:"white",padding:"2px 7px",borderRadius:999}}>5-Phase Residential</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",background:"var(--color-background-secondary)",padding:3,borderRadius:8,gap:2,flexWrap:"wrap"}}>
            {MAIN_TABS.map(t=><button key={t} onClick={()=>setMainTab(t)} style={{padding:"5px 11px",borderRadius:6,fontSize:11,fontWeight:500,background:tBg(t),color:tCl(t),border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>{t}</button>)}
          </div>
          <SaveLoad phases={phases} onLoad={handleLoad}/>
        </div>
      </div>

      {/* Phase pills */}
      <div style={{padding:"7px 16px",display:"flex",gap:7,flexWrap:"wrap",borderBottom:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)"}}>
        {phases.map((ph,i)=><button key={i} onClick={()=>{setActivePhase(i);setMainTab("Phase Detail");}} style={{padding:"2px 11px",borderRadius:999,fontSize:10,fontWeight:500,cursor:"pointer",border:`1px solid ${COLORS[i]}`,background:mainTab==="Phase Detail"&&activePhase===i?COLORS[i]:"transparent",color:mainTab==="Phase Detail"&&activePhase===i?"white":COLORS[i]}}>{ph.name}</button>)}
      </div>

      {/* Sale banner */}
      {sale.enabled&&(
        <div style={{padding:"7px 16px",background:"rgba(37,99,235,0.1)",borderBottom:"0.5px solid #3b82f6",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:11,fontWeight:500,color:"#60a5fa"}}>★ Sale Scenario Active</span>
          <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>Month {sale.month} · {fmtD(sale.price)} gross · {activePhases.length} of {phases.length} phases included</span>
          <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>Phases excluded: {phases.filter(p=>p.startMonth>=sale.month).map(p=>p.name).join(", ")||"None"}</span>
          <button onClick={()=>setSaleField("enabled",false)} style={{marginLeft:"auto",fontSize:11,color:"#f87171",background:"none",border:"none",cursor:"pointer"}}>Disable ×</button>
        </div>
      )}

      {/* KPI strip */}
      <div style={{padding:"10px 16px",display:"grid",gap:7,gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))"}}>
        <KPI label="Portfolio Net Profit" value={fmtD(agg.nP)} color={agg.nP>0?"green":"red"} sm/>
        <KPI label="Profit Margin" value={fmtP(agg.margin)} color={clr(agg.margin)} sm/>
        <KPI label="Unlev. IRR" value={fmtP(agg.uIRR)} sub={`${fmt(agg.years,1)}-yr span`} color={clr(agg.uIRR)} sm/>
        <KPI label="Leveraged IRR" value={fmtP(agg.lIRR)} color={clr(agg.lIRR)} sm/>
        <KPI label="Equity Multiple" value={isFinite(agg.eM)?`${fmt(agg.eM,2)}x`:"—"} color={agg.eM>2?"green":agg.eM>1.5?"yellow":"red"} sm/>
        <KPI label="Total Lots" value={fmt(agg.tL)} color="blue" sm/>
        <KPI label="Total Cost" value={fmtD(agg.tCost)} color="blue" sm/>
        <KPI label="Gross Revenue" value={fmtD(agg.gR)} color="blue" sm/>
      </div>

      <div style={{padding:"0 16px 24px"}}>
        {/* Export bar */}
        <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:12,padding:"8px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
          <span style={{fontSize:11,color:"var(--color-text-tertiary)",alignSelf:"center"}}>Export:</span>
          <ExpBtn label="Portfolio Summary"    filename="portfolio_summary.csv"  getContent={csvPortfolio}/>
          <ExpBtn label="All Phase Inputs"     filename="phase_inputs.csv"       getContent={csvInputs}/>
          <ExpBtn label="Cash Flow (Portfolio)"filename="cashflow_portfolio.csv" getContent={csvCFPort}/>
          <ExpBtn label="Cash Flow (by Phase)" filename="cashflow_by_phase.csv"  getContent={csvCFPhase}/>
          <ExpBtn label="Waterfall"            filename="waterfall.csv"          getContent={csvWF}/>
          <ExpBtn label="Gantt Schedule"       filename="gantt_schedule.csv"     getContent={csvGantt}/>
        </div>

        {/* Portfolio */}
        {mainTab==="Portfolio"&&(
          <div>
            <div style={{overflowX:"auto",borderRadius:10,border:"0.5px solid var(--color-border-tertiary)",marginBottom:14,background:"var(--color-background-primary)"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                  <th style={{padding:"7px 11px",textAlign:"left",color:"var(--color-text-secondary)",fontWeight:500}}>Metric</th>
                  {activePhases.map((ph,ii)=>{const i=activeIndices[ii];return(<th key={i} style={{padding:"7px 11px",textAlign:"right"}}><span style={{color:COLORS[i],fontWeight:500}}>{ph.name}</span><div style={{color:"var(--color-text-tertiary)",fontWeight:400,fontSize:9}}>{ph.lots} lots · {ph.acres} ac</div></th>);})}
                  {sale.enabled&&phases.filter(p=>p.startMonth>=sale.month).map((ph,i)=><th key={"ex"+i} style={{padding:"7px 11px",textAlign:"right",opacity:0.3}}><span style={{color:"var(--color-text-tertiary)",fontWeight:500,textDecoration:"line-through"}}>{ph.name}</span><div style={{fontSize:9,color:"var(--color-text-tertiary)"}}>excluded</div></th>)}
                  <th style={{padding:"7px 11px",textAlign:"right",color:"var(--color-text-primary)",fontWeight:500}}>Total</th>
                </tr></thead>
                <tbody>
                  {[
                    {l:"Allocated Land",fn:(c,ii)=>activeIndices[ii]===0?fmtD(c.landCost):"—",a:fmtD(calcs[0].landCost)},
                    {l:"Total Cost",fn:c=>fmtD(c.tCost),a:fmtD(agg.tCost)},
                    {l:"Gross Revenue",fn:c=>fmtD(c.gR),a:fmtD(agg.gR)},
                    {l:"Net Profit",fn:c=>fmtD(c.nP),a:fmtD(agg.nP),b:true},
                    {l:"Profit Margin",fn:c=>fmtP(c.marg),a:fmtP(agg.margin)},
                    {l:"Cost / Lot",fn:c=>fmtD(c.cPL),a:fmtD(agg.tCost/Math.max(1,agg.tL))},
                    {l:"Revenue / Lot",fn:c=>fmtD(c.rPL),a:fmtD(agg.gR/Math.max(1,agg.tL))},
                    {l:"Unlev. IRR",fn:c=>fmtP(c.uIRR),a:fmtP(agg.uIRR)},
                    {l:"Lev. IRR",fn:c=>fmtP(c.lIRR),a:fmtP(agg.lIRR)},
                    {l:"Equity Multiple",fn:c=>isFinite(c.eM)?`${fmt(c.eM,2)}x`:"—",a:isFinite(agg.eM)?`${fmt(agg.eM,2)}x`:"—"},
                    {l:"Equity Required",fn:c=>fmtD(c.equity),a:fmtD(agg.equity)},
                    {l:"Hold Period",fn:c=>`${c.tM} mo`,a:`${fmt(agg.years,1)} yrs`},
                  ].map(({l,fn,a,b},ri)=>(
                    <tr key={ri} style={{background:b?"rgba(59,130,246,0.08)":ri%2===0?"var(--color-background-secondary)":"transparent",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                      <td style={{padding:"4px 11px",color:"var(--color-text-secondary)",fontWeight:b?500:400}}>{l}</td>
                      {activeCalcs.map((ca,ii)=><td key={ii} style={{padding:"4px 11px",textAlign:"right",fontWeight:b?500:400,color:b?"var(--color-text-primary)":"var(--color-text-secondary)"}}>{fn(ca,ii)}</td>)}
                      {sale.enabled&&phases.filter(p=>p.startMonth>=sale.month).map((_,i)=><td key={"ex"+i} style={{padding:"4px 11px",textAlign:"right",color:"var(--color-text-tertiary)",opacity:0.3}}>—</td>)}
                      <td style={{padding:"4px 11px",textAlign:"right",fontWeight:500,color:b?"#60a5fa":"var(--color-text-primary)"}}>{a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{display:"grid",gap:10,gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))"}}>
              <PhaseBar phases={activePhases} calcs={activeCalcs} metric={c=>c.nP}     fmt2={fmtD}       title="Net profit by phase"/>
              <PhaseBar phases={activePhases} calcs={activeCalcs} metric={c=>c.uIRR}   fmt2={v=>fmtP(v)} title="Unleveraged IRR by phase"/>
              <PhaseBar phases={activePhases} calcs={activeCalcs} metric={c=>c.gR}     fmt2={fmtD}       title="Gross revenue by phase"/>
              <PhaseBar phases={activePhases} calcs={activeCalcs} metric={c=>c.equity} fmt2={fmtD}       title="Equity required by phase"/>
            </div>
          </div>
        )}

        {/* Phase Detail */}
        {mainTab==="Phase Detail"&&(
          <div>
            <div style={{display:"flex",gap:7,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"var(--color-text-secondary)",alignSelf:"center"}}>Editing:</span>
              {phases.map((ph,i)=><button key={i} onClick={()=>setActivePhase(i)} style={{padding:"3px 11px",borderRadius:999,fontSize:11,fontWeight:500,cursor:"pointer",border:`1px solid ${COLORS[i]}`,background:activePhase===i?COLORS[i]:"transparent",color:activePhase===i?"white":COLORS[i]}}>{ph.name}</button>)}
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <div style={{flex:"0 0 290px",minWidth:260}}>
                <div style={{marginBottom:7,display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:11,height:11,borderRadius:3,background:COLORS[activePhase]}}/>
                  <input value={phases[activePhase].name} onChange={e=>setField(activePhase,"name",e.target.value)} style={{background:"transparent",color:"var(--color-text-primary)",fontSize:13,fontWeight:500,outline:"none",border:"none",borderBottom:"1px solid var(--color-border-secondary)"}}/>
                </div>
                <PhaseInputs p={phases[activePhase]} pi={activePhase} c={calcs[activePhase]} tA={tA} setField={setField}/>
              </div>
              <div style={{flex:"1 1 260px",minWidth:240}}>
                <div style={{background:"var(--color-background-primary)",borderRadius:10,border:"0.5px solid var(--color-border-tertiary)",padding:14,overflowY:"auto",maxHeight:600}}>
                  <div style={{fontSize:12,fontWeight:500,marginBottom:10,color:COLORS[activePhase]}}>{phases[activePhase].name} — Summary</div>
                  {(()=>{const c=calcs[activePhase];return(<>
                    <SumRow label="Allocated Land Cost" value={fmtD(c.landCost)} sub/>
                    <SumRow label="Total Acquisition"   value={fmtD(c.tAcq)} hi/>
                    <SumRow label="Total Development"   value={fmtD(c.tDev)} hi/>
                    <SumRow label="All-In Cost"          value={fmtD(c.tCost)} hi/>
                    <SumRow label="Cost per Lot"         value={fmtD(c.cPL)} sub/>
                    <div style={{height:6}}/>
                    <SumRow label="Gross Revenue"        value={fmtD(c.gR)} hi/>
                    <SumRow label="Net Revenue"          value={fmtD(c.nR)}/>
                    <SumRow label="Net Profit (Unlev.)"  value={fmtD(c.nP)} hi/>
                    <div style={{height:6}}/>
                    <SumRow label="Profit Margin"        value={fmtP(c.marg)}/>
                    <SumRow label="Unlev. IRR"           value={fmtP(c.uIRR)}/>
                    <SumRow label="Leveraged IRR"        value={fmtP(c.lIRR)}/>
                    <SumRow label="Equity Multiple"      value={isFinite(c.eM)?`${fmt(c.eM,2)}x`:"—"} hi/>
                    <SumRow label="NPV"                  value={fmtD(c.npv)}/>
                    <div style={{height:6}}/>
                    <SumRow label="Dev Period"  value={`${phases[activePhase].devMonths} mo`}/>
                    <SumRow label="Sales Period" value={`${c.sM} mo`}/>
                    <SumRow label="Total Hold"  value={`${c.tM} mo (${fmt(c.yrs,1)} yrs)`} hi/>
                  </>);})()}
                </div>
              </div>
            </div>
          </div>
        )}

        {mainTab==="Gantt"&&<div style={{background:"var(--color-background-primary)",borderRadius:10,border:"0.5px solid var(--color-border-tertiary)",padding:16}}><Gantt phases={activePhases} calcs={activeCalcs}/></div>}
        {mainTab==="Cash Flow"&&<div style={{background:"var(--color-background-primary)",borderRadius:10,border:"0.5px solid var(--color-border-tertiary)",padding:16}}><CashFlow phases={activePhases} calcs={activeCalcs} portMonthly={portMonthly}/></div>}
        {mainTab==="Waterfall"&&<div style={{background:"var(--color-background-primary)",borderRadius:10,border:"0.5px solid var(--color-border-tertiary)",padding:16}}><Waterfall phases={activePhases} calcs={activeCalcs} setField={setField}/></div>}

        {mainTab==="Sale"&&(
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {/* Inputs */}
            <div style={{flex:"0 0 300px",minWidth:260,background:"var(--color-background-primary)",borderRadius:10,border:"0.5px solid var(--color-border-tertiary)",padding:16}}>
              <div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",marginBottom:14}}>Sale / Exit Scenario</div>

              {/* Toggle */}
              <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:"var(--color-background-secondary)",borderRadius:8,marginBottom:14,cursor:"pointer"}}>
                <span style={{fontSize:12,color:"var(--color-text-primary)",fontWeight:500}}>Enable sale scenario</span>
                <input type="checkbox" checked={sale.enabled} onChange={e=>setSaleField("enabled",e.target.checked)}
                  style={{width:18,height:18,cursor:"pointer",accentColor:"#2563eb"}}/>
              </label>

              {sale.enabled&&<>
                <Sec title="Sale Timing & Price">
                  <Inp label="Sale Month" value={sale.month} onChange={v=>setSaleField("month",Math.max(1,v))} note="project month"/>
                  <Inp label="Gross Sale Price" value={sale.price} onChange={v=>setSaleField("price",v)} prefix="$"/>
                </Sec>
                <Sec title="Transaction Costs">
                  <Inp label="Broker Fee" value={sale.brokerPct} onChange={v=>setSaleField("brokerPct",v)} suffix="%" step="0.25"/>
                  <Inp label="Closing Costs" value={sale.closingPct} onChange={v=>setSaleField("closingPct",v)} suffix="%" step="0.25"/>
                </Sec>
                <div style={{padding:"10px 12px",background:"rgba(59,130,246,0.08)",borderRadius:8,fontSize:11,color:"var(--color-text-secondary)",lineHeight:1.6}}>
                  <div>Gross sale price: <strong style={{color:"var(--color-text-primary)"}}>{fmtD(sale.price)}</strong></div>
                  <div>Transaction costs: <strong style={{color:"#f87171"}}>{fmtD(sale.price*(sale.brokerPct+sale.closingPct)/100)}</strong></div>
                  <div>Net sale proceeds: <strong style={{color:"#34d399"}}>{fmtD(sale.price*(1-(sale.brokerPct+sale.closingPct)/100))}</strong></div>
                  <div style={{marginTop:6,paddingTop:6,borderTop:"0.5px solid var(--color-border-tertiary)"}}>
                    Phases included: <strong style={{color:"var(--color-text-primary)"}}>{activePhases.map(p=>p.name).join(", ")||"None"}</strong>
                  </div>
                  <div>Phases excluded: <strong style={{color:"#f87171"}}>{phases.filter(p=>p.startMonth>=sale.month).map(p=>p.name).join(", ")||"None"}</strong></div>
                </div>
              </>}
              {!sale.enabled&&<div style={{fontSize:12,color:"var(--color-text-tertiary)",fontStyle:"italic",padding:"8px 0"}}>Enable the sale scenario to model an early exit or mid-project disposition.</div>}
            </div>

            {/* Results */}
            {sale.enabled&&saleMetrics&&(
              <div style={{flex:"1 1 300px",minWidth:260}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:14}}>
                  <KPI label="Net Sale Proceeds" value={fmtD(saleMetrics.saleNet)} color="green" sm/>
                  <KPI label="Net Profit (to sale)" value={fmtD(saleMetrics.netProfit)} color={saleMetrics.netProfit>0?"green":"red"} sm/>
                  <KPI label="Sale IRR" value={fmtP(saleMetrics.saleIRR)} color={clr(saleMetrics.saleIRR)} sub={`${fmt(saleMetrics.yrs,1)}-yr hold`} sm/>
                  <KPI label="Equity Multiple" value={isFinite(saleMetrics.eqMult)?`${fmt(saleMetrics.eqMult,2)}x`:"—"} color={saleMetrics.eqMult>2?"green":saleMetrics.eqMult>1.5?"yellow":"red"} sm/>
                </div>

                {/* Return summary table */}
                <div style={{background:"var(--color-background-primary)",borderRadius:10,border:"0.5px solid var(--color-border-tertiary)",overflow:"hidden"}}>
                  <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:12,fontWeight:500,color:"var(--color-text-primary)"}}>Sale Scenario — Return Summary</div>
                  <div style={{padding:14}}>
                    {[
                      ["Sale month", `Month ${sale.month}`],
                      ["Hold period", `${fmt(saleMetrics.yrs,2)} years`],
                      ["Gross sale price", fmtD(sale.price)],
                      ["Transaction costs", fmtD(sale.price*(sale.brokerPct+sale.closingPct)/100)],
                      ["Net sale proceeds", fmtD(saleMetrics.saleNet)],
                      [null,null],
                      ["Total cost (active phases)", fmtD(saleMetrics.totalCostToSale)],
                      ["Equity invested", fmtD(saleMetrics.totalEquity)],
                      [null,null],
                      ["Net profit to sale", fmtD(saleMetrics.netProfit)],
                      ["Sale IRR (unleveraged)", fmtP(saleMetrics.saleIRR)],
                      ["Equity multiple", isFinite(saleMetrics.eqMult)?`${fmt(saleMetrics.eqMult,2)}x`:"—"],
                    ].map(([l,v],i)=>l===null
                      ? <div key={i} style={{height:8}}/>
                      : <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 8px",borderRadius:4,marginBottom:1,background:["Net profit to sale","Sale IRR (unleveraged)","Equity multiple"].includes(l)?"rgba(59,130,246,0.12)":"var(--color-background-secondary)"}}>
                          <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{l}</span>
                          <span style={{fontSize:11,fontWeight:["Net profit to sale","Sale IRR (unleveraged)","Equity multiple"].includes(l)?500:400,color:["Net profit to sale","Sale IRR (unleveraged)","Equity multiple"].includes(l)?"#60a5fa":"var(--color-text-primary)"}}>{v}</span>
                        </div>
                    )}
                  </div>
                </div>

                {/* Cash flow up to sale */}
                <div style={{marginTop:12,background:"var(--color-background-primary)",borderRadius:10,border:"0.5px solid var(--color-border-tertiary)",padding:14}}>
                  <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-primary)",marginBottom:10}}>Cumulative cash flow to sale</div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                      <thead><tr style={{background:"var(--color-background-secondary)"}}>
                        {["Month","Cost Out","Revenue In","Net CF","Cumulative"].map(h=><th key={h} style={{padding:"5px 9px",textAlign:"right",color:"var(--color-text-secondary)",fontWeight:500,borderBottom:"0.5px solid var(--color-border-tertiary)"}}>{h}</th>)}
                      </tr></thead>
                      <tbody>{portMonthly.map((r,i)=>(
                        <tr key={i} style={{background:r.isSaleMonth?"rgba(59,130,246,0.12)":i%2===0?"var(--color-background-secondary)":"transparent"}}>
                          <td style={{padding:"3px 9px",textAlign:"right",color:r.isSaleMonth?"#60a5fa":"var(--color-text-secondary)",fontWeight:r.isSaleMonth?500:400}}>{r.month}{r.isSaleMonth?" ★":""}</td>
                          <td style={{padding:"3px 9px",textAlign:"right",color:"#f87171"}}>{fmtD(r.costOut)}</td>
                          <td style={{padding:"3px 9px",textAlign:"right",color:"#34d399"}}>{fmtD(r.revIn)}</td>
                          <td style={{padding:"3px 9px",textAlign:"right",color:r.net>=0?"#34d399":"#f87171",fontWeight:500}}>{fmtD(r.net)}</td>
                          <td style={{padding:"3px 9px",textAlign:"right",color:r.cumNet>=0?"#34d399":"#f87171",fontWeight:500}}>{fmtD(r.cumNet)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{textAlign:"center",fontSize:10,color:"var(--color-text-tertiary)",paddingBottom:14}}>
        For evaluation purposes only. IRR uses simplified annualized approximation. Consult a licensed financial advisor prior to any investment decision.
      </div>
    </div>
  );
}
