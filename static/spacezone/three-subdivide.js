class LoopSubdivision {
    /////////////////////////////////////////////////////////////////////////////////////
    /////   Constants

    static POSITION_DECIMALS = 2;

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Local Variables

    static _average = new THREE.Vector3();
    static _center = new THREE.Vector3();
    static _midpoint = new THREE.Vector3();
    static _normal = new THREE.Vector3();
    static _temp = new THREE.Vector3();

    static _vector0 = new THREE.Vector3(); // .Vector4();
    static _vector1 = new THREE.Vector3(); // .Vector4();
    static _vector2 = new THREE.Vector3(); // .Vector4();
    static _vec0to1 = new THREE.Vector3();
    static _vec1to2 = new THREE.Vector3();
    static _vec2to0 = new THREE.Vector3();

    static _position = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
    ];

    static _vertex = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
    ];

    static _triangle = new THREE.Triangle();

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Modify
    ////////////////////

    /**
     * Applies Loop subdivision modifier to geometry
     *
     * @param {Object} bufferGeometry - Three.js geometry to be subdivided
     * @param {Number} iterations - How many times to run subdividion
     * @param {Object} params - Optional parameters object, see below
     * @returns {Object} Returns new, subdivided, three.js BufferGeometry object
     *
     * Optional Parameters Object
     * @param {Boolean} split - Should coplanar faces be divided along shared edges before running Loop subdivision?
     * @param {Boolean} uvSmooth - Should UV values be averaged during subdivision?
     * @param {Boolean} preserveEdges - Should edges / breaks in geometry be ignored during subdivision?
     * @param {Boolean} flatOnly - If true, subdivision generates triangles, but does not modify positions
     * @param {Number} maxTriangles - If geometry contains more than this many triangles, subdivision will not continue
     * @param {Number} weight - How much to weigh favoring heavy corners vs favoring Loop's formula
     */
    static modify(bufferGeometry, iterations = 1, params = {}) {
        if (arguments.length > 3) console.warn(`LoopSubdivision.modify() now uses a parameter object. See readme for more info!`);

        if (typeof params !== 'object') params = {};

        ///// Parameters
        if (params.split === undefined) params.split = true;
        if (params.uvSmooth === undefined) params.uvSmooth = false;
        if (params.preserveEdges === undefined) params.preserveEdges = false;
        if (params.flatOnly === undefined) params.flatOnly = false;
        if (params.maxTriangles === undefined) params.maxTriangles = Infinity;
        if (params.weight === undefined) params.weight = 1;
        if (isNaN(params.weight) || !isFinite(params.weight)) params.weight = 1;
        params.weight = Math.max(0, (Math.min(1, params.weight)));

        ///// Geometries
        if (! LoopSubdivision.verifyGeometry(bufferGeometry)) return bufferGeometry;
        let modifiedGeometry = bufferGeometry.clone();

        ///// Presplit
        if (params.split) {
            const splitGeometry = LoopSubdivision.edgeSplit(modifiedGeometry);
            modifiedGeometry.dispose();
            modifiedGeometry = splitGeometry;
        }

        ///// Apply Subdivision
        for (let i = 0; i < iterations; i++) {
            let currentTriangles = modifiedGeometry.attributes.position.count / 3;
            if (currentTriangles < params.maxTriangles) {
                let subdividedGeometry;

                // Subdivide
                if (params.flatOnly) {
                    subdividedGeometry = LoopSubdivision.flat(modifiedGeometry, params);
                } else {
                    subdividedGeometry = LoopSubdivision.smooth(modifiedGeometry, params);
                }

                // Copy and Resize Groups
                modifiedGeometry.groups.forEach((group) => {
                    subdividedGeometry.addGroup(group.start * 4, group.count * 4, group.materialIndex);
                });

                // Clean Up
                modifiedGeometry.dispose();
                modifiedGeometry = subdividedGeometry;
            }
        }

        ///// Return New Geometry
        return modifiedGeometry;
    }

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Split Hypotenuse
    ////////////////////

    /**
     * Applies one iteration of split subdivision. Splits all triangles at edges shared by coplanar triangles.
     * Starts by splitting at longest shared edge, followed by splitting from that new center edge point to the
     * center of any other shared edges.
     */
    static edgeSplit(geometry) {

        ///// Geometries
        if (! LoopSubdivision.verifyGeometry(geometry)) return geometry;
        const existing = (geometry.index !== null) ? geometry.toNonIndexed() : geometry.clone();
        const split = new THREE.BufferGeometry();

        ///// Attributes
        const attributeList = LoopSubdivision.gatherAttributes(existing);
        const vertexCount = existing.attributes.position.count;
        const posAttribute = existing.getAttribute('position');
        const norAttribute = existing.getAttribute('normal');
        const edgeHashToTriangle = {};
        const triangleEdgeHashes = [];
        const edgeLength = {};
        const triangleExist = [];

        ///// Edges
        for (let i = 0; i < vertexCount; i += 3) {

            // Positions
            LoopSubdivision._vector0.fromBufferAttribute(posAttribute, i + 0);
            LoopSubdivision._vector1.fromBufferAttribute(posAttribute, i + 1);
            LoopSubdivision._vector2.fromBufferAttribute(posAttribute, i + 2);
            LoopSubdivision._normal.fromBufferAttribute(norAttribute, i);
            const vecHash0 = LoopSubdivision.hashFromVector(LoopSubdivision._vector0);
            const vecHash1 = LoopSubdivision.hashFromVector(LoopSubdivision._vector1);
            const vecHash2 = LoopSubdivision.hashFromVector(LoopSubdivision._vector2);

            // Verify Area
            const triangleSize = LoopSubdivision._triangle.set(LoopSubdivision._vector0, LoopSubdivision._vector1, LoopSubdivision._vector2).getArea();
            triangleExist.push(! LoopSubdivision.fuzzy(triangleSize, 0));
            if (! triangleExist[i / 3]) {
                triangleEdgeHashes.push([]);
                continue;
            }

            // Calculate Normals
            LoopSubdivision.calcNormal(LoopSubdivision._normal, LoopSubdivision._vector0, LoopSubdivision._vector1, LoopSubdivision._vector2);
            const normalHash = LoopSubdivision.hashFromVector(LoopSubdivision._normal);

            // Vertex Hashes
            const hashes = [
                `${vecHash0}_${vecHash1}_${normalHash}`, // [0]: 0to1
                `${vecHash1}_${vecHash0}_${normalHash}`, // [1]: 1to0
                `${vecHash1}_${vecHash2}_${normalHash}`, // [2]: 1to2
                `${vecHash2}_${vecHash1}_${normalHash}`, // [3]: 2to1
                `${vecHash2}_${vecHash0}_${normalHash}`, // [4]: 2to0
                `${vecHash0}_${vecHash2}_${normalHash}`, // [5]: 0to2
            ];

            // Store Edge Hashes
            const index = i / 3;
            for (let j = 0; j < hashes.length; j++) {
                // Attach Triangle Index to Edge Hash
                if (! edgeHashToTriangle[hashes[j]]) edgeHashToTriangle[hashes[j]] = [];
                edgeHashToTriangle[hashes[j]].push(index);

                // Edge Length
                if (! edgeLength[hashes[j]]) {
                    if (j === 0 || j === 1) edgeLength[hashes[j]] = LoopSubdivision._vector0.distanceTo(LoopSubdivision._vector1);
                    if (j === 2 || j === 3) edgeLength[hashes[j]] = LoopSubdivision._vector1.distanceTo(LoopSubdivision._vector2);
                    if (j === 4 || j === 5) edgeLength[hashes[j]] = LoopSubdivision._vector2.distanceTo(LoopSubdivision._vector0);
                }
            }

            // Triangle Edge Reference
            triangleEdgeHashes.push([ hashes[0], hashes[2], hashes[4] ]);
        }

        ///// Build Geometry, Set Attributes
        attributeList.forEach((attributeName) => {
            const attribute = existing.getAttribute(attributeName);
            if (! attribute) return;
            const floatArray = LoopSubdivision.splitAttribute(attribute, attributeName, edgeHashToTriangle, triangleExist, triangleEdgeHashes, edgeLength);
            split.setAttribute(attributeName, new THREE.BufferAttribute(floatArray, attribute.itemSize));
        });

        ///// Morph Attributes
        const morphAttributes = existing.morphAttributes;
        for (const attributeName in morphAttributes) {
            const array = [];
            const morphAttribute = morphAttributes[attributeName];

            // Process Array of Float32BufferAttributes
            for (let i = 0, l = morphAttribute.length; i < l; i++) {
                if (morphAttribute[i].count !== vertexCount) continue;
                const floatArray = LoopSubdivision.splitAttribute(morphAttribute[i], attributeName, edgeHashToTriangle, triangleExist, triangleEdgeHashes, edgeLength, true);
                array.push(new THREE.BufferAttribute(floatArray, morphAttribute[i].itemSize));
            }
            split.morphAttributes[attributeName] = array;
        }
        split.morphTargetsRelative = existing.morphTargetsRelative;

        // Clean Up, Return New Geometry
        existing.dispose();
        return split;
    }

    // Loop Subdivide Function
    static splitAttribute(attribute, attributeName, edgeHashToTriangle, triangleExist, triangleEdgeHashes, edgeLength, morph = false) {
        const newTriangles = 4; /* maximum number of new triangles */
        const vertexCount = attribute.count;
        const arrayLength = (vertexCount * attribute.itemSize) * newTriangles;
        const floatArray = new attribute.array.constructor(arrayLength);

        const processGroups = (attributeName === 'position' && ! morph && existing.groups.length > 0);
        let groupStart = undefined, groupMaterial = undefined;

        let index = 0;
        let skipped = 0;
        let step = attribute.itemSize;
        for (let i = 0; i < vertexCount; i += 3) {

            // Verify Triangle is Valid
            if (! triangleExist[i / 3]) {
                skipped += 3;
                continue;
            }

            // Get Triangle Points
            LoopSubdivision._vector0.fromBufferAttribute(attribute, i + 0);
            LoopSubdivision._vector1.fromBufferAttribute(attribute, i + 1);
            LoopSubdivision._vector2.fromBufferAttribute(attribute, i + 2);

            // Check for Shared Edges
            const existingIndex = i / 3;
            const edgeHash0to1 = triangleEdgeHashes[existingIndex][0];
            const edgeHash1to2 = triangleEdgeHashes[existingIndex][1];
            const edgeHash2to0 = triangleEdgeHashes[existingIndex][2];

            const edgeCount0to1 = edgeHashToTriangle[edgeHash0to1].length;
            const edgeCount1to2 = edgeHashToTriangle[edgeHash1to2].length;
            const edgeCount2to0 = edgeHashToTriangle[edgeHash2to0].length;
            const sharedCount = (edgeCount0to1 + edgeCount1to2 + edgeCount2to0) - 3;

            // New Index (Before New Triangles, used for Groups)
            const loopStartIndex = ((index * 3) / step) / 3;

            // No Shared Edges
            if (sharedCount === 0) {
                LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector0, LoopSubdivision._vector1, LoopSubdivision._vector2); index += (step * 3);

            // Shared Edges
            } else {
                const length0to1 = edgeLength[edgeHash0to1];
                const length1to2 = edgeLength[edgeHash1to2];
                const length2to0 = edgeLength[edgeHash2to0];

                // Add New Triangle Positions
                if ((length0to1 > length1to2 || edgeCount1to2 <= 1) &&
                    (length0to1 > length2to0 || edgeCount2to0 <= 1) && edgeCount0to1 > 1) {
                    LoopSubdivision._center.copy(LoopSubdivision._vector0).add(LoopSubdivision._vector1).divideScalar(2.0);
                    if (edgeCount2to0 > 1) {
                        LoopSubdivision._midpoint.copy(LoopSubdivision._vector2).add(LoopSubdivision._vector0).divideScalar(2.0);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector0, LoopSubdivision._center, LoopSubdivision._midpoint); index += (step * 3);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._center, LoopSubdivision._vector2, LoopSubdivision._midpoint); index += (step * 3);
                    } else {
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector0, LoopSubdivision._center, LoopSubdivision._vector2); index += (step * 3);
                    }
                    if (edgeCount1to2 > 1) {
                        LoopSubdivision._midpoint.copy(LoopSubdivision._vector1).add(LoopSubdivision._vector2).divideScalar(2.0);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._center, LoopSubdivision._vector1, LoopSubdivision._midpoint); index += (step * 3);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._midpoint, LoopSubdivision._vector2, LoopSubdivision._center); index += (step * 3);
                    } else {
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector1, LoopSubdivision._vector2, LoopSubdivision._center); index += (step * 3);
                    }

                } else if ((length1to2 > length2to0 || edgeCount2to0 <= 1) && edgeCount1to2 > 1) {
                    LoopSubdivision._center.copy(LoopSubdivision._vector1).add(LoopSubdivision._vector2).divideScalar(2.0);
                    if (edgeCount0to1 > 1) {
                        LoopSubdivision._midpoint.copy(LoopSubdivision._vector0).add(LoopSubdivision._vector1).divideScalar(2.0);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._center, LoopSubdivision._midpoint, LoopSubdivision._vector1); index += (step * 3);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._midpoint, LoopSubdivision._center, LoopSubdivision._vector0); index += (step * 3);
                    } else {
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector1, LoopSubdivision._center, LoopSubdivision._vector0); index += (step * 3);
                    }
                    if (edgeCount2to0 > 1) {
                        LoopSubdivision._midpoint.copy(LoopSubdivision._vector2).add(LoopSubdivision._vector0).divideScalar(2.0);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._center, LoopSubdivision._vector2, LoopSubdivision._midpoint); index += (step * 3);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._midpoint, LoopSubdivision._vector0, LoopSubdivision._center); index += (step * 3);
                    } else {
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector2, LoopSubdivision._vector0, LoopSubdivision._center); index += (step * 3);
                    }

                } else if (edgeCount2to0 > 1) {
                    LoopSubdivision._center.copy(LoopSubdivision._vector2).add(LoopSubdivision._vector0).divideScalar(2.0);
                    if (edgeCount1to2 > 1) {
                        LoopSubdivision._midpoint.copy(LoopSubdivision._vector1).add(LoopSubdivision._vector2).divideScalar(2.0);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector2, LoopSubdivision._center, LoopSubdivision._midpoint); index += (step * 3);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._center, LoopSubdivision._vector1, LoopSubdivision._midpoint); index += (step * 3);
                    } else {
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector2, LoopSubdivision._center, LoopSubdivision._vector1); index += (step * 3);
                    }
                    if (edgeCount0to1 > 1) {
                        LoopSubdivision._midpoint.copy(LoopSubdivision._vector0).add(LoopSubdivision._vector1).divideScalar(2.0);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector0, LoopSubdivision._midpoint, LoopSubdivision._center); index += (step * 3);
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._midpoint, LoopSubdivision._vector1, LoopSubdivision._center); index += (step * 3);
                    } else {
                        LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector0, LoopSubdivision._vector1, LoopSubdivision._center); index += (step * 3);
                    }

                } else {
                    LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector0, LoopSubdivision._vector1, LoopSubdivision._vector2); index += (step * 3);
                }
            }

            // Process Groups
            if (processGroups) {
                existing.groups.forEach((group) => {
                    if (group.start === (i - skipped)) {
                        if (groupStart !== undefined && groupMaterial !== undefined) {
                            split.addGroup(groupStart, loopStartIndex - groupStart, groupMaterial);
                        }
                        groupStart = loopStartIndex;
                        groupMaterial = group.materialIndex;
                    }
                });
            }

            // Reset Skipped Triangle Counter
            skipped = 0;
        }

        // Resize Array
        const reducedCount = (index * 3) / step;
        const reducedArray = new attribute.array.constructor(reducedCount);
        for (let i = 0; i < reducedCount; i++) {
            reducedArray[i] = floatArray[i];
        }

        // Final Group
        if (processGroups && groupStart !== undefined && groupMaterial !== undefined) {
            split.addGroup(groupStart, (((index * 3) / step) / 3) - groupStart, groupMaterial);
        }

        return reducedArray;
    }

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Flat
    ////////////////////

    /** Applies one iteration of Loop (flat) subdivision (1 triangle split into 4 triangles) */
    static flat(geometry, params = {}) {

        ///// Geometries
        if (! LoopSubdivision.verifyGeometry(geometry)) return geometry;
        const existing = (geometry.index !== null) ? geometry.toNonIndexed() : geometry.clone();
        const loop = new THREE.BufferGeometry();

        ///// Attributes
        const attributeList = LoopSubdivision.gatherAttributes(existing);
        const vertexCount = existing.attributes.position.count;

        ///// Build Geometry
        attributeList.forEach((attributeName) => {
            const attribute = existing.getAttribute(attributeName);
            if (! attribute) return;

            loop.setAttribute(attributeName, LoopSubdivision.flatAttribute(attribute, vertexCount, params));
        });

        ///// Morph Attributes
        const morphAttributes = existing.morphAttributes;
        for (const attributeName in morphAttributes) {
            const array = [];
            const morphAttribute = morphAttributes[attributeName];

            // Process Array of Float32BufferAttributes
            for (let i = 0, l = morphAttribute.length; i < l; i++) {
                if (morphAttribute[i].count !== vertexCount) continue;
                array.push(LoopSubdivision.flatAttribute(morphAttribute[i], vertexCount, params));
            }
            loop.morphAttributes[attributeName] = array;
        }
        loop.morphTargetsRelative = existing.morphTargetsRelative;

        ///// Clean Up
        existing.dispose();
        return loop;
    }

    static flatAttribute(attribute, vertexCount, params = {}) {
        const newTriangles = 4;
        const arrayLength = (vertexCount * attribute.itemSize) * newTriangles;
        const floatArray = new attribute.array.constructor(arrayLength);

        let index = 0;
        let step = attribute.itemSize;
        for (let i = 0; i < vertexCount; i += 3) {

            // Original Vertices
            LoopSubdivision._vector0.fromBufferAttribute(attribute, i + 0);
            LoopSubdivision._vector1.fromBufferAttribute(attribute, i + 1);
            LoopSubdivision._vector2.fromBufferAttribute(attribute, i + 2);

            // Midpoints
            LoopSubdivision._vec0to1.copy(LoopSubdivision._vector0).add(LoopSubdivision._vector1).divideScalar(2.0);
            LoopSubdivision._vec1to2.copy(LoopSubdivision._vector1).add(LoopSubdivision._vector2).divideScalar(2.0);
            LoopSubdivision._vec2to0.copy(LoopSubdivision._vector2).add(LoopSubdivision._vector0).divideScalar(2.0);

            // Add New Triangle Positions
            LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector0, LoopSubdivision._vec0to1, LoopSubdivision._vec2to0); index += (step * 3);
            LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector1, LoopSubdivision._vec1to2, LoopSubdivision._vec0to1); index += (step * 3);
            LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vector2, LoopSubdivision._vec2to0, LoopSubdivision._vec1to2); index += (step * 3);
            LoopSubdivision.setTriangle(floatArray, index, step, LoopSubdivision._vec0to1, LoopSubdivision._vec1to2, LoopSubdivision._vec2to0); index += (step * 3);
        }

        return new THREE.BufferAttribute(floatArray, attribute.itemSize);
    }

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Smooth
    ////////////////////

    /** Applies one iteration of Loop (smooth) subdivision (1 triangle split into 4 triangles) */
    static smooth(geometry, params = {}) {

        if (typeof params !== 'object') params = {};

        ///// Parameters
        if (params.uvSmooth === undefined) params.uvSmooth = false;
        if (params.preserveEdges === undefined) params.preserveEdges = false;

        ///// Geometries
        if (! LoopSubdivision.verifyGeometry(geometry)) return geometry;
        const existing = (geometry.index !== null) ? geometry.toNonIndexed() : geometry.clone();
        const flat = LoopSubdivision.flat(existing, params);
        const loop = new THREE.BufferGeometry();

        ///// Attributes
        const attributeList = LoopSubdivision.gatherAttributes(existing);
        const vertexCount = existing.attributes.position.count;
        const posAttribute = existing.getAttribute('position');
        const flatPosition = flat.getAttribute('position');
        const hashToIndex = {};             // Position hash mapped to index values of same position
        const existingNeighbors = {};       // Position hash mapped to existing vertex neighbors
        const flatOpposites = {};           // Position hash mapped to new edge point opposites
        const existingEdges = {};

        ///// Existing Vertex Hashes
        for (let i = 0; i < vertexCount; i += 3) {
            const posHash0 = LoopSubdivision.hashFromVector(LoopSubdivision._vertex[0].fromBufferAttribute(posAttribute, i + 0));
            const posHash1 = LoopSubdivision.hashFromVector(LoopSubdivision._vertex[1].fromBufferAttribute(posAttribute, i + 1));
            const posHash2 = LoopSubdivision.hashFromVector(LoopSubdivision._vertex[2].fromBufferAttribute(posAttribute, i + 2));

            // Neighbors (of Existing Geometry)
            LoopSubdivision.addNeighbor(posHash0, posHash1, i + 1);
            LoopSubdivision.addNeighbor(posHash0, posHash2, i + 2);
            LoopSubdivision.addNeighbor(posHash1, posHash0, i + 0);
            LoopSubdivision.addNeighbor(posHash1, posHash2, i + 2);
            LoopSubdivision.addNeighbor(posHash2, posHash0, i + 0);
            LoopSubdivision.addNeighbor(posHash2, posHash1, i + 1);

            // Opposites (of new FlatSubdivided vertices)
            LoopSubdivision._vec0to1.copy(LoopSubdivision._vertex[0]).add(LoopSubdivision._vertex[1]).divideScalar(2.0);
            LoopSubdivision._vec1to2.copy(LoopSubdivision._vertex[1]).add(LoopSubdivision._vertex[2]).divideScalar(2.0);
            LoopSubdivision._vec2to0.copy(LoopSubdivision._vertex[2]).add(LoopSubdivision._vertex[0]).divideScalar(2.0);
            const hash0to1 = LoopSubdivision.hashFromVector(LoopSubdivision._vec0to1);
            const hash1to2 = LoopSubdivision.hashFromVector(LoopSubdivision._vec1to2);
            const hash2to0 = LoopSubdivision.hashFromVector(LoopSubdivision._vec2to0);
            LoopSubdivision.addOpposite(hash0to1, i + 2);
            LoopSubdivision.addOpposite(hash1to2, i + 0);
            LoopSubdivision.addOpposite(hash2to0, i + 1);

            // Track Edges for 'edgePreserve'
            LoopSubdivision.addEdgePoint(posHash0, hash0to1);
            LoopSubdivision.addEdgePoint(posHash0, hash2to0);
            LoopSubdivision.addEdgePoint(posHash1, hash0to1);
            LoopSubdivision.addEdgePoint(posHash1, hash1to2);
            LoopSubdivision.addEdgePoint(posHash2, hash1to2);
            LoopSubdivision.addEdgePoint(posHash2, hash2to0);
        }

        ///// Flat Position to Index Map
        for (let i = 0; i < flat.attributes.position.count; i++) {
            const posHash = LoopSubdivision.hashFromVector(LoopSubdivision._temp.fromBufferAttribute(flatPosition, i));
            if (! hashToIndex[posHash]) hashToIndex[posHash] = [];
            hashToIndex[posHash].push(i);
        }

        ///// Build Geometry, Set Attributes
        attributeList.forEach((attributeName) => {
            const existingAttribute = existing.getAttribute(attributeName);
            const flattenedAttribute = flat.getAttribute(attributeName);
            if (existingAttribute === undefined || flattenedAttribute === undefined) return;

            const floatArray = LoopSubdivision.subdivideAttribute(attributeName, existingAttribute, flattenedAttribute, hashToIndex, existingNeighbors, flatOpposites, existingEdges, params);
            loop.setAttribute(attributeName, new THREE.BufferAttribute(floatArray, flattenedAttribute.itemSize));
        });

        ///// Morph Attributes
        const morphAttributes = existing.morphAttributes;
        for (const attributeName in morphAttributes) {
            const array = [];
            const morphAttribute = morphAttributes[attributeName];

            // Process Array of Float32BufferAttributes
            for (let i = 0, l = morphAttribute.length; i < l; i++) {
                if (morphAttribute[i].count !== vertexCount) continue;
                const existingAttribute = morphAttribute[i];
                const flattenedAttribute = LoopSubdivision.flatAttribute(morphAttribute[i], morphAttribute[i].count, params);

                const floatArray = LoopSubdivision.subdivideAttribute(attributeName, existingAttribute, flattenedAttribute, hashToIndex, existingNeighbors, flatOpposites, existingEdges, params);
                array.push(new THREE.BufferAttribute(floatArray, flattenedAttribute.itemSize));
            }
            loop.morphAttributes[attributeName] = array;
        }
        loop.morphTargetsRelative = existing.morphTargetsRelative;

        ///// Clean Up
        flat.dispose();
        existing.dispose();
        return loop;
    }

    // Loop Subdivide Function
    static subdivideAttribute(attributeName, existingAttribute, flattenedAttribute, hashToIndex, existingNeighbors, flatOpposites, existingEdges, params) {
        const arrayLength = (flattenedAttribute.count * flattenedAttribute.itemSize);
        const floatArray = new existingAttribute.array.constructor(arrayLength);

        // Process Triangles
        let index = 0;
        for (let i = 0; i < flattenedAttribute.count; i += 3) {

            // Process Triangle Points
            for (let v = 0; v < 3; v++) {

                if (attributeName === 'uv' && ! params.uvSmooth) {

                    LoopSubdivision._vertex[v].fromBufferAttribute(flattenedAttribute, i + v);

                } else if (attributeName === 'normal') { // && params.normalSmooth) {

                    LoopSubdivision._position[v].fromBufferAttribute(flattenedAttribute, i + v);
                    const positionHash = LoopSubdivision.hashFromVector(LoopSubdivision._position[v]);
                    const positions = hashToIndex[positionHash];

                    const k = positions.length;
                    const beta = 0.75 / k;
                    const startWeight = 1.0 - (beta * k);

                    LoopSubdivision._vertex[v].fromBufferAttribute(flattenedAttribute, i + v);
                    LoopSubdivision._vertex[v].multiplyScalar(startWeight);

                    positions.forEach(positionIndex => {
                        LoopSubdivision._average.fromBufferAttribute(flattenedAttribute, positionIndex);
                        LoopSubdivision._average.multiplyScalar(beta);
                        LoopSubdivision._vertex[v].add(LoopSubdivision._average);
                    });


                } else { // 'position', 'color', etc...

                    LoopSubdivision._vertex[v].fromBufferAttribute(flattenedAttribute, i + v);
                    LoopSubdivision._position[v].fromBufferAttribute(flatPosition, i + v);

                    const positionHash = LoopSubdivision.hashFromVector(LoopSubdivision._position[v]);
                    const neighbors = existingNeighbors[positionHash];
                    const opposites = flatOpposites[positionHash];

                    ///// Adjust Source Vertex
                    if (neighbors) {

                        // Check Edges have even Opposite Points
                        if (params.preserveEdges) {
                            const edgeSet = existingEdges[positionHash];
                            let hasPair = true;
                            for (const edgeHash of edgeSet) {
                                if (flatOpposites[edgeHash].length % 2 !== 0) hasPair = false;
                            }
                            if (! hasPair) continue;
                        }

                        // Number of Neighbors
                        const k = Object.keys(neighbors).length;

                        ///// Loop's Formula
                        const beta = 1 / k * ((5/8) - Math.pow((3/8) + (1/4) * Math.cos(2 * Math.PI / k), 2));

                        ///// Warren's Formula
                        // const beta = (k > 3) ? 3 / (8 * k) : ((k === 3) ? 3 / 16 : 0);

                        ///// Stevinz' Formula
                        // const beta = 0.5 / k;

                        ///// Corners
                        const heavy = (1 / k) / k;

                        ///// Interpolate Beta -> Heavy
                        const weight = LoopSubdivision.lerp(heavy, beta, params.weight);

                        ///// Average with Neighbors
                        const startWeight = 1.0 - (weight * k);
                        LoopSubdivision._vertex[v].multiplyScalar(startWeight);

                        for (let neighborHash in neighbors) {
                            const neighborIndices = neighbors[neighborHash];

                            LoopSubdivision._average.set(0, 0, 0);
                            for (let j = 0; j < neighborIndices.length; j++) {
                                LoopSubdivision._average.add(LoopSubdivision._temp.fromBufferAttribute(existingAttribute, neighborIndices[j]));
                            }
                            LoopSubdivision._average.divideScalar(neighborIndices.length);

                            LoopSubdivision._average.multiplyScalar(weight);
                            LoopSubdivision._vertex[v].add(LoopSubdivision._average);
                        }

                    ///// Newly Added Edge Vertex
                    } else if (opposites && opposites.length === 2) {
                        const k = opposites.length;
                        const beta = 0.125; /* 1/8 */
                        const startWeight = 1.0 - (beta * k);
                        LoopSubdivision._vertex[v].multiplyScalar(startWeight);

                        opposites.forEach(oppositeIndex => {
                            LoopSubdivision._average.fromBufferAttribute(existingAttribute, oppositeIndex);
                            LoopSubdivision._average.multiplyScalar(beta);
                            LoopSubdivision._vertex[v].add(LoopSubdivision._average);
                        });
                    }
                }
            }

            // Add New Triangle Position
            LoopSubdivision.setTriangle(floatArray, index, flattenedAttribute.itemSize, LoopSubdivision._vertex[0], LoopSubdivision._vertex[1], LoopSubdivision._vertex[2]);
            index += (flattenedAttribute.itemSize * 3);
        }

        return floatArray;
    }

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Local Functions, Hash
    /////////////////////////////////////////////////////////////////////////////////////

    static _positionShift = Math.pow(10, LoopSubdivision.POSITION_DECIMALS);

    /** Compares two numbers to see if they're almost the same */
    static fuzzy(a, b, tolerance = 0.00001) {
        return ((a < (b + tolerance)) && (a > (b - tolerance)));
    }

    /** Generates hash strong from Number */
    static hashFromNumber(num, shift = LoopSubdivision._positionShift) {
        let roundedNumber = LoopSubdivision.round(num * shift);
        if (roundedNumber == 0) roundedNumber = 0; /* prevent -0 (signed 0 can effect Math.atan2(), etc.) */
        return `${roundedNumber}`;
    }

    /** Generates hash strong from Vector3 */
    static hashFromVector(vector, shift = LoopSubdivision._positionShift) {
        return `${LoopSubdivision.hashFromNumber(vector.x, shift)},${LoopSubdivision.hashFromNumber(vector.y, shift)},${LoopSubdivision.hashFromNumber(vector.z, shift)}`;
    }

    static lerp(x, y, t) {
        return (1 - t) * x + t * y;
    }

    static round(x) {
        return (x + ((x > 0) ? 0.5 : -0.5)) << 0;
    }

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Local Functions, Geometry
    /////////////////////////////////////////////////////////////////////////////////////

    static calcNormal(target, vec1, vec2, vec3) {
        LoopSubdivision._temp.subVectors(vec1, vec2);
        target.subVectors(vec2, vec3);
        target.cross(LoopSubdivision._temp).normalize();
    }

    static gatherAttributes(geometry) {
        const desired = [ 'position', 'normal', 'uv' ];
        const contains = Object.keys(geometry.attributes);
        const attributeList = Array.from(new Set(desired.concat(contains)));
        return attributeList;
    }

    static setTriangle(positions, index, step, vec0, vec1, vec2) {
        if (step >= 1) {
            positions[index + 0 + (step * 0)] = vec0.x;
            positions[index + 0 + (step * 1)] = vec1.x;
            positions[index + 0 + (step * 2)] = vec2.x;
        }
        if (step >= 2) {
            positions[index + 1 + (step * 0)] = vec0.y;
            positions[index + 1 + (step * 1)] = vec1.y;
            positions[index + 1 + (step * 2)] = vec2.y;
        }
        if (step >= 3) {
            positions[index + 2 + (step * 0)] = vec0.z;
            positions[index + 2 + (step * 1)] = vec1.z;
            positions[index + 2 + (step * 2)] = vec2.z;
        }
        if (step >= 4) {
            positions[index + 3 + (step * 0)] = vec0.w;
            positions[index + 3 + (step * 1)] = vec1.w;
            positions[index + 3 + (step * 2)] = vec2.w;
        }
    }

    static verifyGeometry(geometry) {
        if (geometry === undefined) {
            console.warn(`LoopSubdivision: Geometry provided is undefined`);
            return false;
        }

        if (! geometry.isBufferGeometry) {
            console.warn(`LoopSubdivision: Geometry provided is not 'BufferGeometry' type`);
            return false;
        }

        if (geometry.attributes.position === undefined) {
            console.warn(`LoopSubdivision: Geometry provided missing required 'position' attribute`);
            return false;
        }

        if (geometry.attributes.normal === undefined) {
            geometry.computeVertexNormals();
        }
        return true;
    }

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Helper Methods
    /////////////////////////////////////////////////////////////////////////////////////

    static addNeighbor(posHash, neighborHash, index) {
        if (! existingNeighbors[posHash]) existingNeighbors[posHash] = {};
        if (! existingNeighbors[posHash][neighborHash]) existingNeighbors[posHash][neighborHash] = [];
        existingNeighbors[posHash][neighborHash].push(index);
    }

    static addOpposite(posHash, index) {
        if (! flatOpposites[posHash]) flatOpposites[posHash] = [];
        flatOpposites[posHash].push(index);
    }

    static addEdgePoint(posHash, edgeHash) {
        if (! existingEdges[posHash]) existingEdges[posHash] = new Set();
        existingEdges[posHash].add(edgeHash);
    }
}

// Attach to THREE namespace
THREE.LoopSubdivision = LoopSubdivision;