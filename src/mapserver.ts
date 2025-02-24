/*==============================================================================

Flatmap viewer and annotation tool

Copyright (c) 2019 - 2025 David Brooks

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

import {
    FlatMapServerIndex,
    FlatMapIndex,
    FlatMapLayer,
    FlatMapMetadata,
    FlatMapPathways
} from './flatmap-types'
import type {FlatMapAnnotations} from './flatmap-types'
import type {FlatMapStyleSpecification} from './flatmap-viewer'

import {NodeLinkGraph} from './knowledge/graphs'

//==============================================================================

export const KNOWLEDGE_SOURCE_SCHEMA = 1.3

//==============================================================================

type KnowledgeSchemaRecord = {
    version: number
}

type KnowledgeSourcesRecord = {
    sources: string[]
}

//==============================================================================

export class FlatMapServer
{
    #url: string
    #latestSource: string = ''
    #knowledgeSchema: number = 0
    #knowledgeSources: string[] = []

    constructor(url: string)
    {
        this.#url = url
    }

    get latestSource()
    //================
    {
        return this.#latestSource
    }

    get knowledgeSchema()
    //===================
    {
        return this.#knowledgeSchema
    }

    async initialise()
    //================
    {
        try {
            const schemaVersion = await this.#loadJSON<KnowledgeSchemaRecord>('knowledge/schema-version')
            if (!schemaVersion) {
                return
            }
            if ('version' in schemaVersion) {
                this.#knowledgeSchema = +schemaVersion.version
            }
            const knowledgeSources = await this.#loadJSON<KnowledgeSourcesRecord>('knowledge/sources')
            if (knowledgeSources && 'sources' in knowledgeSources) {
                this.#knowledgeSources = knowledgeSources.sources
                if (this.#knowledgeSources.length) {
                    this.#latestSource = this.#knowledgeSources[0]
                }
            }
        } catch {
            return
        }
    }

    async #loadJSON<T>(relativePath: string, missingOK: boolean=false): Promise<T|null>
    //=================================================================================
    {
        const url = this.url(relativePath)
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                "Accept": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            }
        })
        if (!response.ok) {
            if (missingOK) {
                return null
            }
            throw new Error(`Cannot access ${url}`)
        }
        return await response.json()
    }

    async flatMaps(): Promise<FlatMapServerIndex[]|null>
    //==================================================
    {
        return this.#loadJSON<FlatMapServerIndex[]>('')
    }

    async mapIndex(mapId: string): Promise<FlatMapIndex|null>
    //=======================================================
    {
        return this.#loadJSON<FlatMapIndex>(`flatmap/${mapId}/`)
    }

    async mapLayers(mapId: string): Promise<FlatMapLayer[]|null>
    //==========================================================
    {
        return this.#loadJSON<FlatMapLayer[]>(`flatmap/${mapId}/layers`)
    }

    async mapStyle(mapId: string): Promise<FlatMapStyleSpecification|null>
    //====================================================================
    {
        return this.#loadJSON<FlatMapStyleSpecification>(`flatmap/${mapId}/style`)
    }

    async mapPathways(mapId: string): Promise<FlatMapPathways|null>
    //=============================================================
    {
        return this.#loadJSON<FlatMapPathways>(`flatmap/${mapId}/pathways`)
    }

    async mapAnnotations(mapId: string): Promise<FlatMapAnnotations|null>
    //===================================================================
    {
        return this.#loadJSON<FlatMapAnnotations>(`flatmap/${mapId}/annotations`)
    }

    async mapMetadata(mapId: string): Promise<FlatMapMetadata|null>
    //=============================================================
    {
        return this.#loadJSON<FlatMapMetadata>(`flatmap/${mapId}/metadata`)
    }

    async mapTermGraph(mapId: string): Promise<NodeLinkGraph|null>
    //============================================================
    {
        return this.#loadJSON<NodeLinkGraph>(`flatmap/${mapId}/termgraph`)

    }

    async queryKnowledge(sql: string, params: string[]=[]): Promise<string[]>
    //========================================================================
    {
        const url = this.url('knowledge/query/')
        const query = { sql, params }
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                "Accept": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(query)
        })
        if (!response.ok) {
            throw new Error(`Cannot access ${url}`)
        }
        const data = await response.json()
        if ('error' in data) {
            throw new TypeError(data.error)
        }
        return data.values
    }

    async sparcTermGraph(): Promise<NodeLinkGraph|null>
    //=================================================
    {
        return this.#loadJSON<NodeLinkGraph>('knowledge/sparcterms')
    }

    url(relativePath: string=''): string
    //==================================
    {
        const url = new URL(relativePath, this.#url);
        return url.href
    }
}

//==============================================================================
