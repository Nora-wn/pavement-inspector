/* ============================================================
   路面损伤检测智能体 — Pavement Inspector AI
   核心应用逻辑
   基于阿里云 DashScope 通义千问 VL 多模态大模型
   ============================================================ */

// ----- 应用状态 -----
const STATE = {
    apiKey: '',
    model: 'qwen-vl-max',
    imageBase64: null,
    imageFile: null,
    imageWidth: 0,
    imageHeight: 0,
    workMode: 'standard',     // 'standard' | 'compare'
    cvJsonData: null,
    currentResult: null,
    isAnalyzing: false,
};

// ----- DOM 缓存 -----
const DOM = {};

function cacheDom() {
    const ids = [
        // 上传相关
        'uploadZone', 'fileInput', 'previewContainer', 'previewImage',
        'previewFilename', 'imageInfo', 'btnReselect', 'btnClearImage',
        'annotationCanvas',
        // 模式
        'modeStandard', 'modeCompare', 'badgeMode',
        // CV上传
        'cvUploadSection', 'cvJsonInput', 'btnLoadSampleCV',
        // 按钮
        'btnAnalyze', 'btnExportPDF', 'btnCopyReport',
        'btnHistory', 'btnSettings', 'btnDemo', 'btnLoadDemo',
        // 演示
        'demoHint',
        // 加载
        'loadingContainer', 'loadingStatus', 'loadingBar',
        // 结果
        'emptyState', 'resultsContent',
        'overviewCard', 'pciValue', 'pciArc', 'metaCount', 'metaSeverity', 'metaPriority',
        'damageList', 'assessmentBody', 'assessmentCard',
        'compareCard', 'compareTable', 'compareVerdict',
        // 历史
        'historyDrawer', 'historyList', 'btnClearHistory', 'btnCloseHistory', 'drawerOverlay',
        // 设置
        'settingsModal', 'apiKey', 'modelSelect', 'saveApiKey',
        'btnTestConnection', 'btnSaveSettings', 'btnCloseSettings',
        // Toast
        'toastContainer',
    ];
    ids.forEach(id => { DOM[id] = document.getElementById(id); });
}

// ----- 初始化 -----
function init() {
    cacheDom();
    loadSettings();
    bindEvents();
    renderHistoryList();
}

// ----- 设置管理 -----
function loadSettings() {
    const saved = localStorage.getItem('pavement_inspector_settings');
    if (saved) {
        try {
            const s = JSON.parse(saved);
            if (s.apiKey) STATE.apiKey = s.apiKey;
            if (s.model) STATE.model = s.model;
            DOM.apiKey.value = s.apiKey || '';
            DOM.modelSelect.value = s.model || 'qwen-vl-max';
            DOM.saveApiKey.checked = !!s.apiKey;
        } catch(e) { /* ignore */ }
    }
}

function saveSettings() {
    const key = DOM.apiKey.value.trim();
    const model = DOM.modelSelect.value;
    const saveKey = DOM.saveApiKey.checked;

    STATE.apiKey = key;
    STATE.model = model;
    updateAnalyzeButton();

    if (saveKey && key) {
        localStorage.setItem('pavement_inspector_settings', JSON.stringify({
            apiKey: key,
            model: model,
        }));
    } else {
        localStorage.removeItem('pavement_inspector_settings');
    }
}

// ----- 事件绑定 -----
function bindEvents() {
    // 上传区域
    DOM.uploadZone.addEventListener('click', () => DOM.fileInput.click());
    DOM.fileInput.addEventListener('change', handleFileSelect);

    // 拖拽
    DOM.uploadZone.addEventListener('dragover', e => {
        e.preventDefault();
        DOM.uploadZone.classList.add('drag-over');
    });
    DOM.uploadZone.addEventListener('dragleave', () => {
        DOM.uploadZone.classList.remove('drag-over');
    });
    DOM.uploadZone.addEventListener('drop', e => {
        e.preventDefault();
        DOM.uploadZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) processImageFile(file);
    });

    // 粘贴图片
    document.addEventListener('paste', e => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                processImageFile(item.getAsFile());
                break;
            }
        }
    });

    // 图片操作
    DOM.btnReselect.addEventListener('click', () => DOM.fileInput.click());
    DOM.btnClearImage.addEventListener('click', clearImage);

    // 模式切换
    DOM.modeStandard.addEventListener('click', () => switchMode('standard'));
    DOM.modeCompare.addEventListener('click', () => switchMode('compare'));

    // CV示例
    DOM.btnLoadSampleCV.addEventListener('click', loadSampleCVData);

    // 分析
    DOM.btnAnalyze.addEventListener('click', startAnalysis);

    // 导出
    DOM.btnExportPDF.addEventListener('click', exportReport);
    DOM.btnCopyReport.addEventListener('click', copyReport);

    // 历史
    DOM.btnHistory.addEventListener('click', openHistory);
    DOM.btnCloseHistory.addEventListener('click', closeHistory);
    DOM.drawerOverlay.addEventListener('click', closeHistory);
    DOM.btnClearHistory.addEventListener('click', clearHistory);

    // 设置
    DOM.btnSettings.addEventListener('click', openSettings);
    DOM.btnCloseSettings.addEventListener('click', closeSettings);
    DOM.settingsModal.addEventListener('click', e => {
        if (e.target === DOM.settingsModal) closeSettings();
    });
    DOM.btnSaveSettings.addEventListener('click', () => {
        saveSettings();
        closeSettings();
        showToast('设置已保存 ✓', 'success');
    });
    DOM.btnTestConnection.addEventListener('click', testConnection);

    // 演示模式
    DOM.btnDemo.addEventListener('click', loadDemoData);
    DOM.btnLoadDemo.addEventListener('click', loadDemoData);

    // 键盘快捷键
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeHistory();
            closeSettings();
        }
        if (e.ctrlKey && e.key === 'Enter' && !STATE.isAnalyzing && STATE.imageBase64) {
            startAnalysis();
        }
    });
}

// ----- 图片处理 -----
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processImageFile(file);
}

function processImageFile(file) {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
        showToast('请上传 JPG / PNG / WEBP 格式的图片', 'error');
        return;
    }

    STATE.imageFile = file;
    DOM.previewFilename.textContent = file.name;

    // 压缩并转 base64
    compressAndEncode(file).then(result => {
        STATE.imageBase64 = result.base64;
        STATE.imageWidth = result.width;
        STATE.imageHeight = result.height;

        DOM.previewImage.src = result.base64;
        DOM.imageInfo.textContent =
            `${result.width} × ${result.height} px | ${(file.size / 1024).toFixed(1)} KB`;

        DOM.uploadZone.style.display = 'none';
        DOM.previewContainer.style.display = 'block';
        DOM.emptyState.style.display = 'none';
        DOM.resultsContent.style.display = 'none';
        DOM.annotationCanvas.style.display = 'none';
        DOM.demoHint.classList.add('demo-hidden');

        updateAnalyzeButton();
    });
}

function compressAndEncode(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                // 限制最大边长 2048px，控制 base64 体积
                let { width, height } = img;
                const maxDim = 2048;
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const base64 = canvas.toDataURL('image/jpeg', 0.85);
                resolve({ base64, width, height });
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function clearImage() {
    STATE.imageBase64 = null;
    STATE.imageFile = null;
    STATE.currentResult = null;
    DOM.previewImage.src = '';
    DOM.uploadZone.style.display = '';
    DOM.previewContainer.style.display = 'none';
    DOM.emptyState.style.display = '';
    DOM.resultsContent.style.display = 'none';
    DOM.btnExportPDF.disabled = true;
    DOM.btnCopyReport.disabled = true;
    DOM.demoHint.classList.remove('demo-hidden');
    // 清除标注画布
    const canvas = DOM.annotationCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = 'none';
    updateAnalyzeButton();
}

// ----- 模式切换 ------
function switchMode(mode) {
    STATE.workMode = mode;
    DOM.modeStandard.classList.toggle('active', mode === 'standard');
    DOM.modeCompare.classList.toggle('active', mode === 'compare');
    DOM.cvUploadSection.style.display = mode === 'compare' ? 'block' : 'none';
    DOM.badgeMode.textContent = mode === 'standard' ? '标准模式' : 'CV校验模式';
    DOM.compareCard.style.display = 'none';
}

function loadSampleCVData() {
    const sample = {
        "model": "YOLOv8-Pavement",
        "confidence_threshold": 0.5,
        "detections": [
            { "type": "crack", "subtype": "transverse", "bbox": [120, 80, 400, 95],
              "confidence": 0.87, "severity": "moderate" },
            { "type": "pothole", "bbox": [300, 250, 450, 380],
              "confidence": 0.92, "severity": "severe" },
            { "type": "crack", "subtype": "alligator", "bbox": [50, 300, 200, 450],
              "confidence": 0.65, "severity": "minor" },
        ]
    };
    DOM.cvJsonInput.value = JSON.stringify(sample, null, 2);
    showToast('已加载示例 CV 检测数据', 'info');
}

// ----- 演示模式 -----
function loadDemoData() {
    // 生成一个 SVG 路面的 base64 演示图片
    const demoCanvas = document.createElement('canvas');
    demoCanvas.width = 1024;
    demoCanvas.height = 680;
    const ctx = demoCanvas.getContext('2d');

    // 绘制路面背景
    const gradient = ctx.createLinearGradient(0, 0, 0, 680);
    gradient.addColorStop(0, '#6b6b6b');
    gradient.addColorStop(0.3, '#5a5a5a');
    gradient.addColorStop(0.5, '#555');
    gradient.addColorStop(0.7, '#4f4f4f');
    gradient.addColorStop(1, '#484848');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 680);

    // 路面纹理
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 680;
        ctx.fillRect(x, y, Math.random() * 8 + 2, Math.random() * 2 + 1);
    }

    // 车道标线（虚线）
    ctx.setLineDash([60, 40]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 340);
    ctx.lineTo(1024, 340);
    ctx.stroke();
    ctx.setLineDash([]);

    // 横向裂缝
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(100, 120);
    ctx.lineTo(240, 122);
    ctx.lineTo(350, 118);
    ctx.lineTo(400, 125);
    ctx.stroke();
    // 裂缝分支
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(220, 121);
    ctx.lineTo(215, 80);
    ctx.stroke();

    // 坑槽（椭圆）
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(650, 450, 70, 50, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(650, 450, 50, 35, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // 坑槽边缘裂纹
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(650, 450, 75, 55, 0.1, 0, Math.PI * 2);
    ctx.stroke();

    // 网状龟裂区域
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1.2;
    const cx = 800, cy = 180, r = 65;
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 / 8) * i;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        ctx.stroke();
    }
    // 龟裂多边形
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    const hexPoints = [];
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i - Math.PI/6;
        hexPoints.push([cx + Math.cos(a) * 40, cy + Math.sin(a) * 40]);
    }
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        for (let j = i + 1; j < 6; j++) {
            if (j - i === 1 || j - i === 5 || (i === 0 && j === 5)) {
                ctx.moveTo(hexPoints[i][0], hexPoints[i][1]);
                ctx.lineTo(hexPoints[j][0], hexPoints[j][1]);
            }
        }
    }
    ctx.stroke();

    // 修补区域
    ctx.fillStyle = '#3d3d3d';
    ctx.fillRect(250, 470, 160, 110);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(250, 470, 160, 110);
    // 修补区内的二次裂缝
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(280, 500);
    ctx.lineTo(350, 540);
    ctx.stroke();

    // 路面标线（已磨损）
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 600, 1024, 80);

    const demoBase64 = demoCanvas.toDataURL('image/jpeg', 0.9);

    // 设置模拟图片
    STATE.imageBase64 = demoBase64;
    STATE.imageFile = { name: 'demo_pavement.jpg', size: demoBase64.length };
    STATE.imageWidth = 1024;
    STATE.imageHeight = 680;

    DOM.previewImage.src = demoBase64;
    DOM.previewFilename.textContent = 'demo_pavement.jpg（演示图片）';
    DOM.imageInfo.textContent = '1024 × 680 px | 演示模式';
    DOM.uploadZone.style.display = 'none';
    DOM.previewContainer.style.display = 'block';
    DOM.demoHint.classList.add('demo-hidden');

    updateAnalyzeButton();

    // 预设演示结果（无需 API）
    STATE.workMode = 'standard';
    DOM.modeStandard.classList.add('active');
    DOM.modeCompare.classList.remove('active');
    DOM.cvUploadSection.style.display = 'none';
    DOM.badgeMode.textContent = '标准模式';

    const demoResult = {
        pavement_condition_index: 52,
        maintenance_priority: 'high',
        damages: [
            {
                type: 'crack',
                subtype: 'transverse',
                location: '图片上方区域（车道左侧）',
                severity: 'medium',
                description: '一条横向裂缝穿越大半个车道，长度约2.5-3m，主裂缝宽度约3-5mm，在裂缝末端出现轻微分支。裂缝方向大致垂直于行车方向，属于典型的温度收缩裂缝。',
                recommended_action: '建议在1-2个月内进行灌缝处理，防止雨水渗入导致基层破坏。'
            },
            {
                type: 'crack',
                subtype: 'alligator',
                location: '图片右上区域',
                severity: 'high',
                description: '网状的龟裂区域，直径约1.2m，由多个不规则的多边形裂缝组成。裂缝密度高，表面已出现轻微松动，属于结构承载能力不足导致的疲劳破坏前兆。',
                recommended_action: '建议在3个月内进行局部刨铣重铺，挖除松散层后重新摊铺沥青混合料。'
            },
            {
                type: 'pothole',
                subtype: null,
                location: '图片中部偏右（右侧车道）',
                severity: 'high',
                description: '一个椭圆形坑槽，直径约1.2m（长轴）× 0.9m（短轴），深度约4-6cm。坑槽边缘已出现碎裂和松散，内部可见基层材料。坑槽是龟裂进一步发展的结果。',
                recommended_action: '紧急修补！使用冷补沥青混合料进行临时填充，天气条件允许时进行热补永久修复。坑槽对行车安全构成直接威胁。'
            },
            {
                type: 'patching',
                subtype: null,
                location: '图片中下部（车道左侧）',
                severity: 'medium',
                description: '一块矩形修补区域，面积约1.6m × 1.1m。修补材料与原始路面颜色有明显差异。修补边缘已出现新的裂缝，修补区域中心也有轻微裂纹，表明修补处基底可能未彻底处理。',
                recommended_action: '监测修补区域的裂缝发展，若裂缝持续扩大，需要对修补处重新进行处理。'
            }
        ],
        overall_assessment: '路面状况整体较差，PCI评分52分，属于"差"等级。路面存在多种类型的损伤：上方横向裂缝贯穿半幅路面，右上角出现严重的龟裂区域（结构强度不足的信号），中央右侧有一个较大的坑槽（已构成安全隐患），中下部有老化修补区出现二次破损。建议优先处理坑槽（紧急），然后对龟裂区域进行局部重铺，横向裂缝做灌缝处理。若不及时维护，路面状况将在6-12个月内进一步恶化至"很差"等级。',
    };

    // 模拟加载过程
    simulateDemoLoading(demoResult);
}

function simulateDemoLoading(demoResult) {
    STATE.isAnalyzing = true;
    DOM.btnAnalyze.disabled = true;
    DOM.btnAnalyze.style.display = 'none';
    DOM.loadingContainer.style.display = 'block';
    DOM.emptyState.style.display = 'none';
    DOM.resultsContent.style.display = 'none';
    DOM.btnExportPDF.disabled = true;
    DOM.btnCopyReport.disabled = true;

    const steps = [
        { delay: 600, msg: '预处理演示图片…' },
        { delay: 1200, msg: '调用通义千问 VL 多模态模型分析…' },
        { delay: 2000, msg: '识别路面损伤类型与位置…' },
        { delay: 2800, msg: '评估损伤严重程度…' },
        { delay: 3500, msg: '生成 PCI 路面状况指数…' },
        { delay: 4000, msg: '编写检测报告与维护建议…' },
    ];

    steps.forEach(({ delay, msg }) => {
        setTimeout(() => updateLoadingStatus(msg), delay);
    });

    setTimeout(() => {
        const result = {
            ...demoResult,
            rawResponse: JSON.stringify(demoResult, null, 2),
            timestamp: Date.now(),
            imageBase64: STATE.imageBase64,
            imageFile: STATE.imageFile,
            workMode: STATE.workMode,
        };

        STATE.currentResult = result;
        renderResults(result);
        saveToHistory(result);

        DOM.loadingContainer.style.display = 'none';
        DOM.btnAnalyze.style.display = '';
        DOM.btnAnalyze.disabled = false;
        DOM.btnExportPDF.disabled = false;
        DOM.btnCopyReport.disabled = false;
        STATE.isAnalyzing = false;
        updateAnalyzeButton();

        showToast('演示分析完成！（演示模式 — 无需 API Key）', 'success');
    }, 4500);
}

// ----- API 调用 -----
async function callQwenVL(imageBase64, prompt, systemPrompt = '') {
    const apiKey = STATE.apiKey;
    if (!apiKey) throw new Error('请先设置 API Key');

    const messages = [];

    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    // 构建用户消息（多模态）
    const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    messages.push({
        role: 'user',
        content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: prompt },
        ],
    });

    const body = {
        model: STATE.model,
        messages: messages,
        max_tokens: 3000,
        temperature: 0.1,
    };

    updateLoadingStatus('正在调用通义千问 VL 多模态模型…');

    const response = await fetch(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        let errMsg;
        try {
            const errJson = JSON.parse(errText);
            errMsg = errJson.message || errJson.error?.message || `HTTP ${response.status}`;
        } catch {
            errMsg = errText || `HTTP ${response.status}`;
        }
        throw new Error(`API 请求失败: ${errMsg}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

// ----- 分析主流程 -----
async function startAnalysis() {
    if (STATE.isAnalyzing) return;
    if (!STATE.imageBase64) {
        showToast('请先上传路面图片', 'error');
        return;
    }
    if (!STATE.apiKey) {
        openSettings();
        showToast('请先设置阿里云 DashScope API Key', 'error');
        return;
    }

    STATE.isAnalyzing = true;
    DOM.btnAnalyze.disabled = true;
    DOM.btnAnalyze.style.display = 'none';
    DOM.loadingContainer.style.display = 'block';
    DOM.emptyState.style.display = 'none';
    DOM.resultsContent.style.display = 'none';
    DOM.btnExportPDF.disabled = true;
    DOM.btnCopyReport.disabled = true;

    updateLoadingStatus('预处理图片…');

    try {
        const isCompareMode = STATE.workMode === 'compare';
        let prompt, systemPrompt;

        if (isCompareMode) {
            prompt = buildComparePrompt();
            systemPrompt = buildSystemPrompt();
        } else {
            prompt = buildStandardPrompt();
            systemPrompt = buildSystemPrompt();
        }

        updateLoadingStatus('调用通义千问 VL 分析路面损伤…');

        const rawResponse = await callQwenVL(STATE.imageBase64, prompt, systemPrompt);

        updateLoadingStatus('解析分析结果…');

        const result = parseResponse(rawResponse);

        STATE.currentResult = {
            ...result,
            rawResponse,
            timestamp: Date.now(),
            imageBase64: STATE.imageBase64,
            imageFile: STATE.imageFile,
            workMode: STATE.workMode,
        };

        renderResults(result);
        saveToHistory(STATE.currentResult);
        updateAnalyzeButton();

        DOM.loadingContainer.style.display = 'none';
        DOM.btnAnalyze.style.display = '';
        DOM.btnExportPDF.disabled = false;
        DOM.btnCopyReport.disabled = false;

        showToast('分析完成！', 'success');

    } catch (error) {
        console.error('Analysis failed:', error);
        showToast(error.message || '分析失败，请重试', 'error');
        DOM.loadingContainer.style.display = 'none';
        DOM.btnAnalyze.style.display = '';
        DOM.btnAnalyze.disabled = false;
        DOM.emptyState.style.display = '';
    } finally {
        STATE.isAnalyzing = false;
        updateAnalyzeButton();
    }
}

function updateLoadingStatus(msg) {
    DOM.loadingStatus.textContent = msg;
}

// ----- 提示词构建 -----
function buildSystemPrompt() {
    return `你是一个专业的道路工程检测专家，精通路面损伤识别与评估。
你使用通义千问 VL 多模态大模型来分析路面图片。
你需要严格遵守输出格式要求，返回结构化的 JSON 数据。
不要输出任何 JSON 之外的内容。`;
}

function buildStandardPrompt() {
    return `请仔细分析这张路面（道路/公路/街道）图片，识别所有可见的路面损伤和缺陷。

## 你需要检测的损伤类型：
1. **裂缝 (crack)**：横向裂缝(transverse)、纵向裂缝(longitudinal)、龟裂/网状裂缝(alligator)、块状裂缝(block)
2. **坑槽 (pothole)**：路面局部塌陷形成的坑洞
3. **车辙 (rutting)**：沿车轮轨迹的纵向凹陷变形
4. **松散/剥落 (raveling)**：集料从路面表面脱落
5. **修补 (patching)**：已修补区域及修补破损
6. **泛油 (bleeding)**：沥青上浮导致路面发亮
7. **沉陷 (depression)**：路面局部下沉
8. **推移 (shoving)**：路面材料横向位移形成波纹

对于每个检测到的损伤，请描述：
- type: 损伤类型
- subtype: 子类型（如适用，否则为 null）
- location: 在图像中的位置描述（如"左上区域"、"中央偏右"）
- severity: 严重程度（low/medium/high/critical）
- description: 损伤的详细中文描述（长度、宽度、面积等估算信息）
- recommended_action: 建议的维护措施

## 同时给出：
- pavement_condition_index: 路面状况指数 PCI（0-100分，100=完美）
- overall_assessment: 整体评价中文段落（100-200字）
- maintenance_priority: 维护优先级（low/medium/high/urgent）

## 重要要求：
- 仔细、全面观察图片
- 如果图片中未发现明显损伤，请如实说明
- PCI 评分要合理（良好路面 > 80，一般 55-80，差 < 55）
- 不要遗漏任何可见损伤

请严格输出以下 JSON 格式（不要输出任何其他内容）：

\`\`\`json
{
  "pavement_condition_index": 75,
  "maintenance_priority": "medium",
  "damages": [
    {
      "type": "crack",
      "subtype": "transverse",
      "location": "图片中央偏上区域",
      "severity": "medium",
      "description": "一条横向裂缝，长度约2米，宽度约3-5mm，贯穿半幅路面",
      "recommended_action": "建议在3个月内进行灌缝处理"
    }
  ],
  "overall_assessment": "路面整体状况尚可，但存在典型的老化裂缝和局部坑槽…"
}
\`\`\``;
}

function buildComparePrompt() {
    let cvSection = '';
    try {
        const cvData = JSON.parse(DOM.cvJsonInput.value.trim());
        cvSection = `\n## CV 模型的检测结果：
\`\`\`json
${JSON.stringify(cvData, null, 2)}
\`\`\`
`;
    } catch (e) {
        cvSection = `\n## CV 模型检测结果：
（未提供有效的 JSON 数据，请仅基于图片进行分析）
`;
    }

    return `请仔细分析这张路面图片，并完成以下两个任务：

### 任务 1：独立检测
识别图片中所有可见的路面损伤和缺陷。

### 任务 2：校验 CV 模型结果${cvSection}
请对 CV 模型的每个检测结果进行校验：
- 标注 bbox 位置是否确实存在对应的损伤 → verdict: "confirmed" / "incorrect" / "uncertain"
- 损伤类型分类是否正确 → type_correct: true / false
- 严重程度评估是否合理 → severity_correct: true / false
- 是否有 CV 模型漏检的损伤 → 在 missed 数组中列出
- 是否有 CV 模型误检的 → 在 false_positives 中列出

## 你的检测范围（8类损伤）：
裂缝(crack)、坑槽(pothole)、车辙(rutting)、松散/剥落(raveling)、修补(patching)、泛油(bleeding)、沉陷(depression)、推移(shoving)

## 评分：
- pavement_condition_index: 路面状况指数 PCI（0-100分，100=完美）
- overall_assessment: 整体评价（100-200字中文）
- maintenance_priority: 维护优先级（low/medium/high/urgent）

请严格输出以下 JSON 格式（不要输出任何其他内容）：

\`\`\`json
{
  "pavement_condition_index": 75,
  "maintenance_priority": "medium",
  "damages": [
    {
      "type": "crack",
      "subtype": "transverse",
      "location": "图片中央偏上",
      "severity": "medium",
      "description": "一条横向裂缝…",
      "recommended_action": "灌缝处理"
    }
  ],
  "overall_assessment": "路面整体状况…",
  "cv_verification": {
    "verified": [
      {
        "original_detection": {"type": "crack", "bbox": [120,80,400,95]},
        "bbox_verdict": "confirmed",
        "type_correct": true,
        "severity_correct": false,
        "corrected_severity": "high",
        "comment": "裂缝实际比CV检测的更宽，严重程度应上调"
      }
    ],
    "missed": [
      {
        "type": "pothole",
        "location": "右下角",
        "reason": "坑槽颜色与路面接近，CV模型未能识别"
      }
    ],
    "false_positives": [
      {
        "original_detection": {"type": "crack", "bbox": [500,300,550,310]},
        "reason": "实际是路面标线，被误判为裂缝"
      }
    ],
    "cv_model_accuracy_rating": "fair",
    "cv_model_feedback": "CV模型在明显裂缝检测上表现良好，但对颜色接近的损伤和细小裂缝存在漏检…"
  }
}
\`\`\``;
}

// ----- 响应解析 -----
function parseResponse(raw) {
    // 尝试从 ```json 代码块中提取
    let jsonStr = raw;
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
    }

    // 尝试直接找 JSON 对象
    if (!jsonStr.startsWith('{')) {
        const braceMatch = raw.match(/\{[\s\S]*\}/);
        if (braceMatch) {
            jsonStr = braceMatch[0];
        }
    }

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        // 尝试修复常见问题：尾部逗号、未闭合引号等
        try {
            const cleaned = jsonStr
                .replace(/,\s*}/g, '}')
                .replace(/,\s*]/g, ']')
                .replace(/[ -]/g, ' ');
            parsed = JSON.parse(cleaned);
        } catch (e2) {
            throw new Error('无法解析模型返回的结构化数据，请重试。原始响应：' + raw.substring(0, 300));
        }
    }

    // 验证必要字段
    if (!parsed.damages && !parsed.overall_assessment) {
        throw new Error('模型返回的数据缺少必要字段（damages 或 overall_assessment）');
    }

    // 确保 damages 为数组
    if (!Array.isArray(parsed.damages)) {
        parsed.damages = [];
    }

    // 确保 PCI 存在且合理
    if (typeof parsed.pavement_condition_index !== 'number') {
        parsed.pavement_condition_index = parsed.damages.length === 0 ? 85 : 60;
    }
    parsed.pavement_condition_index = Math.max(0, Math.min(100, Math.round(parsed.pavement_condition_index)));

    return parsed;
}

// ----- 结果渲染 -----
function renderResults(result) {
    DOM.emptyState.style.display = 'none';
    DOM.resultsContent.style.display = 'block';
    DOM.compareCard.style.display = 'none';

    // PCI 环
    const pci = result.pavement_condition_index;
    const pciColor = pci >= 70 ? '#16a34a' : pci >= 45 ? '#f59e0b' : '#dc2626';
    DOM.pciValue.textContent = pci;
    DOM.pciValue.style.color = pciColor;
    const circumference = 2 * Math.PI * 52; // ~326.7
    const offset = circumference * (1 - pci / 100);
    DOM.pciArc.setAttribute('stroke-dasharray', circumference);
    DOM.pciArc.setAttribute('stroke-dashoffset', offset);
    DOM.pciArc.setAttribute('stroke', pciColor);

    // 元数据
    DOM.metaCount.textContent = `${result.damages.length} 处`;
    DOM.metaSeverity.textContent = getMaxSeverity(result.damages);
    DOM.metaPriority.textContent = priorityLabel(result.maintenance_priority || 'medium');

    // 损伤列表
    renderDamageList(result.damages);

    // 综合评估
    DOM.assessmentBody.textContent = result.overall_assessment || '暂无评估内容。';

    // CV校验（如果有）
    if (result.cv_verification) {
        renderCVComparison(result.cv_verification);
    }
}

function getMaxSeverity(damages) {
    const order = { low: 0, medium: 1, high: 2, critical: 3 };
    let max = 'low';
    damages.forEach(d => {
        if (order[d.severity] > order[max]) max = d.severity;
    });
    return severityLabel(max);
}

function severityLabel(s) {
    const map = { low: '轻微', medium: '中等', high: '严重', critical: '危急' };
    return map[s] || s;
}

function priorityLabel(p) {
    const map = { low: '低', medium: '中', high: '高', urgent: '紧急' };
    return map[p] || p;
}

function renderDamageList(damages) {
    const container = DOM.damageList;
    container.innerHTML = '<h3>损伤详情</h3>';

    if (damages.length === 0) {
        container.innerHTML += `
            <div class="damage-card" style="border-color: #bbf7d0; background: #f0fdf4;">
                <div class="damage-card-header">
                    <span style="font-size:1.5rem;">✅</span>
                    <span class="damage-type-name" style="color: #16a34a;">未检测到明显损伤</span>
                </div>
                <div class="damage-card-body" style="color: #16a34a;">
                    路面状况良好，无明显可见的结构性损伤或表面缺陷。
                </div>
            </div>`;
        return;
    }

    damages.forEach((d, i) => {
        const iconMap = {
            crack: '🔲', pothole: '🕳️', rutting: '〰️', raveling: '🪨',
            patching: '🩹', bleeding: '💧', depression: '⏬', shoving: '🌊',
        };
        const icon = iconMap[d.type] || '⚠️';
        const iconClass = ['crack','pothole','rutting','raveling','patching'].includes(d.type)
            ? d.type : 'other';

        const card = document.createElement('div');
        card.className = 'damage-card';
        card.innerHTML = `
            <div class="damage-card-header">
                <div class="damage-type-icon ${iconClass}">${icon}</div>
                <span class="damage-type-name">
                    ${damageTypeLabel(d.type)}
                    ${d.subtype ? ` · ${d.subtype}` : ''}
                </span>
                <span class="severity-badge severity-${d.severity || 'low'}">
                    ${severityLabel(d.severity || 'low')}
                </span>
            </div>
            <div class="damage-card-body">
                <div class="field">
                    <span class="field-label">位置</span>
                    <span class="field-value">${d.location || '未标注'}</span>
                </div>
                <div class="field">
                    <span class="field-label">描述</span>
                    <span class="field-value">${d.description || '无详细描述'}</span>
                </div>
            </div>
            ${d.recommended_action ? `
            <div class="damage-card-footer">
                💡 ${d.recommended_action}
            </div>` : ''}
        `;
        container.appendChild(card);
    });
}

function damageTypeLabel(type) {
    const map = {
        crack: '裂缝', pothole: '坑槽', rutting: '车辙',
        raveling: '松散/剥落', patching: '修补', bleeding: '泛油',
        depression: '沉陷', shoving: '推移',
    };
    return map[type] || type;
}

function renderCVComparison(cvVer) {
    DOM.compareCard.style.display = 'block';
    const tbody = DOM.compareTable.querySelector('tbody');
    tbody.innerHTML = '';

    // 校验结果行
    if (cvVer.verified && cvVer.verified.length > 0) {
        cvVer.verified.forEach(v => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>检测校验</td>
                <td>${v.original_detection?.type || '--'} (置信度: ${v.original_detection?.confidence || '--'})</td>
                <td>
                    位置: ${v.bbox_verdict === 'confirmed' ? '✅ 一致' : '⚠️ 需修正'}<br>
                    类型: ${v.type_correct ? '✅' : '❌'}<br>
                    严重程度: ${v.severity_correct ? '✅' : '❌ → ' + (v.corrected_severity || '--')}
                </td>
                <td>${v.comment || '--'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    // 漏检行
    if (cvVer.missed && cvVer.missed.length > 0) {
        cvVer.missed.forEach(m => {
            const row = document.createElement('tr');
            row.style.background = '#fef3c7';
            row.innerHTML = `
                <td>🔴 CV 漏检</td>
                <td>--</td>
                <td>类型: ${damageTypeLabel(m.type)}, 位置: ${m.location}</td>
                <td>${m.reason || '--'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    // 误检行
    if (cvVer.false_positives && cvVer.false_positives.length > 0) {
        cvVer.false_positives.forEach(fp => {
            const row = document.createElement('tr');
            row.style.background = '#fee2e2';
            row.innerHTML = `
                <td>🟠 CV 误检</td>
                <td>${fp.original_detection?.type || '--'}</td>
                <td>实际不是损伤</td>
                <td>${fp.reason || '--'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    // 总结
    DOM.compareVerdict.innerHTML = `
        <strong>CV 模型精度评级：${cvVer.cv_model_accuracy_rating || '--'}</strong><br>
        ${cvVer.cv_model_feedback || ''}
    `;

    // 绘制 bbox 标注
    setTimeout(() => drawCVBBoxes(cvVer), 200);
}

// ----- 历史记录 -----
function saveToHistory(result) {
    // 完整结果存入 sessionStorage（同会话内可回看）
    const fullResults = getSessionResults();
    const resultId = Date.now();
    fullResults[resultId] = result;
    // 最多保留 10 条完整结果
    const keys = Object.keys(fullResults);
    if (keys.length > 10) {
        delete fullResults[keys[0]];
    }
    try {
        sessionStorage.setItem('pavement_inspector_full', JSON.stringify(fullResults));
    } catch(e) { /* 超出存储限制则丢弃 */ }

    // 摘要存入 localStorage（跨会话的缩略图列表）
    const history = getHistory();
    history.unshift({
        id: resultId,
        timestamp: result.timestamp,
        pci: result.pavement_condition_index,
        damagesCount: result.damages?.length || 0,
        maxSeverity: getMaxSeverity(result.damages || []),
        imageBase64: result.imageBase64,
        filename: result.imageFile?.name || 'unknown',
    });
    // 最多保留 20 条
    const trimmed = history.slice(0, 20);
    localStorage.setItem('pavement_inspector_history', JSON.stringify(trimmed));
    renderHistoryList();
}

function getSessionResults() {
    try {
        return JSON.parse(sessionStorage.getItem('pavement_inspector_full') || '{}');
    } catch {
        return {};
    }
}

function getHistory() {
    try {
        return JSON.parse(localStorage.getItem('pavement_inspector_history') || '[]');
    } catch {
        return [];
    }
}

function renderHistoryList() {
    const history = getHistory();
    const container = DOM.historyList;

    if (history.length === 0) {
        container.innerHTML = '<p class="empty-hint">暂无历史记录</p>';
        return;
    }

    container.innerHTML = history.map((h, i) => `
        <div class="history-item" data-id="${h.id}">
            <img class="history-item-thumb" src="${h.imageBase64 || ''}" alt="路面图片缩略图"
                 onerror="this.style.display='none'">
            <div class="history-item-meta">
                <span>${new Date(h.timestamp).toLocaleString('zh-CN')}</span>
                <span class="pci">PCI: ${h.pci}</span>
                <span>${h.damagesCount}处损伤</span>
            </div>
        </div>
    `).join('');

    // 点击历史记录 → 从 sessionStorage 加载完整结果
    container.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = parseInt(item.dataset.id);
            const fullResults = getSessionResults();
            const fullResult = fullResults[id];

            if (fullResult && fullResult.pavement_condition_index !== undefined) {
                STATE.currentResult = fullResult;
                STATE.imageBase64 = fullResult.imageBase64;
                STATE.workMode = fullResult.workMode || 'standard';
                DOM.previewImage.src = fullResult.imageBase64 || '';
                DOM.uploadZone.style.display = 'none';
                DOM.previewContainer.style.display = 'block';
                DOM.previewFilename.textContent = fullResult.imageFile?.name || '历史图片';
                DOM.imageInfo.textContent = '';
                DOM.demoHint.classList.add('demo-hidden');
                updateAnalyzeButton();
                renderResults(fullResult);
                DOM.btnExportPDF.disabled = false;
                DOM.btnCopyReport.disabled = false;
                closeHistory();
            } else {
                // 跨会话：完整结果已丢失，仅显示摘要信息
                showToast('完整结果仅在当前浏览器会话中保留。请重新分析获取详细结果。', 'info');
            }
        });
    });
}

function openHistory() {
    DOM.historyDrawer.classList.add('open');
    DOM.drawerOverlay.style.display = 'block';
    renderHistoryList();
}

function closeHistory() {
    DOM.historyDrawer.classList.remove('open');
    DOM.drawerOverlay.style.display = 'none';
}

function clearHistory() {
    if (confirm('确定要清空所有历史记录吗？')) {
        localStorage.removeItem('pavement_inspector_history');
        sessionStorage.removeItem('pavement_inspector_full');
        renderHistoryList();
        showToast('历史记录已清空', 'info');
    }
}

// ----- 设置弹窗 -----
function openSettings() {
    DOM.settingsModal.style.display = 'flex';
    DOM.apiKey.value = STATE.apiKey;
    DOM.modelSelect.value = STATE.model;
}

function closeSettings() {
    DOM.settingsModal.style.display = 'none';
}

async function testConnection() {
    const key = DOM.apiKey.value.trim();
    if (!key) {
        showToast('请先输入 API Key', 'error');
        return;
    }

    const btn = DOM.btnTestConnection;
    btn.disabled = true;
    btn.textContent = '测试中…';
    showToast('正在测试 API 连接…', 'info');

    try {
        const resp = await fetch(
            'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: DOM.modelSelect.value,
                    messages: [{ role: 'user', content: '回复"连接成功"' }],
                    max_tokens: 10,
                }),
            }
        );
        if (resp.ok) {
            showToast('✅ API 连接成功！', 'success');
        } else {
            const err = await resp.json().catch(() => ({}));
            showToast(`❌ 连接失败: ${err.message || resp.status}`, 'error');
        }
    } catch (e) {
        showToast(`❌ 网络错误: ${e.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '测试连接';
    }
}

// ----- CV 标注框绘制 -----
function drawCVBBoxes(cvVerification) {
    const canvas = DOM.annotationCanvas;
    const img = DOM.previewImage;
    if (!img.complete || !img.naturalWidth) return;

    // 同步 canvas 尺寸到图片显示尺寸
    const rect = img.getBoundingClientRect();
    const displayW = rect.width;
    const displayH = rect.height;
    canvas.width = displayW;
    canvas.height = displayH;
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';
    canvas.style.display = 'block';

    const scaleX = displayW / STATE.imageWidth;
    const scaleY = displayH / STATE.imageHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, displayW, displayH);

    const allBBoxes = [];

    // 收集所有已验证的 bbox
    if (cvVerification.verified) {
        cvVerification.verified.forEach(v => {
            const bbox = v.original_detection?.bbox;
            if (bbox && bbox.length === 4) {
                allBBoxes.push({ bbox, verdict: v.bbox_verdict, type: v.original_detection.type });
            }
        });
    }
    // 收集误检的 bbox
    if (cvVerification.false_positives) {
        cvVerification.false_positives.forEach(fp => {
            const bbox = fp.original_detection?.bbox;
            if (bbox && bbox.length === 4) {
                allBBoxes.push({ bbox, verdict: 'false_positive', type: fp.original_detection.type });
            }
        });
    }

    allBBoxes.forEach(({ bbox, verdict, type }) => {
        const [x1, y1, x2, y2] = bbox.map(v => v * scaleX);
        const w = x2 - x1;
        const h = y2 - y1;

        ctx.lineWidth = 2;
        if (verdict === 'confirmed') {
            ctx.strokeStyle = '#16a34a';
            ctx.fillStyle = 'rgba(22,163,74,0.12)';
        } else if (verdict === 'false_positive') {
            ctx.strokeStyle = '#dc2626';
            ctx.fillStyle = 'rgba(220,38,38,0.12)';
            ctx.setLineDash([5, 3]);
        } else {
            ctx.strokeStyle = '#f59e0b';
            ctx.fillStyle = 'rgba(245,158,11,0.12)';
        }

        ctx.fillRect(x1, y1, w, h);
        ctx.strokeRect(x1, y1, w, h);
        ctx.setLineDash([]);

        // 标签
        ctx.fillStyle = verdict === 'confirmed' ? '#16a34a' :
                        verdict === 'false_positive' ? '#dc2626' : '#f59e0b';
        ctx.font = 'bold 11px -apple-system, sans-serif';
        const label = `${type} ${verdict === 'false_positive' ? '❌' : verdict === 'confirmed' ? '✓' : '?'}`;
        const textW = ctx.measureText(label).width + 6;
        ctx.fillRect(x1, y1 - 16, textW, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x1 + 3, y1 - 3);
    });

    // 标注漏检位置（圆形标记）
    if (cvVerification.missed) {
        cvVerification.missed.forEach((m, i) => {
            const cx = 100 + i * 120;
            const cy = canvas.height - 40;
            ctx.beginPath();
            ctx.arc(cx, cy, 20, 0, Math.PI * 2);
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(220,38,38,0.15)';
            ctx.fill();
            ctx.fillStyle = '#dc2626';
            ctx.font = 'bold 10px -apple-system, sans-serif';
            ctx.fillText(`漏:${damageTypeLabel(m.type)}`, cx - 25, cy + 35);
        });
    }
}

// ----- 导出与复制 -----
function exportReport() {
    if (!STATE.currentResult) return;

    const r = STATE.currentResult;
    let report = '';
    report += '═══════════════════════════════════\n';
    report += '  路面损伤检测报告\n';
    report += '  Pavement Inspection Report\n';
    report += '═══════════════════════════════════\n\n';
    report += `生成时间：${new Date(r.timestamp).toLocaleString('zh-CN')}\n`;
    report += `分析模型：通义千问 VL (${STATE.model})\n`;
    report += `工作模式：${STATE.workMode === 'compare' ? 'CV校验模式' : '标准检测模式'}\n`;
    report += `图片文件：${r.imageFile?.name || '未知'}\n\n`;
    report += '───────────────────────────────────\n';
    report += `路面状况指数 (PCI)：${r.pavement_condition_index} / 100\n`;
    report += `维护优先级：${priorityLabel(r.maintenance_priority || 'medium')}\n`;
    report += `检测损伤：${r.damages?.length || 0} 处\n`;
    report += '───────────────────────────────────\n\n';

    if (r.damages && r.damages.length > 0) {
        report += '【损伤详情】\n\n';
        r.damages.forEach((d, i) => {
            report += `  ${i + 1}. ${damageTypeLabel(d.type)}`;
            if (d.subtype) report += ` (${d.subtype})`;
            report += `\n     严重程度：${severityLabel(d.severity || 'low')}`;
            report += `\n     位置：${d.location || '--'}`;
            report += `\n     描述：${d.description || '--'}`;
            if (d.recommended_action) report += `\n     建议：${d.recommended_action}`;
            report += '\n\n';
        });
    }

    report += '【综合评估】\n';
    report += (r.overall_assessment || '无') + '\n';

    if (r.cv_verification) {
        report += '\n【CV 模型校验结果】\n';
        report += `模型精度评级：${r.cv_verification.cv_model_accuracy_rating || '--'}\n`;
        report += `反馈：${r.cv_verification.cv_model_feedback || '--'}\n`;
    }

    // 下载
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `路面损伤报告_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('报告已下载', 'success');
}

function copyReport() {
    if (!STATE.currentResult) return;

    const r = STATE.currentResult;
    let text = `路面损伤检测报告 | PCI: ${r.pavement_condition_index}/100 | ${r.damages?.length || 0}处损伤\n`;
    if (r.damages) {
        r.damages.forEach(d => {
            text += `• ${damageTypeLabel(d.type)} - ${severityLabel(d.severity||'low')} - ${d.description||''}\n`;
        });
    }
    text += `\n评估：${r.overall_assessment || ''}`;

    navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板 ✓', 'success');
    }).catch(() => {
        showToast('复制失败，请手动复制', 'error');
    });
}

// ----- 按钮状态 -----
function updateAnalyzeButton() {
    DOM.btnAnalyze.disabled = !STATE.imageBase64 || STATE.isAnalyzing;
    if (STATE.imageBase64 && STATE.apiKey && !STATE.isAnalyzing) {
        DOM.btnAnalyze.style.display = '';
    }
}

// ----- Toast 通知 -----
function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ----- 启动 -----
document.addEventListener('DOMContentLoaded', init);
