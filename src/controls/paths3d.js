/******************************************************************************

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

******************************************************************************/

export class Path3DControl
{
    #button
    #container
    #map = null
    #flatmap

    constructor(flatmap)
    {
        this.#flatmap = flatmap
    }

    getDefaultPosition()
    //==================
    {
        return 'top-right'
    }

    onAdd(map)
    //========
    {
        this.#map = map
        this.#container = document.createElement('div')
        this.#container.className = 'maplibregl-ctrl'
        this.#button = document.createElement('button')
        this.#button.className = 'control-button text-button'
        this.#button.setAttribute('type', 'button')
        this.#button.setAttribute('aria-label', 'Show 3D paths')
        this.#button.textContent = '3D'
        this.#button.title = 'Show/hide 3D paths'
        this.#container.appendChild(this.#button)
        this.#container.addEventListener('click', this.onClick.bind(this))
        return this.#container
    }

    onRemove()
    //========
    {
        this.#container.parentNode.removeChild(this.#container)
        this.#map = undefined
    }

    onClick(_event)
    //=============
    {
        if (this.#button.classList.contains('control-active')) {
            this.#flatmap.enable3dPaths(false)
            this.#button.classList.remove('control-active')
        } else {
            this.#flatmap.enable3dPaths(true)
            this.#button.classList.add('control-active')
        }
    }
}

//==============================================================================
