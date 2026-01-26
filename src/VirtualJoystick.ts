
export class VirtualJoystick {
    private base: HTMLDivElement;
    private knob: HTMLDivElement;
    private container: HTMLDivElement;

    private centerX: number = 0;
    private centerY: number = 0;
    private pointerId: number | null = null;

    private _axisX: number = 0;
    private _axisY: number = 0;
    private _active: boolean = false;

    private baseRadius: number = 60; // Default, will be updated from DOM

    constructor(onStart?: () => void) {
        this.container = document.createElement('div');
        this.container.id = 'joystick-container';

        this.base = document.createElement('div');
        this.base.className = 'joystick-base';

        this.knob = document.createElement('div');
        this.knob.className = 'joystick-knob';

        this.base.appendChild(this.knob);
        this.container.appendChild(this.base);
        document.body.appendChild(this.container);

        // Initial check for touch device
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (!isTouch) {
            this.container.style.display = 'none';
        }

        this.setupEvents(onStart);
        this.updateKnobPosition(0, 0);
    }

    private setupEvents(onStart?: () => void) {
        this.base.addEventListener('pointerdown', (e) => {
            if (this.pointerId !== null) return;
            if (onStart) onStart();
            this.pointerId = e.pointerId;
            this._active = true;
            this.base.setPointerCapture(this.pointerId);

            const rect = this.base.getBoundingClientRect();
            this.centerX = rect.left + rect.width / 2;
            this.centerY = rect.top + rect.height / 2;
            this.baseRadius = rect.width / 2;

            this.handleMove(e.clientX, e.clientY);
        });

        this.base.addEventListener('pointermove', (e) => {
            if (this.pointerId !== e.pointerId) return;
            this.handleMove(e.clientX, e.clientY);
        });

        const endMove = (e: PointerEvent) => {
            if (this.pointerId !== e.pointerId) return;
            this.pointerId = null;
            this._active = false;
            this._axisX = 0;
            this._axisY = 0;
            this.updateKnobPosition(0, 0);
        };

        this.base.addEventListener('pointerup', endMove);
        this.base.addEventListener('pointercancel', endMove);
    }

    private handleMove(clientX: number, clientY: number) {
        let dx = clientX - this.centerX;
        let dy = clientY - this.centerY;

        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = this.baseRadius;

        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }

        this._axisX = dx / maxDist;
        this._axisY = dy / maxDist;

        this.updateKnobPosition(dx, dy);
    }

    private updateKnobPosition(dx: number, dy: number) {
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }

    public get axisX(): number { return this._axisX; }
    public get axisY(): number { return this._axisY; }
    public get active(): boolean { return this._active; }
}
