document.getElementById('open').addEventListener('click', async () => {
  const status = document.getElementById('status');
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.url || new URL(tab.url).origin !== 'https://gamebanana.com') {
      throw new Error('请先切换到 https://gamebanana.com 的已登录页面');
    }
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['core.js', 'media.js', 'showcase.js', 'collector.js']});
    status.textContent = '采集面板已打开，可以关闭这个弹窗';
  } catch (error) {
    status.textContent = error.message;
  }
});
