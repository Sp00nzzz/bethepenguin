import './style.css'
import * as THREE from 'three'
import { Environment } from './Environment'
import { Penguin } from './Penguin'
import { AudioManager } from './AudioManager'
import { ColonyManager } from './ColonyManager'
import { SubtitleOverlay } from './SubtitleOverlay'

// --- Configuration ---
const CONFIG = {
  fogColor: 0xcce0ff, // Slightly bluer
  skyBottomColor: 0xddeeff,
  skyTopColor: 0x7799bb,
}

class App {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private clock: THREE.Clock

  private environment: Environment
  private penguin: Penguin
  private audioManager: AudioManager
  private colony: ColonyManager
  private subtitleOverlay: SubtitleOverlay

  private input = { forward: false }
  private hasInteracted = false
  private walkingTimer = 0

  // Cinematic State
  private isCinematicMode = false
  private cinematicTimer = 0
  private cinematicPhaseTimer = 0
  private currentCinematicOffset = new THREE.Vector3(0, 2, -5)
  private readonly DEFAULT_OFFSET = new THREE.Vector3(0, 2, -5)

  constructor(container: HTMLElement) {
    this.clock = new THREE.Clock()
    this.audioManager = new AudioManager()
    this.subtitleOverlay = new SubtitleOverlay()

    // Setup Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.9
    container.appendChild(this.renderer.domElement)

    // Setup Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(CONFIG.fogColor)
    this.scene.fog = new THREE.FogExp2(CONFIG.fogColor, 0.0004) // Very light fog for massive distance

    // Setup Camera
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 10000)
    this.camera.position.set(0, 2, -4)

    // Components
    this.penguin = new Penguin(this.scene)
    this.environment = new Environment(this.scene)
    this.colony = new ColonyManager(this.scene)

    // Event Listeners
    window.addEventListener('resize', this.onResize.bind(this))
    window.addEventListener('keydown', this.onKeyDown.bind(this))
    window.addEventListener('keyup', this.onKeyUp.bind(this))

    window.addEventListener('touchstart', this.onTouchStart.bind(this))
    window.addEventListener('touchend', this.onTouchEnd.bind(this))
    window.addEventListener('mousedown', this.handleInteraction.bind(this))

    // Toggle Fullscreen on Double Click
    window.addEventListener('dblclick', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
      } else {
        document.exitFullscreen().catch(() => { });
      }
    });

    // Start Loop
    this.animate()
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  private handleInteraction() {
    if (!this.hasInteracted) {
      this.hasInteracted = true;
      this.audioManager.resume();

      const overlay = document.getElementById('overlay');
      if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => {
          overlay.style.display = 'none';
        }, 500); // Match CSS transition
      }
    }
  }

  private triggerCinematic() {
    if (this.isCinematicMode) return;
    this.isCinematicMode = true;
    this.cinematicTimer = 10; // Total 10 seconds of cinematic
    this.cinematicPhaseTimer = 0;
    document.body.classList.add('cinematic-active');
    this.pickRandomCinematicOffset();
  }

  private pickRandomCinematicOffset() {
    const presets = [
      new THREE.Vector3(4, 1.5, 4),   // Front side
      new THREE.Vector3(-4, 2, 2),   // Another side
      new THREE.Vector3(0, 0.5, 6),  // Low front
      new THREE.Vector3(0, 8, -10),  // High bird eye
      new THREE.Vector3(-6, 1, -2),  // Far side
      new THREE.Vector3(3, 4, -6),   // High rear angle
      new THREE.Vector3(8, 2, 0),    // Wide side
    ];
    this.currentCinematicOffset.copy(presets[Math.floor(Math.random() * presets.length)]);
  }

  private onKeyDown(e: KeyboardEvent) {
    this.handleInteraction();
    if (e.code === 'KeyW' || e.code === 'ArrowUp') {
      this.input.forward = true
    }
    if (e.code === 'KeyC') {
      this.triggerCinematic();
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') {
      this.input.forward = false
    }
  }

  private onTouchStart() {
    this.handleInteraction();
    this.input.forward = true;
  }

  private onTouchEnd() {
    this.input.forward = false;
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this))

    const dt = this.clock.getDelta()
    const time = this.clock.getElapsedTime()

    // Update Game State
    this.penguin.update(dt, this.input.forward, this.audioManager)
    this.environment.update(dt, this.penguin.position, time)
    this.audioManager.update(dt, this.input.forward)
    this.subtitleOverlay.update(this.audioManager.getNarrationTime())
    this.colony.update(dt, this.penguin.position)

    // Auto Cinematic Trigger
    if (this.input.forward) {
      this.walkingTimer += dt;
      if (this.walkingTimer > 25) { // Every 25s of walking
        this.walkingTimer = 0;
        this.triggerCinematic();
      }
    } else {
      this.walkingTimer = Math.max(0, this.walkingTimer - dt * 2); // Cool down faster if stopped
    }

    // Cinematic Logic
    let targetOffset = this.DEFAULT_OFFSET;

    if (this.isCinematicMode) {
      this.cinematicTimer -= dt;
      this.cinematicPhaseTimer += dt;

      if (this.cinematicPhaseTimer > 2.5) { // Switch angle every 2.5s
        this.cinematicPhaseTimer = 0;
        this.pickRandomCinematicOffset();
      }

      if (this.cinematicTimer <= 0) {
        this.isCinematicMode = false;
        document.body.classList.remove('cinematic-active');
      } else {
        targetOffset = this.currentCinematicOffset;
      }
    }

    // Camera Follow
    const targetCamPos = this.penguin.position.clone().add(targetOffset);

    // Smooth damp - faster lerp for cinematic cuts? 
    // Or slower for sweeping? Let's use 3.0 for cinematic, 2.0 for default.
    const lerpSpeed = this.isCinematicMode ? 3.0 : 2.0;
    this.camera.position.lerp(targetCamPos, lerpSpeed * dt);

    // Look at penguin (with slight vertical offset)
    const lookTarget = this.penguin.position.clone().add(new THREE.Vector3(0, 0.5, 0));

    // In normal mode, we look slightly ahead
    if (!this.isCinematicMode) {
      lookTarget.add(new THREE.Vector3(0, 1.0, 10));
    }

    this.camera.lookAt(lookTarget);

    // Update Distance Display
    const distanceText = document.getElementById('distance-text');
    if (distanceText) {
      const distance = Math.max(0, this.penguin.position.z);
      distanceText.innerText = Math.floor(distance).toLocaleString();
    }

    this.renderer.render(this.scene, this.camera)
  }
}

// Initialize
const appDiv = document.getElementById('app')
if (appDiv) {
  new App(appDiv)
}
