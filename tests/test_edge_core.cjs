const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../edge-extension/core.js');
const like = (id, stamp) => ({_aSubmitter: {_idRow: id}, _tsDateAdded: stamp});
const page = (rows, total, perpage = 50, done = false) => ({_aRecords: rows, _aMetadata: {_nRecordCount: total, _nPerpage: perpage, _bIsComplete: done}});
const mod = (id, stamp, likes = 1) => ({_idRow:id, _aGame:{_idRow:19567}, _tsDateAdded:stamp, _tsDateModified:199, _nLikeCount:likes});
const newState = () => ({scope:'new_week',start:100,end:200,mods:[],counts:{},errors:{},nextPage:1});

test('shared game registry matches Python source and rejects unsupported games', () => {
  const games = require('../edge-extension/games.js');
  const source = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../games.json'), 'utf8'));
  assert.deepEqual(games, source);
  for (const game of games) assert.equal(core.game(game.key).id, game.id);
  assert.throws(() => core.game(999999));
});
test('all four games use their own API filter and report identity', async () => {
  for (const game of require('../edge-extension/games.js')) {
    const state = {...newState(), game_id:game.id};
    await core.indexNewWeek(async (endpoint, query) => {
      assert.equal(query['_aFilters[Generic_Game]'], game.id);
      return page([{...mod(1,150,7),_aGame:{_idRow:game.id}}],1);
    },state);
    assert.equal(core.report(state).game.id,game.id);
    assert.equal(core.report(state).status,'complete');
    const bad = {...newState(),game_id:game.id};
    await assert.rejects(core.indexNewWeek(async()=>page([{...mod(1,150),_aGame:{_idRow:999}}],1),bad));
    assert.equal(bad.mods.length,0);
  }
});
test('per-game resume is isolated; only ZZZ migrates legacy checkpoints', () => {
  const values = new Map();
  const storage = {getItem:key=>values.get(key) || null};
  values.set('zzz-weekly-collector-checkpoint-v1',JSON.stringify({version:1,...newState()}));
  assert.equal(core.restoreCheckpoint(storage,19567).game_id,19567);
  assert.throws(()=>core.restoreCheckpoint(storage,8552),/没有/);
  for (const game of require('../edge-extension/games.js')) {
    values.set(core.checkpointKey(game.id),JSON.stringify({version:1,...newState(),game_id:game.id}));
    assert.equal(core.restoreCheckpoint(storage,game.id).game_id,game.id);
  }
  values.set(core.checkpointKey(8552),JSON.stringify({version:1,...newState(),game_id:19567}));
  assert.throws(()=>core.restoreCheckpoint(storage,8552),/不匹配/);
});
test('generated HTML uses selected-game defaults and still accepts custom titles', () => {
  require('../edge-extension/showcase.js');
  for (const game of require('../edge-extension/games.js')) {
    const report = {game,results:[]};
    const html = globalThis.ZZZShowcase.render(report);
    const config = JSON.parse(html.match(/id="site-config">([\s\S]*?)<\/script>/)[1]);
    assert.equal(config.title,game.title);
    const custom = globalThis.ZZZShowcase.render(report,{title:'My edition'});
    assert.equal(JSON.parse(custom.match(/id="site-config">([\s\S]*?)<\/script>/)[1]).title,'My edition');
  }
});

test('new-week scans only recent pages, includes Monday, excludes updated old mods, makes no Likes requests', async () => {
  const state=newState(), calls=[];
  const pages=[page([mod(1,200),mod(2,199,4)],5650,2),page([mod(2,199,4),mod(3,100,7)],5650,2),page([mod(4,99,900)],5650,2)];
  await core.indexNewWeek(async (endpoint,q)=>{calls.push(endpoint);return pages[q._nPage-1];},state);
  assert.deepEqual(calls,['Mod/Index','Mod/Index','Mod/Index']);
  assert.deepEqual(state.mods.map(r=>r.id),[2,3]);
  const result=core.report(state);
  assert.equal(result.status,'complete');
  assert.equal(result.selection.mode,'new_week');
  assert.deepEqual(result.results.map(r=>[r.id,r.weekly_likes]),[[3,7],[2,4]]);
  assert.equal(result.index_pages_read,3);
});
test('new-week rejects bad order and identity without committing a partial page', async () => {
  for(const rows of [[mod(1,99),mod(2,150)], [{...mod(1,150),_tsDateAdded:null}], [{...mod(1,150),_aGame:{_idRow:1}}]]) {
    const state=newState();
    await assert.rejects(core.indexNewWeek(async()=>page(rows,rows.length),state));
    assert.equal(state.mods.length,0);
    assert.equal(core.report(state).status,'partial');
  }
});
test('new-week verifies an omitted count with one total request, including legitimate zero', async () => {
  const omitted=mod(1,190);delete omitted._nLikeCount;
  const state=newState(),calls=[];
  await core.indexNewWeek(async(endpoint,q)=>{
    calls.push(endpoint);
    if(endpoint==='Mod/Index')return page([omitted,mod(2,180,null),mod(3,99)],5650);
    assert.equal(q._nPage,1);assert.equal(q._nPerpage,1);
    if(endpoint==='Mod/1/Likes')return page([],0);
    if(endpoint==='Mod/2/Likes')return page([like(42,170)],3);
    throw new Error('unexpected endpoint');
  },state);
  assert.deepEqual(calls,['Mod/Index','Mod/1/Likes','Mod/2/Likes']);
  assert.equal(core.report(state).status,'complete');
  assert.deepEqual(core.report(state).results.map(r=>[r.id,r.weekly_likes]),[[2,3],[1,0]]);
  assert.equal(state.mods[0].likes_source,'likes_metadata');
});
test('valid zero and digit strings require no fallback; malformed values must be verified', async () => {
  const noRequest=async()=>{throw new Error('must not request');};
  for(const [input,expected] of [[0,0],[12,12],['0',0],['12',12]]) {
    assert.deepEqual(await core.totalLikes(noRequest,1,input),{likes:expected,source:'index'});
  }
  for(const input of [undefined,null,'',false,-1,1.5,'3x']) {
    let calls=0;
    const result=await core.totalLikes(async()=>{calls++;return page([],0);},1,input);
    assert.equal(calls,1);assert.equal(result.likes,0);assert.equal(result.source,'likes_metadata');
  }
});
test('failed fallback keeps the page uncommitted and retry can recover', async () => {
  const state=newState(),rows=[mod(1,190,7),mod(2,180,null),mod(3,99)];
  await assert.rejects(core.indexNewWeek(async endpoint=>{
    if(endpoint==='Mod/Index')return page(rows,5650);
    throw new Error('HTTP 403');
  },state),/Mod #2.*HTTP 403/);
  assert.equal(state.mods.length,0);assert.equal(state.nextPage,1);
  assert.equal(core.report(state).status,'partial');
  await core.indexNewWeek(async endpoint=>endpoint==='Mod/Index'?page(rows,5650):page([],0),state);
  assert.equal(core.report(state).status,'complete');
});
test('missing fallback metadata does not silently become zero', async () => {
  await assert.rejects(core.totalLikes(async()=>({_aRecords:[],_aMetadata:{}}),7,null),/Mod #7/);
});
test('new-week resumes saved pages and catches repeated pages', async () => {
  const state=newState();let paused=false;
  await core.indexNewWeek(async()=>page([mod(1,190)],100,1),state,()=>{paused=true;},()=>paused);
  assert.equal(state.nextPage,2);
  await assert.rejects(core.indexNewWeek(async()=>page([mod(1,190)],100,1),state));
  await core.indexNewWeek(async(_,q)=>{assert.equal(q._nPage,2);return page([mod(2,99)],100,1);},state);
  assert.equal(core.report(state).status,'complete');
});
test('new-week empty week completes and changing index remains partial', async () => {
  const state=newState();
  await core.indexNewWeek(async()=>page([mod(1,99)],5650),state);
  assert.equal(core.report(state).status,'complete');
  assert.equal(core.report(state).results.length,0);
  state.indexChanged=true;
  assert.equal(core.report(state).status,'partial');
});

test('Beijing week is Monday, not last seven days', () => {
  const result = core.weekWindow(Date.parse('2026-10-02T12:00:00Z'));
  assert.equal(core.iso(result.start), '2026-09-28T00:00:00+08:00');
  assert.equal(core.iso(result.end), '2026-10-02T20:00:00+08:00');
});
test('cross-page deduplication and inclusive Monday/exclusive cutoff', async () => {
  const pages = [page([like(1, 200), like(2, 199)], 6, 2), page([like(2, 199), like(3, 100)], 6, 2), page([like(4, 99)], 6, 2, true)];
  const result = await core.countLikes(async (_, query) => pages[query._nPage - 1], 1, 100, 200);
  assert.equal(result.weekly_likes, 2);
  assert.equal(result.like_pages_read, 3);
});
test('unordered API results fail rather than silently miscount', async () => {
  await assert.rejects(core.countLikes(async () => page([like(1, 100), like(2, 199)], 2, 50, true), 1, 100, 200));
});
test('repeated page fails', async () => {
  await assert.rejects(core.countLikes(async () => page([like(1, 199)], 1000), 1, 100, 200));
});
test('empty page before end fails', () => {
  assert.throws(() => core.parsePage(page([], 100), 1));
});
test('zero likes is legitimate', async () => {
  assert.equal((await core.countLikes(async () => page([], 0, 50, true), 1, 100, 200)).weekly_likes, 0);
});
test('scope and errors govern completion, ties are stable', () => {
  const state = {start: 100, end: 200, mods: [{id: 2}, {id: 1}], counts: {1: {weekly_likes: 3}, 2: {weekly_likes: 3}}, errors: {}, indexDone: true, siteTotal: 2};
  assert.equal(core.report(state).status, 'complete');
  assert.deepEqual(core.report(state).results.map(row => row.id), [1, 2]);
  for (const diff of [{limited: true}, {indexChanged: true}, {errors: {4: 'HTTP 403'}}, {siteTotal: 3}, {counts: {1: {weekly_likes: 3}}}]) assert.equal(core.report({...state, ...diff}).status, 'partial');
});
test('exports escape script and spreadsheet formulas', () => {
  assert.equal(core.csvCell('=1+1'), '"\'=1+1"');
  assert.equal(core.csvCell('a"b'), '"a""b"');
  assert.equal(core.escapeHtml('<script>'), '&lt;script&gt;');
});

test('generated showcase preserves JSON and prevents script termination', () => {
  require('../edge-extension/showcase.js');
  const report={status:'partial',results:[{name:'</script><script>alert(1)</script> __CONFIG_JSON__'}]};
  const html=globalThis.ZZZShowcase.render(report,{title:'Custom edition'});
  const content=html.match(/id="report-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(content),report);
  assert.equal(html.includes('</script><script>alert(1)'),false);
});

test('report distinguishes latest sample from full collection', () => {
  const state={start:100,end:200,mods:[],counts:{},errors:{},siteTotal:100,maxMods:20};
  assert.equal(core.report(state).selection.mode,'latest_sample');
  assert.equal(core.report(state).selection.limit,20);
  assert.equal(core.report({...state,maxMods:0}).selection.mode,'all_visible');
});

test('source-visible rated images display; local toggle works for legacy reports', () => {
  const fs=require('node:fs');
  const path=require('node:path');
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');
  const start=source.indexOf('  function canShowImages(row)');
  const end=source.indexOf('  function applyConfig()',start);
  const context={config:{show_rated_images:false}};
  vm.runInNewContext(source.slice(start,end),context);
  assert.equal(context.canShowImages({sensitive:true,source_visibility:'show'}),true);
  assert.equal(context.canShowImages({sensitive:true,source_visibility:'hide'}),false);
  assert.equal(context.canShowImages({sensitive:false}),true);
  assert.equal(context.canShowImages({sensitive:true}),false);
  context.config.show_rated_images=true;
  assert.equal(context.canShowImages({sensitive:true}),true);
  assert.equal(context.canShowImages({sensitive:true,source_visibility:'hide'}),true);
});
