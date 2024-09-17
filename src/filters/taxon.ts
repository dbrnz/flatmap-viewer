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

import {UNCLASSIFIED_TAXON_ID} from '../flatmap-viewer'

import {PropertiesFilter} from '.'
import {Facet, FilteredFacet} from './facets'

//==============================================================================

export class TaxonFacet implements FilteredFacet
{
    #facet: Facet

    constructor(taxonIds: string[])
    {
        this.#facet = new Facet('taxons', taxonIds.map(id => { return { id }}))
    }

    get id()
    //======
    {
        return this.#facet.id
    }

    enable(enabledIds: string[], enable: boolean=true)
    //================================================
    {
        enabledIds.forEach(id => this.#facet.enable(id, enable))
    }

    makeFilter(): PropertiesFilter
    //============================
    {
        const enabledIds = this.#facet.enabledStates
        return new PropertiesFilter(enabledIds.length
          ? { OR: enabledIds.map(taxon => {
                    return (taxon !== UNCLASSIFIED_TAXON_ID)
                        ? { 'IN': [taxon, 'taxons'] }
                        : { 'HAS': 'taxons' }
                    }
                )
            }
          : (this.#facet.size === 0))
    }
}

//==============================================================================
