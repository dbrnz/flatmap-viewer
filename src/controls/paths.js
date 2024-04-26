/*==============================================================================

Flatmap viewer and annotation tool

Copyright (c) 2019 - 2023 David Brooks

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

export class PathControl
{
    constructor(flatmap, pathTypes)
    {
        this._flatmap = flatmap;
        this._map = undefined;
        this.__pathTypes = pathTypes;
    }

    getDefaultPosition()
    //==================
    {
        return 'top-right';
    }

    onAdd(map)
    //========
    {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'maplibregl-ctrl';
        this._container.id = 'flatmap-nerve-key';

        this._legend = document.createElement('div');
        this._legend.id = 'nerve-key-text';
        this._legend.className = 'flatmap-nerve-grid';

        const innerHTML = [];
        innerHTML.push(`<label for="path-all-paths">ALL PATHS:</label><div class="nerve-line"></div><input id="path-all-paths" type="checkbox" checked/>`);
        this.__checkedCount = 0;
        for (const path of this.__pathTypes) {
            const checked =  !('enabled' in path) || path.enabled ? 'checked' : '';
            if (checked != '') {
                this.__checkedCount += 1;
            }
            const colour = path.colour || '#440';
            const style = path.dashed ? `background: repeating-linear-gradient(to right,${colour} 0,${colour} 6px,transparent 6px,transparent 9px);`
                                      : `background: ${colour};`;

            innerHTML.push(`<label for="path-${path.type}">${path.label}</label><div class="nerve-line" style="${style}"></div><input id="path-${path.type}" type="checkbox" ${checked}/>`);
        }
        this._legend.innerHTML = innerHTML.join('\n');
        this.__halfCount = Math.trunc(this.__pathTypes.length/2);

        this._button = document.createElement('button');
        this._button.id = 'nerve-key-button';
        this._button.className = 'control-button text-button';
        this._button.setAttribute('type', 'button');
        this._button.setAttribute('aria-label', 'Nerve paths legend');
        this._button.setAttribute('control-visible', 'false');
        this._button.textContent = 'PATHS';
        this._button.title = 'Show/hide neuron paths';
        this._container.appendChild(this._button);

        this._container.addEventListener('click', this.onClick_.bind(this));
        return this._container;
    }

    onRemove()
    //========
    {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }

    onClick_(event)
    //=============
    {
        if (event.target.id === 'nerve-key-button') {
            if (this._button.getAttribute('control-visible') === 'false') {
                this._container.appendChild(this._legend);
                this._button.setAttribute('control-visible', 'true');
                const allPathsCheckbox = document.getElementById('path-all-paths');
                allPathsCheckbox.indeterminate = this.__checkedCount < this.__pathTypes.length
                                              && this.__checkedCount > 0;
                this._legend.focus();
            } else {
                this._legend = this._container.removeChild(this._legend);
                this._button.setAttribute('control-visible', 'false');
            }
        } else if (event.target.tagName === 'INPUT') {
            if (event.target.id === 'path-all-paths') {
                if (event.target.indeterminate) {
                    event.target.checked = (this.__checkedCount >= this.__halfCount);
                    event.target.indeterminate = false;
                }
                if (event.target.checked) {
                    this.__checkedCount = this.__pathTypes.length;
                } else {
                    this.__checkedCount = 0;
                }
                for (const path of this.__pathTypes) {
                    const pathCheckbox = document.getElementById(`path-${path.type}`);
                    if (pathCheckbox) {
                        pathCheckbox.checked = event.target.checked;
                        this._flatmap.enablePath(path.type, event.target.checked);
                    }
                }
            } else if (event.target.id.startsWith('path-')) {
                const pathType = event.target.id.substring(5);
                this._flatmap.enablePath(pathType, event.target.checked);
                if (event.target.checked) {
                    this.__checkedCount += 1;
                } else {
                    this.__checkedCount -= 1;
                }
                const allPathsCheckbox = document.getElementById('path-all-paths');
                if (this.__checkedCount === 0) {
                    allPathsCheckbox.checked = false;
                    allPathsCheckbox.indeterminate = false;
                } else if (this.__checkedCount === this.__pathTypes.length) {
                    allPathsCheckbox.checked = true;
                    allPathsCheckbox.indeterminate = false;
                } else {
                    allPathsCheckbox.indeterminate = true;
                }
            }
        }
        event.stopPropagation();
    }
}

//==============================================================================
