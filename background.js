// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_RECORDING') {
    // 处理录制数据的保存
    chrome.storage.local.set({ 'tempRecording': request.data }, () => {
      sendResponse({ success: true });
    });
    return true; // 保持消息通道开放
  } else if (request.type === 'LOAD_RECORDING') {
    // 处理录制数据的加载
    chrome.storage.local.get(['tempRecording'], (result) => {
      sendResponse({ data: result.tempRecording });
    });
    return true;
  } else if (request.type === 'CLEAR_RECORDING') {
    // 清理临时录制数据
    chrome.storage.local.remove('tempRecording', () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// 定期清理过期的临时数据
setInterval(() => {
  chrome.storage.local.get(['tempRecording', 'lastAccess'], (result) => {
    if (result.tempRecording && result.lastAccess) {
      const lastAccess = new Date(result.lastAccess);
      const now = new Date();
      const hoursDiff = (now - lastAccess) / (1000 * 60 * 60);
      
      if (hoursDiff > 24) { // 24小时后清理
        chrome.storage.local.remove(['tempRecording', 'lastAccess']);
      }
    }
  });
}, 3600000); // 每小时检查一次

// 监听扩展安装或更新
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 初始化存储
    chrome.storage.local.set({
      'settings': {
        'quality': 'medium',
        'audioSource': 'systemAudio',
        'captureRange': 'screen'
      }
    });
  }
});

// 监听图标点击事件
chrome.action.onClicked.addListener((tab) => {
  // 向 popup 发送消息，请求恢复窗口
  chrome.runtime.sendMessage({ action: 'restorePopup' });
});
