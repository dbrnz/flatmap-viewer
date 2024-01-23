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

//==============================================================================

import {pathColour} from '../pathways'

// Should this be in `pathways.js` ??
function pathColourRGB(pathType, alpha=255)
//=========================================
{
    const rgb = colord(pathColour(pathType)).toRgb()
    return [rgb.r, rgb.g, rgb.b, alpha]
}

//==============================================================================

export class Paths3DLayer
{
    #deckOverlay = null
    #enabled = false
    #map
    #pathData
    #pathManager
    #ui

    constructor(flatmap, ui)
    {
        this.#ui = ui
        this.#map = flatmap.map
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

    enable(enable=true)
    //=================
    {
        if (enable && !this.#enabled) {
            this.#setDeckOverlay()
            this.#map.addControl(this.#deckOverlay)
        } else if (!enable && this.#enabled) {
            if (this.#deckOverlay) {
                this.#map.removeControl(this.#deckOverlay)
                this.#deckOverlay = null
            }
        }
        this.#enabled = enable
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
                // Need to have two layers, one with dashed lines, one without
                //
                // Better, one layer per pathType and set/clear layer.visible...
                //
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
            ],
            getTooltip: ({object}) => object && object.label
        })
    }
}
