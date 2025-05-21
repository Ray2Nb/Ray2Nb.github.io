import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Audio setup
const listener = new THREE.AudioListener();
camera.add(listener);

// Create humans array
const humans = [];

// Load both audio and texture before creating sprites
const audioLoader = new THREE.AudioLoader();
const textureLoader = new THREE.TextureLoader();

// Promise to load audio
const loadAudio = new Promise((resolve) => {
    audioLoader.load('bigger.MP3', (buffer) => {
        resolve(buffer);
    });
});

// Promise to load texture
const loadTexture = new Promise((resolve) => {
    textureLoader.load('rj.png', (texture) => {
        resolve(texture);
    });
});

// Wait for both audio and texture to load, then create sprites
Promise.all([loadAudio, loadTexture]).then(([audioBuffer, texture]) => {
    // Get the aspect ratio of the loaded texture
    const imageAspect = texture.image.width / texture.image.height;
    
    // Create humans as sprites
    for (let i = 0; i < 100; i++) {
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            depthTest: true,
            sizeAttenuation: true,
            alphaTest: 0.1
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Set sprite size maintaining aspect ratio
        const height = 10;  // Base height
        sprite.scale.set(height * imageAspect, height, 1);
        
        // Random position in a circle around the center
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 30;
        sprite.position.x = Math.cos(angle) * radius;
        sprite.position.z = Math.sin(angle) * radius;
        sprite.position.y = 2;
        
        // Create individual audio source for each RJ
        const sound = new THREE.Audio(listener);
        sound.setBuffer(audioBuffer);
        sound.setVolume(0.5);
        sound.setLoop(true);
        
        // Schedule audio start with delay
        setTimeout(() => {
            if (sound && !sound.isPlaying) {
                sound.play();
            }
        }, i * 300); // 0.3 seconds * index
        
        humans.push({
            model: sprite,
            velocity: new THREE.Vector3(),
            health: 100,
            sound: sound
        });
        scene.add(sprite);
    }
});

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// Ground
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Camera position
camera.position.set(0, 10, 20);
camera.lookAt(0, 0, 0);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Models
let gorilla;
const humanCount = document.getElementById('humanCount');

// Load gorilla model
const gltfLoader = new GLTFLoader();
gltfLoader.load('gorilla.glb', (gltf) => {
    gorilla = gltf.scene;
    
    // Calculate the bounding box to get model size
    const box = new THREE.Box3().setFromObject(gorilla);
    const size = box.getSize(new THREE.Vector3());
    console.log('Gorilla size:', size);
    
    // Adjust scale based on desired height
    const desiredHeight = 5;
    const scale = desiredHeight / size.y;
    gorilla.scale.setScalar(scale);
    
    gorilla.position.y = 1;
    scene.add(gorilla);
});

// Animation and game logic
const clock = new THREE.Clock();
let remainingHumans = 100;

function updateHumans() {
    const time = clock.getElapsedTime();
    
    humans.forEach((human, index) => {
        if (human.health <= 0) return;

        // Add floating motion
        const floatHeight = 2;
        const floatSpeed = 1.5;
        const floatAmplitude = 0.5;
        human.model.position.y = floatHeight + Math.sin(time * floatSpeed + index) * floatAmplitude;

        // Move away from gorilla
        if (gorilla) {
            const direction = human.model.position.clone().sub(gorilla.position).normalize();
            human.velocity.add(direction.multiplyScalar(0.01));
        }

        // Apply velocity (only to x and z)
        human.model.position.x += human.velocity.x;
        human.model.position.z += human.velocity.z;
        human.velocity.multiplyScalar(0.95);

        // Keep humans within bounds
        const maxRadius = 50;
        const distanceFromCenter = Math.sqrt(
            human.model.position.x * human.model.position.x +
            human.model.position.z * human.model.position.z
        );
        
        if (distanceFromCenter > maxRadius) {
            const angle = Math.atan2(human.model.position.z, human.model.position.x);
            human.model.position.x = Math.cos(angle) * maxRadius;
            human.model.position.z = Math.sin(angle) * maxRadius;
        }

        // Check collision with gorilla - instant defeat on touch
        if (gorilla) {
            const distance = human.model.position.distanceTo(gorilla.position);
            const collisionRadius = 4;
            
            if (distance < collisionRadius) {
                // Stop this RJ's audio
                if (human.sound && human.sound.isPlaying) {
                    human.sound.stop();
                }
                
                // Instant defeat
                scene.remove(human.model);
                human.health = 0;
                remainingHumans--;
                humanCount.textContent = remainingHumans;
            }
        }
    });
}

// Raycaster for mouse position
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let targetPosition = new THREE.Vector3();

// Mouse move handler
function onMouseMove(event) {
    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update the picking ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);

    // Calculate objects intersecting the picking ray
    const intersects = raycaster.intersectObject(ground);

    if (intersects.length > 0) {
        targetPosition.copy(intersects[0].point);
        targetPosition.y = 1; // Keep gorilla at ground level
    }
}

// Add mouse move listener
window.addEventListener('mousemove', onMouseMove);

function updateGorilla() {
    if (!gorilla) return;

    // Calculate direction to target
    const direction = targetPosition.clone().sub(gorilla.position);
    const distance = direction.length();
    
    // Only move if we're not too close to target
    if (distance > 0.1) {
        direction.normalize();
        const speed = 0.2;
        gorilla.position.add(direction.multiplyScalar(speed));
        
        // Make gorilla face movement direction
        gorilla.lookAt(targetPosition);
    }

    // Keep gorilla within bounds
    const maxRadius = 45;
    const distanceFromCenter = Math.sqrt(
        gorilla.position.x * gorilla.position.x +
        gorilla.position.z * gorilla.position.z
    );
    
    if (distanceFromCenter > maxRadius) {
        const angle = Math.atan2(gorilla.position.z, gorilla.position.x);
        gorilla.position.x = Math.cos(angle) * maxRadius;
        gorilla.position.z = Math.sin(angle) * maxRadius;
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    controls.update();
    
    updateGorilla();
    updateHumans();
    
    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}); 