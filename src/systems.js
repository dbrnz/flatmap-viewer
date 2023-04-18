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

export class SystemsManager
{
    constructor(flatmap)
    {
        this.__systems = new Map();
//        const UNKNOWN_FEATURES = 'UNKNOWN FEATURES...';
        for (const [id, ann] of flatmap.annotations) {
            if (ann['fc-class'] === 'fc-class:System') {
                if (this.__systems.has(ann.name)) {
                    this.__systems.get(ann.name).featureIds.push(ann.featureId)
                } else {
                    this.__systems.set(ann.name, {
                        id: ann.name.replaceAll(' ', '_'),
                        colour: ann.colour,
                        featureIds: [ ann.featureId ]
                    });
                }
            }
/*
             else if (ann['fc-class'] === 'fc-class:Unknown') {
console.log(ann);
                if (this.__systems.has(UNKNOWN_FEATURES)) {
                    this.__systems.get(UNKNOWN_FEATURES).featureIds.push(ann.featureId)
                } else {
                    this.__systems.set(UNKNOWN_FEATURES, {
                        id: UNKNOWN_FEATURES.replaceAll(' ', '_'),
                        colour: COLOUR_ERROR,
                        featureIds: [ ann.featureId ]
                    });
                }
            }  */
        }
    }

    get systems()
    {
        return this.__systems;
    }
}

//==============================================================================
