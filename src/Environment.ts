import * as THREE from 'three';



// We'll use StandardMaterial for the ground to interact with lights properly, 
// and maybe modify it strictly if needed, but standard is best for realism.

export class Environment {
    private scene: THREE.Scene;
    private ground: THREE.Mesh;
    private farGround: THREE.Mesh;
    private mountain: THREE.Group;
    private snowSystem: THREE.Points;
    private skyLight: THREE.HemisphereLight;
    private sunLight: THREE.DirectionalLight;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        // LIGHTING
        // Cold, soft ambient light
        this.skyLight = new THREE.HemisphereLight(0xddeeff, 0x222222, 1.2);
        this.scene.add(this.skyLight);

        // Sun (low angle, creates long shadows)
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
        this.sunLight.position.set(100, 20, 100); // Lowered Y for grazing angle
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 4096; // Increased resolution
        this.sunLight.shadow.mapSize.height = 4096;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 1000;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        this.sunLight.shadow.bias = -0.0001;
        this.scene.add(this.sunLight);

        // GROUND
        // A huge plane that we will move with the player to simulate infinite world
        const geometry = new THREE.PlaneGeometry(240, 240, 512, 512); // Higher resolution for micro-detail

        // Material with custom shader for realism
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.8,
            metalness: 0.1,
        });

        // Inject custom shader logic
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            shader.uniforms.uWindDir = { value: new THREE.Vector2(1.0, 0.5).normalize() };

            shader.vertexShader = `
                varying vec2 vUv;
                varying vec3 vWorldPosition;
                ${shader.vertexShader}
            `.replace(
                `#include <begin_vertex>`,
                `
                vUv = uv;
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                
                // Procedural height for sastrugi and undulations
                float h = 0.0;
                
                // Large undulations
                h += sin(vWorldPosition.x * 0.05) * cos(vWorldPosition.z * 0.04) * 0.4;
                h += sin(vWorldPosition.x * 0.02) * 0.2;
                
                // Sastrugi (wind-carved ridges)
                // Stretched noise along wind direction
                vec2 windDir = vec2(1.0, 0.5);
                float windCoord = dot(vWorldPosition.xz, windDir);
                float perpCoord = dot(vWorldPosition.xz, vec2(-windDir.y, windDir.x));
                
                h += sin(windCoord * 0.5) * sin(perpCoord * 5.0) * 0.05;
                h += sin(windCoord * 0.2) * 0.1;
                
                vec3 transformed = vec3(position.x, position.y, position.z + h);
                `
            );

            shader.fragmentShader = `
                uniform float uTime;
                varying vec2 vUv;
                varying vec3 vWorldPosition;
                
                // Pseudo-noise for micro-detail
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(12.71, 311.7))) * 43758.5453123);
                }
                
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
                }

                ${shader.fragmentShader}
            `.replace(
                `#include <color_fragment>`,
                `
                #include <color_fragment>
                
                // Base colors: soft blue, gray, and white
                vec3 snowColor = vec3(0.96, 0.98, 1.0);
                vec3 iceColor = vec3(0.75, 0.88, 0.98);
                
                // Blend based on noise and slopes
                float n = noise(vWorldPosition.xz * 0.4);
                float iceMask = smoothstep(0.4, 0.7, n);
                
                vec3 baseSnow = mix(snowColor, iceColor, iceMask * 0.3);
                
                // Micro-detail for grazing angles
                float micro = noise(vWorldPosition.xz * 120.0);
                
                // Sparkle effect (glitter)
                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                float sparkle = pow(micro, 20.0) * 0.8;
                sparkle *= pow(max(0.0, dot(vNormal, viewDir)), 2.0);
                
                // Subsurface scattering simulation
                float sss = pow(1.0 - max(0.0, dot(vNormal, vec3(0, 1, 0))), 2.0) * 0.2;
                vec3 sssColor = vec3(0.5, 0.7, 1.0);
                
                baseSnow = mix(baseSnow, sssColor, sss * iceMask);
                baseSnow += sparkle * vec3(0.9, 0.95, 1.0);
                
                diffuseColor.rgb = baseSnow;
                `
            );

            // Capture uniforms to update them later if needed
            material.userData.shader = shader;
        };

        this.ground = new THREE.Mesh(geometry, material);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        // Update ground texture mapping to avoid tiling
        // Actually we are using world positions in shader, so no tiling issues.

        // FAR GROUND (Fills the horizon to the mountain)
        const farGeom = new THREE.PlaneGeometry(30000, 30000, 32, 32);
        const farMat = new THREE.MeshStandardMaterial({
            color: 0xe0f0ff,
            roughness: 1.0,
            metalness: 0.0,
        });
        this.farGround = new THREE.Mesh(farGeom, farMat);
        this.farGround.rotation.x = -Math.PI / 2;
        this.farGround.position.y = -0.5; // Slightly below mainly ground to avoid z-fighting
        this.farGround.receiveShadow = true;
        this.scene.add(this.farGround);

        // MOUNTAIN
        this.mountain = this.createMountain();
        this.scene.add(this.mountain);

        // SNOW PARTICLES
        this.snowSystem = this.createSnow();
        this.scene.add(this.snowSystem);

        // GROUND SKIM SNOW
        this.groundSnow = this.createGroundSnow();
        this.scene.add(this.groundSnow);
    }

    private groundSnow: THREE.Points;

    private createGroundSnow(): THREE.Points {
        const count = 2000;
        const geom = new THREE.BufferGeometry();
        const positions = [];
        for (let i = 0; i < count; i++) {
            positions.push((Math.random() - 0.5) * 200);
            positions.push(Math.random() * 0.5); // Very low to ground
            positions.push((Math.random() - 0.5) * 200);
        }
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.05,
            transparent: true,
            opacity: 0.4,
            fog: true
        });

        return new THREE.Points(geom, mat);
    }

    public getGroundHeight(x: number, z: number): number {
        // Updated to match shader exactly
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

    private smoothstep(min: number, max: number, value: number): number {
        var x = Math.max(0, Math.min(1, (value - min) / (max - min)));
        return x * x * (3 - 2 * x);
    }

    private createMountain(): THREE.Group {
        const group = new THREE.Group();

        // Create the central peak (original, unchanged)
        const centralPeak = this.createMountainMesh(0, 0, 1.0, 1.0, 0);
        group.add(centralPeak);

        // Left secondary peaks - harmonized with central peak's geological characteristics
        const leftPeak1 = this.createMountainMesh(-2800, 300, 0.85, 0.90, 100);
        group.add(leftPeak1);
        const leftPeak2 = this.createMountainMesh(-5000, 500, 0.75, 0.82, 200);
        group.add(leftPeak2);

        // Right secondary peaks - harmonized with central peak's geological characteristics
        const rightPeak1 = this.createMountainMesh(2800, 300, 0.88, 0.92, 300);
        group.add(rightPeak1);
        const rightPeak2 = this.createMountainMesh(5000, 500, 0.78, 0.85, 400);
        group.add(rightPeak2);

        // Intermediate peaks to fill gaps - positioned between main peaks
        // Between center and left peaks
        const leftMid1 = this.createMountainMesh(-1400, 400, 0.70, 0.85, 500);
        group.add(leftMid1);
        const leftMid2 = this.createMountainMesh(-3900, 450, 0.72, 0.80, 600);
        group.add(leftMid2);

        // Between center and right peaks
        const rightMid1 = this.createMountainMesh(1400, 400, 0.68, 0.83, 700);
        group.add(rightMid1);
        const rightMid2 = this.createMountainMesh(3900, 450, 0.73, 0.81, 800);
        group.add(rightMid2);

        // Outer edge peaks to extend the range
        const leftOuter = this.createMountainMesh(-6500, 600, 0.65, 0.75, 900);
        group.add(leftOuter);
        const rightOuter = this.createMountainMesh(6500, 600, 0.67, 0.77, 1000);
        group.add(rightOuter);



        return group;
    }

    /**
     * Creates a single mountain mesh with configurable position, scale, height, and noise seed.
     * @param offsetX - Horizontal offset from center
     * @param offsetZ - Depth offset (added to base Z=7500)
     * @param scale - Size multiplier (1.0 = original 4000x4000)
     * @param heightScale - Height multiplier (1.0 = original heights)
     * @param seed - Noise seed for variation
     */
    private createMountainMesh(offsetX: number, offsetZ: number, scale: number, heightScale: number, seed: number): THREE.Mesh {
        const baseSize = 10000 * scale;
        const segs = Math.floor(256 * Math.max(0.75, scale)); // Minimum 192 segments for realism
        const geom = new THREE.PlaneGeometry(baseSize, baseSize, segs, segs);
        const pos = geom.attributes.position;

        // Noise functions with seed offset
        const random = (x: number, z: number) => {
            const s = Math.sin((x + seed) * 12.9898 + (z + seed) * 78.233) * 43758.5453;
            return s - Math.floor(s);
        };
        const noise = (x: number, z: number) => {
            const i = Math.floor(x);
            const j = Math.floor(z);
            const u = x - i;
            const v = z - j;
            return (random(i, j) * (1 - u) + random(i + 1, j) * u) * (1 - v) +
                (random(i, j + 1) * (1 - u) + random(i + 1, j + 1) * u) * v;
        };
        const fbm = (x: number, z: number, octaves: number) => {
            let total = 0;
            let amp = 1;
            let freq = 1;
            for (let o = 0; o < octaves; o++) {
                total += noise(x * freq, z * freq) * amp;
                amp *= 0.5;
                freq *= 2;
            }
            return total;
        };

        // Deform vertices
        const radius = 4500 * scale;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const d = Math.sqrt(x * x + y * y);

            let mask = Math.max(0, 1 - Math.pow(d / radius, 1.5));
            mask = Math.pow(mask, 1.0);

            if (mask <= 0) {
                pos.setZ(i, -10);
                continue;
            }

            let h = 0;
            const n1 = fbm(x * 0.001, y * 0.001, 4);
            h += n1 * 1200 * mask * heightScale;
            const n2 = fbm(x * 0.005, y * 0.005, 6);
            h += n2 * 150 * mask * heightScale;
            const ridgeRaw = 1.0 - Math.abs(fbm(x * 0.0006 + 50, y * 0.0006 + 50, 2) * 2.0 - 1.0);
            const ridge = Math.max(0, ridgeRaw);
            h += Math.pow(ridge, 1.8) * 500 * mask * heightScale;

            pos.setZ(i, h);
        }

        geom.computeVertexNormals();

        // Material with vertex colors
        const mountainMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true
        });

        // Vertex Colors for Snow/Rock
        const count = geom.attributes.position.count;
        geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        const colors = geom.attributes.color;
        const p = geom.attributes.position;

        const rockColor = new THREE.Color(0x222222);
        const snowColor = new THREE.Color(0xf5fbff); // Matches ground's soft blue-white

        for (let i = 0; i < count; i++) {
            const x = p.getX(i);
            const y = p.getY(i);
            const z = p.getZ(i);
            // Deterministic noise for consistent snow/rock patterns across all peaks
            let noiseVal = (Math.sin((x + seed) * 0.1) * Math.cos((z + seed) * 0.1) + 1) * 0.5;
            let mixVal = this.smoothstep(50 * heightScale, 500 * heightScale, y + noiseVal * 250 * heightScale);
            const c = rockColor.clone().lerp(snowColor, mixVal);
            colors.setXYZ(i, c.r, c.g, c.b);
        }

        mountainMat.vertexColors = true;

        const mesh = new THREE.Mesh(geom, mountainMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(offsetX, -10, 7500 + offsetZ);

        return mesh;
    }

    private createSnow(): THREE.Points {
        const count = 5000;
        const geom = new THREE.BufferGeometry();
        const positions = [];
        for (let i = 0; i < count; i++) {
            positions.push((Math.random() - 0.5) * 100);
            positions.push((Math.random()) * 40);
            positions.push((Math.random() - 0.5) * 100);
        }
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.2,
            transparent: true,
            opacity: 0.8,
            fog: true
        });

        return new THREE.Points(geom, mat);
    }

    public update(dt: number, playerPos: THREE.Vector3, time: number) {
        // Update Ground Time
        const groundMat = this.ground.material as THREE.MeshStandardMaterial;
        if (groundMat.userData.shader) {
            groundMat.userData.shader.uniforms.uTime.value = time;
        }

        // Move ground to keep player in center roughly (infinite terrain illusion)
        this.ground.position.x = playerPos.x;
        this.ground.position.z = playerPos.z;
        this.farGround.position.x = playerPos.x;
        this.farGround.position.z = playerPos.z;

        // Particles: Wrap around
        const snowPos = this.snowSystem.geometry.attributes.position;
        for (let i = 0; i < snowPos.count; i++) {
            let y = snowPos.getY(i);
            y -= dt * 2.0; // fall speed
            if (y < 0) {
                y = 40;
            }
            snowPos.setY(i, y);
        }
        snowPos.needsUpdate = true;
        this.snowSystem.position.set(playerPos.x, 0, playerPos.z);

        // Ground Skim Particles
        const skimPos = this.groundSnow.geometry.attributes.position;
        for (let i = 0; i < skimPos.count; i++) {
            let x = skimPos.getX(i);
            let z = skimPos.getZ(i);

            // Move with wind
            x += dt * 5.0; // Wind speed
            z += dt * 2.5;

            if (Math.abs(x) > 100) x = (Math.random() - 0.5) * 200;
            if (Math.abs(z) > 100) z = (Math.random() - 0.5) * 200;

            skimPos.setXY(i, x, z);
        }
        skimPos.needsUpdate = true;
        this.groundSnow.position.set(playerPos.x, 0.1, playerPos.z);

        // Wind effect on particles (drift)
        this.snowSystem.rotation.y = Math.sin(time * 0.1) * 0.1;
    }
}
