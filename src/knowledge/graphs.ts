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

import Graph from 'graphology'
import {bidirectional} from 'graphology-shortest-path'
import {subgraph} from 'graphology-operators'

//==============================================================================

// From https://stackoverflow.com/a/65064026

export function pairwise<T>(a: T[]): [T, T]
{
    // @ts-ignore
    return a.flatMap( (x) => {
        return a.flatMap( (y) => {
            return (x !== y) ? [[x, y]] : []
        })
    })
}

//==============================================================================

export class DiGraph extends Graph
{
    constructor()
    {
        super({type: 'directed', allowSelfLoops: false})
    }

    static fromGraph(data: Object): DiGraph
    //=====================================
    {
        const instance = new DiGraph()
        instance.import(data)
        return instance
    }

    children(term: string): string[]
    //==============================
    {
        return this.inEdges(term)
                   .map(edge => this.opposite(term, edge))
    }

    connectedSubgraph(nodes: string[]): DiGraph
    //=========================================
    {
        const connectedNodes: Set<string> = new Set()
        for (const [source, target] of pairwise(nodes)) {
            const path = bidirectional(this, source, target)
            if (path && path.length) {
                for (const node of path) {
                    connectedNodes.add(node)
                }
            }
        }
        return DiGraph.fromGraph(subgraph(this, connectedNodes))
    }

    parents(term: string): string[]
    //=============================
    {
        return this.outEdges(term)
                   .map(edge => this.opposite(term, edge))
    }

    shortestPath(source: string, target: string): string[]
    //====================================================
    {
        return bidirectional(this, source, target) || []
    }
}

//==============================================================================
