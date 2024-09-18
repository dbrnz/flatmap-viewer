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

import {PathType} from '../../pathways'
import {PropertiesFilter} from '..'
import {Facet, FilteredFacet} from '.'

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

    get id()
    //======
    {
        return this.#facet.id
    }

    enable(pathTypes: string[], enable: boolean=true)
    //===============================================
    {
        pathTypes.forEach(pt => this.#facet.enable(pt, enable))
    }

    makeFilter(): PropertiesFilter
    //============================
    {
        const enabledTypes = this.#facet.enabledStates
        return new PropertiesFilter(enabledTypes.length
          ? {
                OR: enabledTypes.map(pathType => { return {kind: pathType}})
            }
          : (this.#facet.size === 0))
    }
}

//==============================================================================
