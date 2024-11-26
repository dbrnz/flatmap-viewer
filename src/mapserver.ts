/*==============================================================================

Flatmap viewer and annotation tool

Copyright (c) 2019 - 2024 David Brooks

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

export const KNOWLEDGE_SOURCE_SCHEMA = 1.3

//==============================================================================

type SchemaRecord = {
    version: number
}

type SourcesRecord = {
    sources: string[]
}

//==============================================================================

export class MapServer
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
            const schemaVersion = await this.loadJSON<SchemaRecord>('knowledge/schema-version')
            if (schemaVersion === undefined) {
                return
            }
            if ('version' in schemaVersion) {
                this.#knowledgeSchema = +schemaVersion.version
            }
            const knowledgeSources = await this.loadJSON<SourcesRecord>('knowledge/sources')
            if (knowledgeSources && 'sources' in knowledgeSources) {
                this.#knowledgeSources = knowledgeSources.sources
                if (this.#knowledgeSources.length) {
                    this.#latestSource = this.#knowledgeSources[0]
                }
            }
        } catch {}
    }

    url(relativePath: string='')
    //==========================
    {
        const url = new URL(relativePath, this.#url);
        return url.href
    }

    async loadJSON<T>(relativePath: string, missingOK: boolean=false): Promise<T|null>
    //================================================================================
    {
        const url = this.url(relativePath)
        try {
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
        } catch (e) {
            throw e
        }
    }

    async queryKnowledge(sql: string, params: string[]=[]): Promise<any[]>
    //====================================================================
    {
        const url = this.url('knowledge/query/')
        const query = { sql, params }
        try {
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
        } catch (e) {
            throw e
        }
    }
}

//==============================================================================
