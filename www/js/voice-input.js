/**
 * 聊天语音输入：点击麦克风开始，再次点击结束
 */
class VoiceInput {
    constructor() {
        /** @type {boolean} */
        this.isListening = false;
        /** @type {SpeechRecognition|null} */
        this.recognition = null;
        /** @type {string} */
        this.finalTranscript = '';
        this.btn = document.getElementById('voice-input-btn');
        this.input = document.getElementById('chat-input');
        this.init();
    }

    init() {
        this.btn?.addEventListener('click', () => this.toggle());
    }

    /**
     * 是否支持语音识别
     * @returns {boolean}
     */
    static isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    /**
     * 切换录音状态
     */
    async toggle() {
        if (this.isListening) {
            this.stop();
            return;
        }
        await this.start();
    }

    /**
     * 开始录音识别
     */
    async start() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            VoiceInput.showError(
                '当前环境不支持语音识别。\n\n建议使用 Chrome 浏览器；Android 应用需授予麦克风权限，部分机型可能仍不可用。'
            );
            return;
        }

        const micOk = await VoiceInput.ensureMicPermission();
        if (!micOk) {
            VoiceInput.showError('无法使用麦克风，请在系统设置中允许本应用访问麦克风后重试。');
            return;
        }

        if (!this.recognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'zh-CN';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.bindRecognitionEvents();
        }

        this.finalTranscript = this.input?.value?.trim()
            ? `${this.input.value.trim()} `
            : '';

        try {
            this.recognition.start();
            this.setListeningState(true);
        } catch (error) {
            if (error?.name === 'InvalidStateError') {
                this.recognition.stop();
                return;
            }
            VoiceInput.showError(`语音启动失败：${error?.message || '未知错误'}`);
        }
    }

    /**
     * 结束录音识别
     */
    stop() {
        if (!this.recognition || !this.isListening) {
            return;
        }
        try {
            this.recognition.stop();
        } catch {
            this.setListeningState(false);
        }
    }

    /**
     * 绑定识别事件
     */
    bindRecognitionEvents() {
        this.recognition.onstart = () => {
            this.setListeningState(true);
        };

        this.recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const piece = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    this.finalTranscript += piece;
                } else {
                    interim += piece;
                }
            }
            if (this.input) {
                this.input.value = (this.finalTranscript + interim).trim();
            }
        };

        this.recognition.onend = () => {
            this.setListeningState(false);
            if (this.input) {
                this.input.value = this.finalTranscript.trim();
                this.input.focus();
            }
        };

        this.recognition.onerror = (event) => {
            this.setListeningState(false);
            const code = event?.error || 'unknown';
            if (code === 'aborted') {
                return;
            }
            if (code === 'not-allowed') {
                VoiceInput.showError('麦克风权限被拒绝，请在系统设置中允许应用使用麦克风。');
                return;
            }
            if (code === 'no-speech') {
                VoiceInput.showError('没有检测到语音，请靠近麦克风后再试。');
                return;
            }
            VoiceInput.showError(`语音识别失败（${code}），请稍后重试。`);
        };
    }

    /**
     * 更新按钮与输入框状态
     * @param {boolean} listening
     */
    setListeningState(listening) {
        this.isListening = listening;
        const icon = this.btn?.querySelector('i');
        if (!this.btn) {
            return;
        }

        if (listening) {
            this.btn.classList.add('chat-voice-btn--active');
            this.btn.setAttribute('aria-pressed', 'true');
            this.btn.title = '点击结束录音';
            if (icon) {
                icon.className = 'fa fa-stop';
            }
            if (this.input) {
                this.input.placeholder = '正在聆听…再次点击麦克风结束';
            }
        } else {
            this.btn.classList.remove('chat-voice-btn--active');
            this.btn.setAttribute('aria-pressed', 'false');
            this.btn.title = '点击开始语音输入';
            if (icon) {
                icon.className = 'fa fa-microphone';
            }
            if (this.input) {
                this.input.placeholder = '输入你的问题，让我来帮你…';
            }
        }
    }

    /**
     * 预请求麦克风权限（改善 Android WebView）
     * @returns {Promise<boolean>}
     */
    static async ensureMicPermission() {
        if (!navigator.mediaDevices?.getUserMedia) {
            return true;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @param {string} message
     */
    static showError(message) {
        if (window.aiAssistant && typeof window.aiAssistant.addMessage === 'function') {
            window.aiAssistant.addMessage('assistant', `🎤 ${message}`);
            return;
        }
        alert(message);
    }
}
