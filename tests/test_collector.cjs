// Collector integration tests: real orchestration and exports, isolated DOM/network/storage.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../edge-extension/core.js');
require('../edge-extension/showcase.js');
const games = require('../edge-extension/games.js');

class Element {
  constructor() {this.children=[];this.hidden=false;this.disabled=false;this.style={};}
  append(...items) {this.children.push(...items);}
  appendChild(item) {this.children.push(item);return item;}
  replaceChildren(...items) {this.children=[...items];}
  attachShadow() {return {};}
  remove() {}
}
function harness({storage=new Map(), request}={}) {
  const elements = new Map();
  const $ = id => {if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const calls=[], messages=[];
  let selected=games[0], onChange;
  const ui = {$, get game(){return selected;}, select(id){selected=core.game(id);onChange(selected);},
    message(text,phase,error){messages.push({text,phase,error});},
    busy(value){for(const id of ['start','resume','trial','close'])$(id).disabled=value;},
    reset(){ $('downloads').replaceChildren();$('downloads').hidden=true;}, progress(state,phase,text){messages.push({text,phase});}
  };
  const context = vm.createContext({
    ZZZCollectorCore:core, ModGames:games, ZZZShowcase:globalThis.ZZZShowcase,
    ZZZMedia:{normalize:detail=>({media_schema:2,author:'Test author',images:[],files:[],view_count:10,total_likes_at_scan:detail._nLikeCount})},
    ModPanel:{create(root,options){onChange=options.onChange;selected=core.game(options.gameId);return ui;}},
    document:{getElementById:()=>null, createElement:()=>new Element(), documentElement:new Element()},
    localStorage:{getItem:key=>storage.get(key)||null, setItem:(key,value)=>storage.set(key,String(value))},
    location:{origin:'https://gamebanana.com'}, navigator:{locks:{request:async(key,options,fn)=>fn({name:key})}},
    URL,URLSearchParams,Blob,AbortController,Promise,
    setTimeout(fn,ms){if(ms<25000)setImmediate(fn);return 1;},clearTimeout(){},
    async fetch(url){calls.push(new URL(url));return request(new URL(url));},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../edge-extension/collector.js'),'utf8'),context);
  return {ui,calls,messages,storage,context};
}
function response(data){return {ok:true,json:async()=>data};}
function fixture(url) {
  const {start,end}=core.weekWindow();
  if(url.pathname.endsWith('/Mod/Index')) {
    const gameId=Number(url.searchParams.get('_aFilters[Generic_Game]'));
    const rows=Array.from({length:12},(_,i)=>({_idRow:gameId*100+i,_aGame:{_idRow:gameId},_tsDateAdded:end-i-1,_nLikeCount:i,_sName:`Mod ${i}`}));
    rows.push({_idRow:gameId*100+20,_aGame:{_idRow:gameId},_tsDateAdded:start-1,_nLikeCount:999});
    return response({_aRecords:rows,_aMetadata:{_nRecordCount:100,_nPerpage:50}});
  }
  const id=Number(url.pathname.split('/')[3]);
  const gameId=Math.floor(id/100);
  return response({_idRow:id,_aGame:{_idRow:gameId},_nLikeCount:id%100});
}

test('four-game collect -> details -> HTML/JSON exports -> switch -> resume preserves each game', async()=>{
  const h=harness({request:fixture});
  for(const game of games) {
    h.ui.select(game.id);
    await h.ui.$('start').onclick();
    assert.equal(h.ui.$('start').disabled,false);
    assert.equal(h.ui.$('downloads').children.length,4);
    const saved=JSON.parse(h.storage.get(core.checkpointKey(game.id)));
    assert.equal(saved.game_id,game.id);
    assert.equal(saved.mods.length,12);
    assert.equal(Object.keys(saved.details).length,10);
    const links=h.ui.$('downloads').children;
    assert.ok(links.every(a=>a.download.startsWith(game.key+'_')));
    const html=await (await fetch(links[0].href)).text();
    assert.equal(JSON.parse(html.match(/id="site-config">([\s\S]*?)<\/script>/)[1]).title,game.title);
    const report=await (await fetch(links[1].href)).json();
    assert.equal(report.game.id,game.id);
    assert.equal(report.status,'complete');
    assert.equal(report.results.length,10);
    assert.equal(report.results[0].weekly_likes,11);
    assert.ok(report.results.every(row=>Math.floor(row.id/100)===game.id));
    const before=h.calls.length;
    await h.ui.$('resume').onclick();
    assert.equal(h.calls.length,before,'completed resume must not repeat API calls');
    assert.equal(JSON.parse(h.storage.get(core.checkpointKey(game.id))).end,saved.end);
  }
  assert.equal([...h.storage.keys()].filter(key=>/^mod-journal-checkpoint-v2-\d+$/.test(key)).length,4);
});
test('collection locks switching, stopping saves progress, resuming completes details', async()=>{
  let release, entered;
  const started=new Promise(resolve=>entered=resolve);
  const hold=new Promise(resolve=>release=resolve);
  const h=harness({request:async url=>{if(url.pathname.endsWith('/Mod/Index')){entered();await hold;}return fixture(url);}});
  h.ui.select(8552);
  const work=h.ui.$('start').onclick();
  await started;
  assert.equal(h.ui.$('start').disabled,true);
  assert.throws(()=>h.context.ModJournalSelectGame(20357),/停止后/);
  h.ui.$('stop').onclick();release();await work;
  assert.equal(h.ui.$('start').disabled,false);
  assert.ok(h.messages.some(m=>m.phase==='已停止 · 进度已保存'));
  assert.equal(Object.keys(JSON.parse(h.storage.get(core.checkpointKey(8552))).details || {}).length,0);
  await h.ui.$('resume').onclick();
  assert.equal(Object.keys(JSON.parse(h.storage.get(core.checkpointKey(8552))).details).length,10);
});
test('HTTP denial unlocks controls, shows error, and offers no empty partial exports', async()=>{
  const h=harness({request:async()=>({ok:false,status:403})});
  await h.ui.$('start').onclick();
  assert.equal(h.ui.$('start').disabled,false);
  assert.equal(h.ui.$('downloads').children.length,0);
  assert.ok(h.messages.some(m=>m.error && m.text.includes('HTTP 403')));
});
test('resuming a new game cannot accidentally use the legacy ZZZ checkpoint', async()=>{
  const state={version:1,scope:'new_week',...core.weekWindow(),mods:[],counts:{},errors:{},nextPage:1,indexDone:true};
  const h=harness({storage:new Map([['zzz-weekly-collector-checkpoint-v1',JSON.stringify(state)]]),request:fixture});
  h.ui.select(18366);await h.ui.$('resume').onclick();
  assert.equal(h.calls.length,0);
  assert.ok(h.messages.some(m=>m.error && m.text.includes('没有')));
  h.ui.select(19567);await h.ui.$('resume').onclick();
  assert.equal(h.ui.$('downloads').children.length,4);
});
