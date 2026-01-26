export class AudioManager {
    private ctx: AudioContext;
    private windGain: GainNode;
    private music: HTMLAudioElement;
    private musicGain: GainNode;
    private narration: HTMLAudioElement;
    private narrationGain: GainNode;
    private isEnabled: boolean = false;
    private musicStarted: boolean = false;
    private narrationStarted: boolean = false;
    private walkTimer: number = 0;
    private narrationTimer: number = 0;

    constructor() {
        // browser might block until user interaction
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Wind Chain
        const windOsc = this.ctx.createBufferSource();
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        windOsc.buffer = noiseBuffer;
        windOsc.loop = true;

        const windFilter = this.ctx.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.value = 400;

        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0.0; // Start silent

        windOsc.connect(windFilter);
        windFilter.connect(this.windGain);
        this.windGain.connect(this.ctx.destination);

        windOsc.start();

        // Music Chain
        this.music = new Audio('/background.mp3');
        this.music.loop = true;
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0;

        const musicSource = this.ctx.createMediaElementSource(this.music);
        musicSource.connect(this.musicGain);
        this.musicGain.connect(this.ctx.destination);

        // Narration Chain
        this.narration = new Audio('/Narration.mp3');
        this.narration.loop = false;
        this.narrationGain = this.ctx.createGain();
        this.narrationGain.gain.value = 1.0;

        const narrationSource = this.ctx.createMediaElementSource(this.narration);
        narrationSource.connect(this.narrationGain);
        this.narrationGain.connect(this.ctx.destination);
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        this.isEnabled = true;

        // Fade in wind
        this.windGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 2.0);
    }

    playStep() {
        if (!this.isEnabled) return;

        const t = this.ctx.currentTime;
        // Simple noise burst for snow crunch
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        // Create noise buffer for step
        const duration = 0.15;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

        noise.start(t);
        noise.stop(t + duration);
    }

    public getNarrationTime(): number {
        return this.narration.currentTime;
    }

    update(dt: number, isWalking: boolean) {
        if (!this.isEnabled) return;

        if (isWalking && !this.musicStarted) {
            this.walkTimer += dt;
            if (this.walkTimer >= 10) {
                this.musicStarted = true;
                this.music.play().catch(e => console.error("Music play failed:", e));
                // Slow fade in over 5 seconds
                this.musicGain.gain.setTargetAtTime(0.4, this.ctx.currentTime, 5.0);
            }
        }

        if (this.musicStarted && !this.narrationStarted) {
            this.narrationTimer += dt;
            if (this.narrationTimer >= 4.0) {
                this.narrationStarted = true;
                this.narration.play().catch(e => console.error("Narration play failed:", e));
            }
        }
    }
}
