/*==============================================================================

Flatmap viewer and annotation tool

Copyright (c) 2019 - 2024  David Brooks

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

import {DiGraph, pairwise} from '../knowledge/graphs'
import {isUberon, normalisedUri, uberon} from '../knowledge/uberon'

import {FlatMap} from '../flatmap-viewer'

//==============================================================================

export interface DatasetTerms
{
    datasetId: string
    terms: string[]
}

type DatasetMarker = {
    term: string
    dataset: string
    minZoom: number
    maxZoom: number
}

export type ClusteredAnatomicalMarker = {
    id: string
    term: string
    position: [number, number]
    /**
     * { The number of datasets at the marker when ``index <= zoom < index+1`` }
     */
    zoomCount: number[]
}

//==============================================================================

const MAX_ZOOM = 12

function depthToZoomRange(depth: number): [number, number]
{
    return (depth < 0)         ? [0, 1]
         : (depth >= MAX_ZOOM) ? [MAX_ZOOM, MAX_ZOOM]
         :                       [depth, depth+1]
}

//==============================================================================

class DatasetMarkerSet
{
    #connectedTermGraph: DiGraph
    #datasetId: string
    #mapTermGraph: MapTermGraph
    #markers: Map<string, DatasetMarker>

    constructor(datasetTerms: DatasetTerms, mapTermGraph: MapTermGraph)
    {
        this.#datasetId = datasetTerms.datasetId
        this.#mapTermGraph = mapTermGraph

        const mapTerms = new Set(this.#validatedTerms(datasetTerms.terms))
        mapTerms.add(uberon.anatomicalRoot)

        this.#connectedTermGraph = mapTermGraph.connectedTermGraph([...mapTerms.values()])

        this.#markers = new Map(this.#connectedTermGraph.nodes().map(term => {
            const d = mapTermGraph.depth(term)
            const zoomRange = depthToZoomRange(d)
            return [ term, {
                dataset: this.#datasetId,
                term,
                minZoom: zoomRange[0],
                maxZoom: zoomRange[1]
            }]
        }))
        for (const terminal of this.#connectedTermGraph.nodes()
                                                 .filter(term => term !== uberon.anatomicalRoot
                                                              && this.#connectedTermGraph.degree(term) == 1)) {
            const marker = this.#markers.get(terminal)
            marker.maxZoom = MAX_ZOOM
            this.#setZoomFromParents(marker)
        }
        this.#markers.delete(uberon.anatomicalRoot)
    }

    get id(): string
    {
        return this.#datasetId
    }

    get markers(): DatasetMarker[]
    {
        return [...this.#markers.values()]
    }

    #setZoomFromParents(marker: DatasetMarker)
    //========================================
    {
        if (marker.term === uberon.anatomicalRoot) {
            return
        }
        for (const parent of this.#connectedTermGraph.parents(marker.term)) {
            const parentMarker = this.#markers.get(parent)
            if (parentMarker.maxZoom < marker.minZoom) {
                parentMarker.maxZoom = marker.minZoom
            }
            if (parent === uberon.anatomicalRoot) {
                marker.minZoom = 0
            } else {
                this.#setZoomFromParents(parentMarker)
            }
        }
    }

    #substituteTerm(term: string): string|null
    //========================================
    {
        const parents = uberon.parents(term)
        if (parents[0] === uberon.anatomicalRoot) {
            return null
        }
        for (const parent of parents) {
            if (this.#mapTermGraph.hasTerm(parent)) {
                return parent
            }
        }
        return this.#substituteTerm(parents[0])
    }

    #validatedTerms(terms: string[]): string[]
    //========================================
    {
        const mapTerms = []
        for (const term of terms) {
            if (this.#mapTermGraph.hasTerm(term)) {
                mapTerms.push(term)
            } else {
                const substitute = this.#substituteTerm(term)
                if (substitute === null) {
                    console.error(`No feature for ${term} on map; can't find substitute`)
                } else {
                    console.log(`No feature for ${term} on map; substituting ${substitute}`)
                    mapTerms.push(substitute)
                }
            }
        }
        return mapTerms
    }
}


//==============================================================================

class DatasetMarkers
{

    #markers: Map<string, ClusteredAnatomicalMarker> = new Map()

    constructor(datasetTermsList: DatasetTerms[], mapTermGraph: MapTermGraph)
    {
        for (const datasetTerms of datasetTermsList) {
            const dataSetMarkers = new DatasetMarkerSet(datasetTerms, mapTermGraph)
            this.#mergeMarkers(dataSetMarkers.markers)
        }
    }

    #mergeMarkers(_markers: DatasetMarker[])
    {

    }
}

//==============================================================================

export class MapTermGraph
{
    #hierarchy: DiGraph

    constructor(flatmap: FlatMap)
    {
        const mapUberons = flatmap.anatomicalIdentifiers.map(t => normalisedUri(t))
                                                        .filter(t => isUberon(t))
        this.#hierarchy = new DiGraph()
        this.#hierarchy.addNode(uberon.anatomicalRoot, {
            label: uberon.label(uberon.anatomicalRoot),
            distance: 0
        })
        for (const term of mapUberons) {
            const rootPath = uberon.pathToRoot(term)
            if (rootPath.length) {
                this.#hierarchy.addNode(term, {
                    label: uberon.label(term),
                    distance: rootPath.length - 1
                })
            }
        }

        // Find the shortest path between each pair of Uberon terms used in the flatmap
        // and, if a path exists, add an edge to the hierarchy graph

        for (const [source, target] of pairwise(this.#hierarchy.nodes())) {
            const path = uberon.shortestPath(source, target)
            if (path.length) {
                this.#hierarchy.addEdge(source, target, {
                    parentDistance: path.length - 1
                })
            }
        }

        // For each term used by the flatmap find the closest term(s), in terms of path
        // length, that it is connected to and then delete edges connecting it to more
        // distant terms

        for (const term of this.#hierarchy.nodes()) {
            const parentEdges = this.#hierarchy.outEdges(term)
                                               .map(edge => {
                                                    return {
                                                        edge: edge,
                                                        parent: this.#hierarchy.opposite(term, edge),
                                                        distance: this.#hierarchy.getEdgeAttribute(edge, 'parentDistance') as number
                                                    }
                                                })
            if (parentEdges.length) {
                parentEdges.sort((a, b) => a.distance - b.distance)
                const distance = parentEdges[0].distance
                let n = 1
                while (n < parentEdges.length && distance == parentEdges[n].distance) {
                    n += 1
                }
                while (n < parentEdges.length) {
                    this.#hierarchy.dropEdge(parentEdges[n].edge)
                    n += 1
                }
            }
        }
    }

    addDatasetMarkers(datasetTermsList: DatasetTerms[])
    //=================================================
    {
        const dataSetMarkers = new DatasetMarkers(datasetTermsList, this)

    }

    clearMarkers()
    //============
    {
    }

    connectedTermGraph(terms: string[])
    //=================================
    {
        return this.#hierarchy.connectedSubgraph(terms)
    }

    depth(term: string): number
    //=========================
    {
        return this.#hierarchy.getNodeAttribute(term, 'distance') as number
    }

    hasTerm(term: string): boolean
    //============================
    {
        return this.#hierarchy.hasNode(term)
    }
}

//==============================================================================
