import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';

let scene, camera, renderer, controls;
// let treeGroup; // A group to hold all parts of the tree for easy removal - Removed for InstancedMesh
let treeInstancedMesh; // Use InstancedMesh for performance
let branchMatrices = []; // Array to hold matrices for each instance
const baseBranchGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8); // Unit cylinder (radius 0.5, height 1), centered
let groundPlane;
let estimatedMaxInstances = 0; // Estimate for InstancedMesh allocation

// --- Leaf Variables ---
let leafInstancedMesh;
let leafMatrices = [];
const baseLeafGeometry = new THREE.PlaneGeometry(1, 1); // Unit plane
const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x228B22, // ForestGreen
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.3 // Leaves are typically not metallic
});

// --- Configuration Object ---
const config = {
    maxDepth: 5,
    initialLength: 10,
    initialRadius: 0.7, // Base radius of the main trunk
    lengthFactor: 0.7,
    branchAngle: 30, // degrees
    radiusFactor: 0.6,
    minRadius: 0.1,
    numBranches: 2,
    angleVariance: 10, // degrees
    lengthVariance: 10, // percentage
    taperFactor: 0.68, // Ratio of topRadius to bottomRadius for the base geometry
    branchMaterial: new THREE.MeshStandardMaterial({
        color: 0x5C4033, // DarkBrown (Darker than SaddleBrown)
        roughness: 0.8,
        metalness: 0.3,
        // side: THREE.DoubleSide // Optional: Might help if seeing inside thin branches
    }),
    // Add a reasonable upper limit for pre-allocation, adjust if needed
    maxInstanceEstimateFactor: 1.5,
    leafSize: 0.5, // Controls the scale of the leaf planes
};

// --- UI Elements ---
const sliders = {
    maxDepth: document.getElementById('maxDepth'),
    initialLength: document.getElementById('initialLength'),
    initialRadius: document.getElementById('initialRadius'),
    lengthFactor: document.getElementById('lengthFactor'),
    branchAngle: document.getElementById('branchAngle'),
    radiusFactor: document.getElementById('radiusFactor'),
    minRadius: document.getElementById('minRadius'),
    numBranches: document.getElementById('numBranches'),
    angleVariance: document.getElementById('angleVariance'),
    lengthVariance: document.getElementById('lengthVariance'),
    taperFactor: document.getElementById('taperFactor'),
    leafSize: document.getElementById('leafSize'),
};

const valueSpans = {
    maxDepth: document.getElementById('maxDepthValue'),
    initialLength: document.getElementById('initialLengthValue'),
    initialRadius: document.getElementById('initialRadiusValue'),
    lengthFactor: document.getElementById('lengthFactorValue'),
    branchAngle: document.getElementById('branchAngleValue'),
    radiusFactor: document.getElementById('radiusFactorValue'),
    minRadius: document.getElementById('minRadiusValue'),
    numBranches: document.getElementById('numBranchesValue'),
    angleVariance: document.getElementById('angleVarianceValue'),
    lengthVariance: document.getElementById('lengthVarianceValue'),
    taperFactor: document.getElementById('taperFactorValue'),
    leafSize: document.getElementById('leafSizeValue'),
};

// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x85D4FF); // CornflowerBlue (Darker Sky Blue)
    scene.fog = new THREE.Fog(0x85D4FF, 50, 150);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(15, 15, 25);
    camera.lookAt(0, config.initialLength / 2, 0); // Look towards the middle of the trunk

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('container').appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xcccccc, 1.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.6);
    directionalLight.position.set(30, 40, 20);
    directionalLight.castShadow = true;
    // Configure shadow properties for better quality
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    scene.add(directionalLight);
    // const helper = new THREE.CameraHelper( directionalLight.shadow.camera ); // Optional: visualize shadow camera
    // scene.add( helper );

    // Ground Plane
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x6B8E23, side: THREE.DoubleSide, roughness: 0.8 }); // OliveDrab (Darker Green)
    groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2; // Rotate flat
    groundPlane.position.y = 0;
    groundPlane.receiveShadow = true; // Allow ground to receive shadows
    scene.add(groundPlane);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooths rotation
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false; // Keep panning relative to ground plane
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't let camera go below ground
    controls.minDistance = 5;
    controls.maxDistance = 100;
    controls.target.set(0, config.initialLength / 2, 0); // Set initial target
    controls.update();

    // Setup UI Listeners
    setupUIListeners();

    // Initial Tree Generation
    generateTree();

    // Handle Window Resize
    window.addEventListener('resize', onWindowResize, false);

    // Start Animation Loop
    animate();
}

// --- Tree Generation Logic ---

/**
 * Calculates an estimated maximum number of instances needed.
 */
function estimateMaxInstances() {
    let count = 0;
    for (let i = 0; i <= config.maxDepth; i++) {
        count += Math.pow(config.numBranches, i);
    }
    // Add a buffer factor - Also used for leaves, might need adjustment
    estimatedMaxInstances = Math.ceil(count * config.maxInstanceEstimateFactor * 1.5); // Increase buffer slightly for leaves
    // console.log(`Estimated max instances: ${estimatedMaxInstances}`);
}

function generateTree() {
    // --- Cleanup Old Mesh ---
    if (treeInstancedMesh) {
        scene.remove(treeInstancedMesh);
        // If the geometry *might* change (like with taper), dispose of it.
        if (treeInstancedMesh.geometry) {
            treeInstancedMesh.geometry.dispose();
        }
        // Geometry and material are shared, no need to dispose per-generation
        // unless the base geometry/material changes.
    }
    // Cleanup old leaf mesh
    if (leafInstancedMesh) {
        scene.remove(leafInstancedMesh);
        // We don't dispose geometry/material as they are reused
        leafInstancedMesh = null; // Ensure the old reference is cleared
    }
    // Reset matrices array
    branchMatrices = [];
    leafMatrices = [];

    // --- Estimate Instance Count ---
    estimateMaxInstances(); // Recalculate based on current config

    // --- Create Base Geometry (potentially tapered) ---
    // Base radius remains 0.5 for consistent scaling calculation
    const baseTopRadius = 0.5 * config.taperFactor;
    const baseBottomRadius = 0.5;
    const currentBaseGeometry = new THREE.CylinderGeometry(baseTopRadius, baseBottomRadius, 1, 8);

    // --- Create or Reconfigure InstancedMesh ---
    // We create it once and resize if needed, or just create new each time
    // For simplicity now, let's recreate it. Can optimize later if needed.
    treeInstancedMesh = new THREE.InstancedMesh(
        currentBaseGeometry, // Use the newly created (possibly tapered) geometry
        config.branchMaterial,
        estimatedMaxInstances // Allocate estimated max size
    );
    treeInstancedMesh.castShadow = true;
    treeInstancedMesh.receiveShadow = false; // Branches generally don't receive shadows on themselves well

    // --- Collect Matrices ---
    const initialMatrix = new THREE.Matrix4(); // Identity matrix for the root

    // --- Create Leaf InstancedMesh (using shared geometry/material) ---
    // We create it here so it's ready to receive matrices
    leafInstancedMesh = new THREE.InstancedMesh(
        baseLeafGeometry,
        leafMaterial,
        estimatedMaxInstances // Use same estimate for now
    );
    leafInstancedMesh.castShadow = true; // Leaves can cast shadows
    leafInstancedMesh.receiveShadow = true;

    collectBranchData(branchMatrices, leafMatrices, 0, initialMatrix, config.initialLength, config.initialRadius);

    // --- Apply Matrices to InstancedMesh ---
    const actualInstanceCount = branchMatrices.length;
    if (actualInstanceCount > estimatedMaxInstances) {
        console.warn(`Actual instance count (${actualInstanceCount}) exceeded estimate (${estimatedMaxInstances}). Some branches might be missing. Consider increasing maxInstanceEstimateFactor.`);
    }
    treeInstancedMesh.count = Math.min(actualInstanceCount, estimatedMaxInstances); // Set the actual number of instances to draw

    for (let i = 0; i < treeInstancedMesh.count; i++) {
        treeInstancedMesh.setMatrixAt(i, branchMatrices[i]);
    }
    treeInstancedMesh.instanceMatrix.needsUpdate = true; // IMPORTANT: Tell Three.js to update the instance matrices

    scene.add(treeInstancedMesh);

    // --- Apply Leaf Matrices ---
    const actualLeafCount = leafMatrices.length;
    if (actualLeafCount > estimatedMaxInstances) {
        console.warn(`Actual leaf count (${actualLeafCount}) exceeded estimate (${estimatedMaxInstances}). Some leaves might be missing.`);
    }
    leafInstancedMesh.count = Math.min(actualLeafCount, estimatedMaxInstances);
    for (let i = 0; i < leafInstancedMesh.count; i++) {
        leafInstancedMesh.setMatrixAt(i, leafMatrices[i]);
    }
    leafInstancedMesh.instanceMatrix.needsUpdate = true;

    scene.add(leafInstancedMesh);

    // Update controls target after generating tree
    controls.target.set(0, config.initialLength / 2.5, 0);
    controls.update();
}

/**
 * Recursive function to collect transformation matrices for each branch.
 * @param {THREE.Matrix4[]} matricesArray - Array to store the final world matrices.
 * @param {THREE.Matrix4[]} leafMatricesArray - Array to store leaf matrices.
 * @param {number} level - The current recursion depth level.
 * @param {THREE.Matrix4} parentMatrix - The world transformation matrix ending at the base of this branch.
 * @param {number} length - The length of this branch segment.
 * @param {number} radius - The radius at the base of this branch segment.
 */
function collectBranchData(matricesArray, leafMatricesArray, level, parentMatrix, length, radius) {
    // --- Base Case: Stop recursion ---
    const isTerminal = level >= config.maxDepth || length <= 0.01 || radius < config.minRadius;
    const reachedLimit = matricesArray.length >= estimatedMaxInstances || leafMatricesArray.length >= estimatedMaxInstances - 1; // Check space for 2 leaves

    if (isTerminal || reachedLimit) {
        if (reachedLimit && !isTerminal) {
            // console.warn("Instance limit reached during recursion.");
        }

        // --- Add Leaves if it's a natural terminal branch (not just limit reached) ---
        if (isTerminal && level > 0) { // Don't add leaves to the base trunk segment (level 0)

            const canAddLeaves = leafMatricesArray.length < estimatedMaxInstances - 1;
            if (canAddLeaves) {
                const leafScale = config.leafSize;
                const scaleMatrix = new THREE.Matrix4().makeScale(leafScale, leafScale, leafScale);

                // --- Leaf at Base of this Terminal Segment ---
                const randomQuatBase = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI)
                );
                const rotationMatrixBase = new THREE.Matrix4().makeRotationFromQuaternion(randomQuatBase);
                const leafMatrixBase = new THREE.Matrix4()
                    .multiply(parentMatrix) // Position at the start of this segment
                    .multiply(rotationMatrixBase)
                    .multiply(scaleMatrix);
                leafMatricesArray.push(leafMatrixBase);

                // --- Leaf at Tip of this Terminal Segment ---
                const endPointTranslation = new THREE.Matrix4().makeTranslation(0, length, 0);
                const tipMatrix = new THREE.Matrix4().multiplyMatrices(parentMatrix, endPointTranslation);
                const randomQuatTip = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI)
                );
                const rotationMatrixTip = new THREE.Matrix4().makeRotationFromQuaternion(randomQuatTip);
                const leafMatrixTip = new THREE.Matrix4()
                    .multiply(tipMatrix) // Position at the end of this segment
                    .multiply(rotationMatrixTip)
                    .multiply(scaleMatrix);
                leafMatricesArray.push(leafMatrixTip);
            }
        }
        return; // Stop recursion
    }

    const actualRadius = Math.max(radius, config.minRadius);
    // Note: InstancedMesh uses one geometry, so tapering within a segment isn't directly possible via matrix alone
    // unless using non-uniform scale, which can affect lighting/normals.
    // We scale uniformly based on the 'base' radius (actualRadius).

    // --- 1. Calculate the Local Transformation for the current branch segment ---
    // Scale the unit cylinder (height 1, radius 0.5) and position its base at the origin (0,0,0) locally.
    const scaleMatrix = new THREE.Matrix4().makeScale(actualRadius * 2, length, actualRadius * 2);
    const translationMatrix = new THREE.Matrix4().makeTranslation(0, length / 2, 0); // Translate center of scaled cylinder to put base at origin

    const localMatrix = new THREE.Matrix4().multiplyMatrices(translationMatrix, scaleMatrix); // Scale then translate

    // --- 2. Calculate the World Matrix for this segment ---
    // Apply the local transformation relative to the parent's endpoint matrix.
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(parentMatrix, localMatrix);

    // --- 3. Store the World Matrix ---
    matricesArray.push(worldMatrix);
    const currentMatrixIndex = matricesArray.length - 1; // Keep track in case limit is reached

    // --- Calculate parameters for child branches ---
    const nextLevel = level + 1;
    const baseNextLength = length * config.lengthFactor;
    const baseNextRadius = actualRadius * config.radiusFactor;

    // --- Calculate starting matrix for children ---
    // This matrix represents the transformation to the *end* of the current branch segment.
    const childBaseMatrix = new THREE.Matrix4();
    const endPointTranslation = new THREE.Matrix4().makeTranslation(0, length, 0); // Translate along the local Y axis of the current segment
    childBaseMatrix.multiplyMatrices(parentMatrix, endPointTranslation); // Start from parent base, move to the tip

    // --- Create Child Branches ---
    const angleStep = config.numBranches > 1 ? 360 / config.numBranches : 0; // Use degrees for variance calc ease

    for (let i = 0; i < config.numBranches; i++) {
        if (matricesArray.length >= estimatedMaxInstances) break; // Check limit before recursion

        // Apply randomness/variance to parameters
        const lengthVarianceFactor = 1 + (Math.random() - 0.5) * 2 * (config.lengthVariance / 100);
        const angleVariance = (Math.random() - 0.5) * 2 * config.angleVariance; // degrees
        const spreadVariance = (Math.random() - 0.5) * (angleStep * 0.4); // degrees, variance up to 40% of step

        const nextLength = baseNextLength * lengthVarianceFactor;
        const nextRadius = baseNextRadius; // Radius variance could be added here

        // Calculate the final tilt angle for this specific branch (degrees)
        const branchAngleDeg = config.branchAngle + angleVariance;

        // Calculate the final spread angle for this specific branch (degrees)
        const baseSpreadAngleDeg = angleStep * i;
        const spreadAngleDeg = baseSpreadAngleDeg + spreadVariance;

        // --- Calculate Orientation Quaternion ---
        // Convert angles to radians for trig functions
        const branchAngleRad = THREE.MathUtils.degToRad(branchAngleDeg);
        const spreadAngleRad = THREE.MathUtils.degToRad(spreadAngleDeg);

        // Using spherical coordinates relative to the parent branch's direction (local Y)
        // Azimuthal (spread) rotation around Y, then Polar (branch) rotation away from Y
        const qSpread = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spreadAngleRad);
        const qBranch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), branchAngleRad); // Rotate around X after spread

        const orientationQuat = new THREE.Quaternion().multiplyQuaternions(qSpread, qBranch); // Apply spread then branch angle

        // --- Calculate the full matrix for the child's base ---
        const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(orientationQuat);
        const nextParentMatrix = new THREE.Matrix4().multiplyMatrices(childBaseMatrix, rotationMatrix);

        // Recursively call, passing the child's starting matrix as the new parent matrix
        collectBranchData(matricesArray, leafMatricesArray, nextLevel, nextParentMatrix, nextLength, nextRadius);
    }
}

/**
 * REMOVED - Old recursive function to create branches using individual meshes.
 * function createBranch(parentPivot, level, length, radius) { ... }
 */

// --- Save Functionality ---

/**
 * Saves the full tree data including matrices and essential config.
 */
function saveFullTreeData() {
    if (!branchMatrices || !leafMatrices) {
        console.error("Tree data not generated yet.");
        alert("Please generate a tree first!");
        return;
    }

    // Convert Matrix4 arrays to serializable array-of-arrays
    const serializableBranchMatrices = branchMatrices.slice(0, treeInstancedMesh.count).map(matrix => matrix.toArray());
    const serializableLeafMatrices = leafMatrices.slice(0, leafInstancedMesh.count).map(matrix => matrix.toArray());

    const treeData = {
        // Include parameters needed to reconstruct the appearance/structure
        config: {
            taperFactor: config.taperFactor,
            leafSize: config.leafSize,
            branchColor: config.branchMaterial.color.getHexString(), // Save color as hex
            leafColor: leafMaterial.color.getHexString(), // Save color as hex
            // Add other relevant config params if needed for the game loader
        },
        branchMatrices: serializableBranchMatrices,
        leafMatrices: serializableLeafMatrices,
    };

    try {
        const jsonString = JSON.stringify(treeData, null, 2); // Pretty print JSON
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'tree_data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url); // Clean up the object URL
        console.log("Tree data saved.");

    } catch (error) {
        console.error("Failed to save tree data:", error);
        alert("Failed to prepare tree data for saving.");
    }
}

/**
 * Saves only the configuration parameters suitable for external generation.
 */
function saveTreeParams() {
    // Create a copy of the config object to filter
    const paramsToSave = { ...config };

    // Remove non-parameter properties
    delete paramsToSave.branchMaterial;       // Material object is not needed
    delete paramsToSave.maxInstanceEstimateFactor; // Internal editor detail
    // Add any other properties to remove if they aren't pure generation parameters

    try {
        const jsonString = JSON.stringify(paramsToSave, null, 2); // Pretty print JSON
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'tree_params.json'; // Different filename
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url); // Clean up the object URL
        console.log("Tree parameters saved.");

    } catch (error) {
        console.error("Failed to save tree parameters:", error);
        alert("Failed to prepare tree parameters for saving.");
    }
}

// --- UI Update Logic ---
function setupUIListeners() {
    for (const key in sliders) {
        sliders[key].addEventListener('input', (event) => {
            const value = parseFloat(event.target.value);
            // Store the old taper factor if the current slider is the taper slider
            const isTaperSlider = key === 'taperFactor';
            const oldTaperFactor = isTaperSlider ? config.taperFactor : null;

            config[key] = value;
            let precision = 0;
            if (key === 'lengthFactor' || key === 'radiusFactor' || key === 'minRadius' || key === 'taperFactor' || key === 'leafSize'
                || key === 'initialRadius') precision = 2;
            else if (key === 'initialLength') precision = 1;
            valueSpans[key].textContent = value.toFixed(precision);

            // If the taper factor changed, the base geometry MUST be recreated.
            // Other changes only require updating matrices.
            // We call generateTree for all changes for simplicity, which handles geometry recreation.
            generateTree();
        });
        // Initialize display values
        let precision = 0;
        if (key === 'lengthFactor' || key === 'radiusFactor' || key === 'minRadius' || key === 'taperFactor' || key === 'leafSize'
            || key === 'initialRadius') precision = 2;
        else if (key === 'initialLength') precision = 1;
        valueSpans[key].textContent = parseFloat(sliders[key].value).toFixed(precision);
    }

    // Add listener for the Randomize button
    const randomizeButton = document.getElementById('randomizeButton');
    if (randomizeButton) {
        randomizeButton.addEventListener('click', () => {
            generateTree(); // Regenerate tree with current settings, applying new randomness
        });
    }

    // Add listener for the Save Data button
    const saveDataButton = document.getElementById('saveDataButton');
    if (saveDataButton) {
        saveDataButton.addEventListener('click', saveFullTreeData);
    }

    // Add listener for the Save Params button
    const saveParamsButton = document.getElementById('saveParamsButton');
    if (saveParamsButton) {
        saveParamsButton.addEventListener('click', saveTreeParams);
    }
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