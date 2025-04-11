// popup.js

// 通过全局变量获取 ffmpeg API
var createFFmpeg = window.createFFmpeg;
var fetchFile = window.fetchFile;
var ffmpegInstance = null;

// 国际化文本配置
var i18nTexts = {
  zh: {
    title: "多功能录屏助手",
    header: "多功能录屏助手",
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
    screenshotTooltip: "捕获当前屏幕 (Ctrl+P)",
    startRecordingTooltip: "开始录制 (Ctrl+R)",
    stopRecordingTooltip: "停止录制 (Ctrl+S)",
    autoSave: "自动保存：",
    enabled: "启用",
    disabled: "禁用",
    maxDuration: "最大时长(分钟)：",
    fileNameFormat: "文件名格式：",
    recordingHistory: "录制历史",
    statusError: "错误：",
    statusCountdown: "将在 "
  },
  en: {
    title: "Easy Recorder",
    header: "Easy Recorder",
    screenshot: "Screenshot",
    captureScreenshot: "Capture Screenshot",
    recording: "Recording",
    selectRange: "Select recording range:",
    fullDesktop: "Full Screen",
    browserWindow: "Window",
    customArea: "Browser Tab",
    startRecording: "Start Recording",
    stopRecording: "Stop Recording",
    statusRecording: "Recording...",
    statusStopped: "Recording stopped",
    statusScreenshot: "Screenshot captured",
    duration: "Duration:",
    size: "Size:",
    quality: "Quality:",
    high: "High",
    medium: "Medium",
    low: "Low",
    audio: "Audio",
    video: "Video",
    both: "Video & Audio",
    selectAudio: "Select audio source:",
    systemAudio: "System Audio",
    microphone: "Microphone",
    none: "No Audio",
    toggleLanguage: "Toggle Language",
    toggleTheme: "Toggle Theme",
    settings: "Settings",
    screenshotTooltip: "Capture current screen (Ctrl+P)",
    startRecordingTooltip: "Start recording (Ctrl+R)",
    stopRecordingTooltip: "Stop recording (Ctrl+S)",
    autoSave: "Auto Save:",
    enabled: "Enabled",
    disabled: "Disabled",
    maxDuration: "Max Duration (minutes):",
    fileNameFormat: "File Name Format:",
    recordingHistory: "Recording History",
    statusError: "Error:",
    statusCountdown: "Will start in "
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
  
  // 更新选择框选项
  const rangeOptions = document.querySelectorAll("#captureRange option");
  rangeOptions[0].textContent = i18nTexts[currentLang].fullDesktop;
  rangeOptions[1].textContent = i18nTexts[currentLang].browserWindow;
  rangeOptions[2].textContent = i18nTexts[currentLang].customArea;
  
  const audioOptions = document.querySelectorAll("#audioSource option");
  audioOptions[0].textContent = i18nTexts[currentLang].none;
  audioOptions[1].textContent = i18nTexts[currentLang].systemAudio;
  audioOptions[2].textContent = i18nTexts[currentLang].microphone;
  
  const qualityOptions = document.querySelectorAll("#qualitySelect option");
  qualityOptions[0].textContent = i18nTexts[currentLang].high;
  qualityOptions[1].textContent = i18nTexts[currentLang].medium;
  qualityOptions[2].textContent = i18nTexts[currentLang].low;
  
  // 更新状态文本
  if (!isRecording) {
    document.getElementById("status").textContent = i18nTexts[currentLang].statusStopped;
  }
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
  
  // 监听主题切换按钮
  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    themeToggle.textContent = newTheme === "dark" ? "☀️" : "🌙";
    chrome.storage.local.set({ theme: newTheme });
  });
  
  // 监听系统主题变化
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!chrome.storage.local.get("theme")) {
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    }
  });
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

// 录制倒计时
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
function saveToHistory(blob) {
  const historyItem = {
    name: generateFileName(),
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
        <button class="download-btn" data-url="${item.url}">下载</button>
        <button class="delete-btn" data-date="${item.date}">删除</button>
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
  const range = document.getElementById('captureRange').value;
  
  const constraints = {
    video: {
      mediaSource: 'screen'
    }
  };

  // 设置录制范围
  if (range === 'window') {
    constraints.video.displaySurface = 'window';
  } else if (range === 'browser') {
    constraints.video.displaySurface = 'browser';
  } else if (range === 'area') {
    constraints.video.displaySurface = 'screen';
  }

  return constraints;
}

// 生成文件名
function generateFileName() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `recording_${date}_${time}.webm`;
}

// 添加视频预览元素
function addVideoPreview() {
  const previewContainer = document.createElement('div');
  previewContainer.id = 'videoPreview';
  previewContainer.className = 'video-preview';
  previewContainer.style.display = 'none'; // 初始隐藏
  previewContainer.innerHTML = `
    <video id="previewVideo" autoplay muted></video>
    <div class="preview-stats">
      <div id="previewDuration">00:00:00</div>
      <div id="previewSize">0 B</div>
    </div>
  `;
  document.body.appendChild(previewContainer);
}

// 显示预览窗口
function showPreview() {
  const preview = document.getElementById('videoPreview');
  if (preview) {
    preview.style.display = 'block';
  }
}

// 隐藏预览窗口
function hidePreview() {
  const preview = document.getElementById('videoPreview');
  if (preview) {
    preview.style.display = 'none';
  }
}

// 更新预览视频
function updatePreviewVideo(stream) {
  const previewVideo = document.getElementById('previewVideo');
  if (previewVideo) {
    previewVideo.srcObject = stream;
  }
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

// 更新扩展图标状态
function updateExtensionIcon(isRecording) {
  const iconPath = isRecording ? 'favicon/web-app-manifest-512x512.png' : 'favicon/web-app-manifest-192x192.png';
  chrome.action.setIcon({ path: iconPath });
}

// 应用颜色滤镜
function applyColorFilter(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // 加载图标
  const img = new Image();
  img.src = 'favicon/web-app-manifest-192x192.png';
  
  // 绘制图标
  ctx.drawImage(img, 0, 0, size, size);
  
  // 应用红色滤镜
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    // 增加红色通道，减少绿色和蓝色通道
    data[i] = Math.min(255, data[i] * 1.5);     // 红色
    data[i + 1] = Math.max(0, data[i + 1] * 0.5); // 绿色
    data[i + 2] = Math.max(0, data[i + 2] * 0.5); // 蓝色
  }
  ctx.putImageData(imageData, 0, 0);
  
  return ctx.getImageData(0, 0, size, size);
}

// 开始录制
async function startRecording() {
  try {
    // 获取录制参数
    const constraints = getCaptureConstraints();

    // 根据音频源设置添加音频
    const audioSource = document.getElementById('audioSource').value;
    if (audioSource !== 'none') {
      if (audioSource === 'systemAudio') {
        constraints.audio = true;
      } else if (audioSource === 'microphone') {
        constraints.audio = true;
      }
    }

    // 请求屏幕共享
    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    
    // 配置 MediaRecorder
    const options = {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: document.getElementById('qualitySelect').value === 'high' ? 8000000 :
                         document.getElementById('qualitySelect').value === 'medium' ? 4000000 : 2000000
    };

    mediaRecorder = new MediaRecorder(stream, options);
    recordedChunks = [];
    
    // 监听数据可用事件
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    // 监听录制停止事件
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = generateFileName();
      a.click();
      
      URL.revokeObjectURL(url);
      stream.getTracks().forEach(track => track.stop());
      
      // 保存到历史记录
      saveToHistory(blob);
      
      // 重置状态
      isRecording = false;
      document.getElementById('startRec').disabled = false;
      document.getElementById('stopRec').disabled = true;
      document.getElementById('status').textContent = i18nTexts[currentLang].statusStopped;
      clearInterval(recordingInterval);
      
      // 隐藏预览
      hidePreview();
    };

    // 开始倒计时
    startCountdown(3, () => {
      // 开始实际录制
      recordingStartTime = Date.now();
      mediaRecorder.start(1000); // 每秒收集一次数据
      isRecording = true;
      
      // 更新UI状态
      document.getElementById('startRec').disabled = true;
      document.getElementById('stopRec').disabled = false;
      document.getElementById('status').textContent = i18nTexts[currentLang].statusRecording;
      
      // 显示预览窗口并更新视频源
      showPreview();
      updatePreviewVideo(stream);
      
      // 开始更新录制统计
      recordingInterval = setInterval(() => {
        updateRecordingStats();
        updatePreviewStats();
        
        // 检查最大时长
        chrome.storage.local.get(['settings'], (result) => {
          const settings = result.settings || { maxDuration: 30 };
          const duration = Math.floor((Date.now() - recordingStartTime) / 1000 / 60);
          if (settings.maxDuration > 0 && duration >= settings.maxDuration) {
            stopRecording();
          }
        });
      }, 1000);
      
      // 添加录制指示器
      addRecordingIndicator();
    });

  } catch (err) {
    console.error('录制错误:', err);
    showError(currentLang === 'zh' ? '录制失败，请检查权限设置' : 'Recording failed, please check permissions');
  }
}

// 停止录制
function stopRecording() {
  if (mediaRecorder && isRecording) {
    try {
      mediaRecorder.stop();
      isRecording = false;
      
      // 更新UI状态
      document.getElementById('startRec').disabled = false;
      document.getElementById('stopRec').disabled = true;
      document.getElementById('status').textContent = i18nTexts[currentLang].statusStopped;
      
      // 清除定时器
      clearInterval(recordingInterval);
      
      // 移除录制指示器
      removeRecordingIndicator();
      
      // 更新扩展图标
      updateExtensionIcon(false);
      
      // 保存录制状态到存储
      chrome.storage.local.set({ isRecording: false });
    } catch (err) {
      console.error('停止录制错误:', err);
      showError(currentLang === 'zh' ? '停止录制失败' : 'Failed to stop recording');
    }
  }
}

// 添加录制指示器
function addRecordingIndicator() {
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
  status.textContent = message;
  status.className = 'error';
  setTimeout(() => {
    status.textContent = '';
    status.className = '';
  }, 3000);
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

// 初始化
function init() {
  // 初始化语言（根据系统语言）
  const systemLang = navigator.language.toLowerCase();
  currentLang = systemLang.startsWith('zh') ? 'zh' : 'en';
  updateTexts();
  
  // 初始化主题
  initTheme();
  
  
  // 添加视频预览元素
  addVideoPreview();
  
  // 添加事件监听器
  document.getElementById('screenshotBtn').addEventListener('click', captureScreenshot);
  document.getElementById('startRec').addEventListener('click', startRecording);
  document.getElementById('stopRec').addEventListener('click', stopRecording);
  // document.getElementById('langToggle').addEventListener('click', toggleLanguage);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  
  // 初始化录制统计信息显示
  const statsContainer = document.createElement("div");
  statsContainer.id = "recordingStats";
  statsContainer.className = "recording-stats";
  statsContainer.innerHTML = `
    <div id="recordingDuration">${i18nTexts[currentLang].duration} 00:00:00</div>
    <div id="recordingSize">${i18nTexts[currentLang].size} 0 B</div>
  `;
  document.getElementById("status").appendChild(statsContainer);
}

// 初始化
document.addEventListener("DOMContentLoaded", function() {
  // 初始化语言（根据系统语言）
  const systemLang = navigator.language.toLowerCase();
  currentLang = systemLang.startsWith('zh') ? 'zh' : 'en';
  updateTexts();
  
  // 初始化主题
  initTheme();
  
  // 添加视频预览元素
  addVideoPreview();
  
  // 添加事件监听器
  document.getElementById('screenshotBtn').addEventListener('click', captureScreenshot);
  document.getElementById('startRec').addEventListener('click', startRecording);
  document.getElementById('stopRec').addEventListener('click', stopRecording);
  // document.getElementById('langToggle').addEventListener('click', toggleLanguage);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  
  // 初始化录制统计信息显示
  const statsContainer = document.createElement("div");
  statsContainer.id = "recordingStats";
  statsContainer.className = "recording-stats";
  statsContainer.innerHTML = `
    <div id="recordingDuration">${i18nTexts[currentLang].duration} 00:00:00</div>
    <div id="recordingSize">${i18nTexts[currentLang].size} 0 B</div>
  `;
  document.getElementById("status").appendChild(statsContainer);
  
  // 监听插件图标点击事件
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'restorePopup') {
      restorePopup();
    }
  });
  
  // 检查录制状态
  chrome.storage.local.get(['isRecording'], (result) => {
    if (result.isRecording) {
      isRecording = true;
      updateExtensionIcon(true);
    }
  });
  
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRecording) {
      // 页面隐藏时，确保录制继续
      updateExtensionIcon(true);
    }
  });
  
  // 监听窗口关闭事件
  window.addEventListener('beforeunload', (e) => {
    if (isRecording) {
      e.preventDefault();
      e.returnValue = '';
      return '录制正在进行中，确定要关闭窗口吗？';
    }
  });
});
