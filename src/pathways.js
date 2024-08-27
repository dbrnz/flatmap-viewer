/*==============================================================================

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

==============================================================================*/

import {colord} from 'colord'

//==============================================================================

import {FLATMAP_STYLE} from './flatmap-viewer'
import { reverseMap } from './utils'

export const PATHWAYS_LAYER = 'pathways'

//==============================================================================

export const APINATOMY_PATH_PREFIX = 'ilxtr:'

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
    { type: "error", label: "Paths with errors or warnings", colour: "#FF0", enabled: false}
]

const PathTypeMap = new Map(PATH_TYPES.map(t => [t.type, t]))

export const PATH_STYLE_RULES =
    PATH_TYPES.flatMap(pathType => [['==', ['get', 'kind'], pathType.type], pathType.colour])

export function pathColourArray(pathType, alpha=255)
//==================================================
{
    const rgb = colord(PathTypeMap.has(pathType)
                        ? PathTypeMap.get(pathType).colour
                        : PathTypeMap.get('other').colour).toRgb()
    return [rgb.r, rgb.g, rgb.b, alpha]
}

//==============================================================================

export class PathManager
{
    #centrelineDetails = []             // Array<Object>
    #pathsByCentreline = new Map()      // Map<string, Set<string>>
    #pathLines = new Map()              // Map<string, Array<number>>   pathId: [lineIds]

    constructor(flatmap, ui, enabled=true)
    {
        this.__flatmap = flatmap
        this.__ui = ui;
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
        this.__pathModelPaths = {};                             // pathModelId: [pathIds]
        this.__pathToPathModel = {};                            // pathId: pathModelId
        this.__paths = {};                                      // pathId: path
        const pathNerves = new Map()                            // pathId: [nerveIds]
        if ('paths' in flatmap.pathways) {
            for (const [pathId, path] of Object.entries(flatmap.pathways.paths)) {
                this.#pathLines.set(pathId, path.lines)
                pathNerves.set(pathId, path.nerves)
                this.__paths[pathId] = path;
                this.__paths[pathId].systemCount = 0;
                if ('models' in path) {
                    const modelId = path['models'];
                    if (!(modelId in this.__pathModelPaths)) {
                        this.__pathModelPaths[modelId] = [];
                    }
                    this.__pathModelPaths[modelId].push(pathId);
                    this.__pathToPathModel[pathId] = modelId;
                }
                for (const id of (path.centrelines || [])) {
                    if (!this.#pathsByCentreline.has(id)) {
                        this.#pathsByCentreline.set(id, new Set())
                    }
                    this.#pathsByCentreline.get(id).add(pathId)
                }
            }
        }

        this.__pathsByLine = reverseMap(this.#pathLines);            // lineId: [pathIds]
        this.__pathsByNerve = reverseMap(pathNerves);                // nerveId: [pathIds]

        const nodePaths = flatmap.pathways['node-paths'];
        this._nodePaths = nodePaths;                                 // nodeId: [pathIds]
        const featureIds = new Set();
        for (const paths of Object.values(this._nodePaths)) {
            this.addPathsToFeatureSet_(paths, featureIds);
        }
        this._allFeatureIds = featureIds;

        // Construct a list of path types we know about
        const pathTypes = {};
        this.__pathtypeEnabled = {};
        for (const pathTypeDefn of PATH_TYPES) {
            pathTypes[pathTypeDefn.type] = pathTypeDefn;
            this.__pathtypeEnabled[pathTypeDefn.type] = !('enabled' in pathTypeDefn) || pathTypeDefn.enabled;
        }

        // Set path types, mapping unknown path types to ``other``
        this.__pathsByType = {};
        this.__pathsByType['other'] = [];
        for (const [pathType, paths] of Object.entries(flatmap.pathways['type-paths'])) {
            if (pathType in pathTypes) {
                this.__pathsByType[pathType] = paths;
            } else {
                this.__pathsByType['other'].push(...paths);
                this.__pathtypeEnabled[pathType] = false;
            }
            if (pathType === 'centreline') {
                // Set details of centrelines
                for (const id of paths) {
                    const annotation = flatmap.annotationById(id)
                    if (flatmap.options.style === FLATMAP_STYLE.CENTRELINE
                     || this.#pathsByCentreline.has(id)) {
                        const details = {id}
                        if (annotation) {
                            if ('label' in annotation) {
                                details['label'] = annotation.label
                            }
                            if ('models' in annotation) {
                                details['models'] = annotation.models
                            }
                        }
                        this.#centrelineDetails.push(details)
                    } else if (annotation) {
                        // Hide centrelines with no paths if not a ``centreline`` map
                        const feature = this.__ui.mapFeatureFromAnnotation(annotation)
                        if (feature) {
                            this.__flatmap.map.setFeatureState(feature, {'invisible': true})
                        }
                    }
                }
            }
        }
        // Assign types to individual paths
        this.__assignPathTypes();

        // Nerve centrelines are a special case with their own controls
        if (flatmap.options.style === FLATMAP_STYLE.CENTRELINE) {
            // Centrelines are always enabled in a ``centreline`` map
            this.__haveCentrelines = true
            this.__enabledCentrelines = true
        } else {
            this.__haveCentrelines = (this.#centrelineDetails.length > 0)
            this.__enabledCentrelines = false
        }
    }

    get centrelineDetails()
    //=====================
    {
        return this.#centrelineDetails
    }

    get haveCentrelines()
    //===================
    {
        return this.__haveCentrelines;
    }

    get enabledCentrelines()
    //======================
    {
        return this.__enabledCentrelines;
    }

    __assignPathTypes()
    //=================
    {
        for (const [pathType, paths] of Object.entries(this.__pathsByType)) {
            for (const pathId of paths) {
                this.__paths[pathId].pathType = pathType;
            }
        }
    }

    pathStyles()
    //==========
    {
        const styles = []
        for (const mapType of this.pathTypes()) {
            const defn = PathTypeMap.get(mapType.type)
            styles.push({
                type: defn.type,
                colour: defn.colour,
                dashed: defn.dashed || false
            })
        }
        return styles
    }

    pathTypes()
    //=========
    {
        const pathTypes = [];
        for (const pathTypeDefn of PATH_TYPES) {
            if (pathTypeDefn.type in this.__pathsByType
            && this.__pathsByType[pathTypeDefn.type].length > 0) {
                if (pathTypeDefn.type === 'centreline') {
                    if (this.__flatmap.options.style !== FLATMAP_STYLE.CENTRELINE) {
                        this.__haveCentrelines = true;
                        this.__enabledCentrelines = this.__pathtypeEnabled[pathTypeDefn.type]
                    }
                } else {
                    pathTypes.push({
                        ...pathTypeDefn,
                        enabled: this.__pathtypeEnabled[pathTypeDefn.type]
                    });
                }
            }
        }
        return pathTypes;
    }

    addPathsToFeatureSet_(pathIds, featureSet)
    //========================================
    {
        for (const pathId of pathIds) {
            const path = this.__paths[pathId];
            path.lines.forEach(lineId => featureSet.add(lineId));
            path.nerves.forEach(nerveId => featureSet.add(nerveId));
            path.nodes.forEach(nodeId => featureSet.add(nodeId));
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
            if (this.__pathsByLine.has(lineId)) {
                this.addPathsToFeatureSet_(this.__pathsByLine.get(lineId), featureIds);
            }
        }
        return featureIds;
    }

    nerveFeatureIds(nerveId)
    //======================
    {
        const featureIds = new Set();
        if (this.__pathsByNerve.has(nerveId)) {
            this.addPathsToFeatureSet_(this.__pathsByNerve.get(nerveId), featureIds);
        }
        return featureIds;
    }

    pathProperties(feature)
    //=====================
    {
        const properties = Object.assign({}, feature.properties);
        if (this.__pathsByLine.has(feature.id)) {
            for (const pathId of this.__pathsByLine.get(feature.id)) {
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
                for (const pathId of this.__pathsByNerve.get(feature.id)) {
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

    __typeFeatureIds(pathType)
    //========================
    {
        const featureIds = new Set();
        if (pathType in this.__pathsByType) {
            this.addPathsToFeatureSet_(this.__pathsByType[pathType], featureIds);
        }
        return featureIds;
    }

    enablePathLines(enable, force=false)
    //==================================
    {
        for (const lineId of this.__pathsByLine.keys()) {
            this.__ui.enableFeature(lineId, enable, force)
        }
    }

    enablePathsByCentreline(centrelineId, enable, force=false)
    //========================================================
    {
        if (this.#pathsByCentreline.has(centrelineId)) {
            if (this.#pathLines.has(centrelineId)) {
                for (const lineId of this.#pathLines.get(centrelineId)) {
                    this.__ui.enableFeature(lineId, enable, force)
                }
            }
            const featureIds = new Set()
            this.addPathsToFeatureSet_(this.#pathsByCentreline.get(centrelineId), featureIds)
            for (const featureId of featureIds) {
                this.__ui.enableFeature(featureId, enable, force)
            }
            this.#notifyWatchers()
        }
    }

    enablePathsBySystem(system, enable, force=false)
    //==============================================
    {
        let changed = false
        for (const pathId of system.pathIds) {
            const path = this.__paths[pathId]
            if (this.__pathtypeEnabled[path.pathType]
              && (force
               || enable && path.systemCount === 0
               || !enable && path.systemCount == 1)) {
                // and type(pathId) is enabled...
                const featureIds = new Set()
                this.addPathsToFeatureSet_([pathId], featureIds)
                for (const featureId of featureIds) {
                    this.__ui.enableFeature(featureId, enable, force)
                }
                changed = true
            }
            path.systemCount += (enable ? 1 : -1)
            if (path.systemCount < 0) {
                path.systemCount = 0
            }
            // TODO? Show connectors and parent components of these paths??
        }
        if (changed) {
            this.#notifyWatchers()
        }
    }

    enablePathsByType(pathType, enable, force=false)
    //==============================================
    {
        if (force
         || enable && !this.__pathtypeEnabled[pathType]
         || !enable && this.__pathtypeEnabled[pathType]) {
            for (const featureId of this.__typeFeatureIds(pathType)) {
                this.__ui.enableFeature(featureId, enable, force);
            }
            this.__pathtypeEnabled[pathType] = enable;
            this.#notifyWatchers({pathType})
        }
    }

    pathTypeEnabled(pathType)
    //=======================
    {
        return this.__pathtypeEnabled[pathType] || false
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

    pathModelNodes(modelId)
    //=====================
    {
        const nodeIds = new Set();
        if (modelId in this.__pathModelPaths) {
            for (const pathId of this.__pathModelPaths[modelId]) {
                for (const nodeId of this.__paths[pathId].nodes) {
                    nodeIds.add(nodeId);
                }
            }
        }
        return nodeIds;
    }

    #lastWatcherId = 0
    #watcherCallbacks = new Map()

    addWatcher(callback)
    //==================
    {
        this.#lastWatcherId += 1
        this.#watcherCallbacks.set(this.#lastWatcherId, callback)
        return this.#lastWatcherId
    }

    removeWatcher(watcherId)
    //======================
    {
        this.#watcherCallbacks.delete(watcherId)
    }

    #notifyWatchers(changes={})
    //=========================
    {
        for (const callback of this.#watcherCallbacks.values()) {
            callback(changes)
        }
    }
}

//==============================================================================
