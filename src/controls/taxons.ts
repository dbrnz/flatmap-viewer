/*==============================================================================

Flatmap viewer and annotation tool

Copyright (c) 2019 - 2023  David Brooks

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

import { Control } from './controls'

//==============================================================================

export class TaxonsControl extends Control
{
    #taxons = new Map()

    constructor(flatmap)
    {
        super(flatmap, 'taxon', 'taxons')
        for (const taxonId of flatmap.taxonIdentifiers) {
            this.#taxons.set(taxonId, this.__flatmap.taxonName(taxonId))
        }
    }

    _addControlDetails()
    //==================
    {
        let lines = 0
        let enabled = 0
        // Sort into name order
        const nameOrder = new Map([...this.#taxons]
                            .sort((a, b) => Intl.Collator().compare(a[1], b[1])))
        for (const [id, name] of nameOrder) {
            const input = this._addControlLine(`${this.__prefix}${id}`, `${name}`);
            input.checked = true
            enabled += 1
            lines += 1
        }
        return {
            enabled: enabled,
            total: lines
        }
    }

    _enableAll(enable)
    //================
    {
        for (const taxonId of this.#taxons.keys()) {
            const checkbox = document.getElementById(`${this.__prefix}${taxonId}`)
            if (checkbox) {
                checkbox.checked = enable;
            }
        }
        this.__flatmap.enableConnectivityByTaxonIds([...this.#taxons.keys()], enable)
    }

    __enableControl(id, enable)
    //=========================
    {
        for (const taxonId of this.#taxons.keys()) {
            if (id === taxonId) {
                this.__flatmap.enableConnectivityByTaxonIds(taxonId, enable)
            }
        }
    }

}
