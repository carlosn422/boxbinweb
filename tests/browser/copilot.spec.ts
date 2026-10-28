import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const userId='11111111-1111-4111-8111-111111111111';
const bin={id:'a-box',name:'Herramientas',description:'Inventario de prueba',userId,location:{id:'loc-1',name:'Bodega'},createdAt:'2026-10-24T10:00:00Z'};
const loc={id:'loc-1',name:'Bodega',description:'',address:'',userId,createdAt:bin.createdAt};
const user={id:userId,email:'copilot-test@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{displayName:'Usuario de prueba'},created_at:bin.createdAt};
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
async function setup(page:Page, language: 'en' | 'es' | null = 'es'){
  if (language) await page.addInitScript(lang=>{if(!localStorage.getItem('lang'))localStorage.setItem('lang',lang);},language);
  const env=readFileSync('.env','utf8');const url=env.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'')||'https://xfqmknrtozlxoscotcqa.supabase.co';
  const ref=new URL(url).hostname.split('.')[0];
  const payload={sub:userId,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
  const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.test';
  await page.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${ref}-auth-token`,session:{access_token:token,refresh_token:'test-refresh',expires_at:payload.exp,expires_in:3600,token_type:'bearer',user}});
  const chats:any[]=[];const writes:any[]=[];const requests:any[]=[];let images=0;
  const ctx=(focus:string|null)=>({activeBin:focus?bin:null,binsSummary:[bin],locationsSummary:[loc],itemsSample:[],matches:{bins:1,locations:1,items:0},inventoryMetrics:{totalBins:1,totalItems:writes.length,totalLocations:1,totalEstimatedValue:0,unvaluedItems:0},hasMore:false});
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1'||u.hostname==='localhost')return route.continue();
    if(u.hostname!==new URL(url).hostname)return route.fulfill({status:200,body:'{}',contentType:'application/json'});
    const req=route.request(),method=req.method(),body=req.postDataJSON();
    let data:any=[];
    if(u.pathname.includes('/auth/v1/'))data=user;
    else if(u.pathname.endsWith('/functions/v1/boxbin-copilot')){
      requests.push(body);
      if(body.operation==='context')data=ctx(body.binId);
      else if(body.operation==='execute'){writes.push(body);data={itemId:'new-item',name:body.data.name};}
      else if(body.operation==='document')data={title:'Inventario real',content:'| Ítem | Cantidad |\n| --- | --- |\n| Taladro | 2 |',fecha:'2026-10-24'};
      else {
        data={reply:'Respuesta de prueba: <img src=x onerror="window.__copilotXss=true"> **seguro**',suggestedActions:[],suggestedQuestions:[],actionProposal:null,sources:[]};
        if(body.query.toLowerCase().includes('crea'))data.actionProposal={type:'create_item',status:'pending',data:{name:'Taladro',binId:'a-box',binName:'Herramientas',cuantity:'1',value:'150',tags:[]}};
        if(body.query.toLowerCase().includes('pdf'))data.actionProposal={type:'generate_inventory_pdf',status:'pending',data:{title:'Inventario real',binId:'a-box'}};
        if(body.query.toLowerCase().includes('imagen'))data.actionProposal={type:'generate_image',status:'pending',data:{title:'Caja',prompt:'Una caja',aspectRatio:'1:1'}};
      }
    }else if(u.pathname.endsWith('/functions/v1/boxbin-image')){if(body.retrieveOnly)data={image:{base64:png,mimeType:'image/png'}};else{images++;data={base64:png,mimeType:'image/png'};}}
    else if(u.pathname.includes('/functions/v1/'))data={metadata:{bins:'100',items:'100',locations:'50'},product:{name:'Test',metadata:{}},unit_amount:0};
    else if(u.pathname.includes('/rest/v1/')){
      const table=u.pathname.split('/').pop();
      if(table==='users')data=[{...user,uid:userId,auth_user_id:userId,username:'tester',tokens:100}];
      if(table==='subscriptions')data=[{id:'subscription',userId,planId:'price_test',status:'active'}];
      if(table==='bins')data=[bin];
      if(table==='locations')data=[loc];
      if(table==='copilot_chats'){
        const id=u.searchParams.get('id')?.replace(/^eq\./,'');
        if(method==='POST'){chats.unshift(body);data=[body];}
        else if(method==='PATCH'){const row=chats.find(x=>x.id===id);if(row)Object.assign(row,body);data=row?{id:row.id}:null;}
        else if(method==='DELETE'){const index=chats.findIndex(x=>x.id===id);if(index>=0)chats.splice(index,1);data=[];}
        else data=chats;
      }
      if(req.headers()['accept']?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null;
    }
    return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':`0-${Math.max(0,(Array.isArray(data)?data.length:1)-1)}/${Array.isArray(data)?data.length:1}`},body:method==='HEAD'?'':JSON.stringify(data)});
  });
  await page.goto('/home');
  return {chats,writes,requests,imageCount:()=>images};
}
const open=async(page:Page)=>{await page.getByRole('button',{name:/^(Copiloto IA|Consultar al Copiloto IA de BoxBin|AI Copilot|Ask BoxBin AI Copilot)$/}).first().click();await expect(page.getByRole('dialog',{name:'BoxBin Copilot',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:/^(Consulta al copiloto|Ask Copilot)$/})).toBeEnabled();};
const send=async(page:Page,text:string)=>{await page.getByRole('textbox',{name:/^(Consulta al copiloto|Ask Copilot)$/}).fill(text);await page.getByRole('button',{name:/^(Enviar consulta|Send query)$/}).click();await expect(page.getByRole('textbox',{name:/^(Consulta al copiloto|Ask Copilot)$/})).toBeEnabled();};

test('Global entry point, safe text, confirmed action and server history after reload',async({page})=>{
  const state=await setup(page);await open(page);await send(page,'crea un taladro');
  await expect(page.getByText('Registrar ítem',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=> (window as any).__copilotXss)).toBeUndefined();
  await page.getByRole('button',{name:'Confirmar acción'}).click();await expect(page.getByText('Cambio guardado correctamente.',{exact:true})).toBeVisible();expect(state.writes.length).toBe(1);
  await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('boxbin_copilot_sessions_'))localStorage.removeItem(k);});
  await page.reload();await page.getByRole('button',{name:'Abrir BoxBin Copilot'}).click();await expect(page.getByText('Cambio guardado correctamente.',{exact:true})).toBeVisible();
  await page.screenshot({path:'/tmp/boxbin-copilot-desktop.png',fullPage:true});
});
test('PDF preview/download uses real pdfmake and generated image is recovered, not regenerated',async({page})=>{
  const state=await setup(page);await open(page);await send(page,'prepara PDF');await page.getByRole('button',{name:'Revisar archivo',exact:true}).click();
  await page.getByRole('button',{name:'Actualizar Vista Previa'}).click();const checkbox=page.getByRole('checkbox',{name:'He revisado el contenido y las cantidades'});await expect(checkbox).toBeEnabled();await checkbox.check();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar Manifiesto PDF'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/\.pdf$/);await download.saveAs('/tmp/boxbin-copilot-test.pdf');
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();await send(page,'genera una imagen');await page.getByRole('button',{name:'Revisar archivo',exact:true}).click();
  await page.getByRole('button',{name:'Generar Imagen con IA',exact:true}).click();await expect(page.getByRole('button',{name:'Descargar imagen',exact:true})).toBeVisible();expect(state.imageCount()).toBe(1);
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.getByRole('button',{name:'Reabrir archivo',exact:true}).last().click();await expect(page.getByRole('button',{name:'Descargar imagen',exact:true})).toBeVisible();expect(state.imageCount()).toBe(1);
});
test('Mobile drawer fits viewport and can return from a bin to a global chat',async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page);await page.goto('/bin-details/a-box');
  await page.getByTitle('Preguntar a BoxBin Copilot IA sobre esta caja').click();await expect(page.getByText('Consultas limitadas a esta caja',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:/^(Consulta al copiloto|Ask Copilot)$/})).toBeEnabled();await page.getByRole('button',{name:'Abrir chat global',exact:true}).click();await expect(page.getByText('Inventario global',{exact:true})).toBeVisible();
  const size=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));expect(size.scroll).toBeLessThanOrEqual(size.viewport);
  await expect(page.getByRole('button',{name:/^(Enviar consulta|Send query)$/})).toBeInViewport();await page.screenshot({path:'/tmp/boxbin-copilot-mobile.png',fullPage:true});
});


async function liveFixture(page:Page, language: 'en' | 'es' | null = 'es') {
  let connection:any;const controls:any[]=[];let packets=0;
  await page.addInitScript(()=>{
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).__micStreams=[];(window as any).__audioStarts=0;(window as any).__audioStops=0;
    navigator.mediaDevices.getUserMedia=async options=>{const stream=await original(options);(window as any).__micStreams.push(stream);return stream;};
    const create=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource=function(){const source=create.call(this);const start=source.start.bind(source),stop=source.stop.bind(source);source.start=(...args)=>{(window as any).__audioStarts++;start(...args);};source.stop=(...args)=>{(window as any).__audioStops++;stop(...args);};return source;};
  });
  await page.routeWebSocket('**/functions/v1/boxbin-copilot-voice',socket=>{
    connection=socket;socket.onMessage(message=>{
      if(typeof message!=='string'){packets++;return;}
      const data=JSON.parse(message);controls.push(data);
      if(data.type==='start')socket.send(JSON.stringify({type:'ready'}));
    });
  });
  const state=await setup(page,language);await open(page);
  return {state,controls,packets:()=>packets,send:(data:any)=>connection.send(JSON.stringify(data)),audio:()=>connection.send(Buffer.alloc(24000*2*5))};
}

test('Live call captures continuous PCM, handles barge-in, persists multiple turns and confirms actions only after hangup',async({page})=>{
  const live=await liveFixture(page);
  await page.getByRole('button',{name:'Iniciar llamada con Gemini',exact:true}).click();
  await expect(page.getByText('Te escucho',{exact:true})).toBeVisible();await expect.poll(live.packets).toBeGreaterThan(0);
  live.send({type:'transcript',id:'live-1',input:'Dónde está mi taladro',output:'Está en Herramientas.'});live.audio();
  await expect(page.getByText('Gemini está hablando',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__audioStarts)).toBeGreaterThan(0);
  live.send({type:'interrupted'});live.send({type:'turn_complete',id:'live-1',input:'Dónde está mi taladro',interrupted:true,answer:{reply:'Está en Herramientas.',suggestedActions:[],suggestedQuestions:[],actionProposal:null}});
  await expect.poll(()=>page.evaluate(()=>(window as any).__audioStops)).toBeGreaterThan(0);
  live.send({type:'transcript',id:'live-2',input:'Mejor crea un taladro nuevo',output:'Revisa la propuesta.'});
  live.send({type:'turn_complete',id:'live-2',input:'Mejor crea un taladro nuevo',interrupted:false,answer:{reply:'Revisa la propuesta.',suggestedActions:[],suggestedQuestions:[],actionProposal:{type:'create_item',status:'pending',data:{name:'Taladro nuevo',binId:'a-box',binName:'Herramientas',cuantity:'1',value:'100',tags:[]}}}});
  live.audio();await expect.poll(()=>page.evaluate(()=>(window as any).__audioStarts)).toBe(2);
  live.send({type:'transcript',id:'live-3',input:'Gracias',output:'De nada.'});
  await expect.poll(()=>page.evaluate(()=>(window as any).__audioStops)).toBe(2);
  live.send({type:'turn_complete',id:'live-3',input:'Gracias',interrupted:false,answer:{reply:'De nada.',suggestedActions:[],suggestedQuestions:[]}});
  await expect(page.getByRole('button',{name:'Confirmar acción'})).toBeDisabled();
  await expect.poll(()=>live.state.chats.some(c=>c.messages.some((m:any)=>m.id==='voice-bot-live-2'))).toBe(true);
  await page.getByRole('button',{name:'Silenciar micrófono de llamada'}).click();await expect.poll(()=>live.controls.some(c=>c.type==='mute')).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__micStreams.every((s:MediaStream)=>s.getTracks().every(t=>!t.enabled)))).toBe(true);
  await page.getByRole('button',{name:'Activar micrófono de llamada'}).click();
  await page.screenshot({path:'/tmp/boxbin-gemini-live.png',fullPage:true});
  await page.getByRole('button',{name:'Finalizar llamada'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__micStreams.every((s:MediaStream)=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  await expect(page.getByRole('button',{name:'Confirmar acción'})).toBeEnabled();
  await page.getByRole('button',{name:'Confirmar acción'}).click();await expect(page.getByText('Cambio guardado correctamente.',{exact:true})).toBeVisible();expect(live.state.writes.length).toBe(1);
});

test('Live renewal retains transcript context; closing the drawer ends every microphone track',async({page})=>{
  await page.setViewportSize({width:390,height:844});const live=await liveFixture(page);
  await page.getByRole('button',{name:'Iniciar llamada con Gemini',exact:true}).click();await expect(page.getByText('Te escucho',{exact:true})).toBeVisible();
  live.send({type:'transcript',id:'first',input:'Mis cajas',output:'Tienes una caja.'});
  live.send({type:'turn_complete',id:'first',input:'Mis cajas',interrupted:false,answer:{reply:'Tienes una caja.',suggestedQuestions:[],suggestedActions:[]}});
  live.send({type:'reconnect',resumeToken:'opaque-token'});
  await expect.poll(()=>live.controls.filter(c=>c.type==='start').length).toBe(2);
  const second=live.controls.filter(c=>c.type==='start')[1];expect(second.resumeToken).toBe('opaque-token');expect(second.chatHistory.some((m:any)=>m.text==='Tienes una caja.')).toBe(true);
  await expect(page.getByText('Te escucho',{exact:true})).toBeVisible();
  live.send({type:'transcript',id:'unfinished',input:'Busca en',output:''});
  await expect(page.getByRole('button',{name:'Finalizar llamada'})).toBeInViewport();
  await page.screenshot({path:'/tmp/boxbin-gemini-live-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();await expect.poll(()=>live.controls.some(c=>c.type==='stop')).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__micStreams.every((s:MediaStream)=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  await page.getByRole('button',{name:'Abrir BoxBin Copilot',exact:true}).click();await expect(page.getByRole('textbox',{name:/^(Consulta al copiloto|Ask Copilot)$/})).toBeEnabled();
  await expect(page.getByText('Busca en',{exact:true})).toBeVisible();
});

test('Microphone permission denial leaves text chat usable and creates no Live provider connection',async({page})=>{
  let connections=0;
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
  await page.routeWebSocket('**/functions/v1/boxbin-copilot-voice',()=>{connections++;});
  await setup(page);await open(page);await page.getByRole('button',{name:'Iniciar llamada con Gemini',exact:true}).click();
  await expect(page.getByText('Permite el acceso al micrófono para hablar. El chat de texto sigue disponible.',{exact:true})).toBeVisible();expect(connections).toBe(0);
  await expect(page.getByRole('textbox',{name:/^(Consulta al copiloto|Ask Copilot)$/})).toBeEnabled();
  await send(page,'crea un taladro');await expect(page.getByText('Registrar ítem',{exact:true})).toBeVisible();
});

test('English default, LanguageSelector switches chat and dictation to Spanish and persists after reload',async({page})=>{
  await page.addInitScript(()=>{
    (window as any).__dictationLanguages=[];
    (window as any).SpeechRecognition=class {
      lang='';onstart?:()=>void;onend?:()=>void;
      start(){(window as any).__dictationLanguages.push(this.lang);this.onstart?.();}
      stop(){this.onend?.();}
    };
  });
  const state=await setup(page,null);await open(page);
  await expect(page.getByText("I'm BoxBin Copilot.",{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Start a call with Gemini'})).toBeVisible();
  await page.getByRole('button',{name:'Dictate a query',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__dictationLanguages)).toEqual(['en-US']);
  await page.getByRole('button',{name:'Stop dictation'}).click();
  await send(page,'Where are my items?');expect(state.requests.at(-1).language).toBe('en');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:/^Language/}).click();await page.getByRole('menuitem',{name:/Español/}).click();
  await page.getByRole('button',{name:'Abrir BoxBin Copilot'}).click();
  await expect(page.getByText('Soy BoxBin Copilot.',{exact:false})).toBeVisible();
  await expect(page.getByText('Where are my items?',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Dictar consulta',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__dictationLanguages)).toEqual(['en-US','es-MX']);
  await page.getByRole('button',{name:'Detener dictado'}).click();
  await send(page,'Dónde están mis ítems');expect(state.requests.at(-1).language).toBe('es');
  await page.reload();await open(page);await expect(page.getByRole('button',{name:'Iniciar llamada con Gemini'})).toBeVisible();
  await page.screenshot({path:'/tmp/boxbin-copilot-spanish.png',fullPage:true});
});

test('English Live sends and retains locale on renewal; switching locale ends capture and next call uses Spanish',async({page})=>{
  const live=await liveFixture(page,null);
  await page.getByRole('button',{name:'Start a call with Gemini'}).click();
  await expect(page.getByText('Listening',{exact:true})).toBeVisible();
  expect(live.controls.find(c=>c.type==='start').language).toBe('en');
  live.send({type:'reconnect',resumeToken:'english-token'});
  await expect.poll(()=>live.controls.filter(c=>c.type==='start').length).toBe(2);
  expect(live.controls.filter(c=>c.type==='start')[1].language).toBe('en');
  await page.screenshot({path:'/tmp/boxbin-copilot-english.png',fullPage:true});
  // Exercise the same i18next instance used by LanguageSelector while the call is open.
  await page.evaluate(async()=>{const mod=await import(/* @vite-ignore */ '/src/i18n.js');await mod.default.changeLanguage('es');});
  await expect(page.getByText('Idioma cambiado. Inicia una nueva llamada para hablar en español.',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__micStreams.every((s:MediaStream)=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  await page.getByRole('button',{name:'Iniciar llamada con Gemini'}).click();
  await expect(page.getByText('Te escucho',{exact:true})).toBeVisible();
  const latest=live.controls.filter(c=>c.type==='start').at(-1);expect(latest.language).toBe('es');expect(latest.resumeToken).toBeUndefined();
  await page.getByRole('button',{name:'Finalizar llamada'}).click();
});
