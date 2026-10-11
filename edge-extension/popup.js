(() => {
  const core = globalThis.ZZZCollectorCore;
  let selected = 19567;
  try { selected = core.game(Number(localStorage.getItem('mod-journal-selected-game')) || 19567).id; } catch { /* Use default if an old preference is invalid. */ }
  const ui = globalThis.ModPanel.create(document.getElementById('app'), {popup:true, gameId:selected,
    onChange(game) {
      try { localStorage.setItem('mod-journal-selected-game', game.id); } catch { /* Selection still works without persistence. */ }
      ui.message(`已选择${game.name}，可在任意 GameBanana 标签页打开采集面板。`, '准备好，开始新的发现');
    }
  });
  ui.$('open').addEventListener('click', async () => {
    ui.busy(true);
    try {
      if (!globalThis.chrome?.scripting) throw new Error('请在 Edge 扩展中打开此面板');
      const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
      if (!tab?.url || new URL(tab.url).origin !== 'https://gamebanana.com') throw new Error('请先打开并登录 GameBanana，再点击打开采集面板');
      await chrome.scripting.executeScript({target:{tabId:tab.id}, files:['games.js','core.js','media.js','showcase.js','panel.js']});
      await chrome.scripting.executeScript({target:{tabId:tab.id}, func:gameId => {globalThis.ModJournalRequestedGame = gameId;}, args:[ui.game.id]});
      await chrome.scripting.executeScript({target:{tabId:tab.id}, files:['collector.js']});
      ui.message(`${ui.game.name}的采集面板已打开，可以关闭这个弹窗。`, '面板已就绪');
    } catch (error) { ui.message(error.message, '暂时无法打开', true); }
    finally { ui.busy(false); }
  });
})();
