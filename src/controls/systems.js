/******************************************************************************

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

**/
//==============================================================================

import { Control } from './controls';

//==============================================================================

export class SystemsControl extends Control
{
    constructor(flatmap, systems)
    {
        super(flatmap, 'system', 'systems');
        this.__systems = systems;
    }

    __innerLinesHTML()
    //================
    {
        const html = [];
        for (const system of this.__systems) {
            html.push(`<label for="${this.__prefix}${system.id}" style="background: ${system.colour};">${system.name}</label><input id="${this.__prefix}${system.id}" type="checkbox" checked/>`);
        }
        return html;
    }

    __enableAll(enable)
    //=================
    {
        for (const system of this.__systems) {
            const checkbox = document.getElementById(`${this.__prefix}${system.id}`);
            if (checkbox) {
                checkbox.checked = enable;
                this.__flatmap.enableSystem(system.name, enable);
            }
        }
    }

    __enableControl(id, enable)
    //=========================
    {
        for (const system of this.__systems) {
            if (id === system.id) {
                this.__flatmap.enableSystem(system.name, enable);
            }
        }
    }

}
