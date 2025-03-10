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

import {PropertiesFilter} from '..'
import {Facet, FilteredFacet} from '.'

//==============================================================================

export class DetailsFilter extends FilteredFacet
{
    #detailsLayerId: string

    constructor(detailsLayerId: string)
    {
        super(new Facet(`$detailsLayerId}-details-facet`, [{id: detailsLayerId}]))
        this.#detailsLayerId = detailsLayerId
    }

    makeFilter(): PropertiesFilter
    //============================
    {
        return new PropertiesFilter({
            'OR': [
                { 'layer': this.#detailsLayerId},
                { 'AND': [
                    { 'HAS': 'associated-details' },
                    { 'IN': [this.#detailsLayerId, 'associated-details'] }
                ]}
            ]
        })
    }
}

//==============================================================================
