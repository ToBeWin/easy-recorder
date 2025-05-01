// popup.js

// 通过全局变量获取 ffmpeg API
var createFFmpeg = window.createFFmpeg;
var fetchFile = window.fetchFile;
var ffmpegInstance = null;

// 国际化文本配置
var i18nTexts = {
  zh: {
    title: "录屏助手",
    header: "录屏助手",
    screenshot: "截图",
    captureScreenshot: "捕获截图",
    recording: "录制",
    selectRange: "选择录制范围：",
    fullDesktop: "全屏",
    browserWindow: "窗口",
    customArea: "浏览器标签",
    startRecording: "开始录制",
    stopRecording: "停止录制",
    statusRecording: "录制中...",
    statusStopped: "录制已停止",
    statusScreenshot: "截图已捕获",
    duration: "时长：",
    size: "大小：",
    quality: "质量：",
    high: "高质量",
    medium: "中等质量",
    low: "低质量",
    audio: "音频",
    video: "视频",
    both: "视频和音频",
    selectAudio: "选择音频源：",
    systemAudio: "系统音频",
    microphone: "麦克风",
    none: "无音频",
    toggleLanguage: "切换语言",
    toggleTheme: "切换主题",
    settings: "设置",
    screenshotTooltip: "捕获当前屏幕",
    startRecordingTooltip: "开始录制",
    stopRecordingTooltip: "停止录制",
    autoSave: "自动保存：",
    enabled: "启用",
    disabled: "禁用",
    maxDuration: "最大时长(分钟)：",
    fileNameFormat: "文件名格式：",
    recordingHistory: "录制历史",
    statusError: "错误：",
    statusCountdown: "将在 ",
    download: "下载",
    delete: "删除"
  },
  en: {
    title: "Easy Recorder",
    header: "Easy Recorder",
    screenshot: "Screenshot",
    captureScreenshot: "Capture Screenshot",
    recording: "Recording",
    selectRange: "Select Recording Range:",
    fullDesktop: "Full Screen",
    browserWindow: "Window",
    customArea: "Browser Tab",
    startRecording: "Start Recording",
    stopRecording: "Stop Recording",
    statusRecording: "Recording...",
    statusStopped: "Recording Stopped",
    statusScreenshot: "Screenshot Captured",
    duration: "Duration:",
    size: "Size:",
    quality: "Quality:",
    high: "High",
    medium: "Medium",
    low: "Low",
    audio: "Audio",
    video: "Video",
    both: "Video and Audio",
    selectAudio: "Select Audio Source:",
    systemAudio: "System Audio",
    microphone: "Microphone",
    none: "No Audio",
    toggleLanguage: "Toggle Language",
    toggleTheme: "Toggle Theme",
    settings: "Settings",
    screenshotTooltip: "Capture Current Screen",
    startRecordingTooltip: "Start Recording",
    stopRecordingTooltip: "Stop Recording",
    autoSave: "Auto Save:",
    enabled: "Enabled",
    disabled: "Disabled",
    maxDuration: "Max Duration (minutes):",
    fileNameFormat: "File Name Format:",
    recordingHistory: "Recording History",
    statusError: "Error:",
    statusCountdown: "Starting in ",
    download: "Download",
    delete: "Delete"
  }
};

var currentLang = 'zh';
var mediaStream = null;
var mediaRecorder = null;
var recordedChunks = [];
var recordingStartTime = null;
var recordingTimer = null;
var isRecording = false;
var recordingInterval = null;

// 添加全局变量，防止同时触发多次录制请求
let pendingRecordingRequest = false;

// 添加新的状态变量来跟踪媒体流的获取状态
let isGettingMedia = false;

// 添加新的状态管理
const RecordingState = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  RECORDING: 'recording',
  STOPPING: 'stopping'
};

let currentState = RecordingState.IDLE;

// 初始化 FFmpeg
async function initFFmpeg() {
  try {
    console.log('Checking FFmpeg availability:', {
      createFFmpeg: typeof createFFmpeg,
      fetchFile: typeof fetchFile
    });

    if (typeof createFFmpeg === 'undefined' || typeof fetchFile === 'undefined') {
      throw new Error(currentLang === 'zh' ? 
        'FFmpeg 库未正确加载，请检查控制台错误信息' : 
        'FFmpeg library not loaded correctly, please check console errors');
    }

    console.log('Creating FFmpeg instance...');
    ffmpegInstance = createFFmpeg({
      log: true,
      logger: ({ type, message }) => {
        console.log(`[FFmpeg ${type}]`, message);
        if (type === 'ffout') {
          updateConversionProgress(message);
        }
      },
      corePath: chrome.runtime.getURL('lib/ffmpeg-core.js')
    });

    console.log('Loading FFmpeg...');
    document.getElementById("status").textContent = 
      currentLang === 'zh' ? '正在加载 FFmpeg...' : 'Loading FFmpeg...';
    
    await ffmpegInstance.load();
    console.log('FFmpeg loaded successfully');
    document.getElementById("status").textContent = '';
    
    return true;
  } catch (error) {
    console.error('FFmpeg initialization error:', error);
    document.getElementById("status").textContent = currentLang === 'zh' ? 
      `FFmpeg 初始化失败: ${error.message}` : 
      `FFmpeg initialization failed: ${error.message}`;
    return false;
  }
}

// 更新界面文本
function updateTexts() {
  // 更新按钮文本
  document.getElementById("screenshotBtn").textContent = i18nTexts[currentLang].screenshot;
  document.getElementById("startRec").textContent = i18nTexts[currentLang].startRecording;
  document.getElementById("stopRec").textContent = i18nTexts[currentLang].stopRecording;
  
  // 更新标题
  document.querySelector("h1").textContent = i18nTexts[currentLang].header;
  document.title = i18nTexts[currentLang].title;
  
  // 更新悬浮提示
  const langToggle = document.getElementById("langToggle");
  if (langToggle) {
    langToggle.title = i18nTexts[currentLang].toggleLanguage;
  }
  
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.title = i18nTexts[currentLang].toggleTheme;
  }
  
  // 更新状态文本
  if (!isRecording) {
    document.getElementById("status").textContent = i18nTexts[currentLang].statusStopped;
  }

  // 更新历史记录列表
  chrome.storage.local.get(['recordingHistory'], (result) => {
    const history = result.recordingHistory || [];
    updateHistoryList(history);
  });
}

// 更新录制状态
function updateRecordingStats() {
  if (!recordingStartTime) return;
  
  const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
  const size = calculateFileSize(recordedChunks);
  
  const durationElement = document.getElementById("recordingDuration");
  const sizeElement = document.getElementById("recordingSize");
  
  if (durationElement) {
    durationElement.textContent = 
      `${i18nTexts[currentLang].duration} ${formatDuration(duration)}`;
  }
  
  if (sizeElement) {
    sizeElement.textContent = 
      `${i18nTexts[currentLang].size} ${formatFileSize(size)}`;
  }
}

// 格式化时长
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 计算文件大小
function calculateFileSize(chunks) {
  return chunks.reduce((acc, chunk) => acc + chunk.size, 0);
}

// 深色模式支持
function initTheme() {
  const themeToggle = document.getElementById("themeToggle");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  
  // 检查本地存储中的主题设置
  chrome.storage.local.get("theme", (result) => {
    const theme = result.theme || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
  });
  
  // 不再在这里添加事件监听器，统一在DOMContentLoaded中添加
}

// 切换主题函数
function toggleTheme() {
  console.log('切换主题');
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  document.getElementById("themeToggle").textContent = newTheme === "dark" ? "☀️" : "🌙";
  chrome.storage.local.set({ theme: newTheme });
}

// 键盘快捷键支持
function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "r":
          e.preventDefault();
          if (!document.getElementById("startRec").disabled) {
            startRecording();
          }
          break;
        case "s":
          e.preventDefault();
          if (!document.getElementById("stopRec").disabled) {
            stopRecording();
          }
          break;
        case "p":
          e.preventDefault();
          captureScreenshot();
          break;
      }
    }
  });
}

// 倒计时函数
function startCountdown(seconds, callback) {
  let count = seconds;
  const status = document.getElementById("status");
  status.className = "status";
  
  const countdown = setInterval(() => {
    if (count > 0) {
      status.textContent = currentLang === "zh" ? 
        `录制将在 ${count} 秒后开始...` : 
        `Recording will start in ${count}...`;
      count--;
    } else {
      clearInterval(countdown);
      status.textContent = "";
      if (typeof callback === 'function') {
        callback();
      }
    }
  }, 1000);
}

// 保存到历史记录
function saveToHistory(blob, fileName) {
  const historyItem = {
    name: fileName,
    size: blob.size,
    date: new Date().toISOString(),
    url: URL.createObjectURL(blob)
  };

  // 从存储中获取历史记录
  chrome.storage.local.get(['recordingHistory'], (result) => {
    let history = result.recordingHistory || [];
    
    // 添加新记录到开头
    history.unshift(historyItem);
    
    // 只保留最近的10条记录
    if (history.length > 10) {
      history = history.slice(0, 10);
    }
    
    // 保存到存储
    chrome.storage.local.set({ recordingHistory: history }, () => {
      // 更新历史记录显示
      updateHistoryList(history);
    });
  });
}

// 更新历史记录列表
function updateHistoryList(history) {
  const historyList = document.getElementById('historyList');
  if (!historyList) return;

  historyList.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-name">${item.name}</div>
      <div class="history-info">
        <span>${formatFileSize(item.size)}</span>
        <span>${new Date(item.date).toLocaleString()}</span>
      </div>
      <div class="history-actions">
        <button class="download-btn" data-url="${item.url}">${i18nTexts[currentLang].download}</button>
        <button class="delete-btn" data-date="${item.date}">${i18nTexts[currentLang].delete}</button>
      </div>
    </div>
  `).join('');

  // 添加事件监听器
  historyList.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.target.dataset.url;
      const a = document.createElement('a');
      a.href = url;
      a.download = e.target.closest('.history-item').querySelector('.history-name').textContent;
      a.click();
    });
  });

  historyList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const date = e.target.dataset.date;
      chrome.storage.local.get(['recordingHistory'], (result) => {
        let history = result.recordingHistory || [];
        history = history.filter(item => item.date !== date);
        chrome.storage.local.set({ recordingHistory: history }, () => {
          updateHistoryList(history);
        });
      });
    });
  });
}

// 获取录制约束参数
function getCaptureConstraints() {
  const constraints = {
    video: {
      mediaSource: 'screen'
    }
  };

  return constraints;
}

// 生成文件名
function generateFileName() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `recording_${date}_${time}.webm`;
}

// 更新预览视频
function updatePreviewVideo(stream) {
  try {
    console.log('更新预览视频', stream);
    const previewVideo = document.getElementById('previewVideo');
    if (previewVideo) {
      previewVideo.srcObject = stream;
      previewVideo.muted = true;
      
      console.log('设置预览视频元素属性');
      previewVideo.style.width = '100%';
      previewVideo.style.height = 'auto';
      previewVideo.style.display = 'block';
      previewVideo.style.background = 'black';
      
      previewVideo.onloadedmetadata = () => {
        console.log('预览视频元数据已加载');
        previewVideo.play().catch(err => {
          console.error('预览视频播放失败:', err);
        });
      };
    } else {
      console.error('预览视频元素不存在，无法更新');
    }
  } catch (error) {
    console.error('更新预览视频出错:', error);
  }
}

// 更新预览窗口样式，确保可见
function addVideoPreview() {
  try {
    // 如果已存在预览元素，先移除
    const existingPreview = document.getElementById('videoPreview');
    if (existingPreview) {
      console.log('移除已存在的预览窗口');
      existingPreview.remove();
    }
    
    console.log('添加视频预览元素');
    
    // 创建预览容器
    const previewContainer = document.createElement('div');
    previewContainer.id = 'videoPreview';
    previewContainer.className = 'video-preview';
    
    // 确保CSS样式被应用
    document.head.insertAdjacentHTML('beforeend', `
      <style>
        .video-preview {
          position: fixed;
          top: 100px;
          right: 20px;
          width: 320px;
          height: auto;
          z-index: 2147483647;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
          cursor: move;
          background: black;
          border: 2px solid #f44336;
          padding: 0;
          margin: 0;
          max-width: 320px; /* 限制最大宽度 */
          resize: none; /* 禁止调整大小 */
        }
        .video-preview video {
          width: 100%;
          height: auto;
          display: block;
          background: black;
          margin: 0;
          padding: 0;
        }
        .video-preview-stats {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: rgba(244,67,54,0.9);
          color: white;
          font-size: 12px;
          font-weight: bold;
        }
        .close-button {
          position: absolute;
          top: 5px;
          right: 5px;
          cursor: pointer;
          background: rgba(0,0,0,0.5);
          border-radius: 50%;
          width: 20px;
          height: 20px;
          display: flex;
          justify-content: center;
          align-items: center;
          color: white;
          z-index: 2147483648;
        }
      </style>
    `);
    
    // 设置容器样式 - 初始设为隐藏
    previewContainer.style.display = 'none';
    
    // 使用模板字符串一次性创建所有内容
    previewContainer.innerHTML = `
      <div style="width:100%; height:100%; position:relative;">
        <video id="previewVideo" style="width:100%; height:auto; display:block; background:black; margin:0; padding:0;"></video>
        <div class="video-preview-stats">
          <div id="previewDuration">00:00:00</div>
          <div id="previewSize">0 MB</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(previewContainer);
    
    // 为整个预览容器添加拖动功能
    makePreviewDraggable(previewContainer);
    
    console.log('预览元素已添加');
  } catch (error) {
    console.error('添加视频预览元素失败:', error);
  }
}

// 改进的拖动功能，确保在整个预览窗口区域内点击都能拖动
function makePreviewDraggable(element) {
  let isDragging = false;
  let startX, startY;
  let elementX, elementY;
  
  // 开始拖动
  element.addEventListener('mousedown', function(e) {
    // 跳过关闭按钮的点击
    if (e.target.classList.contains('close-button') || e.target.parentElement.classList.contains('close-button')) {
      return;
    }
    
    isDragging = true;
    
    // 记录起始位置
    startX = e.clientX;
    startY = e.clientY;
    
    // 元素当前位置
    const rect = element.getBoundingClientRect();
    elementX = rect.left;
    elementY = rect.top;
    
    // 防止拖动时出现文本选择
    e.preventDefault();
  });
  
  // 拖动移动 - 限制在弹窗范围内
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    
    // 计算移动距离
    const moveX = e.clientX - startX;
    const moveY = e.clientY - startY;
    
    // 获取popup的尺寸
    const popup = document.querySelector('.popup');
    const popupRect = popup ? popup.getBoundingClientRect() : {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    // 计算新位置
    let newLeft = elementX + moveX;
    let newTop = elementY + moveY;
    
    // 元素自身尺寸
    const elementRect = element.getBoundingClientRect();
    const elementWidth = elementRect.width;
    const elementHeight = elementRect.height;
    
    // 限制在弹窗内
    if (newLeft < popupRect.left) newLeft = popupRect.left;
    if (newTop < popupRect.top) newTop = popupRect.top;
    if (newLeft + elementWidth > popupRect.right) newLeft = popupRect.right - elementWidth;
    if (newTop + elementHeight > popupRect.bottom) newTop = popupRect.bottom - elementHeight;
    
    // 更新位置
    element.style.left = newLeft + 'px';
    element.style.top = newTop + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  });
  
  // 结束拖动
  document.addEventListener('mouseup', function() {
    isDragging = false;
  });
  
  // 鼠标离开浏览器窗口
  document.addEventListener('mouseleave', function() {
    isDragging = false;
  });
}

// 更新预览统计信息
function updatePreviewStats() {
  if (!recordingStartTime) return;
  
  const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
  const size = calculateFileSize(recordedChunks);
  
  const durationElement = document.getElementById('previewDuration');
  const sizeElement = document.getElementById('previewSize');
  
  if (durationElement) {
    durationElement.textContent = formatDuration(duration);
  }
  
  if (sizeElement) {
    sizeElement.textContent = formatFileSize(size);
  }
}

// 修改更新扩展图标函数
async function updateExtensionIcon(isRecording) {
  try {
    // 使用简单的路径，确保图标存在
    const iconPath = {
      "16": `icons/${isRecording ? 'recording' : 'default'}_16.png`,
      "32": `icons/${isRecording ? 'recording' : 'default'}_32.png`,
      "48": `icons/${isRecording ? 'recording' : 'default'}_48.png`,
      "128": `icons/${isRecording ? 'recording' : 'default'}_128.png`
    };

    await chrome.action.setIcon({ path: iconPath }).catch(() => {
      console.log('图标更新失败，使用默认图标');
    });
  } catch (error) {
    console.error('更新图标出错:', error);
  }
}

// 改进与background script的通信
async function sendMessageToBackground(message) {
  try {
    // 检查background script是否存在
    const backgroundPage = await chrome.runtime.getBackgroundPage();
    if (!backgroundPage) {
      console.warn('Background page不存在');
      return;
    }

    // 发送消息
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.error('发送消息到background失败:', error);
    return null;
  }
}

// 切换语言
function toggleLanguage() {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  updateTexts();
  chrome.storage.local.set({ language: currentLang });
  console.log('语言已切换到:', currentLang);
}

// 添加录制指示器
function addRecordingIndicator() {
  // 先移除现有的录制指示器，避免重复
  removeRecordingIndicator();
  
  const status = document.getElementById('status');
  const indicator = document.createElement('div');
  indicator.className = 'recording-indicator';
  indicator.innerHTML = `
    <div class="recording-dot"></div>
    <span>${i18nTexts[currentLang].statusRecording}</span>
  `;
  status.appendChild(indicator);
}

// 移除录制指示器
function removeRecordingIndicator() {
  const indicator = document.querySelector('.recording-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// 显示错误信息
function showError(message) {
  const status = document.getElementById('status');
  
  // 检查特定的错误类型，为其提供更友好的显示
  if (message.includes('无法在浏览器内部页面上录制')) {
    // 特殊处理浏览器内部页面错误
    status.innerHTML = `
      <div class="error-message">
        <div class="error-icon">⚠️</div>
        <div class="error-text">
          <strong>${currentLang === 'zh' ? '提示' : 'Notice'}</strong>: 
          ${currentLang === 'zh' ? 
            '无法在浏览器内部页面上录制。<br>请打开一个普通网页（如 <a href="https://www.baidu.com" target="_blank">百度</a> 或 <a href="https://www.google.com" target="_blank">Google</a>）后再试。' : 
            'Cannot record on browser internal pages.<br>Please open a regular webpage (like <a href="https://www.baidu.com" target="_blank">Baidu</a> or <a href="https://www.google.com" target="_blank">Google</a>) and try again.'}
        </div>
      </div>
    `;
    status.className = 'warning';
  } else {
    // 普通错误处理
    status.textContent = message;
    status.className = 'error';
  }
  
  // 不自动清除特殊错误消息，让用户有充分时间阅读
  if (!message.includes('无法在浏览器内部页面上录制')) {
    setTimeout(() => {
      status.textContent = '';
      status.className = '';
    }, 3000);
  }
}

// 显示下载链接
function showDownloadLink(blob, fileName, mimeType) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// 捕获截图
async function captureScreenshot() {
  try {
    const constraints = getCaptureConstraints();
    let stream;
    
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err) {
      console.error("截图错误: ", err);
      showError(currentLang === 'zh' ? '截图失败，请检查权限设置' : 'Screenshot failed, please check permissions');
      return;
    }
    
    const track = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(track);
    
    try {
      const bitmap = await imageCapture.grabFrame();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(function(blob) {
        if (blob) {
          const now = new Date();
          const date = now.toISOString().split('T')[0];
          const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
          const fileName = `screenshot_${date}_${time}.png`;
          showDownloadLink(blob, fileName, "image/png");
          document.getElementById("status").textContent = i18nTexts[currentLang].statusScreenshot;
        } else {
          showError(currentLang === 'zh' ? '截图创建失败' : 'Failed to create screenshot');
        }
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
      }, "image/png");
    } catch (err) {
      console.error("截图处理错误: ", err);
      showError(currentLang === 'zh' ? '截图处理失败' : 'Failed to process screenshot');
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
    }
  } catch (err) {
    console.error("截图错误: ", err);
    showError(currentLang === 'zh' ? '截图失败' : 'Screenshot failed');
  }
}

// 检查录制状态
function checkRecordingStatus() {
  if (currentState === RecordingState.RECORDING && mediaRecorder) {
    if (mediaRecorder.state === 'inactive' || !window.recordingStream?.active) {
      console.warn('录制已中断');
      cleanupRecordingResources();
    }
  }
}

// 显示预览窗口
function showPreview() {
  try {
    console.log('显示预览窗口');
    const preview = document.getElementById('videoPreview');
    if (preview) {
      preview.style.display = 'block';
      console.log('预览窗口已显示, display:', preview.style.display);
      
      // 确保预览窗口在视口中可见
      const popupRect = document.querySelector('.popup')?.getBoundingClientRect() || {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight
      };
      
      const previewRect = preview.getBoundingClientRect();
      
      // 将预览放置在弹窗内的合适位置
      // 默认放在弹窗右上角
      let newLeft = popupRect.right - previewRect.width - 20;
      let newTop = popupRect.top + 100;
      
      // 确保在弹窗内
      if (newLeft < popupRect.left) newLeft = popupRect.left + 10;
      if (newTop < popupRect.top) newTop = popupRect.top + 10;
      if (newLeft + previewRect.width > popupRect.right) newLeft = popupRect.right - previewRect.width - 10;
      if (newTop + previewRect.height > popupRect.bottom) newTop = popupRect.bottom - previewRect.height - 10;
      
      preview.style.left = newLeft + 'px';
      preview.style.top = newTop + 'px';
      preview.style.right = 'auto';
    } else {
      console.error('预览窗口不存在，重新创建');
      addVideoPreview();
      const newPreview = document.getElementById('videoPreview');
      if (newPreview) {
        newPreview.style.display = 'block';
        console.log('新预览窗口已显示');
      }
    }
  } catch (error) {
    console.error('显示预览窗口失败:', error);
  }
}

// 隐藏预览窗口
function hidePreview() {
  const preview = document.getElementById('videoPreview');
  if (preview) {
    preview.style.display = 'none';
  }
}

// 添加状态重置函数
async function resetAllState() {
  console.log('重置所有状态');
  currentState = RecordingState.IDLE;
  isRecording = false;
  pendingRecordingRequest = false;
  isGettingMedia = false;
  recordingStartTime = null;
  recordedChunks = [];
  
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }
  
  // 清除存储中的状态
  try {
    await chrome.storage.local.remove([
      'isRecording',
      'recordingStartTime',
      'recordingOptions',
      'recordedChunks',
      'lastChunkTime'
    ]);
  } catch (error) {
    console.error('清除存储状态失败:', error);
  }
}

// 改进的初始化函数
async function initializePopup() {
  console.log('初始化 popup');
  
  try {
    // 检查是否有正在进行的录制
    const storage = await chrome.storage.local.get([
      'isRecording',
      'recordingStartTime',
      'recordingOptions'
    ]);
    
    // 验证存储的状态是否有效
    if (storage.isRecording) {
      // 检查录制是否真的在进行中
      const isActuallyRecording = await verifyRecordingState();
      
      if (!isActuallyRecording) {
        console.log('检测到无效的录制状态，重置状态');
        await resetAllState();
        return;
      }
      
      // 恢复录制状态
      console.log('恢复录制状态');
      currentState = RecordingState.RECORDING;
      isRecording = true;
      recordingStartTime = storage.recordingStartTime;
      
      // 更新UI
      document.getElementById('startRec').disabled = true;
      const stopRecBtn = document.getElementById('stopRec');
      stopRecBtn.disabled = false;
      stopRecBtn.style.display = 'block';
      
      // 添加录制指示器
      addRecordingIndicator();
      
      // 显示录制正在进行的消息
      document.getElementById('status').textContent = currentLang === 'zh' ? 
        '录制正在进行中' : 'Recording in progress';
      
      // 开始更新录制统计
      recordingInterval = setInterval(updatePreviewStats, 1000);
      
      // 尝试恢复预览
      if (storage.recordingOptions) {
        startLocalPreview().catch(error => {
          console.warn('恢复预览失败:', error);
        });
      }
    } else {
      // 确保状态被重置
      await resetAllState();
    }
  } catch (error) {
    console.error('初始化popup时出错:', error);
    await resetAllState();
  }
}

// 验证录制状态是否真实有效
async function verifyRecordingState() {
  try {
    // 检查是否有活动的媒体流
    if (window.recordingStream && window.recordingStream.active) {
      const activeTracks = window.recordingStream.getTracks().filter(track => track.readyState === 'live');
      if (activeTracks.length > 0) {
        return true;
      }
    }
    
    // 如果没有活动的媒体流，检查 MediaRecorder 状态
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('验证录制状态时出错:', error);
    return false;
  }
}

// 改进的处理录制停止函数
async function handleRecordingStopped() {
  console.log('处理录制停止');
  
  try {
    // 如果没有录制数据，显示错误信息
    if (!recordedChunks || recordedChunks.length === 0) {
      console.error('No recorded chunks available');
      showError(currentLang === 'zh' ? '录制失败，没有获取到数据' : 'Recording failed, no data available');
      await resetAllState();
      return;
    }
    
    // 创建Blob
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    
    // 生成文件名
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileName = `recording_${date}_${time}.webm`;
    
    // 显示正在保存中的状态
    document.getElementById('status').textContent = currentLang === 'zh' ? 
      '正在保存视频...' : 'Saving video...';
    
    // 创建下载链接并触发下载
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    
    // 延迟后清理
    setTimeout(async () => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // 更新状态文本
      document.getElementById('status').textContent = currentLang === 'zh' ? 
        '视频已保存: ' + fileName : 'Video saved: ' + fileName;
      
      // 保存到历史记录
      await saveToHistory(blob, fileName);
      
      // 重置所有状态
      await resetAllState();
      
      console.log('录制已完成并保存:', fileName);
    }, 100);
    
  } catch (error) {
    console.error('处理录制停止时出错:', error);
    await resetAllState();
    showError(currentLang === 'zh' ? '保存录制时出错' : 'Error saving recording');
  }
}

// 获取最高质量的比特率
function getBitrate() {
  return 8000000; // 8 Mbps - 最高质量
}

// 改进的开始录制函数
async function startRecording() {
  try {
    console.log('尝试开始录制, 当前状态:', currentState);
    
    // 检查当前状态
    if (currentState !== RecordingState.IDLE) {
      console.log('当前状态不允许开始新录制:', currentState);
      return;
    }
    
    // 设置准备状态
    currentState = RecordingState.PREPARING;
    
    // 清理之前的资源
    await resetAllState();
    
    // 检查标签页权限
    const tabCheckResult = await checkIfTabCanBeRecorded();
    if (!tabCheckResult.canRecord) {
      currentState = RecordingState.IDLE;
      return;
    }
    
    // 更新UI状态
    document.getElementById('startRec').disabled = true;
    document.getElementById('status').textContent = currentLang === 'zh' ? 
      '准备录制...' : 'Preparing recording...';
    
    try {
      // 准备媒体约束
      const constraints = {
        video: {
          mediaSource: 'screen'
        },
        audio: true // 默认启用音频，让用户在系统对话框中选择
      };
      
      // 获取媒体流
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      
      // 验证流
      if (!stream || !stream.active || stream.getTracks().length === 0) {
        throw new Error('无效的媒体流');
      }
      
      // 保存流引用
      window.recordingStream = stream;
      
      // 设置轨道结束处理
      stream.getTracks().forEach(track => {
        track.onended = async () => {
          console.log('媒体轨道结束:', track.kind);
          if (currentState === RecordingState.RECORDING) {
            await resetAllState();
          }
        };
      });
      
      // 创建录制器，使用最高质量设置
      const options = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: getBitrate()
      };
      
      mediaRecorder = new MediaRecorder(stream, options);
      recordedChunks = [];
      
      // 设置录制器事件
      mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped');
        handleRecordingStopped();
      };
      
      mediaRecorder.onerror = async (event) => {
        console.error('MediaRecorder 错误:', event);
        await resetAllState();
        showError(currentLang === 'zh' ? '录制过程中出错' : 'Error during recording');
      };
      
      // 设置预览
      addVideoPreview();
      const previewVideo = document.getElementById('previewVideo');
      if (previewVideo) {
        previewVideo.srcObject = stream;
        previewVideo.muted = true;
        await previewVideo.play();
      }
      
      // 开始倒计时
      startCountdown(3, async () => {
        try {
          // 开始录制
          currentState = RecordingState.RECORDING;
          isRecording = true;
          mediaRecorder.start(1000);
          recordingStartTime = Date.now();
          
          // 显示预览
          showPreview();
          
          // 保存状态
          await chrome.storage.local.set({
            'isRecording': true,
            'recordingStartTime': recordingStartTime
          });
          
          // 更新UI
          const stopRecBtn = document.getElementById('stopRec');
          stopRecBtn.disabled = false;
          stopRecBtn.style.display = 'block';
          
          addRecordingIndicator();
          recordingInterval = setInterval(updatePreviewStats, 1000);
          
          // 改进与background的通信
          await sendMessageToBackground({
            action: 'startRecording'
          });
          
          document.getElementById('status').textContent = currentLang === 'zh' ? 
            '录制进行中...' : 'Recording...';
            
        } catch (error) {
          console.error('开始录制时出错:', error);
          await resetAllState();
        }
      });
      
    } catch (error) {
      console.error('获取媒体流错误:', error);
      
      let errorMessage = currentLang === 'zh' ? '录制失败: ' : 'Recording failed: ';
      if (error.name === 'NotAllowedError' || error.message.includes('用户取消')) {
        errorMessage += currentLang === 'zh' ? '用户取消了录制' : 'Recording was cancelled';
      } else {
        errorMessage += error.message;
      }
      
      showError(errorMessage);
      await resetAllState();
    }
    
  } catch (error) {
    console.error('录制过程出错:', error);
    showError(currentLang === 'zh' ? '录制失败，请检查权限设置' : 'Recording failed, please check permissions');
    await resetAllState();
  }
}

// 改进的停止录制函数
async function stopRecording() {
  console.log('停止录制, 当前状态:', currentState);
  
  try {
    // 检查是否真的在录制中
    if (currentState !== RecordingState.RECORDING) {
      console.log('没有正在进行的录制');
      return;
    }

    // 更新状态
    currentState = RecordingState.STOPPING;
    document.getElementById('status').textContent = currentLang === 'zh' ? 
      '正在停止录制...' : 'Stopping recording...';
    
    // 停止媒体录制器
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      console.log('停止 MediaRecorder');
      mediaRecorder.stop();
      
      // 停止所有轨道
      if (window.recordingStream) {
        console.log('停止所有媒体轨道');
        window.recordingStream.getTracks().forEach(track => {
          track.stop();
        });
      }
    }
    
    // 禁用停止按钮，防止重复点击
    const stopRecBtn = document.getElementById('stopRec');
    if (stopRecBtn) {
      stopRecBtn.disabled = true;
    }
    
    // 隐藏预览
    hidePreview();
    
    // 移除录制指示器
    removeRecordingIndicator();
    
    // 通知background脚本
    await sendMessageToBackground({
      action: 'stopRecording'
    });
    
    // 等待handleRecordingStopped处理完成
    // handleRecordingStopped会在mediaRecorder.onstop中被调用
    
  } catch (error) {
    console.error('停止录制时出错:', error);
    showError(currentLang === 'zh' ? '停止录制时出错' : 'Error stopping recording');
    await resetAllState();
  }
}

// 检查标签页是否可以录制
async function checkIfTabCanBeRecorded() {
  try {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showError(currentLang === 'zh' ? '无法获取当前标签页' : 'Cannot get current tab');
      return { canRecord: false };
    }
    
    // 检查是否是浏览器内部页面
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      showError(currentLang === 'zh' ? 
        '无法在浏览器内部页面上录制' : 
        'Cannot record on browser internal pages');
      return { canRecord: false };
    }
    
    return { canRecord: true, tab };
  } catch (error) {
    console.error('检查标签页时出错:', error);
    showError(currentLang === 'zh' ? 
      '检查标签页权限时出错' : 
      'Error checking tab permissions');
    return { canRecord: false };
  }
}

// 修改 DOMContentLoaded 事件处理
document.addEventListener("DOMContentLoaded", async function() {
  console.log('DOM已加载完成');
  
  try {
    // 初始化popup
    await initializePopup();
    
    // 添加错误样式
    const style = document.createElement('style');
    style.textContent = `
      .warning {
        background-color: #fff3cd;
        color: #856404;
        border: 1px solid #ffeeba;
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 15px;
      }
      .error-message {
        display: flex;
        align-items: flex-start;
      }
      .error-icon {
        font-size: 20px;
        margin-right: 10px;
        margin-top: 2px;
      }
      .error-text {
        flex: 1;
      }
      .error-text a {
        color: #0056b3;
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
    
    // 初始化语言
    chrome.storage.local.get("language", (result) => {
      const systemLang = navigator.language.toLowerCase();
      currentLang = result.language || (systemLang.startsWith('zh') ? 'zh' : 'en');
      updateTexts();
    });
    
    // 初始化主题
    initTheme();
    
    // 添加视频预览元素
    addVideoPreview();
    
    // 添加事件监听器
    document.getElementById('screenshotBtn').addEventListener('click', captureScreenshot);
    document.getElementById('startRec').addEventListener('click', startRecording);
    document.getElementById('stopRec').addEventListener('click', function() {
      console.log('停止录制按钮被点击');
      stopRecording();
    });
    
    // 语言切换按钮
    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
      langToggle.addEventListener('click', toggleLanguage);
    }
    
    // 主题切换按钮
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }
    
    // 确保停止录制按钮初始隐藏
    const stopRecBtn = document.getElementById('stopRec');
    if (stopRecBtn) {
      stopRecBtn.style.display = 'none';
      stopRecBtn.style.width = '100%';
      stopRecBtn.style.marginTop = '16px';
    }
    
  } catch (error) {
    console.error('初始化失败:', error);
    await resetAllState();
  }
});
