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

import {DiGraph} from '../knowledge/graphs'
import {isUberon, normalisedUri, uberon} from '../knowledge/uberon'

import {FlatMap} from '../flatmap-viewer'


//==============================================================================

// From https://stackoverflow.com/a/65064026

function pairs<T>(a: T[]): [T, T]
{
    // @ts-ignore
    return a.flatMap( (x) => {
        return a.flatMap( (y) => {
            return (x !== y) ? [[x, y]] : []
        })
    })
}

//==============================================================================

export interface DatasetTerms
{
    datasetId: string
    terms: string[]
}

//==============================================================================

class DatasetMarkers
{
    #datasetId: string
    #mapTermGraph: MapTermGraph

    constructor(datasetTerms: DatasetTerms, mapTermGraph: MapTermGraph)
    {
        this.#datasetId = datasetTerms.datasetId
        this.#mapTermGraph = mapTermGraph

        const mapTerms = new Set(this.#validatedTerms(datasetTerms.terms))
    }

    #substituteTerm(term: string): string|null
    //========================================
    {
        const parents = uberon.parents(term)
        if (parents[0] === uberon.anatomicalRoot) {
            return null
        }
        for (const parent of parents) {
            if (this.#mapTermGraph.hasNode(parent)) {
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
            if (this.#mapTermGraph.hasNode(term)) {
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
            this.#hierarchy.addNode(term, {
                label: uberon.label(term),
                distance: uberon.pathToRoot(term).length - 1
            })
        }

        // Find the shortest path between each pair of Uberon terms used in the flatmap
        // and, if a path exists, add an edge to the hierarchy graph

        for (const [source, target] of pairs(this.#hierarchy.nodes())) {
            const path = uberon.shortestPath(source, target)
            if (path && path.length) {
                this.#hierarchy.addEdge(source, target, {
                    parentDistance: path.length - 1
                })
            }
        }
        console.log(`Map hierarchical terms: ${this.#hierarchy.order}, Edges: ${this.#hierarchy.size}`)

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

        console.log(`--> hierarchical terms: ${this.#hierarchy.order}, Edges: ${this.#hierarchy.size}`)
    }

    children(term: string): string[]
    //==============================
    {
        return this.#hierarchy.inEdges(term)
                              .map(edge => this.#hierarchy.opposite(term, edge))
    }

    hasNode(term: string): boolean
    //============================
    {
        return this.#hierarchy.hasNode(term)
    }

    level(term: string): number
    //=========================
    {
        return this.#hierarchy.getNodeAttribute(term, 'distance') as number
    }

    parents(term: string): string[]
    //=============================
    {
        return this.#hierarchy.outEdges(term)
                              .map(edge => this.#hierarchy.opposite(term, edge))
    }

    clearMarkers()
    {

    }

    addDatasetMarkers(datasetTermsList: DatasetTerms[])
    {

    }
}

//==============================================================================
