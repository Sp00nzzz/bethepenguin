import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { AudioManager } from './AudioManager';

export class Penguin {
    public mesh: THREE.Group;
    public position: THREE.Vector3;

    private body: THREE.Object3D | null = null;
    // Parts can be re-enabled if found in model
    // private wingL: THREE.Object3D | null = null;
    // private wingR: THREE.Object3D | null = null;
    // ...

    private walkTime: number = 0;
    private waddleSpeed: number = 8.0;
    private moveSpeed: number = 2.0;

    private scene: THREE.Scene;
    private footprints: THREE.Mesh[] = [];
    private lastStepTime: number = 0;
    private isLeftStep: boolean = true;

    private footprintTexture: THREE.Texture | null = null;
    private footprintNormal: THREE.Texture | null = null;
    private footprintGeometry: THREE.PlaneGeometry;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        this.position = this.mesh.position;

        // Shared Geometry for footprints (High Res for displacement if needed, or just normal mapping)
        this.footprintGeometry = new THREE.PlaneGeometry(0.3, 0.4, 32, 32);

        // Load FBX Model
        const loader = new FBXLoader();
        loader.load('PenguinBaseMesh.fbx', (fbx: THREE.Group) => {
            fbx.scale.set(0.01, 0.01, 0.01); // Adjust scale as needed (often FBX is 100x)
            fbx.traverse((child: THREE.Object3D) => {
                if ((child as THREE.Mesh).isMesh) {
                    const m = child as THREE.Mesh;
                    m.castShadow = true;
                    m.receiveShadow = true;
                    // Load texture if not already there, or ensure we apply the one we have
                }
            });

            // Load and apply texture explicitly
            const textureLoader = new THREE.TextureLoader();
            const texture = textureLoader.load('Penguin Diffuse Color.png');
            texture.colorSpace = THREE.SRGBColorSpace;

            fbx.traverse((child: THREE.Object3D) => {
                if ((child as THREE.Mesh).isMesh) {
                    const m = child as THREE.Mesh;
                    m.material = new THREE.MeshStandardMaterial({
                        map: texture,
                        roughness: 0.6,
                    });
                }
            });

            // Center the model?
            // Usually models pivot is at feet (0,0,0). 
            // Our procedural penguin had body centered higher. 
            // We'll just add it to the group.
            this.mesh.add(fbx);
            this.body = fbx;

            // Attempt to find parts by name if possible (optional, based on model hierarchy)
            // this.wingL = fbx.getObjectByName('Wing_L') || null;
            // ...
        }, undefined, (error: unknown) => {
            console.error('An error happened loading the penguin model:', error);
        });

        this.loadFootprintTexture(); // Call the new method to load and process footprint textures

        scene.add(this.mesh);
    }

    private loadFootprintTexture() {
        const loader = new THREE.ImageLoader();
        loader.load('footprint.png', (image) => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(image, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // create RGBA texture
                // Src: White=BG/Traversable, Black=Hole.
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i]; // Source Height (0-255)

                    // Alpha Logic
                    // We want faint white pixels (BG) to be transparent.
                    // Let's use a soft threshold.
                    // If R > 245 => 0 opacity.
                    // If R < 245 => 1.0 opacity? Or fade?
                    // Let's use smoothstep style.
                    let alpha = 255;
                    if (r > 200) {
                        // Fade out from 200 to 255
                        alpha = Math.max(0, (255 - r) * (255 / 55));
                    }

                    // Color Logic
                    // We want the hole to be dark (Shadow).
                    // We want the rim (around 200) to be White (Snow).
                    // R=0 -> 100 (Deep Grey). R=200 -> 255 (White).
                    const colVal = 100 + (r / 200) * 155;
                    const finalCol = Math.min(255, colVal);

                    data[i] = finalCol;     // R
                    data[i + 1] = finalCol; // G
                    data[i + 2] = finalCol; // B
                    data[i + 3] = alpha;    // A
                }
                ctx.putImageData(imageData, 0, 0);

                this.footprintTexture = new THREE.CanvasTexture(canvas);
                this.footprintTexture.colorSpace = THREE.SRGBColorSpace;
            }
        });

        const texLoader = new THREE.TextureLoader();
        this.footprintNormal = texLoader.load('footprint_normal.png', (tex) => {
            tex.colorSpace = THREE.NoColorSpace;
        });
    }

    // Manage footprints fading
    private updateFootprints(dt: number) {
        for (let i = this.footprints.length - 1; i >= 0; i--) {
            const fp = this.footprints[i];
            const material = fp.material as THREE.MeshStandardMaterial;
            material.opacity -= dt * 0.02; // Slower fade (50s) to "persist over time"
            if (material.opacity <= 0) {
                this.scene.remove(fp);
                this.footprints.splice(i, 1);
                // Dispose geometry/material if not shared? 
                // We share geometry, but material is unique per instance (cloned) to fade opacity?
                // Or we can use vertex colors for opacity if we assume material supports it, but standard material uses .opacity uniform.
                // Cloning material is okay for 50 items.
                material.dispose();
            }
        }
    }

    private getGroundHeight(x: number, z: number): number {
        // Must match Environment.ts formula!
        let h = 0;
        h += Math.sin(x * 0.05) * Math.cos(z * 0.04) * 0.4;
        h += Math.sin(x * 0.02) * 0.2;

        const windDir = new THREE.Vector2(1.0, 0.5).normalize();
        const windCoord = x * windDir.x + z * windDir.y;
        const perpCoord = x * -windDir.y + z * windDir.x;

        h += Math.sin(windCoord * 0.5) * Math.sin(perpCoord * 5.0) * 0.05;
        h += Math.sin(windCoord * 0.2) * 0.1;

        return h;
    }

    private spawnFootprint(position: THREE.Vector3, isLeft: boolean) {
        if (!this.footprintTexture || !this.footprintNormal) return;

        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff, // White, let texture define color
            map: this.footprintTexture,
            transparent: true,
            opacity: 1.0,

            normalMap: this.footprintNormal,
            normalScale: new THREE.Vector2(2, 2),

            roughness: 1.0,
            metalness: 0.0,

            depthWrite: false, // Important for decals
            polygonOffset: true,
            polygonOffsetFactor: -4, // Ensure it sits on top
        });

        // Orientation
        const fp = new THREE.Mesh(this.footprintGeometry, mat);
        fp.rotation.x = -Math.PI / 2;

        // Calculate ground height at this position
        const groundHeight = this.getGroundHeight(position.x, position.z);

        fp.position.copy(position);
        fp.position.y = groundHeight + 0.03; // Sit on top of the wave

        fp.rotation.z = isLeft ? 0.2 : -0.2;
        fp.rotation.z += Math.PI;

        this.scene.add(fp);
        this.footprints.push(fp);

        if (this.footprints.length > 200) { // Limit to 200 for longer trail
            const old = this.footprints.shift();
            if (old) {
                this.scene.remove(old);
                (old.material as THREE.Material).dispose();
            }
        }
    }

    update(dt: number, moving: boolean, speedMultiplier: number = 1.0, audio?: AudioManager) {
        this.updateFootprints(dt);

        if (!this.body) return; // Not loaded yet

        if (!moving) {
            // Return to stance
            this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, 0, dt * 5);
            // Reset parts if we had them
            return;
        }

        const effectiveWaddleSpeed = this.waddleSpeed * speedMultiplier;
        const effectiveMoveSpeed = this.moveSpeed * speedMultiplier;

        this.walkTime += dt * effectiveWaddleSpeed;

        // Forward Movement
        this.mesh.position.z += effectiveMoveSpeed * dt;

        // Waddle 
        const waddle = Math.sin(this.walkTime);
        this.mesh.rotation.z = waddle * 0.1; // Waddle whole body
        this.mesh.rotation.y = waddle * 0.05; // Slight yaw

        // Bobbing (whole object)
        const bob = Math.abs(Math.cos(this.walkTime));
        // Base Y is 0. If model pivot is at feet, we don't need to offset much, 
        // but maybe we want a hop.
        this.mesh.position.y = bob * 0.05;

        // Footprint triggering logic (same as before)
        if (this.walkTime - this.lastStepTime > Math.PI) {
            this.lastStepTime = this.walkTime;
            if (audio) {
                audio.playStep();
            }

            // Spawn footprints at roughly the penguin's current position + offset for foot
            const footPos = this.position.clone();
            footPos.x += this.isLeftStep ? -0.2 : 0.2;
            this.spawnFootprint(footPos, this.isLeftStep);

            // Flip step for next time
            this.isLeftStep = !this.isLeftStep;
        }
    }
}
