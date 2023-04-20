/******************************************************************************

Flatmap viewer and annotation tool

Copyright (c) 2020  David Brooks

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

******************************************************************************/

'use strict';

//==============================================================================

export const PATHWAYS_LAYER = 'pathways';

//==============================================================================

const PATH_TYPES = [
    { type: "cns", label: "CNS", colour: "#9B1FC1"},
    { type: "intracardiac", label: "Local circuit neuron", colour: "#F19E38"},
    { type: "para-pre", label: "Parasympathetic pre-ganglionic", colour: "#3F8F4A"},
    { type: "para-post", label: "Parasympathetic post-ganglionic", colour: "#3F8F4A", dashed: true},
    { type: "sensory", label: "Sensory (afferent) neuron", colour: "#2A62F6"},
    { type: "motor", label: "Somatic lower motor", colour: "#98561D"},
    { type: "somatic", label: "Somatic lower motor", colour: "#98561D"},
    { type: "symp-pre", label: "Sympathetic pre-ganglionic", colour: "#EA3423"},
    { type: "symp-post", label: "Sympathetic post-ganglionic", colour: "#EA3423", dashed: true},
    { type: "other", label: "Other neuron type", colour: "#888"},
    { type: "arterial", label: "Arterial blood vessel", colour: "#F00", enabled: false},
    { type: "venous", label: "Venous blood vessel", colour: "#2F6EBA", enabled: false},
    { type: "centreline", label: "Nerve centrelines", colour: "#CCC", enabled: false},
    { type: "error", label: "Paths with errors or warnings", colour: "#FF0"}
];

export const PATH_STYLE_RULES =
    PATH_TYPES.flatMap(pathType => [['==', ['get', 'kind'], pathType.type], pathType.colour]);

//==============================================================================

function reverseMap(mapping)
//==========================
{
    const reverse = {};
    for (const [key, values] of Object.entries(mapping)) {
        for (const value of values) {
            if (value in reverse) {
                reverse[value].add(key);
            } else {
                reverse[value] = new Set([key]);
            }
        }
    }
    return reverse;
}

//==============================================================================

export class Pathways
{
    constructor(flatmap)
    {
        this.__connectivityModelPaths = {};                          // modelId: [pathIds]
        this.__pathToConnectivityModel = {};
        if ('models' in flatmap.pathways) {
            for (const model of flatmap.pathways.models) {
                this.__connectivityModelPaths[model.id] = model.paths;
                for (const path of model.paths) {
                    this.__pathToConnectivityModel[path] = model.id;
                }
            }
        }
        this.__pathModelPaths = {};                                  // pathModelId: [pathIds]
        this.__pathToPathModel = {};
        if ('paths' in flatmap.pathways) {
            this._pathLines = {};                                    // pathId: [lineIds]
            this._pathNerves = {};                                   // pathId: [nerveIds]
            this._pathNodes = {};                                    // pathId: [nodeIds]
            for (const [pathId, path] of Object.entries(flatmap.pathways.paths)) {
                this._pathLines[pathId] = path.lines;
                this._pathNerves[pathId] = path.nerves;
                this._pathNodes[pathId] = path.nodes;
                if ('models' in path) {
                    const modelId = path['models'];
                    if (!(modelId in this.__pathModelPaths)) {
                        this.__pathModelPaths[modelId] = [];
                    }
                    this.__pathModelPaths[modelId].push(pathId);
                    this.__pathToPathModel[pathId] = modelId;
                }
            }
        } else {
            // To be deprecated...
            this._pathLines = flatmap.pathways['path-lines'];        // pathId: [lineIds]
            this._pathNerves = flatmap.pathways['path-nerves'];      // pathId: [nerveIds]
            if ('path-nodes' in flatmap.pathways) {
                this._pathNodes = flatmap.pathways['path-nodes'];    // pathId: [nodeIds]
            } else {
                this._pathNodes = {};
                for (const path of Object.keys(this._pathLines)) {
                    this._pathNodes[path] = [];
                }
            }
        }
        this._linePaths = reverseMap(this._pathLines);               // lineId: [pathIds]
        this._nervePaths = reverseMap(this._pathNerves);             // nerveId: [pathIds]

        const nodePaths = flatmap.pathways['node-paths'];
        if (!('start-paths' in nodePaths)) {
            this._nodePaths = nodePaths;                             // nodeId: [pathIds]
        } else {   // Original format, deprecated
            this._nodePaths = nodePaths['start-paths'];
            this.extendNodePaths_(nodePaths['through-paths']);
            this.extendNodePaths_(nodePaths['end-paths']);
        }
        const featureIds = new Set();
        for (const paths of Object.values(this._nodePaths)) {
            this.addPathsToFeatureSet_(paths, featureIds);
        }
        this._allFeatureIds = featureIds;

        // Construct a list of path types we know about
        const pathTypes = [];
        for (const pathType of PATH_TYPES) {
            pathTypes.push(pathType.type);
        }
        // Map unknown path types to ``other``
        this.__typePaths = {};
        this.__typePaths['other'] = [];
        for (const [pathType, paths] of Object.entries(flatmap.pathways['type-paths'])) {
            if (pathTypes.indexOf(pathType) >= 0) {
                this.__typePaths[pathType] = paths;
            } else {
                this.__typePaths['other'].push(...paths);
            }
        }
        // Nerve centrelines are a special case with their own controls
        this.__haveCentrelines = false;
    }

    get haveCentrelines()
    //===================
    {
        return this.__haveCentrelines;
    }

    pathTypes()
    //=========
    {
        const pathTypes = [];
        for (const pathType of PATH_TYPES) {
            if (pathType.type in this.__typePaths
            && this.__typePaths[pathType.type].length > 0) {
                if (pathType.type === 'centreline') {
                    this.__haveCentrelines = true;
                } else {
                    pathTypes.push(pathType);
                }
            }
        }
        return pathTypes;
    }

    addPathsToFeatureSet_(paths, featureSet)
    //======================================
    {
        for (const path of paths) {
            if (path in this._pathLines) {
                this._pathLines[path].forEach(lineId => featureSet.add(lineId));
                this._pathNerves[path].forEach(nerveId => featureSet.add(nerveId));
                this._pathNodes[path].forEach(nodeId => featureSet.add(nodeId));
            }
        }
    }

    extendNodePaths_(nodePaths)
    //=========================
    {
        for (const [key, values] of Object.entries(nodePaths)) {
            if (key in this._nodePaths) {
                this._nodePaths[key].push(...values);
            } else {
                this._nodePaths[key] = values;
            }
        }
    }

    allFeatureIds()
    //=============
    {
        return this._allFeatureIds;
    }

    lineFeatureIds(lineIds)
    //=====================
    {
        const featureIds = new Set();
        for (const lineId of lineIds) {
            if (lineId in this._linePaths) {
                this.addPathsToFeatureSet_(this._linePaths[lineId], featureIds);
            }
        }
        return featureIds;
    }

    nerveFeatureIds(nerveId)
    //======================
    {
        const featureIds = new Set();
        if (nerveId in this._nervePaths) {
            this.addPathsToFeatureSet_(this._nervePaths[nerveId], featureIds);
        }
        return featureIds;
    }

   nodeFeatureIds(nodeId)
    //===================
    {
        const featureIds = new Set();
        if (nodeId in this._nodePaths) {
            this.addPathsToFeatureSet_(this._nodePaths[nodeId], featureIds);
        }
        return featureIds;
    }

    pathProperties(feature)
    //=====================
    {
        const properties = Object.assign({}, feature.properties);
        if (feature.id in this._linePaths) {
            for (const pathId of this._linePaths[feature.id]) {
                // There should only be a single path for a line
                if (pathId in this.__pathToConnectivityModel) {
                    properties['connectivity'] = this.__pathToConnectivityModel[pathId];
                }
                if (pathId in this.__pathToPathModel) {
                    properties['models'] = this.__pathToPathModel[pathId];
                }
            }
/*
            if (!('connectivity' in properties)) {
                for (const pathId of this._nervePaths[feature.id]) {
                    if (pathId in this.__pathToConnectivityModel) {
                        properties['connectivity'] = this.__pathToConnectivityModel[pathId];
                        break;
                    }
                }
            }
*/
        }
        return properties;
    }

    connectivityModelFeatureIds(modelId)
    //==================================
    {
        const featureIds = new Set();
        if (modelId in this.__connectivityModelPaths) {
            this.addPathsToFeatureSet_(this.__connectivityModelPaths[modelId], featureIds);
            }
        return featureIds;
    }

    pathModelFeatureIds(modelId)
    //==========================
    {
        const featureIds = new Set();
        if (modelId in this.__pathModelPaths) {
            this.addPathsToFeatureSet_(this.__pathModelPaths[modelId], featureIds);
            }
        return featureIds;
    }

    isNode(id)
    //========
    {
        return id in this._nodePaths;
    }

    pathFeatureIds(nodeId)
    //====================
    {
        const featureIds = new Set();
        if (nodeId in this._nodePaths) {
            this.addPathsToFeatureSet_(this._nodePaths[nodeId], featureIds);
        }
        return featureIds;
    }

    typeFeatureIds(pathType)
    //======================
    {
        const featureIds = new Set();
        if (pathType in this.__typePaths) {
            this.addPathsToFeatureSet_(this.__typePaths[pathType], featureIds);
        }
        return featureIds;
    }

    nodePathModels(nodeId)
    //====================
    {
        const modelIds = new Set();
        if (nodeId in this._nodePaths) {
            for (const pathId of this._nodePaths[nodeId]) {
                if (pathId in this.__pathToPathModel) {
                    modelIds.add(this.__pathToPathModel[pathId]);
                }
            }
        }
        return modelIds;
    }
}

//==============================================================================
