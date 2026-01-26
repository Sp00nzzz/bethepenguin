export class SubtitleOverlay {
    private element: HTMLDivElement;
    private subtitles: { start: number; end: number; text: string }[] = [];
    private activeIndex: number = -1;

    constructor() {
        this.element = document.createElement('div');
        this.element.id = 'subtitle-overlay';
        this.element.style.position = 'fixed';
        this.element.style.bottom = '10%';
        this.element.style.left = '50%';
        this.element.style.transform = 'translateX(-50%)';
        this.element.style.width = '100vw';
        this.element.style.textAlign = 'center';
        this.element.style.color = '#FDEB37';
        this.element.style.fontFamily = '"Inter", sans-serif';
        this.element.style.fontSize = '20px'; // Smaller font
        this.element.style.fontWeight = '500';
        this.element.style.letterSpacing = '0.5px';
        this.element.style.lineHeight = '1.2';
        this.element.style.pointerEvents = 'none';
        this.element.style.opacity = '0';
        this.element.style.zIndex = '1000';

        document.body.appendChild(this.element);

        this.loadSubtitles();
    }

    private async loadSubtitles() {
        try {
            const response = await fetch('/Narration.subtitles.json');
            if (!response.ok) throw new Error('Subtitles not found');
            this.subtitles = await response.json();
            console.log('Subtitles loaded:', this.subtitles.length);
        } catch (error) {
            console.warn('Failed to load subtitles:', error);
        }
    }

    public update(currentTime: number) {
        let foundIndex = -1;
        let maxStart = -1;

        for (let i = 0; i < this.subtitles.length; i++) {
            const sub = this.subtitles[i];
            if (currentTime >= sub.start && currentTime < sub.end) {
                if (sub.start > maxStart) {
                    maxStart = sub.start;
                    foundIndex = i;
                }
            }
        }

        if (foundIndex !== this.activeIndex) {
            this.activeIndex = foundIndex;
            if (this.activeIndex !== -1) {
                this.element.innerText = this.subtitles[this.activeIndex].text;
                this.element.style.opacity = '1';
            } else {
                this.element.style.opacity = '0';
            }
        }
    }

    public setVisible(visible: boolean) {
        if (!visible) {
            this.element.style.opacity = '0';
            this.activeIndex = -1;
        }
    }
}
