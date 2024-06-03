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

const MAX_ZOOM = 12

function depthToZoomRange(depth: number): [number, number]
{
    return (depth < 0)         ? [0, 1]
         : (depth >= MAX_ZOOM) ? [MAX_ZOOM, MAX_ZOOM]
         :                       [depth, depth+1]
}

//==============================================================================

export class DatasetMarkerSet
{
    #connectedTermGraph: DiGraph
    #datasetId: string
    #mapTermGraph: MapTermGraph
    #markers: Map<string, DatasetMarker>

    constructor(dataset: Dataset, mapTermGraph: MapTermGraph)
    {
        this.#datasetId = dataset.id
        this.#mapTermGraph = mapTermGraph

        const mapTerms = new Set(this.#validatedTerms(dataset.terms))
        mapTerms.add(ANATOMICAL_ROOT)

        this.#connectedTermGraph = mapTermGraph.connectedTermGraph([...mapTerms.values()])

        this.#markers = new Map(this.#connectedTermGraph.nodes().map(term => {
            const d = mapTermGraph.depth(term)
            const zoomRange = depthToZoomRange(d)
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
        this.#markers.delete(ANATOMICAL_ROOT)
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
        if (marker.term === ANATOMICAL_ROOT) {
            return
        }
        for (const parent of this.#connectedTermGraph.parents(marker.term)) {
            const parentMarker = this.#markers.get(parent)
            if (parentMarker.maxZoom < marker.minZoom) {
                parentMarker.maxZoom = marker.minZoom
            }
            if (parent === ANATOMICAL_ROOT) {
                marker.minZoom = 0
            } else {
                this.#setZoomFromParents(parentMarker)
            }
        }
    }

    #substituteTerm(term: string): string|null
    //========================================
    {
        const parents = sparcTermGraph.parents(term)
        if (parents[0] === ANATOMICAL_ROOT) {
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
