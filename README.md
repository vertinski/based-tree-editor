# Generative Tree Editor & Loader (Three.js)

<img src="./tree_editor.png" />

This project provides a web-based toolset for interactively generating L-system like tree structures using Three.js and `InstancedMesh` for performance. It also includes utilities for saving tree data and parameters, and loading/generating trees from saved files.

## Features

*   **Interactive Generation (`tree_editor-001.html`):**
    *   Adjust tree structure parameters (depth, length, radius, angles, branches, variance, taper) using sliders.
    *   Control leaf size.
    *   Adjust initial trunk radius and length.
    *   Real-time visual feedback in a 3D scene.
    *   "Randomize" button to regenerate the tree with current settings but new random variations.
    *   Basic scene controls (orbit, zoom, pan).
*   **Save Tree Data (`tree_editor-001.html`):**
    *   Save the complete transformation matrices for all branches and leaves, along with essential visual parameters (colors, taper, leaf size), into a `tree_data.json` file.
    *   Suitable for loading a specific, static tree instance into another application.
*   **Save Tree Parameters (`tree_editor-001.html`):**
    *   Save only the configuration parameters (slider values) used for generation into a `tree_params.json` file.
    *   Suitable for use with the `tree_generator.js` module or a similar generation algorithm in another application (e.g., a game engine) to generate trees dynamically.
*   **Load Full Data (`tree_loader.html`):**
    *   Load a `tree_data.json` file and display the exact tree structure defined by the saved matrices.
*   **Load Params & Generate (`param_loader.html`):**
    *   Load a `tree_params.json` file.
    *   Use the standalone `tree_generator.js` module to generate a new tree instance based on the loaded parameters.
    *   Includes a "Regenerate" button to generate new variations using the same loaded parameters.
*   **Standalone Generator Module (`tree_generator.js`):**
    *   A JavaScript module independent of the DOM/Three.js scene setup.
    *   Exports a `generateTreeMatrices` function that takes a configuration object and returns calculated branch and leaf `THREE.Matrix4` arrays.

## Usage in Other Projects (`tree_generator.js`)

The `tree_generator.js` module allows you to generate tree matrix data within your own JavaScript projects (e.g., game engines, other Three.js scenes) without needing the editor interface.

**1. Import:**

Make sure `three.js` (or its relevant components like `THREE.Matrix4`, `THREE.Vector3`, `THREE.Quaternion`, `THREE.MathUtils`) is available in your project scope. Then, import the generator function:

```javascript
// Assuming you have Three.js available (e.g., via import map or global)
import { generateTreeMatrices } from './path/to/tree_generator.js';
```

**2. Prepare Configuration:**

Create a configuration object. This object should contain the parameters that define the tree structure. These typically correspond to the values saved in `tree_params.json`.

```javascript
const treeConfig = {
    maxDepth: 6,
    initialLength: 12,
    initialRadius: 0.8,
    lengthFactor: 0.75,
    branchAngle: 25,
    radiusFactor: 0.65,
    minRadius: 0.05,
    numBranches: 3,
    angleVariance: 15,
    lengthVariance: 12,
    leafSize: 0.6
    // taperFactor: 0.7, // Optional, used by display scripts
    // branchColor: "5C4033", // Optional, used by display scripts
    // leafColor: "228B22" // Optional, used by display scripts
};
```
*Note: The generator itself primarily uses the structural parameters. Visual parameters like `taperFactor` and colors are often handled by the rendering code that *uses* the generated matrices.*

**3. Generate Matrices:**

Call the function with your configuration object:

```javascript
const { branchMatrices, leafMatrices } = generateTreeMatrices(treeConfig);

// branchMatrices is an array of THREE.Matrix4 objects for branches
// leafMatrices is an array of THREE.Matrix4 objects for leaves
```

**4. Use Matrices:**

You can now use these arrays of `THREE.Matrix4` objects to set up your own `THREE.InstancedMesh` instances for rendering the branches and leaves in your application.

```javascript
// Example (Simplified - assumes scene, base geometries, materials are set up)

const branchCount = branchMatrices.length;
const leafCount = leafMatrices.length;

if (branchCount > 0) {
    const branchMesh = new THREE.InstancedMesh(myBaseBranchGeometry, myBranchMaterial, branchCount);
    for (let i = 0; i < branchCount; i++) {
        branchMesh.setMatrixAt(i, branchMatrices[i]);
    }
    branchMesh.instanceMatrix.needsUpdate = true;
    myScene.add(branchMesh);
}

if (leafCount > 0) {
    const leafMesh = new THREE.InstancedMesh(myBaseLeafGeometry, myLeafMaterial, leafCount);
    for (let i = 0; i < leafCount; i++) {
        leafMesh.setMatrixAt(i, leafMatrices[i]);
    }
    leafMesh.instanceMatrix.needsUpdate = true;
    myScene.add(leafMesh);
}
```

Remember to define appropriate base geometries (`myBaseBranchGeometry`, `myBaseLeafGeometry`) and materials (`myBranchMaterial`, `myLeafMaterial`) in your own rendering setup. 
