import * as THREE from 'three';

export const PenguinState = {
    IDLE: 0,
    WALKING: 1,
    TURNING: 2,
    LOOKING: 3,
} as const;

export type PenguinState = typeof PenguinState[keyof typeof PenguinState];

export class ColonyPenguin {
    public mesh: THREE.Group;
    public position: THREE.Vector3;

    private state: PenguinState = PenguinState.IDLE;
    private timer: number = 0;
    private stateDuration: number = 0;

    private walkTime: number = 0;
    private waddleSpeed: number = 5.0 + Math.random() * 3.0;
    private moveSpeed: number = 0.5 + Math.random() * 0.5;

    private targetRotation: number = 0;
    private currentRotation: number = 0;

    private headTilt: number = 0;
    private headTiltTarget: number = 0;

    constructor(scene: THREE.Scene, model: THREE.Group, startPos: THREE.Vector3) {
        this.mesh = model.clone();
        this.position = this.mesh.position;
        this.position.copy(startPos);

        // Randomize initial rotation
        this.currentRotation = Math.random() * Math.PI * 2;
        this.targetRotation = this.currentRotation;
        this.mesh.rotation.y = this.currentRotation;

        // Randomize initial state
        this.pickNewState();

        scene.add(this.mesh);
    }

    private pickNewState() {
        const r = Math.random();
        if (r < 0.6) {
            this.state = PenguinState.IDLE;
            this.stateDuration = 2 + Math.random() * 4;
        } else if (r < 0.85) {
            this.state = PenguinState.WALKING;
            this.stateDuration = 1.5 + Math.random() * 3;
            // Pick a slightly different direction
            this.targetRotation = this.currentRotation + (Math.random() - 0.5) * 1.5;
        } else if (r < 0.95) {
            this.state = PenguinState.TURNING;
            this.stateDuration = 1 + Math.random() * 2;
            this.targetRotation = Math.random() * Math.PI * 2;
        } else {
            this.state = PenguinState.LOOKING;
            this.stateDuration = 2 + Math.random() * 2;
            this.headTiltTarget = (Math.random() - 0.5) * 0.5;
        }
        this.timer = 0;
    }

    public update(dt: number, colonyCenter: THREE.Vector3, otherPenguins: ColonyPenguin[]) {
        this.timer += dt;

        if (this.timer >= this.stateDuration) {
            this.pickNewState();
        }

        // Apply behaviors based on state
        switch (this.state) {
            case PenguinState.IDLE:
                this.updateIdle(dt);
                break;
            case PenguinState.WALKING:
                this.updateWalking(dt, colonyCenter, otherPenguins);
                break;
            case PenguinState.TURNING:
                this.updateTurning(dt);
                break;
            case PenguinState.LOOKING:
                this.updateLooking(dt);
                break;
        }

        // Always keep them near ground
        this.mesh.position.y = Math.sin(this.mesh.position.x * 0.1) * Math.cos(this.mesh.position.z * 0.1) * 0.5;
    }

    private updateIdle(dt: number) {
        // Subtle breathing or small sway
        this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, Math.sin(Date.now() * 0.001) * 0.02, dt * 2);
    }

    private updateWalking(dt: number, colonyCenter: THREE.Vector3, otherPenguins: ColonyPenguin[]) {
        this.walkTime += dt * this.waddleSpeed;

        // Smooth rotation towards target
        this.currentRotation = THREE.MathUtils.lerp(this.currentRotation, this.targetRotation, dt * 2);
        this.mesh.rotation.y = this.currentRotation;

        // Move forward
        const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.currentRotation);

        // Collision avoidance & Colony cohesion
        const avoidance = new THREE.Vector3();
        for (const other of otherPenguins) {
            if (other === this) continue;
            const dist = this.position.distanceTo(other.position);
            if (dist < 1.0) {
                const diff = this.position.clone().sub(other.position).normalize();
                avoidance.add(diff.multiplyScalar(0.5 / (dist + 0.1)));
            }
        }

        // Keep within certain distance of colony center
        const toCenter = colonyCenter.clone().sub(this.position);
        if (toCenter.length() > 5) {
            avoidance.add(toCenter.normalize().multiplyScalar(0.1));
        }

        forward.add(avoidance).normalize();
        this.position.add(forward.multiplyScalar(this.moveSpeed * dt));

        // Waddle animation
        const waddle = Math.sin(this.walkTime);
        this.mesh.rotation.z = waddle * 0.08;
        this.mesh.position.y += Math.abs(Math.cos(this.walkTime)) * 0.03;
    }

    private updateTurning(dt: number) {
        this.currentRotation = THREE.MathUtils.lerp(this.currentRotation, this.targetRotation, dt * 3);
        this.mesh.rotation.y = this.currentRotation;

        // Slight waddle even when turning if it's a big turn?
        this.mesh.rotation.z = Math.sin(Date.now() * 0.01) * 0.03;
    }

    private updateLooking(dt: number) {
        // Head tilt/look around (this depends on the model having a head bone, but since we just have the mesh, we tilt the whole body slightly)
        this.headTilt = THREE.MathUtils.lerp(this.headTilt, this.headTiltTarget, dt * 2);
        this.mesh.rotation.x = this.headTilt;
    }

    public setOpacity(opacity: number) {
        this.mesh.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (mesh.material) {
                    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    materials.forEach((m: THREE.Material) => {
                        m.transparent = true;
                        (m as THREE.MeshStandardMaterial).opacity = opacity;
                    });
                }
            }
        });

        // Hide if invisible
        this.mesh.visible = opacity > 0.01;
    }
}
