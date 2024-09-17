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

import {StyleFilterValue} from '../filters'
import {UNCLASSIFIED_TAXON_ID} from '../flatmap-viewer'
import {Facet, FilteredFacet} from '../layers/facets'

//==============================================================================

export class TaxonFacet implements FilteredFacet
{
    #facet: Facet

    constructor(taxonIds: string[])
    {
        this.#facet = new Facet('taxons', taxonIds.map(id => { return { id }}))
    }

    enable(enabledIds: string[], enable: boolean=true)
    //================================================
    {
        enabledIds.forEach(id => this.#facet.enable(id, enable))
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
        const enabledIds = this.#facet.enabledStates
        if (enabledIds.length) {
            const filter: StyleFilterValue = ['any']
            for (const taxon of enabledIds) {
                if (taxon !== UNCLASSIFIED_TAXON_ID) {
                    filter.push(['in', taxon, ['get', 'taxons']])
                } else {
                    filter.push(['case', ['has', 'taxons'], false, true])
                }
            }
            return filter
        } else {
            return false
        }
    }
}

//==============================================================================
