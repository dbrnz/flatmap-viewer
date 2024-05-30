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

import {DiGraph} from './graphs'

//==============================================================================

const UBERON_SOURCE_URL = 'http://localhost:8000/knowledge/ontology/uberon-basic.json'

//==============================================================================

const UBERON_PREFIX = 'UBERON:'

const IS_A = 'is_a'
const PART_OF = 'BFO:0000050'

const MULTICELLULAR_ORGANISM = 'UBERON:0000468'

const ANATOMY_ROOT = MULTICELLULAR_ORGANISM

//==============================================================================

type NormalisedUri = string

//==============================================================================

const NAMESPACES = [
    [UBERON_PREFIX, 'http://purl.obolibrary.org/obo/UBERON_'],
    ['BFO:',        'http://purl.obolibrary.org/obo/BFO_'],
]

export function normalisedUri(uri: string): NormalisedUri
//=======================================================
{
    if (uri.startsWith('http:') || uri.startsWith('https:')) {
        for (const namespace of NAMESPACES) {
            if (uri.startsWith(namespace[1])) {
                const colon = namespace[0].endsWith(':') ? '' : ':'
                return `${namespace[0]}${colon}${uri.slice(namespace[1].length)}`
            }
        }
    }
    return uri
}

export function isUberon(uri: NormalisedUri): boolean
//===================================================
{
    return uri.startsWith(UBERON_PREFIX)
}

//==============================================================================

export interface NodeObject
{
    id: string
    lbl?: string
}

export interface EdgeObject
{
    sub: string
    pred: string
    obj: string
    meta?: Object
}

export interface NodeGraph {
    nodes: NodeObject[]
    edges: EdgeObject[]
}

//==============================================================================

export class Triple
{
    #subject: NormalisedUri
    #predicate: NormalisedUri
    #object: NormalisedUri
    #metadata: Object|undefined

    constructor(edge: EdgeObject)
    {
        this.#subject = normalisedUri(edge.sub)
        this.#predicate = normalisedUri(edge.pred)
        this.#object = normalisedUri(edge.obj)
        this.#metadata = edge.meta
    }

    get asString(): string
    {
        return `<${this.s}, ${this.p}, ${this.o}>`
    }

    get s(): NormalisedUri
    {
        return this.#subject
    }

    get p(): NormalisedUri
    {
        return this.#predicate
    }

    get o(): NormalisedUri
    {
        return this.#object
    }

    get metadata(): Object|undefined
    {
        return this.#metadata
    }
}

//==============================================================================

class UberonHierarchy
{
    static #instance: UberonHierarchy|null = null
    #graph: DiGraph = new DiGraph()

    constructor(uberon: NodeGraph)
    {
        if (UberonHierarchy.#instance) {
            throw new Error('Use UberonHierarchy.instance() instead of `new`')
        }
        UberonHierarchy.#instance = this

        for (const node of uberon.nodes) {
            const uri = normalisedUri(node.id)
            if (isUberon(uri)) {
                this.#graph.addNode(uri, {
                    label: node.lbl || uri
                })
            }
        }
        for (const edge of uberon.edges) {
            const triple = new Triple(edge)
            if (triple.p === PART_OF || triple.p === IS_A) {
                if (isUberon(triple.s) && isUberon(triple.o)) {
                    this.#graph.mergeEdge(triple.s, triple.o)
                }
            }
        }
    }

    static instance(uberon: NodeGraph)
    {
        return UberonHierarchy.#instance ?? (UberonHierarchy.#instance = new UberonHierarchy(uberon))
    }

    get anatomicalRoot()
    {
        return ANATOMY_ROOT
    }

    children(term: NormalisedUri): NormalisedUri[]
    //============================================
    {
        return this.#graph.children(term)
    }

    label(term: NormalisedUri): string
    //================================
    {
        return this.#graph.getNodeAttribute(term, 'label')
    }

    parents(term: NormalisedUri): NormalisedUri[]
    //===========================================
    {
        return this.#graph.parents(term)
    }

    pathToRoot(term: NormalisedUri): NormalisedUri[]
    //==============================================
    {
        return this.shortestPath(term, ANATOMY_ROOT)
    }

    shortestPath(source: NormalisedUri, target: NormalisedUri): NormalisedUri[]
    //=========================================================================
    {
        return this.#graph.shortestPath(source, target)
    }
}

//==============================================================================

const uberonBasic = (await (await fetch(UBERON_SOURCE_URL)).json()).graphs[0]

export const uberon = UberonHierarchy.instance(uberonBasic)

console.log('Loaded Uberon ontology...')

//==============================================================================
