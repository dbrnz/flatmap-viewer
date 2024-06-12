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

import {ANATOMICAL_ROOT, MapTermGraph, sparcTermGraph} from '../knowledge'
import {DiGraph} from '../knowledge/graphs'

import {Dataset} from './acluster'

//==============================================================================

type DatasetMarker = {
    term: string
    datasetId: string
    minZoom: number
    maxZoom: number
}

//==============================================================================

const MIN_ZOOM =  2
const MAX_ZOOM = 12

//==============================================================================

export class DatasetMarkerSet
{
    #connectedTermGraph: DiGraph
    #datasetId: string
    #mapTermGraph: MapTermGraph
    #markers: Map<string, DatasetMarker>
    #maxDepth: number

    constructor(dataset: Dataset, mapTermGraph: MapTermGraph)
    {
        this.#datasetId = dataset.id
        this.#mapTermGraph = mapTermGraph
        this.#maxDepth = mapTermGraph.maxDepth

        const mapTerms = new Set(this.#validatedTerms(dataset.terms))
        this.#connectedTermGraph = mapTermGraph.connectedTermGraph([...mapTerms.values()])

        this.#markers = new Map(this.#connectedTermGraph.nodes().map(term => {
            const d = mapTermGraph.depth(term)
            const zoomRange = this.#depthToZoomRange(d)
            return [ term, {
                datasetId: this.#datasetId,
                term,
                minZoom: zoomRange[0],
                maxZoom: zoomRange[1]
            }]
        }))
        for (const terminal of this.#connectedTermGraph.nodes()
                                                       .filter(term => term !== ANATOMICAL_ROOT
                                                            && this.#connectedTermGraph.degree(term) == 1)) {
            const marker = this.#markers.get(terminal)
            marker.maxZoom = MAX_ZOOM
            this.#setZoomFromParents(marker)
        }
    }

    get id(): string
    //==============
    {
        return this.#datasetId
    }

    get markers(): DatasetMarker[]
    //============================
    {
        return [...this.#markers.values()]
    }

    #depthToZoomRange(depth: number): [number, number]
    //================================================
    {
        const zoom = MIN_ZOOM + Math.floor((MAX_ZOOM - MIN_ZOOM)*depth/this.#maxDepth)
        return (zoom < 0)         ? [0, 1]
             : (zoom >= MAX_ZOOM) ? [MAX_ZOOM, MAX_ZOOM]
             :                      [zoom, zoom+1]
    }

    #setZoomFromParents(marker: DatasetMarker)
    //========================================
    {
        if (marker.term === ANATOMICAL_ROOT) {
            marker.minZoom = 0
            return
        }
        for (const parent of this.#connectedTermGraph.parents(marker.term)) {
            const parentMarker = this.#markers.get(parent)
            if (parentMarker.maxZoom < marker.minZoom) {
                parentMarker.maxZoom = marker.minZoom
            }
            this.#setZoomFromParents(parentMarker)
        }
    }

    #substituteTerm(term: string): string|null
    //========================================
    {
        const parents = sparcTermGraph.parents(term)
        if (parents.length == 0
         || parents[0] === ANATOMICAL_ROOT) {
            return null
        }
        let max_depth = -1
        let furthest_parent = null
        for (const parent of parents) {
            const depth = this.#mapTermGraph.depth(parent)
            if (depth > max_depth) {
                furthest_parent = parent
            }
        }
        return furthest_parent
                ? furthest_parent
                : this.#substituteTerm(parents[0])
    }

    #validatedTerms(terms: string[]): string[]
    //========================================
    {
        const mapTerms = []
        for (let term of terms) {
            term = term.trim()
            if (term === '') {
                continue
            } else if (this.#mapTermGraph.hasTerm(term)) {
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
