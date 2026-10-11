const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('../edge-extension/core.js');

function popup(url) {
  const calls=[],messages=[],values=new Map();
  let selected=core.game(),change;
  const button={};
  const ui={get game(){return selected;},$:()=>button,busy(value){button.disabled=value;},
    message(text,phase,error){messages.push({text,phase,error});},select(id){selected=core.game(id);change(selected);}};
  const context=vm.createContext({ZZZCollectorCore:core,
    document:{getElementById:()=>({})},
    localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},
    ModPanel:{create(root,options){selected=core.game(options.gameId);change=options.onChange;return ui;}},
    chrome:{tabs:{query:async()=>[{id:12,url}]},scripting:{executeScript:async request=>{calls.push(request);}}},
    URL});
  button.addEventListener=(event,callback)=>{button.click=callback;};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../edge-extension/popup.js'),'utf8'),context);
  return {ui,button,calls,messages,values};
}
test('popup passes the selected game to the in-page collector and persists selection',async()=>{
  const h=popup('https://gamebanana.com/mods/games/19567');
  h.ui.select(20357);await h.button.click();
  assert.equal(h.values.get('mod-journal-selected-game'),20357);
  assert.equal(h.calls.length,3);
  assert.deepEqual(Array.from(h.calls[0].files),['games.js','core.js','media.js','showcase.js','panel.js']);
  assert.equal(h.calls[1].args[0],20357);
  assert.equal(h.calls[2].files[0],'collector.js');
  assert.equal(h.button.disabled,false);
  assert.ok(h.messages.some(m=>m.text.includes('鸣潮的采集面板已打开')));
});
test('popup refuses a non-GameBanana tab without injecting scripts',async()=>{
  const h=popup('https://example.com/');await h.button.click();
  assert.equal(h.calls.length,0);
  assert.equal(h.button.disabled,false);
  assert.ok(h.messages.some(m=>m.error && m.text.includes('登录 GameBanana')));
});
