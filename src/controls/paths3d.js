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

import {colord} from 'colord'
import {ArcLayer} from '@deck.gl/layers'
import {MapboxOverlay as DeckOverlay} from '@deck.gl/mapbox'
import {PathStyleExtension} from '@deck.gl/extensions'

//==============================================================================

import {pathColour} from '../pathways'

function pathColourRGB(pathType, alpha=255)
//=========================================
{
    const rgb = colord(pathColour(pathType)).toRgb()
    return [rgb.r, rgb.g, rgb.b, alpha]
}

//==============================================================================

export class Path3DControl
{
    #button
    #container
    #deckOverlay = null
    #map = null
    #pathData
    #pathManager
    #ui

    constructor(flatmap, ui)
    {
        this.#ui = ui
        this.#pathManager = ui.pathManager
        this.#pathManager.addWatcher(this.#pathStateChanged.bind(this))
        this.#pathData = [...flatmap.annotations.values()]
                 .filter(ann => ann['tile-layer'] === 'pathways'
                             && ann['geometry'] === 'LineString'
                             && 'type' in ann && ann['type'].startsWith('line')
                             && 'kind' in ann // && !ann['kind'].includes('arterial') && !ann['kind'].includes('venous')
                             && 'pathStartPosition' in ann
                             && 'pathEndPosition' in ann)
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
            if (this.#deckOverlay) {
                this.#map.removeControl(this.#deckOverlay)
                this.#deckOverlay = null
                this.#button.classList.remove('control-active')
            }
        } else {
            this.#setDeckOverlay()
            this.#map.addControl(this.#deckOverlay)
            this.#button.classList.add('control-active')
        }
    }

    #pathStateChanged()
    //=================
    {
        if (this.#deckOverlay) {
            this.#map.removeControl(this.#deckOverlay)
            this.#setDeckOverlay()
            this.#map.addControl(this.#deckOverlay)
        }
    }

    #setDeckOverlay()
    //===============
    {
        this.#deckOverlay = new DeckOverlay({
            layers: [
                new ArcLayer({
                    id: 'arcs',
                    data: this.#pathData
                              .filter(f => this.#pathManager.pathTypeEnabled(f.kind)),
                    pickable: true,
                    autoHighlight: true,
                    numSegments: 100,
                    onHover: (i, e) => {
                        //console.log('hover', i, e)
                        if (i.object) {
                            const lineFeatureId = +i.object.featureId
                            this.#ui.activateFeature(this.#ui.mapFeature(lineFeatureId))
                            for (const featureId of this.#pathManager.lineFeatureIds([lineFeatureId])) {
                                if (+featureId !== lineFeatureId) {
                                    this.#ui.activateFeature(this.#ui.mapFeature(featureId))
                                }
                            }
                        }
                    },
                    onClick: (i, e) => {
                        console.log('click', i, e)
                    },
                    // Styles
                    getSourcePosition: f => f.pathStartPosition,
                    getTargetPosition: f => f.pathEndPosition,
                    getSourceColor: f => pathColourRGB(f.kind, 160),
                    getTargetColor: f => pathColourRGB(f.kind, 160),
                    highlightColor: o => pathColourRGB(o.object.kind),
                    getWidth: 3,
                })
            ],
            getTooltip: ({object}) => object && object.label
        })
    }
}

//==============================================================================
