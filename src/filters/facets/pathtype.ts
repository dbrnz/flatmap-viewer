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
import {PropertiesFilter, PropertiesFilterExpression} from '..'
import {Facet, FilteredFacet} from '.'

//==============================================================================

export class PathTypeFacet extends FilteredFacet
{
    constructor(pathTypes: PathType[])
    {
        super(new Facet('pathtypes', pathTypes.map(pt => {
            return {
                id: pt.type,
                label: pt.label,
                enabled: 'enabled' in pt ? pt.enabled : true,
                properties: {
                    colour: pt.colour,
                    dashed: pt.dashed || false
                }
            }
        })))
    }

    makeFilter(): PropertiesFilter
    //============================
    {
         const pathCondition: PropertiesFilterExpression[] =
            this.facet.enabledStates.map(
                pathType => { return {kind: pathType} }
            )
        if (pathCondition.length === 0) {
            pathCondition.push(this.facet.size === 0)
        }
        return new PropertiesFilter(
           { OR: [{'NOT': {'HAS': 'kind'}}, ...pathCondition] }
        )
    }
}

//==============================================================================
