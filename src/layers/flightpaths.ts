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

import {ArcLayer} from '@deck.gl/layers'
import {MapboxOverlay as DeckOverlay} from '@deck.gl/mapbox'
import {Model, Geometry} from '@luma.gl/engine'
import {IControl, Map as MapLibreMap} from 'maplibre-gl'

//==============================================================================

import {FlatMap} from '../flatmap-viewer'
import {PathManager} from '../pathways'
import {UserInteractions} from '../interactions'

import {pathColourArray} from '../pathways'
import {PropertiesFilter} from './filter'

//==============================================================================

import {PropertiesType} from '../types'

interface PathData extends PropertiesType {
    featureId: string
}

interface PathStyle extends PropertiesType {
    dashed: boolean
    type: string
}

interface LayerOptions extends PropertiesType {
    dimmed: boolean
}

interface PathStateChanges {
    pathType?: string
}

//==============================================================================

const transparencyCheck = '|| length(vColor) == 0.0'

class ArcMapLayer extends ArcLayer
{
    static layerName = 'ArcMapLayer'

    #dirty = false
    #pathDataMap: Map<number, PathData>

    constructor(...args)
    {
        super(...args)
        this.#pathDataMap = new Map([...(this.props.data as PathData[])].map(ann => [+ann.featureId, ann]))
        this.#pathDataMap.forEach(ann => delete ann['hidden'])
    }

    get featureIds()
    //==============
    {
        return [...this.#pathDataMap.keys()]
    }


    getShaders()
    //==========
    {
        const shaders = super.getShaders()
        shaders.fs = shaders.fs.replace('isValid == 0.0', `isValid == 0.0 ${transparencyCheck}`)
        return shaders
    }


    setDataProperty(featureId: string, key: string, enabled: boolean)
    //===============================================================
    {
        const properties = this.#pathDataMap.get(+featureId)
        if (properties) {
            if (!(key in properties) || properties[key] !== enabled) {
                properties[key] = enabled
                this.#dirty = true
            }
        }
    }

    redraw(force: boolean=false)
    //==========================
    {
        if (force || this.#dirty) {
            this.setChangeFlags({dataChanged: 'redraw'})
            this.setNeedsUpdate()
            this.#dirty = false
        }
    }
}

//==============================================================================

const makeDashedTriangles = `  float alpha = floor(fract(float(gl_VertexID)/12.0)+0.5);
  if (vColor.a != 0.0) vColor.a *= alpha;
`

class ArcDashedLayer extends ArcMapLayer
{
    static layerName = 'ArcDashedLayer'

    getShaders()
    //==========
    {
        const shaders = super.getShaders()
        shaders.vs = shaders.vs.replace('DECKGL_FILTER_COLOR(', `${makeDashedTriangles}\n  DECKGL_FILTER_COLOR(`)
        return shaders
    }

    _getModel()
    //=========
    {
        const {numSegments} = this.props
        let positions = []
        for (let i = 0; i < numSegments; i++) {
            positions = positions.concat([i,  1, 0, i,  -1, 0, i+1,  1, 0,
                                          i, -1, 0, i+1, 1, 0, i+1, -1, 0])
        }
        const model = new Model(this.context.device, {
            ...this.getShaders(),
            id: this.props.id,
            bufferLayout: this.getAttributeManager()!.getBufferLayouts(),
            geometry: new Geometry({
                topology: 'triangle-list',
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

export class FlightPathLayer
{
    #arcLayers: Map<string, ArcMapLayer> = new Map()
    #deckOverlay: DeckOverlay|null = null
    #dimmed: boolean = false
    #enabled: boolean = false
    #featureFilter: PropertiesFilter = new PropertiesFilter()
    #featureToLayer: Map<number, ArcMapLayer> = new Map()
    #map: MapLibreMap
    #pathDataMap: Map<number, PathData>
    #pathFilters: Map<string, PropertiesFilter>
    #pathManager: PathManager
    #pathStyles: Map<string, PathStyle>

    constructor(flatmap: FlatMap, ui: UserInteractions)
    {
        this.#map = flatmap.map
        this.#pathManager = ui.pathManager
        this.#pathManager.addWatcher(this.#pathStateChanged.bind(this))
        this.#pathDataMap = new Map([...flatmap.annotations.values()]
                                    .filter(ann => ann['tile-layer'] === 'pathways'
                                                && ann['geometry'] === 'LineString'
                                                && 'type' in ann && ann['type'].startsWith('line')
                                                && 'kind' in ann
                                                && 'pathStartPosition' in ann
                                                && 'pathEndPosition' in ann)
                                    .map(ann => [ann.featureId, ann]))
        this.#pathStyles = new Map(this.#pathManager.pathStyles().map(s => [s.type, s]))
        const knownTypes = [...this.#pathStyles.keys()].filter(t => t !== 'other')
        this.#pathFilters = new Map(
            [...this.#pathStyles.keys()]
                .map(pathType => [pathType, new PropertiesFilter({
                    OR: [{
                        AND: [
                            {kind: knownTypes},
                            {kind: pathType}
                        ],
                    },
                    {
                        AND: [
                            {NOT: {kind: knownTypes}},
                            {pathType: 'other'}
                        ]
                    }]
                })
            ])
        )
    }

    enable(enable: boolean=true)
    //==========================
    {
        if (enable && !this.#enabled) {
            this.#setupDeckOverlay()
            this.#map.addControl(this.#deckOverlay as IControl)
        } else if (!enable && this.#enabled) {
            if (this.#deckOverlay) {
                this.#map.removeControl(this.#deckOverlay as IControl)
                this.#deckOverlay.finalize()
                this.#deckOverlay = null
            }
            this.#featureToLayer = new Map()
        }
        this.#enabled = enable
    }

    queryFeaturesAtPoint(point)
    //=========================
    {
        if (this.#deckOverlay) {
            return this.#deckOverlay
                       .pickMultipleObjects(point)
                       .map(o => this.#makeMapFeature(o.object))
        }
        return []
    }

    redraw(force: boolean=false)
    //==========================
    {
        for (const layer of this.#arcLayers.values()) {
            layer.redraw(force)
        }
    }

    removeFeatureState(featureId: string, key: string)
    //================================================
    {
        const layer = this.#featureToLayer.get(+featureId)
        if (layer) {
            layer.setDataProperty(featureId, key, false)
            layer.redraw()
        }
    }

    setFeatureState(featureId: string, state: Object)
    //===============================================
    {
        const layer = this.#featureToLayer.get(+featureId)
        if (layer) {
            for (const [key, value] of Object.entries(state)) {
                layer.setDataProperty(featureId, key, value)
            }
            layer.redraw()
        }
    }

    clearVisibilityFilter()
    //=====================
    {
        this.setVisibilityFilter(new PropertiesFilter(true))
    }

    setVisibilityFilter(featureFilter: PropertiesFilter)
    //==================================================
    {
        this.#featureFilter = featureFilter
        if (this.#deckOverlay) {
            const updatedLayers = new Map()
            for (const [pathType, layer] of this.#arcLayers.entries()) {
                layer.featureIds.forEach(id => this.#featureToLayer.delete(+id))
                const pathStyle = this.#pathStyles.get(pathType)
                if (pathStyle) {
                    const updatedLayer = pathStyle.dashed
                                    ? new ArcDashedLayer(this.#layerOptions(pathType))
                                    : new ArcMapLayer(this.#layerOptions(pathType))
                    updatedLayer.featureIds.forEach(id => this.#featureToLayer.set(+id, layer))
                    updatedLayers.set(pathType, updatedLayer)
                }
            }
            this.#arcLayers = updatedLayers
            this.#deckOverlay.setProps({
                layers:  [...this.#arcLayers.values()]
            })
        }
    }

    setPaint(options: LayerOptions)
    //=============================
    {
        const dimmed = options.dimmed || false
        if (this.#dimmed !== dimmed) {
            this.#dimmed = dimmed
            this.redraw(true)
        }
    }

    #addArcLayer(pathType: string)
    //============================
    {
        const pathStyle = this.#pathStyles.get(pathType)
        if (pathStyle) {
            const layer = pathStyle.dashed
                            ? new ArcDashedLayer(this.#layerOptions(pathType))
                            : new ArcMapLayer(this.#layerOptions(pathType))
            layer.featureIds.forEach(id => this.#featureToLayer.set(+id, layer))
            this.#arcLayers.set(pathType, layer)
        }
    }

    #removeArcLayer(pathType: string)
    //===============================
    {
        const layer = this.#arcLayers.get(pathType)
        if (layer) {
            layer.featureIds.forEach(id => this.#featureToLayer.delete(+id))
            this.#arcLayers.delete(pathType)
        }
    }

    #pathColour(properties: PropertiesType)
    //=====================================
    {
        if (properties.hidden) {
            return [0, 0, 0, 0]
        }
        return pathColourArray(properties.kind,
                               properties.active || properties.selected ? 255
                                                                        : this.#dimmed ? 20 : 160)
    }

    #pathStateChanged(changes: PathStateChanges)
    //==========================================
    {
        if (this.#deckOverlay) {
            if ('pathType' in changes) {
                const pathType = changes.pathType
                const enabled = this.#pathManager.pathTypeEnabled(pathType)
                if (enabled && !this.#arcLayers.has(pathType)) {
                    this.#addArcLayer(pathType)
                } else if (!enabled && this.#arcLayers.has(pathType)) {
                    this.#removeArcLayer(pathType)
                }
                this.#deckOverlay.setProps({
                    layers:  [...this.#arcLayers.values()]
                })
            }
        }
    }

    #layerOptions(pathType: string)
    //=============================
    {
        const filter = this.#pathFilters.get(pathType)
        const pathData: PathData[] = (filter ? [...this.#pathDataMap.values()].filter(ann => filter.match(ann))
                                             : []).filter(ann => this.#featureFilter.match(ann))
        return {
            id: `arc-${pathType}`,
            data: pathData,
            pickable: true,
            numSegments: 400,
            // Styles
            getSourcePosition: f => f.pathStartPosition,
            getTargetPosition: f => f.pathEndPosition,
            getSourceColor: this.#pathColour.bind(this),
            getTargetColor: this.#pathColour.bind(this),
            opacity: 1.0,
            getWidth: 3,
        }
    }

    #makeMapFeature(pickedObject: PropertiesType)
    //===========================================
    {
        // Mock up a map vector feature
        return {
            id: pickedObject.featureId,
            source: 'vector-tiles',
            sourceLayer: `${pickedObject.layer}_${pickedObject['tile-layer']}`,
            properties: pickedObject,
            flightPath: true
        }
    }

    #setupDeckOverlay()
    //=================
    {
        // One overlay layer for each path style
        [...this.#pathStyles.values()].filter(style => this.#pathManager.pathTypeEnabled(style.type))
                                      .forEach(style => this.#addArcLayer(style.type))
        this.#deckOverlay = new DeckOverlay({
            layers: [...this.#arcLayers.values()],
        })
    }
}

//==============================================================================
