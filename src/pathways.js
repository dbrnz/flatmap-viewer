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

export const PATH_TYPES = [
    { type: "cns", label: "CNS", colour: "#9B1FC1"},
    { type: "lcn", label: "Local circuit neuron", colour: "#F19E38"},
    { type: "para-pre", label: "Parasympathetic pre-ganglionic", colour: "#3F8F4A"},
    { type: "para-post", label: "Parasympathetic post-ganglionic", colour: "#3F8F4A"},
    { type: "sensory", label: "Sensory (afferent) neuron", colour: "#2A62F6"},
    { type: "somatic", label: "Somatic lower motor", colour: "#98561D"},
    { type: "symp-pre", label: "Sympathetic pre-ganglionic", colour: "#EA3423"},
    { type: "symp-post", label: "Sympathetic post-ganglionic", colour: "#EA3423"}
];

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
        this._pathLines = flatmap.pathways['path-lines'];    // pathId: [lineIds]
        this._pathNerves = flatmap.pathways['path-nerves'];  // pathId: [nerveIds]
        if ('path-nodes' in flatmap.pathways) {
            this._pathNodes = flatmap.pathways['path-nodes'];    // pathId: [nodeIds]
        } else {
            this._pathNodes = {};
            for (const path of Object.keys(this._pathLines)) {
                this._pathNodes[path] = [];
            }
        }
        this._linePaths = reverseMap(this._pathLines);       // lineId: [pathIds]
        this._nervePaths = reverseMap(this._pathNerves);     // nerveId: [pathIds]

        const nodePaths = flatmap.pathways['node-paths'];
        if (!('start-paths' in nodePaths)) {
            this._nodePaths = nodePaths;                     // nodeId: [pathIds]
        } else {                                             // Original format
            this._nodePaths = nodePaths['start-paths'];
            this.extendNodePaths_(nodePaths['through-paths']);
            this.extendNodePaths_(nodePaths['end-paths']);
        }
        const featureIds = new Set();
        for (const paths of Object.values(this._nodePaths)) {
            this.addPathsToFeatureSet_(paths, featureIds);
        }
        this._allFeatureIds = featureIds;

        this._typePaths = flatmap.pathways['type-paths'];     // nerve-type: [pathIds]
    }

    addPathsToFeatureSet_(paths, featureSet)
    //======================================
    {
        for (const path of paths) {
            if (path in this._pathLines) {
                this._pathLines[path].forEach(lineId => featureSet.add(lineId));
                this._pathNerves[path].forEach(nerveId => featureSet.add(nerveId));
                this._pathNodes[path].forEach(nerveId => featureSet.add(nerveId));
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
        if (pathType in this._typePaths) {
            this.addPathsToFeatureSet_(this._typePaths[pathType], featureIds);
        }
        return featureIds;
    }
}

//==============================================================================
