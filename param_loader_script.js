import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';
import { generateTreeMatrices } from './tree_generator.js';

let scene, camera, renderer, controls;
let generatedBranchMesh, generatedLeafMesh;
let currentConfig = null; // Store the loaded config

// Base geometries
const baseLeafGeometry = new THREE.PlaneGeometry(1, 1);

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6495ED);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(15, 15, 25);
    camera.lookAt(0, 5, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('container').appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xcccccc, 1.0);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(30, 40, 20);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Ground Plane
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x6B8E23, side: THREE.DoubleSide, roughness: 1.0 });
    const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = 0;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 5, 0);
    controls.update();

    // File Input Listener
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', handleFileLoad, false);

    // Regenerate Button Listener
    const regenerateButton = document.getElementById('regenerateButton');
    regenerateButton.addEventListener('click', () => {
        if (currentConfig) {
            displayGeneratedTree(currentConfig);
        }
    });

    // Handle Window Resize
    window.addEventListener('resize', onWindowResize, false);

    // Start Animation Loop
    animate();
}

function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loadedConfig = JSON.parse(e.target.result);
            console.log("Loaded Tree Params:", loadedConfig);

            // Basic validation (can be more robust)
            if (loadedConfig && typeof loadedConfig === 'object') {
                currentConfig = loadedConfig; // Store the loaded config
                displayGeneratedTree(currentConfig);
                document.getElementById('regenerateButton').disabled = false; // Enable regenerate button
            } else {
                alert("Invalid tree parameters format in JSON file.");
                console.error("Invalid params format:", loadedConfig);
                currentConfig = null;
                document.getElementById('regenerateButton').disabled = true;
            }
        } catch (error) {
            alert("Failed to parse JSON file.");
            console.error("JSON Parsing Error:", error);
            currentConfig = null;
            document.getElementById('regenerateButton').disabled = true;
        }
    };
    reader.onerror = function(e) {
        alert("Failed to read file.");
        console.error("File Reading Error:", e);
        currentConfig = null;
        document.getElementById('regenerateButton').disabled = true;
    };
    reader.readAsText(file);

    event.target.value = null; // Reset file input
}

/**
 * Generates and displays the tree based on the loaded configuration.
 * @param {object} config - The loaded tree generation parameters.
 */
function displayGeneratedTree(config) {
    console.log("Generating tree with config:", config);

    // --- Generate Matrices using the module ---
    const { branchMatrices, leafMatrices } = generateTreeMatrices(config);

    const branchCount = branchMatrices.length;
    const leafCount = leafMatrices.length;

    // --- Clear existing meshes ---
    if (generatedBranchMesh) {
        scene.remove(generatedBranchMesh);
        if (generatedBranchMesh.geometry) generatedBranchMesh.geometry.dispose();
        if (generatedBranchMesh.material) generatedBranchMesh.material.dispose();
        generatedBranchMesh = null;
    }
    if (generatedLeafMesh) {
        scene.remove(generatedLeafMesh);
        if (generatedLeafMesh.material) generatedLeafMesh.material.dispose();
        generatedLeafMesh = null;
    }

    if (branchCount === 0) {
        console.warn("Generation resulted in no branches.");
        return; // Nothing to display
    }

    // --- Create Materials (Use defaults or get from config if saved) ---
    const branchColor = config.branchColor ? ("#" + config.branchColor) : 0x5C4033;
    const leafColor = config.leafColor ? ("#" + config.leafColor) : 0x228B22;
    const taperFactor = config.taperFactor ?? 0.68;

    const branchMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(branchColor),
        roughness: 0.8,
        metalness: 0.1
    });
    const leafMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(leafColor),
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.0
    });

    // --- Create Base Branch Geometry (Tapered) ---
    const baseTopRadius = 0.5 * taperFactor;
    const baseBottomRadius = 0.5;
    const baseBranchGeometry = new THREE.CylinderGeometry(baseTopRadius, baseBottomRadius, 1, 8);

    // --- Create Branch InstancedMesh ---
    generatedBranchMesh = new THREE.InstancedMesh(baseBranchGeometry, branchMaterial, branchCount);
    generatedBranchMesh.castShadow = true;
    generatedBranchMesh.receiveShadow = false;

    for (let i = 0; i < branchCount; i++) {
        generatedBranchMesh.setMatrixAt(i, branchMatrices[i]); // Directly use the generated Matrix4
    }
    generatedBranchMesh.instanceMatrix.needsUpdate = true;
    scene.add(generatedBranchMesh);

    // --- Create Leaf InstancedMesh (if matrices exist) ---
    if (leafCount > 0) {
        generatedLeafMesh = new THREE.InstancedMesh(baseLeafGeometry, leafMaterial, leafCount);
        generatedLeafMesh.castShadow = true;
        generatedLeafMesh.receiveShadow = true;

        for (let i = 0; i < leafCount; i++) {
            generatedLeafMesh.setMatrixAt(i, leafMatrices[i]); // Directly use the generated Matrix4
        }
        generatedLeafMesh.instanceMatrix.needsUpdate = true;
        scene.add(generatedLeafMesh);
    }

    // Adjust camera focus
    const initialLength = config.initialLength ?? 10;
    controls.target.set(0, initialLength / 2.5, 0);
    controls.update();
    console.log("Tree generated and displayed.");
}

// --- Window Resize Handler ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// --- Start ---
init(); 