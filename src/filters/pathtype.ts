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

import {PathType} from '../pathways'

import {StyleFilterValue} from '.'
import {Facet, FilteredFacet} from './facets'

//==============================================================================

export class PathTypeFacet implements FilteredFacet
{
    #facet: Facet

    constructor(pathTypes: PathType[])
    {
        this.#facet = new Facet('pathtypes', pathTypes.map(pt => {
            return {
                id: pt.type,
                label: pt.label,
                enabled: 'enabled' in pt ? pt.enabled : true,
                properties: {
                    colour: pt.colour,
                    dashed: pt.dashed || false
                }
            }
        }))
    }

    enable(pathTypes: string[], enable: boolean=true)
    //===============================================
    {
        pathTypes.forEach(pt => this.#facet.enable(pt, enable))
    }

    getFilter(): Record<string, StyleFilterValue>
    //===========================================
    {
        const result = {}
        result[this.#facet.id] = [this.#makeFilter()]
        return result
    }

    #makeFilter(): StyleFilterValue
    //=============================
    {
        const enabledTypes = this.#facet.enabledStates
        if (enabledTypes.length) {
            const filter: StyleFilterValue = ['any']
            for (const pathType of enabledTypes) {
                filter.push(['==', ['get', 'kind'], pathType])
            }
            return filter
        } else {
            return false
        }
    }
}

//==============================================================================
