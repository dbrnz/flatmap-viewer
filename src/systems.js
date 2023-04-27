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
    constructor(flatmap, ui, enabled=false)
    {
        this.__ui = ui;
        this.__systems = new Map();
        this.__enabledChildren = new Map();
        for (const [id, ann] of flatmap.annotations) {
            if (ann['fc-class'] === 'fc-class:System') {
                const systemId = ann.name.replaceAll(' ', '_');
                if (this.__systems.has(systemId)) {
                    this.__systems.get(systemId).featureIds.push(ann.featureId)
                } else {
                    this.__systems.set(systemId, {
                        name: ann.name,
                        colour: ann.colour,
                        featureIds: [ ann.featureId ],
                        enabled: false,
                        pathIds: ('path-ids' in ann) ? ann['path-ids'] : []
                    });
                this.__ui.enableFeature(ann.featureId, false);
                }
                for (const childId of ann['children']) {
                    this.__enabledChildren.set(childId, 0);
                    this.__ui.enableFeatureWithChildren(childId, false);
                }
            }
        }
        if (enabled) {
            for (const system of this.__systems.values()) {
                this.__enableSystem(system, true);
            }
        }
    }

    get systems()
    //===========
    {
        const systems = [];
        for (const [systemId, system] of this.__systems.entries()) {
            systems.push({
                id: systemId,
                name: system.name,
                colour: system.colour,
                enabled: system.enabled
            });
        }
        return systems;
    }

    enable(systemId, enable=true)
    //===========================
    {
        const system = this.__systems.get(systemId);
        if (system !== undefined && enable !== system.enabled) {
            this.__enableSystem(system, enable);
        }
    }

    __enableSystem(system, enable=true)
    //=================================
    {
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

        // Enable/disable all paths associated with the system
        this.__ui.enablePathsBySystem(system, enable);

        // Save system state
        system.enabled = enable;
    }

    systemEnabled(systemId)
    //=====================
    {
        const system = this.__systems.get(systemId);
        return (system !== undefined && system.enabled);
    }
}

//==============================================================================
