import * as THREE from 'three';

/**
 * Estimates the maximum number of instances (branches/leaves) needed.
 * @param {object} config - Configuration object containing maxDepth and numBranches.
 * @param {number} estimateFactor - Buffer factor to multiply the calculated count by.
 * @returns {number} Estimated maximum instances.
 */
function estimateMaxInstances(config, estimateFactor = 1.5) {
    let count = 0;
    const depth = config.maxDepth || 5;
    const branches = config.numBranches || 2;
    for (let i = 0; i <= depth; i++) {
        count += Math.pow(branches, i);
    }
    // Increase buffer slightly for leaves (assuming 2 leaves per terminal branch)
    return Math.ceil(count * estimateFactor * 1.5);
}

/**
 * Recursive function to collect transformation matrices for branches and leaves.
 * Adapted for standalone module use.
 * @param {THREE.Matrix4[]} branchMatricesArray - Array to store branch matrices.
 * @param {THREE.Matrix4[]} leafMatricesArray - Array to store leaf matrices.
 * @param {object} config - The tree generation configuration object.
 * @param {number} estimatedMaxInstances - Pre-calculated instance limit.
 * @param {number} level - The current recursion depth level.
 * @param {THREE.Matrix4} parentMatrix - The world transformation matrix ending at the base of this branch.
 * @param {number} length - The length of this branch segment.
 * @param {number} radius - The radius at the base of this branch segment.
 */
function collectBranchDataRecursive(branchMatricesArray, leafMatricesArray, config, estimatedMaxInstances, level, parentMatrix, length, radius) {
    // --- Get necessary config with defaults ---
    const maxDepth = config.maxDepth ?? 5;
    const minRadius = config.minRadius ?? 0.1;
    const numBranches = config.numBranches ?? 2;
    const lengthFactor = config.lengthFactor ?? 0.7;
    const radiusFactor = config.radiusFactor ?? 0.6;
    const branchAngle = config.branchAngle ?? 30;
    const angleVariance = config.angleVariance ?? 10;
    const lengthVariance = config.lengthVariance ?? 10;
    const leafSize = config.leafSize ?? 0.5;

    // --- Base Case: Stop recursion ---
    const isTerminal = level >= maxDepth || length <= 0.01 || radius < minRadius;
    const reachedLimit = branchMatricesArray.length >= estimatedMaxInstances || leafMatricesArray.length >= estimatedMaxInstances - 1; // Check space for branches + 2 leaves

    if (isTerminal || reachedLimit) {
        if (reachedLimit && !isTerminal) {
            // console.warn("Instance limit reached during generation.");
        }

        // --- Add Leaves if it's a natural terminal branch (not just limit reached) ---
        if (isTerminal && level > 0) { // Don't add leaves to the base trunk segment (level 0)
            const canAddLeaves = leafMatricesArray.length < estimatedMaxInstances - 1;
            if (canAddLeaves) {
                const scale = leafSize;
                const scaleMatrix = new THREE.Matrix4().makeScale(scale, scale, scale);

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

    // --- Calculate Branch Matrix ---
    const actualRadius = Math.max(radius, minRadius);
    const scaleMatrixBranch = new THREE.Matrix4().makeScale(actualRadius * 2, length, actualRadius * 2);
    const translationMatrixBranch = new THREE.Matrix4().makeTranslation(0, length / 2, 0);
    const localMatrix = new THREE.Matrix4().multiplyMatrices(translationMatrixBranch, scaleMatrixBranch);
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(parentMatrix, localMatrix);
    branchMatricesArray.push(worldMatrix);

    // --- Calculate parameters for child branches ---
    const nextLevel = level + 1;
    const baseNextLength = length * lengthFactor;
    const baseNextRadius = actualRadius * radiusFactor;

    // --- Calculate starting matrix for children ---
    const childBaseMatrix = new THREE.Matrix4();
    const endPointTranslationChild = new THREE.Matrix4().makeTranslation(0, length, 0);
    childBaseMatrix.multiplyMatrices(parentMatrix, endPointTranslationChild);

    // --- Create Child Branches ---
    const angleStep = numBranches > 1 ? 360 / numBranches : 0;

    for (let i = 0; i < numBranches; i++) {
        if (branchMatricesArray.length >= estimatedMaxInstances || leafMatricesArray.length >= estimatedMaxInstances -1) break;

        // Apply randomness/variance
        const lenVarFactor = 1 + (Math.random() - 0.5) * 2 * (lengthVariance / 100);
        const angleVar = (Math.random() - 0.5) * 2 * angleVariance;
        const spreadVar = (Math.random() - 0.5) * (angleStep * 0.4);

        const nextLength = baseNextLength * lenVarFactor;
        const nextRadius = baseNextRadius;

        const branchAngleDeg = branchAngle + angleVar;
        const baseSpreadAngleDeg = angleStep * i;
        const spreadAngleDeg = baseSpreadAngleDeg + spreadVar;

        const branchAngleRad = THREE.MathUtils.degToRad(branchAngleDeg);
        const spreadAngleRad = THREE.MathUtils.degToRad(spreadAngleDeg);

        const qSpread = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spreadAngleRad);
        const qBranch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), branchAngleRad);
        const orientationQuat = new THREE.Quaternion().multiplyQuaternions(qSpread, qBranch);

        const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(orientationQuat);
        const nextParentMatrix = new THREE.Matrix4().multiplyMatrices(childBaseMatrix, rotationMatrix);

        // Recursively call
        collectBranchDataRecursive(branchMatricesArray, leafMatricesArray, config, estimatedMaxInstances, nextLevel, nextParentMatrix, nextLength, nextRadius);
    }
}

/**
 * Generates tree branch and leaf matrices based on configuration parameters.
 * @param {object} config - Configuration object matching the structure saved in tree_params.json.
 *                          Should include: maxDepth, initialLength, initialRadius, lengthFactor, branchAngle,
 *                          radiusFactor, minRadius, numBranches, angleVariance, lengthVariance, leafSize, etc.
 * @returns {{branchMatrices: THREE.Matrix4[], leafMatrices: THREE.Matrix4[]}} Object containing arrays of matrices.
 */
export function generateTreeMatrices(config) {
    if (!config) {
        console.error("generateTreeMatrices requires a configuration object.");
        return { branchMatrices: [], leafMatrices: [] };
    }

    const branchMatrices = [];
    const leafMatrices = [];
    const estimatedMax = estimateMaxInstances(config);

    // Ensure required starting parameters exist
    const initialLength = config.initialLength ?? 10;
    const initialRadius = config.initialRadius ?? (initialLength / 15); // Default if not provided

    const initialMatrix = new THREE.Matrix4(); // Identity matrix for the root

    // Start the recursive collection process
    collectBranchDataRecursive(branchMatrices, leafMatrices, config, estimatedMax, 0, initialMatrix, initialLength, initialRadius);

    console.log(`Generated ${branchMatrices.length} branch matrices and ${leafMatrices.length} leaf matrices.`);

    return {
        branchMatrices,
        leafMatrices
    };
} 