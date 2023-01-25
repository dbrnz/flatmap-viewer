/******************************************************************************

Flatmap viewer and annotation tool

Copyright (c) 2019  David Brooks

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

******************************************************************************/

'use strict';

//==============================================================================

import * as pathways from './pathways.js';

//==============================================================================

export class NavigationControl
{
    constructor(flatmap)
    {
        this._flatmap = flatmap;
        this._map = undefined;
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
        this._container.className = 'maplibregl-ctrl navigation-group';
        this._container.innerHTML = `<button id="flatmap-zoom-in" class="navigation-zoom-in" type="button" title="Zoom in" aria-label="Zoom in"></button>
<button id="flatmap-zoom-out" class="navigation-zoom-out" type="button" title="Zoom out" aria-label="Zoom out"></button>
<button id="flatmap-reset" class="navigation-reset" type="button" title="Reset" aria-label="Reset"></button>`;
        this._container.onclick = this.onClick_.bind(this);
        return this._container;
    }

    onRemove()
    //========
    {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }

    onClick_(e)
    //=========
    {
        if        (e.target.id === 'flatmap-zoom-in') {
            this._flatmap.zoomIn();
        } else if (e.target.id === 'flatmap-zoom-out') {
            this._flatmap.zoomOut();
        } else if (e.target.id === 'flatmap-reset') {
            this._flatmap.resetMap();
        }
    }
}

//==============================================================================

export class PathControl
{
    constructor(flatmap)
    {
        this._flatmap = flatmap;
        this._map = undefined;
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
        innerHTML.push(`<label for="path-all-paths">ALL PATHS:</label><input id="path-all-paths" type="checkbox" checked/><div class="nerve-line"></div>`);
        for (const path of pathways.PATH_TYPES) {
            innerHTML.push(`<label for="path-${path.type}">${path.label}</label><input id="path-${path.type}" type="checkbox" checked/><div class="nerve-line nerve-${path.type}"></div>`);
        }
        this._legend.innerHTML = innerHTML.join('\n');
        this.__checkedCount = pathways.PATH_TYPES.length;
        this.__halfCount = Math.trunc(this.__checkedCount/2);

        this._button = document.createElement('button');
        this._button.id = 'nerve-key-button';
        this._button.className = 'control-button';
        this._button.setAttribute('type', 'button');
        this._button.setAttribute('aria-label', 'Nerve paths legend');
        this._button.setAttribute('legend-visible', 'false');
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
            if (this._button.getAttribute('legend-visible') === 'false') {
                this._container.appendChild(this._legend);
                this._button.setAttribute('legend-visible', 'true');
                this._legend.focus();
            } else {
                this._legend = this._container.removeChild(this._legend);
                this._button.setAttribute('legend-visible', 'false');
            }
        } else if (event.target.tagName === 'INPUT') {
            if (event.target.id === 'path-all-paths') {
                if (event.target.indeterminate) {
                    event.target.checked = (this.__checkedCount >= this.__halfCount);
                    event.target.indeterminate = false;
                }
                if (event.target.checked) {
                    this.__checkedCount = pathways.PATH_TYPES.length;
                } else {
                    this.__checkedCount = 0;
                }
                for (const path of pathways.PATH_TYPES) {
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
                } else if (this.__checkedCount === pathways.PATH_TYPES.length) {
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

export class LayerControl
{
    constructor(flatmap, layerManager)
    {
        this.__flatmap = flatmap;
        this.__manager = layerManager;
        this.__map = undefined;
    }

    getDefaultPosition()
    //==================
    {
        return 'top-right';
    }

    onAdd(map)
    //========
    {
        this.__map = map;
        this.__container = document.createElement('div');
        this.__container.className = 'maplibregl-ctrl';
        this.__container.id = 'flatmap-layer-control';

        this.__layers = document.createElement('div');
        this.__layers.id = 'layer-control-text';
        this.__layers.className = 'flatmap-layer-grid';

        const innerHTML = [];
        innerHTML.push(`<label for="layer-all-layers">ALL LAYERS:</label><input id="layer-all-layers" type="checkbox" checked/>`);
        for (const layer of this.__manager.layers) {
            innerHTML.push(`<label for="layer-${layer.id}">${layer.description}</label><input id="layer-${layer.id}" type="checkbox" checked/>`);
        }
        this.__layers.innerHTML = innerHTML.join('\n');

        this.__layersCount = this.__manager.layers.length;
        this.__checkedCount = this.__layersCount;
        this.__halfCount = Math.trunc(this.__checkedCount/2);

        this.__button = document.createElement('button');
        this.__button.id = 'map-layers-button';
        this.__button.className = 'control-button text-button';
        this.__button.setAttribute('type', 'button');
        this.__button.setAttribute('aria-label', 'Show/hide map layers');
        this.__button.setAttribute('control-visible', 'false');
        this.__button.textContent = 'LAYERS';
        this.__button.title = 'Show/hide map layers';
        this.__container.appendChild(this.__button);

        this.__container.addEventListener('click', this.onClick_.bind(this));
        return this.__container;
    }

    onRemove()
    //========
    {
        this.__container.parentNode.removeChild(this.__container);
        this.__map = undefined;
    }

    onClick_(event)
    //=============
    {
        if (event.target.id === 'map-layers-button') {
            if (this.__button.getAttribute('control-visible') === 'false') {
                this.__container.appendChild(this.__layers);
                this.__button.setAttribute('control-visible', 'true');
                this.__layers.focus();
            } else {
                this.__layers = this.__container.removeChild(this.__layers);
                this.__button.setAttribute('control-visible', 'false');
            }
        } else if (event.target.tagName === 'INPUT') {
            if (event.target.id === 'layer-all-layers') {
                if (event.target.indeterminate) {
                    event.target.checked = (this.__checkedCount >= this.__halfCount);
                    event.target.indeterminate = false;
                }
                if (event.target.checked) {
                    this.__checkedCount = this.__layersCount;
                } else {
                    this.__checkedCount = 0;
                }
                for (const layer of this.__manager.layers) {
                    const layerCheckbox = document.getElementById(`layer-${layer.id}`);
                    if (layerCheckbox) {
                        layerCheckbox.checked = event.target.checked;
                        this.__manager.activate(layer.id, event.target.checked);
                    }
                }
            } else if (event.target.id.startsWith('layer-')) {
                const layerId = event.target.id.substring(6);
                this.__manager.activate(layerId, event.target.checked);
                if (event.target.checked) {
                    this.__checkedCount += 1;
                } else {
                    this.__checkedCount -= 1;
                }
                const allLayersCheckbox = document.getElementById('layer-all-layers');
                if (this.__checkedCount === 0) {
                    allLayersCheckbox.checked = false;
                    allLayersCheckbox.indeterminate = false;
                } else if (this.__checkedCount === this.__layersCount) {
                    allLayersCheckbox.checked = true;
                    allLayersCheckbox.indeterminate = false;
                } else {
                    allLayersCheckbox.indeterminate = true;
                }
            }
        }
        event.stopPropagation();
    }
}

//==============================================================================

