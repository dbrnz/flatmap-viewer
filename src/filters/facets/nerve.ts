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

import {CentrelineDetails} from '../../pathways'
import {PropertiesFilter} from '..'
import {Facet, FilteredFacet} from '.'

//==============================================================================

export class NerveCentreFacet implements FilteredFacet
{
    #facet: Facet

    constructor(centrelines: CentrelineDetails[])
    {
        this.#facet = new Facet('nerves', centrelines.map(cl => {
            return {
                id: cl.id,
                label: cl.label || cl.id,
                properties: {
                    models: cl.models
                }
            }
        }))
    }

    get id()
    //======
    {
        return this.#facet.id
    }

    enable(nerveIds: string[], enable: boolean=true)
    //===============================================
    {
        nerveIds.forEach(pt => this.#facet.enable(pt, enable))
    }

    makeFilter(): PropertiesFilter
    //============================
    {
        const nerveCondition = this.#facet.enabledStates.map(
            nerve => { return {'IN': [nerve, 'nerves']} }
        )
        return new PropertiesFilter(nerveCondition.length
          ? { OR: [{'NOT': {'HAS': 'nerves'}}, ...nerveCondition] }
          : (this.#facet.size === 0))
    }
}

//==============================================================================
