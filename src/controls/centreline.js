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

export class CentrelineControl
{
    #button
    #checkedCount
    #container
    #flatmap
    #halfCount
    #legend
    #map
    #nerves
    #ui

    constructor(flatmap, ui)
    {
        this.#flatmap = flatmap
        this.#map = undefined
        this.#ui = ui
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
        this.#container.id = 'centreline-nerve-ctrl'
        this.#container.className = 'maplibregl-ctrl'

        this.#legend = document.createElement('div')
        this.#legend.id = 'centreline-key-text'
        this.#legend.className = 'flatmap-nerve-grid centreline-nerve-grid'
        this.#nerves = this.#ui.getNerveDetails().map(nerve => {
            return Object.assign({}, nerve, {label: nerve.label || nerve.id})
        }).sort((a, b) => a.label.localeCompare(b.label))

        const innerHTML = []
        innerHTML.push(`<label for="centreline-all-centrelines">ALL NERVES:</label></div><input id="centreline-all-centrelines" type="checkbox"/>`)
        for (const centreline of this.#nerves) {
            innerHTML.push(`<label for="centreline-${centreline.id}">${centreline.label}</label></div><input id="centreline-${centreline.id}" type="checkbox"/>`)
        }
        this.#legend.innerHTML = innerHTML.join('\n')
        this.#checkedCount = 0
        this.#halfCount = Math.trunc(this.#nerves.length/2)

        this.#button = document.createElement('button')
        this.#button.id = 'centreline-key-button'
        this.#button.className = 'control-button text-button'
        this.#button.setAttribute('type', 'button')
        this.#button.setAttribute('aria-label', 'Nerve centrelines legend')
        this.#button.setAttribute('control-visible', 'false')
        this.#button.textContent = 'NERVES'
        this.#button.title = 'Show/hide nerve centrelines'
        this.#container.appendChild(this.#button)

        this.#container.addEventListener('click', this.onClick_.bind(this))
        return this.#container
    }

    onRemove()
    //========
    {
        this.#container.parentNode.removeChild(this.#container)
        this.#map = undefined
    }

    onClick_(event)
    //=============
    {
        if (event.target.id === 'centreline-key-button') {
            if (this.#button.getAttribute('control-visible') === 'false') {
                this.#container.appendChild(this.#legend)
                this.#button.setAttribute('control-visible', 'true')
                const allCentrelinesCheckbox = document.getElementById('centreline-all-centrelines')
                allCentrelinesCheckbox.indeterminate = this.#checkedCount < this.#nerves.length
                                                    && this.#checkedCount > 0
                this.#legend.focus()
            } else {
                this.#legend = this.#container.removeChild(this.#legend)
                this.#button.setAttribute('control-visible', 'false')
            }
        } else if (event.target.tagName === 'INPUT') {
            if (event.target.id === 'centreline-all-centrelines') {
                if (event.target.indeterminate) {
                    event.target.checked = (this.#checkedCount >= this.#halfCount)
                    event.target.indeterminate = false
                }
                if (event.target.checked) {
                    this.#checkedCount = this.#nerves.length
                } else {
                    this.#checkedCount = 0
                }
                for (const centreline of this.#nerves) {
                    const centrelineCheckbox = document.getElementById(`centreline-${centreline.id}`)
                    if (centrelineCheckbox) {
                        centrelineCheckbox.checked = event.target.checked
                        this.#flatmap.enableNeuronPathsByNerve(centreline.id, event.target.checked)
                    }
                }
            } else if (event.target.id.startsWith('centreline-')) {
                const centrelineId = event.target.id.substring(11)
                this.#flatmap.enableNeuronPathsByNerve(centrelineId, event.target.checked)
                if (event.target.checked) {
                    this.#checkedCount += 1
                } else {
                    this.#checkedCount -= 1
                }
                const allCentrelinesCheckbox = document.getElementById('centreline-all-centrelines')
                if (this.#checkedCount === 0) {
                    allCentrelinesCheckbox.checked = false
                    allCentrelinesCheckbox.indeterminate = false
                } else if (this.#checkedCount === this.#nerves.length) {
                    allCentrelinesCheckbox.checked = true
                    allCentrelinesCheckbox.indeterminate = false
                } else {
                    allCentrelinesCheckbox.indeterminate = true
                }
            }
        }
        event.stopPropagation()
    }
}

//==============================================================================
