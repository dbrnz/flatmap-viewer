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
    constructor(flatmap, ui, enabled=true)
    {
        this.__ui = ui;
        this.__systems = new Map();
        this.__enabledChildren = new Map();
        for (const [id, ann] of flatmap.annotations) {
            if (ann['fc-class'] === 'fc-class:System') {
                if (this.__systems.has(ann.name)) {
                    this.__systems.get(ann.name).featureIds.push(ann.featureId)
                } else {
                    this.__systems.set(ann.name, {
                        id: ann.name.replaceAll(' ', '_'),
                        colour: ann.colour,
                        featureIds: [ ann.featureId ],
                        enabled: enabled
                    });
                }
                for (const childId of ann['children']) {
                    if (enabled) {
                        const enabledCount = (this.__enabledChildren.has(childId))
                                           ? this.__enabledChildren.get(childId)
                                           : 0;
                        this.__enabledChildren.set(childId, enabledCount + 1);
                    } else {
                        this.__enabledChildren.set(childId, 0);
                    }
                }
            }
        }
    }

    get systems()
    //===========
    {
        const systems = [];
        for (const [name, system] of this.__systems.entries()) {
            systems.push({
                name: name,
                id: system.id,
                colour: system.colour,
                enabled: system.enabled
            });
        }
        return systems;
    }

    enable(systemName, enable=true)
    //=============================
    {
        const system = this.__systems.get(systemName);
        if (system !== undefined && enable !== system.enabled) {
            for (const featureId of system.featureIds) {
                const feature = this.__ui.mapFeature(featureId);
                if (feature !== undefined) {
                    this.__ui.enableFeature(feature, enable);
                    for (const childFeatureId of feature.children) {
                        const enabledCount = this.__enabledChildren.get(childFeatureId);
                        if (enable && enabledCount === 0 || !enable && enabledCount == 1) {
                            this.__ui.enableFeatureWithChildren(childFeatureId, enable);
                        }
                        this.__enabledChildren.set(childFeatureId, enabledCount + (enable ? 1 : -1));
                    }
                }
            }
            system.enabled = enable;
        }
    }
}

//==============================================================================
