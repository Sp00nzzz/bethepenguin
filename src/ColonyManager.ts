import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ColonyPenguin } from './ColonyPenguin';

export class ColonyManager {
    private penguins: ColonyPenguin[] = [];
    private scene: THREE.Scene;
    private colonyCenter: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.loadAndSpawn();
    }

    private loadAndSpawn() {
        const loader = new FBXLoader();
        loader.load('PenguinBaseMesh.fbx', (fbx: THREE.Group) => {
            fbx.scale.set(0.01, 0.01, 0.01);

            // Shared Texture
            const textureLoader = new THREE.TextureLoader();
            const texture = textureLoader.load('Penguin Diffuse Color.png');
            texture.colorSpace = THREE.SRGBColorSpace;

            fbx.traverse((child: THREE.Object3D) => {
                if ((child as THREE.Mesh).isMesh) {
                    const m = child as THREE.Mesh;
                    m.castShadow = true;
                    m.receiveShadow = true;
                    m.material = new THREE.MeshStandardMaterial({
                        map: texture,
                        roughness: 0.6,
                        transparent: true,
                    });
                }
            });

            // Spawn 15-20 penguins
            const count = 15 + Math.floor(Math.random() * 10);
            for (let i = 0; i < count; i++) {
                // Random position in a circle
                const angle = Math.random() * Math.PI * 2;
                const radius = 2 + Math.random() * 4;
                const pos = new THREE.Vector3(
                    Math.cos(angle) * radius,
                    0,
                    Math.sin(angle) * radius
                );

                const penguin = new ColonyPenguin(this.scene, fbx, pos);
                this.penguins.push(penguin);
            }
        });
    }

    public update(dt: number, playerPos: THREE.Vector3) {
        this.penguins.forEach(p => p.update(dt, this.colonyCenter, this.penguins));

        // Handle fading
        // Colony is at (0,0,0). Fade based on distance from z=0.
        // As player moves forward (z increases), colony fades.
        const fadeStart = 5;
        const fadeEnd = 30;
        const dist = playerPos.length(); // Distance from origin

        const opacity = 1.0 - THREE.MathUtils.smoothstep(dist, fadeStart, fadeEnd);
        this.penguins.forEach(p => p.setOpacity(opacity));
    }
}
