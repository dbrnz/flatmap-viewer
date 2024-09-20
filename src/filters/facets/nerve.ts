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

import {PropertiesFilter} from '..'
import {NerveCentrelineDetails} from '../../pathways'
import {Facet, FilteredFacet} from '.'

//==============================================================================

export class NerveCentreFacet extends FilteredFacet
{
    constructor(nerveDetails: NerveCentrelineDetails[])
    {
        super(new Facet('nerves', nerveDetails.map(n => {
            return {
                id: n.models,
                label: n.label
            }
        })))
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
