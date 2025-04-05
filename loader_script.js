import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';

let scene, camera, renderer, controls;
let loadedBranchMesh, loadedLeafMesh;

// Base geometries (will be recreated based on loaded data)
const baseLeafGeometry = new THREE.PlaneGeometry(1, 1);

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6495ED); // Match editor background

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(15, 15, 25);
    camera.lookAt(0, 5, 0); // Adjust lookAt based on typical tree height

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

    // Ground Plane (Optional but good for context)
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
    controls.target.set(0, 5, 0); // Set initial target
    controls.update();

    // File Input Listener
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', handleFileLoad, false);

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
            const treeData = JSON.parse(e.target.result);
            console.log("Loaded Tree Data:", treeData);
            // Basic validation
            if (treeData && treeData.config && treeData.branchMatrices && treeData.leafMatrices) {
                displayLoadedTree(treeData);
            } else {
                alert("Invalid tree data format in JSON file.");
                console.error("Invalid tree data format:", treeData);
            }
        } catch (error) {
            alert("Failed to parse JSON file.");
            console.error("JSON Parsing Error:", error);
        }
    };
    reader.onerror = function(e) {
        alert("Failed to read file.");
        console.error("File Reading Error:", e);
    };
    reader.readAsText(file);

    // Reset file input to allow reloading the same file
    event.target.value = null;
}

function displayLoadedTree(treeData) {
    // --- Clear existing meshes ---
    if (loadedBranchMesh) {
        scene.remove(loadedBranchMesh);
        if (loadedBranchMesh.geometry) loadedBranchMesh.geometry.dispose();
        if (loadedBranchMesh.material) loadedBranchMesh.material.dispose();
        loadedBranchMesh = null;
    }
    if (loadedLeafMesh) {
        scene.remove(loadedLeafMesh);
        // Leaf geometry/material are often shared, but dispose just in case
        // if (loadedLeafMesh.geometry) loadedLeafMesh.geometry.dispose(); // Base geo likely shared
        if (loadedLeafMesh.material) loadedLeafMesh.material.dispose();
        loadedLeafMesh = null;
    }

    // --- Get Parameters ---
    const config = treeData.config;
    const branchMatricesData = treeData.branchMatrices;
    const leafMatricesData = treeData.leafMatrices;
    const branchCount = branchMatricesData.length;
    const leafCount = leafMatricesData.length;

    if (branchCount === 0) {
        console.warn("No branch data found in loaded file.");
        return; // Nothing to display
    }

    // --- Create Materials ---
    const branchMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#" + config.branchColor), // Prepend # if needed
        roughness: 0.8, // Assume default from editor for now
        metalness: 0.1
    });
    const leafMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#" + config.leafColor),
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.0
    });

    // --- Create Base Branch Geometry (Tapered) ---
    const baseTopRadius = 0.5 * config.taperFactor;
    const baseBottomRadius = 0.5;
    const baseBranchGeometry = new THREE.CylinderGeometry(baseTopRadius, baseBottomRadius, 1, 8);

    // --- Create Branch InstancedMesh ---
    loadedBranchMesh = new THREE.InstancedMesh(baseBranchGeometry, branchMaterial, branchCount);
    loadedBranchMesh.castShadow = true;
    loadedBranchMesh.receiveShadow = false; // Match editor setting

    const tempMatrix = new THREE.Matrix4(); // Reuse for performance
    for (let i = 0; i < branchCount; i++) {
        tempMatrix.fromArray(branchMatricesData[i]);
        loadedBranchMesh.setMatrixAt(i, tempMatrix);
    }
    loadedBranchMesh.instanceMatrix.needsUpdate = true;
    scene.add(loadedBranchMesh);

    // --- Create Leaf InstancedMesh (if data exists) ---
    if (leafCount > 0) {
        loadedLeafMesh = new THREE.InstancedMesh(baseLeafGeometry, leafMaterial, leafCount);
        loadedLeafMesh.castShadow = true;
        loadedLeafMesh.receiveShadow = true;

        for (let i = 0; i < leafCount; i++) {
            tempMatrix.fromArray(leafMatricesData[i]);
            loadedLeafMesh.setMatrixAt(i, tempMatrix);
        }
        loadedLeafMesh.instanceMatrix.needsUpdate = true;
        scene.add(loadedLeafMesh);
    }

    // Adjust camera focus roughly based on potential tree height
    // This is a guess; the saved JSON doesn't store the initial length directly
    const estimatedTrunkHeight = 10; // Use a default guess
    controls.target.set(0, estimatedTrunkHeight / 2.5, 0);
    controls.update();
    console.log("Tree loaded and displayed.");
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