// 存储当前的录制状态
let recordingState = {
  isRecording: false,
  startTime: null,
  options: null,
  videoQuality: 'medium',
  audioSource: 'none',
  captureRange: 'screen'
};

// 用于存储录制的计时器
let recordingTimer = null;

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

// 初始化扩展
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 初始化存储 - service worker中没有window对象，使用默认主题
    chrome.storage.local.set({
      'settings': {
        'quality': 'medium',
        'audioSource': 'systemAudio',
        'captureRange': 'screen',
        'maxDuration': 30
      },
      'language': navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en',
      'theme': 'light' // 默认使用浅色主题，在popup中可以根据系统偏好更新
    });
  }
});

// 监听popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.action);
  
  // 获取录制状态
  if (message.action === 'getRecordingState') {
    sendResponse(recordingState);
    return true;
  }
  
  // 更新录制状态
  if (message.action === 'updateRecordingState') {
    recordingState.isRecording = message.isRecording;
    if (message.startTime) {
      recordingState.startTime = message.startTime;
    }
    updateIcon(message.isRecording);
    sendResponse({ success: true });
    return true;
  }
  
  // 启动录制
  if (message.action === 'startRecording') {
    // 保存录制参数
    recordingState.videoQuality = message.videoQuality || 'medium';
    recordingState.audioSource = message.audioSource || 'none';
    recordingState.captureRange = message.captureRange || 'screen';
    
    // 更新状态
    recordingState.isRecording = true;
    recordingState.startTime = Date.now();
    
    // 更新图标
    updateIcon(true);
    
    // 启动计时器
    startRecordingTimer();
    
    sendResponse({ success: true });
    return true;
  }
  
  // 停止录制
  if (message.action === 'stopRecording') {
    // 更新状态
    recordingState.isRecording = false;
    
    // 更新图标
    updateIcon(false);
    
    // 停止计时器
    clearRecordingTimer();
    
    sendResponse({ success: true });
    return true;
  }
  
  // 重置录制状态
  if (message.action === 'resetRecordingState') {
    resetRecordingState();
    sendResponse({ success: true });
    return true;
  }
  
  // 检查活动标签
  if (message.action === 'checkActiveTab') {
    checkActiveTabForRecording().then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ canRecord: false, error: error.message });
    });
    return true;
  }
  
  // 默认响应
  sendResponse({ success: false, error: '未知的操作请求' });
  return true;
});

// 更新扩展图标
function updateIcon(isRecording) {
  try {
    // 使用简单的字符串路径，避免对象结构
    const iconPath = isRecording ? 
      'favicon/web-app-manifest-512x512.png' : 
      'favicon/web-app-manifest-192x192.png';
    
    chrome.action.setIcon({ path: iconPath });
  } catch (error) {
    console.error('更新图标错误:', error);
  }
}

// 重置录制状态
function resetRecordingState() {
  recordingState.isRecording = false;
  recordingState.startTime = null;
  updateIcon(false);
  clearRecordingTimer();
}

// 开始录制计时器，检查录制状态
function startRecordingTimer() {
  // 确保没有运行中的计时器
  clearRecordingTimer();
  
  // 设置新的计时器，每秒检查一次
  recordingTimer = setInterval(() => {
    // 检查录制是否应该继续
    if (recordingState.isRecording) {
      // 检查录制时长
      const duration = Math.floor((Date.now() - recordingState.startTime) / 1000 / 60);
      
      // 获取设置的最大时长
      chrome.storage.local.get(['settings'], (result) => {
        const settings = result.settings || { maxDuration: 30 };
        
        // 如果超过最大时长，自动停止
        if (settings.maxDuration > 0 && duration >= settings.maxDuration) {
          // 更新状态
          recordingState.isRecording = false;
          
          // 更新图标
          updateIcon(false);
          
          // 通知popup录制已停止
          chrome.runtime.sendMessage({ 
            action: 'recordingTimedOut',
            message: '已达到最大录制时长，录制已自动停止'
          });
          
          // 停止计时器
          clearRecordingTimer();
        }
      });
      
      // 发送更新消息给popup
      chrome.runtime.sendMessage({ 
        action: 'recordingUpdate',
        duration: Date.now() - recordingState.startTime
      });
    }
  }, 1000);
}

// 清除录制计时器
function clearRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

// 检查活动标签是否可以录制
async function checkActiveTabForRecording() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs || tabs.length === 0) {
        resolve({ 
          canRecord: false, 
          error: '没有找到活动标签页，请确保有打开的网页' 
        });
        return;
      }
      
      const currentTab = tabs[0];
      if (!currentTab.url || 
          currentTab.url.startsWith('chrome://') || 
          currentTab.url.startsWith('edge://') || 
          currentTab.url.startsWith('about:') ||
          currentTab.url === 'newtab') {
        resolve({ 
          canRecord: false, 
          error: '无法在浏览器内部页面上录制，请切换到普通网页后再试'
        });
        return;
      }
      
      resolve({ canRecord: true, tabId: currentTab.id });
    });
  });
}

// 监听扩展图标点击
chrome.action.onClicked.addListener((tab) => {
  // 如果正在录制，则打开popup
  if (recordingState.isRecording) {
    chrome.action.openPopup();
  }
});

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // 如果标签页关闭但录制仍在进行，确保继续录制
  if (recordingState.isRecording) {
    console.log('标签页关闭，但录制仍在继续');
  }
});
