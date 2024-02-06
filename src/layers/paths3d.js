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

import {ArcLayer} from '@deck.gl/layers'
import {MapboxOverlay as DeckOverlay} from '@deck.gl/mapbox'
import {Model, Geometry} from '@luma.gl/core'
import GL from '@luma.gl/constants'

//==============================================================================

import {pathColourArray} from '../pathways'


//==============================================================================

const transparencyCheck = '|| length(vColor) == 0.0'

class ArcMapLayer extends ArcLayer
{
    static layerName = 'ArcMapLayer'

    constructor(...args)
    {
        super(...args)
    }

    getShaders()
    //==========
    {
        const shaders = super.getShaders()
        shaders.fs = `#version 300 es\n${shaders.fs}`
                     .replace('isValid == 0.0', `isValid == 0.0 ${transparencyCheck}`)
        shaders.vs = `#version 300 es\n${shaders.vs}`
        return shaders
    }
}

//==============================================================================

const makeDashedTriangles = `  float alpha = floor(fract(float(gl_VertexID)/12.0)+0.5);
  if (vColor.a != 0.0) vColor.a = alpha;
`

class ArcDashedLayer extends ArcMapLayer
{
    static layerName = 'ArcDashedLayer'

    constructor(...args)
    {
        super(...args)
    }

    getShaders()
    //==========
    {
        const shaders = super.getShaders()
        shaders.vs = shaders.vs.replace('DECKGL_FILTER_COLOR(', `${makeDashedTriangles}\n  DECKGL_FILTER_COLOR(`)
        return shaders
    }

    _getModel(gl)
    //===========
    {
        const {numSegments} = this.props
        let positions = []
        for (let i = 0; i < numSegments; i++) {
            positions = positions.concat([i,  1, 0, i,  -1, 0, i+1,  1, 0,
                                          i, -1, 0, i+1, 1, 0, i+1, -1, 0])
        }
        const model = new Model(gl, {
            ...this.getShaders(),
            id: this.props.id,
            geometry: new Geometry({
                drawMode: GL.TRIANGLES,
                attributes: {
                    positions: new Float32Array(positions)
                }
            }),
            isInstanced: true,
        })
        model.setUniforms({numSegments: numSegments})
        return model
    }
}

//==============================================================================

export class Paths3DLayer
{
    #arcLayers = new Map()
    #deckOverlay = null
    #enabled = false
    #knownTypes = []
    #map
    #pathData
    #pathManager
    #pathStyles
    #ui

    constructor(flatmap, ui)
    {
        this.#ui = ui
        this.#map = flatmap.map
        this.#pathManager = ui.pathManager
        this.#pathManager.addWatcher(this.#pathStateChanged.bind(this))
        this.#pathData = new Map([...flatmap.annotations.values()]
                                 .filter(ann => ann['tile-layer'] === 'pathways'
                                             && ann['geometry'] === 'LineString'
                                             && 'type' in ann && ann['type'].startsWith('line')
                                             && 'kind' in ann
                                             && 'pathStartPosition' in ann
                                             && 'pathEndPosition' in ann)
                                 .map(ann => [ann.featureId, ann]))
        this.#pathStyles = new Map(this.#pathManager.pathStyles().map(s => [s.type, s]))
        this.#knownTypes = [...this.#pathStyles.keys()].filter(t => t !== 'other')
    }

    enable(enable=true)
    //=================
    {
        if (enable && !this.#enabled) {
            this.#setupDeckOverlay()
            this.#map.addControl(this.#deckOverlay)
        } else if (!enable && this.#enabled) {
            if (this.#deckOverlay) {
                this.#map.removeControl(this.#deckOverlay)
                this.#deckOverlay.finalize()
                this.#deckOverlay = null
            }
        }
        this.#enabled = enable
    }

    #pathStateChanged(changes={})
    //===========================
    {
        if (this.#deckOverlay) {
            if ('pathType' in changes) {
                const pathType = changes.pathType
                const enabled = this.#pathManager.pathTypeEnabled(pathType)
                if (enabled && !this.#arcLayers.has(pathType)) {
                    const pathStyles = this.#pathManager.pathStyles()
                    this.#arcLayers.set(pathType, this.#arcLayer(pathType, this.#pathStyles.get(pathType).dashed))
                } else if (!enabled && this.#arcLayers.has(pathType)) {
                    this.#arcLayers.delete(pathType)
                }
                this.#deckOverlay.setProps({
                    layers:  [...this.#arcLayers.values()]
                })
            }
        }
    }

    #layerOptions(type)
    //=================
    {
        const pathData = [...this.#pathData.values()]
                                 .filter(ann => (this.#knownTypes.includes(ann.kind) && (ann.kind === type)
                                             || !this.#knownTypes.includes(ann.kind) && (type === 'other')))
        return {
            id: `arc-${type}`,
            data: pathData,
            pickable: true,
            autoHighlight: true,
            numSegments: 400,
            onHover: (i, e) => {
                if (i.object) {
                    // change width
                    const lineFeatureId = +i.object.featureId
                    this.#ui.activateFeature(this.#ui.mapFeature(lineFeatureId))
                    for (const featureId of this.#pathManager.lineFeatureIds([lineFeatureId])) {
                        if (+featureId !== lineFeatureId) {
                            this.#ui.activateFeature(this.#ui.mapFeature(featureId))
                        }
                    }
                    return true   // stop bubbling up...
                }
            },
            // Styles
            getSourcePosition: f => f.pathStartPosition,
            getTargetPosition: f => f.pathEndPosition,
            getSourceColor: f => pathColourArray(f.kind, 160),
            getTargetColor: f => pathColourArray(f.kind, 160),
            highlightColor: o => pathColourArray(o.object.kind),
            opacity: 1.0,
            getWidth: 3,
        }
    }

    #arcLayer(type, dashed)
    //=====================
    {
        return dashed ? new ArcDashedLayer(this.#layerOptions(type))
                      : new ArcMapLayer(this.#layerOptions(type))
    }

    #setupDeckOverlay()
    //=================
    {
        [...this.#pathStyles.values()].filter(style => this.#pathManager.pathTypeEnabled(style.type))
                                      .forEach(style => this.#arcLayers.set(style.type, this.#arcLayer(style.type, style.dashed)))
        this.#deckOverlay = new DeckOverlay({
            layers: [...this.#arcLayers.values()],
            getTooltip: ({object}) => object && object.label
        })
    }
}

//==============================================================================
