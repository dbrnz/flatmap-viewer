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

import {Map as MapLibreMap} from 'maplibre-gl'

//==============================================================================

import {FlatMap} from '../flatmap-viewer'
import {PATHWAYS_LAYER} from '../pathways.js';
import {UserInteractions} from '../interactions'
import * as utils from '../utils.js';

import {ANATOMICAL_MARKERS_LAYER, ClusteredAnatomicalMarkerLayer, Dataset} from './acluster'

import * as style from './styling.js';
import {BackgroundStyleLayer, BodyStyleLayer, RasterStyleLayer, VectorStyleLayer} from './styling.js';

import {DeckGlOverlay} from './deckgl'
import {FlightPathLayer} from './flightpaths'
import {PropertiesFilter} from './filter'
//import {SvgLayer} from './svglayer'

const FEATURES_LAYER = 'features';
const RASTER_LAYERS_NAME = 'Background image layer';
const RASTER_LAYERS_ID = 'background-image-layer';

//==============================================================================

interface FlatmapLayer      // To go into flatmap-viewer when converted to Typescript
{
    id: string
    description: string
    'image-layers'?: string[]
}

//==============================================================================

export function inAnatomicalClusterLayer(feature)
{
    return ('layer' in feature
         && feature.layer.id === ANATOMICAL_MARKERS_LAYER)
}

//==============================================================================

type StyleLayerType = BackgroundStyleLayer | RasterStyleLayer | VectorStyleLayer

class MapStylingLayer<StyleLayerType>
{
    #active: boolean = true
    #description: string
    #id: string
    #layerOptions
    #layers: StyleLayerType[] = []
    #map: MapLibreMap
    #separateLayers: boolean

    constructor(flatmap: FlatMap, layer: FlatmapLayer, options)
    {
        this.#map = flatmap.map
        this.#id = layer.id
        this.#description = layer.description
        this.#layerOptions = options
        this.#separateLayers = flatmap.options.separateLayers
    }

    get active()
    //==========
    {
        return this.#active
    }

    get description()
    //===============
    {
        return this.#description
    }

    get id()
    //======
    {
        return this.#id
    }

    get layers()
    //==========
    {
        return this.#layers
    }

    get layerOptions()
    //================
    {
        return this.#layerOptions
    }

    get map()
    //=======
    {
        return this.#map
    }

    addLayer(styleLayer: StyleLayerType, options)
    //===========================================
    {
        // @ts-ignore
        this.#map.addLayer(styleLayer.style(options))
        this.#layers.push(styleLayer)
    }

    #showLayer(layer, visible=true)
    //=============================
    {
        this.#map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none')
    }

    activate(enable=true)
    //===================
    {
        for (const layer of this.#layers) {
            this.#showLayer(layer, enable)
        }
        this.#active = enable
    }

    vectorSourceId(sourceLayer: string)
    //=================================
    {
        return (this.#separateLayers ? `${this.#id}_${sourceLayer}`
                                      : sourceLayer).replaceAll('/', '_')
    }

    setPaint(_options)
    {
    }

    setFilter(_options)
    {
    }
}

//==============================================================================

class MapFeatureLayer extends MapStylingLayer<VectorStyleLayer>
{
    #pathStyleLayers: style.StyleLayer[] = []

    constructor(flatmap: FlatMap, layer: FlatmapLayer, options)
    {
        super(flatmap, layer, options)
        const vectorTileSource = this.map.getSource('vector-tiles')
        const haveVectorLayers = (typeof vectorTileSource !== 'undefined')

        // if no image layers then make feature borders (and lines?) more visible...??
        if (haveVectorLayers) {
            const featuresVectorSource = this.vectorSourceId(FEATURES_LAYER)
//console.log('features source', featuresVectorSource)
            const vectorFeatures = vectorTileSource.vectorLayerIds.includes(featuresVectorSource)
            if (vectorFeatures) {
                this.#addStyleLayer(style.FeatureFillLayer)
                this.#addStyleLayer(style.FeatureDashLineLayer)
                this.#addStyleLayer(style.FeatureLineLayer)
                this.#addStyleLayer(style.FeatureBorderLayer)
                this.#addStyleLayer(style.CentrelineNodeFillLayer)
            }
            this.#addPathwayStyleLayers()
            if (vectorFeatures) {
                this.#addStyleLayer(style.FeatureLargeSymbolLayer)
                if (!flatmap.options.tooltips) {
                    this.#addStyleLayer(style.FeatureSmallSymbolLayer)
                }
            }
        }

        // Make sure our paint options are set properly, in particular raster layer visibility

        this.setPaint(this.layerOptions)
    }

    #addStyleLayer(styleClass, sourceLayer=FEATURES_LAYER, path2dLayer=false)
    //=======================================================================
    {
        const styleLayer = new styleClass(`${this.id}_${sourceLayer}`,
                                          this.vectorSourceId(sourceLayer))
        this.addLayer(styleLayer, this.layerOptions)
        if (path2dLayer) {
            this.#pathStyleLayers.push(styleLayer)
        }
    }

    #addPathwayStyleLayers()
    //======================
    {
        const pathwaysVectorSource = this.vectorSourceId(PATHWAYS_LAYER)
//console.log('paths source', pathwaysVectorSource)
        if (this.map.getSource('vector-tiles')
                .vectorLayerIds
                .includes(pathwaysVectorSource)) {
            this.#addStyleLayer(style.AnnotatedPathLayer, PATHWAYS_LAYER, true)

            this.#addStyleLayer(style.CentrelineEdgeLayer, PATHWAYS_LAYER)
            this.#addStyleLayer(style.CentrelineTrackLayer, PATHWAYS_LAYER)

            this.#addStyleLayer(style.PathLineLayer, PATHWAYS_LAYER, true)
            this.#addStyleLayer(style.PathDashlineLayer, PATHWAYS_LAYER, true)

            this.#addStyleLayer(style.NervePolygonBorder, PATHWAYS_LAYER, true)
            this.#addStyleLayer(style.NervePolygonFill, PATHWAYS_LAYER, true)
            this.#addStyleLayer(style.FeatureNerveLayer, PATHWAYS_LAYER, true)

            this.#addStyleLayer(style.PathHighlightLayer, PATHWAYS_LAYER, true)
            this.#addStyleLayer(style.PathDashHighlightLayer, PATHWAYS_LAYER, true)
        }
    }

    setFlatPathMode(visible: boolean)
    //===============================
    {
        for (const layer of this.#pathStyleLayers) {
            this.map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none')
        }
    }

    setPaint(options)
    //===============
    {
        for (const layer of this.layers) {
            const paintStyle = layer.paintStyle(options, true)
            for (const [property, value] of Object.entries(paintStyle)) {
                this.map.setPaintProperty(layer.id, property, value, {validate: false})
            }
        }
    }

    setFilter(options)
    //================
    {
        for (const layer of this.layers) {
            const filter = layer.makeFilter(options)
            if (filter !== null) {
                this.map.setFilter(layer.id, filter, {validate: true})
            }
        }
    }

    clearVisibilityFilter()
    //=====================
    {
        for (const layer of this.layers) {
            this.map.setFilter(layer.id, layer.defaultFilter(), {validate: false})
        }
    }

    setVisibilityFilter(filter)
    //=========================
    {
        for (const layer of this.layers) {
            const styleFilter = layer.defaultFilter()
            let newFilter = null
            if (styleFilter) {
                if (styleFilter[0] === 'all') {
                    if (Array.isArray(filter) && filter[0] === 'all') {
                        newFilter = [...styleFilter, ...filter.slice(1)]
                    } else {
                        newFilter = [...styleFilter, filter]
                    }
                } else if (filter[0] === 'all') {
                    newFilter = [...filter, styleFilter]
                } else {
                    newFilter = [filter, styleFilter]
                }
            } else {
                newFilter = filter
            }
            if (newFilter) {
                this.map.setFilter(layer.id, newFilter, {validate: true})
            }
        }
    }
}

//==============================================================================

class MapRasterLayer extends MapStylingLayer<BodyStyleLayer|RasterStyleLayer>
{
    constructor(flatmap: FlatMap, options, bodyLayerId=null)
    {
        const rasterLayer = {
            id: RASTER_LAYERS_ID,
            description: RASTER_LAYERS_NAME
        }
        super(flatmap, rasterLayer, options);
        if (bodyLayerId !== null) {
            const layerId = `${bodyLayerId}_${FEATURES_LAYER}`
            const source = flatmap.options.separateLayers ? layerId : FEATURES_LAYER
            const styleLayer = new BodyStyleLayer(layerId, source)
            // @ts-ignore
            this.map.addLayer(styleLayer.style(this.layerOptions))
            this.layers.push(styleLayer)
        }
        // Make sure our paint options are set properly, in particular raster layer visibility
        this.setPaint(this.layerOptions)
    }

    addImageLayers(layer: FlatmapLayer)
    //=================================
    {
        for (const layer_id of layer['image-layers']) {
            const rasterLayer = new RasterStyleLayer(layer_id)
            // @ts-ignore
            this.map.addLayer(rasterLayer.style(this.layerOptions))
//console.log('raster source', layer_id)
            this.layers.push(rasterLayer)
        }
        // Make sure our paint options are set properly, in particular raster layer visibility
        this.setPaint(this.layerOptions)
    }

    setPaint(options)
    //===============
    {
        const coloured = !('colour' in options) || options.colour
        for (const layer of this.layers) {
            // Check active status when resetting to visible....
            this.map.setLayoutProperty(layer.id, 'visibility',
                                                   (coloured && this.active) ? 'visible' : 'none',
                                         {validate: false})
        }
    }
}

//==============================================================================

export class LayerManager
{
    #deckGlOverlay: DeckGlOverlay
    #featureLayers = new Map()
    #flatmap: FlatMap
    #flightPathLayer: FlightPathLayer
    #layerOptions
    #map: MapLibreMap
    #markerLayer: ClusteredAnatomicalMarkerLayer
//    #modelLayer
    #rasterLayer = null

    constructor(flatmap: FlatMap, ui: UserInteractions)
    {
        this.#flatmap = flatmap
        this.#map = flatmap.map
        this.#layerOptions = utils.setDefaults(flatmap.options.layerOptions, {
            colour: true,
            outline: true,
            sckan: 'valid'
        })
        const backgroundLayer = new BackgroundStyleLayer()
        if ('background' in flatmap.options) {
            const s = backgroundLayer.style(flatmap.options.background)
            // @ts-ignore
            this.#map.addLayer(s) //backgroundLayer.style(flatmap.options.background))
        } else {
            // @ts-ignore
            this.#map.addLayer(backgroundLayer.style('white'));
        }

        // Add the map's layers
        if (flatmap.details['image-layers']) {
            this.#layerOptions.activeRasterLayer = true;

            // Image layers are below all feature layers
            const bodyLayer = flatmap.layers[0];
            this.#rasterLayer = new MapRasterLayer(this.#flatmap,
                                                     this.#layerOptions,
                                                     bodyLayer.id);  // body layer if not FC??
            for (const layer of flatmap.layers) {
                this.#rasterLayer.addImageLayers(layer)
            }
        } else {
            this.#layerOptions.activeRasterLayer = false;
        }
        for (const layer of flatmap.layers) {
            this.#featureLayers.set(layer.id, new MapFeatureLayer(this.#flatmap,
                                                                   layer,
                                                                   this.#layerOptions));
        }

        // Show anatomical clustered markers in a layer
        this.#markerLayer = new ClusteredAnatomicalMarkerLayer(flatmap, ui)

        // We use ``deck.gl`` for some layers
        this.#deckGlOverlay = new DeckGlOverlay(flatmap)

        // Support flight path view
        this.#flightPathLayer = new FlightPathLayer(this.#deckGlOverlay, flatmap, ui)

        // Simulation models are in SVG
//        this.#modelLayer = new SvgLayer(this.#deckGlOverlay, flatmap)
    }

    get layers()
    //==========
    {
        const layers = []
        if (this.#rasterLayer) {
            layers.push({
                id: this.#rasterLayer.id,
                description: this.#rasterLayer.description,
                enabled: this.#rasterLayer.active
            })
        }
        for (const mapLayer of this.#featureLayers.values()) {
            layers.push({
                id: mapLayer.id,
                description: mapLayer.description,
                enabled: mapLayer.active
            });
        }
        return layers;
    }

    get sckanState()
    //==============
    {
        return this.#layerOptions.sckan;
    }

    activate(layerId, enable=true)
    //============================
    {
        if (layerId === RASTER_LAYERS_ID) {
            if (this.#rasterLayer) {
                this.#rasterLayer.activate(enable)
                this.#layerOptions.activeRasterLayer = enable
                for (const mapLayer of this.#featureLayers.values()) {
                    mapLayer.setPaint(this.#layerOptions)
                }
            }
        } else {
            const layer = this.#featureLayers.get(layerId)
            if (layer) {
                layer.activate(enable)
            }
        }
    }

    addMarker(_id, _position, _properties={})
    //=======================================
    {
    // Geographical clustering
        //this.#markerLayer.addMarker(id, position, properties)
    }

    clearMarkers()
    //============
    {
    // Geographical clustering
        //this.#markerLayer.clearMarkers()
    }

    addDatasetMarkers(datasets: Dataset[])
    //====================================
    {
        this.#markerLayer.addDatasetMarkers(datasets)
    }

    clearDatasetMarkers()
    //===================
    {
        this.#markerLayer.clearDatasetMarkers()
    }

    removeDatasetMarker(datasetId: string)
    //====================================
    {
        this.#markerLayer.removeDatasetMarker(datasetId)
    }

    featuresAtPoint(point)
    //====================
    {
        let features = []
        features = this.#flightPathLayer.queryFeaturesAtPoint(point)
        if (features.length === 0) {
            features = this.#map.queryRenderedFeatures(point, {layers: [ANATOMICAL_MARKERS_LAYER]})
        }
        if (features.length === 0) {
            features = this.#map.queryRenderedFeatures(point)
        }
        return features
    }

    removeFeatureState(feature, key: string)
    //======================================
    {
        this.#flightPathLayer.removeFeatureState(feature.id, key)
        this.#markerLayer.removeFeatureState(feature.id, key)
    }

    setFeatureState(feature, state)
    //=============================
    {
        this.#flightPathLayer.setFeatureState(feature.id, state)
        this.#markerLayer.setFeatureState(feature.id, state)
    }

    setPaint(options={})
    //==================
    {
        this.#layerOptions = utils.setDefaults(options, this.#layerOptions)
        if (this.#rasterLayer) {
            this.#rasterLayer.setPaint(this.#layerOptions)
        }
        for (const mapLayer of this.#featureLayers.values()) {
            mapLayer.setPaint(this.#layerOptions)
        }
        // @ts-ignore
        this.#flightPathLayer.setPaint(options)
    }

    setFilter(options={})
    //===================
    {
        this.#layerOptions = utils.setDefaults(options, this.#layerOptions);
        for (const mapLayer of this.#featureLayers.values()) {
            mapLayer.setFilter(this.#layerOptions);
        }
        // @ts-ignore
        const sckanState = options.sckan || 'valid'
        const sckanFilter = (sckanState == 'none') ? {NOT: {HAS: 'sckan'}} :
                            (sckanState == 'valid') ? {sckan: true} :
                            (sckanState == 'invalid') ? {NOT: {sckan: true}} :
                            true
        const featureFilter = new PropertiesFilter(sckanFilter)
        if ('taxons' in options) {
            // @ts-ignore
            featureFilter.narrow({taxons: options.taxons})
        }
    }

    clearVisibilityFilter()
    //=====================
    {
        for (const mapLayer of this.#featureLayers.values()) {
            mapLayer.clearVisibilityFilter()
        }
        this.#flightPathLayer.clearVisibilityFilter()
    }

    setVisibilityFilter(propertiesFilter)
    //===================================
    {
        const styleFilter = propertiesFilter.getStyleFilter()
        for (const mapLayer of this.#featureLayers.values()) {
            mapLayer.setVisibilityFilter(styleFilter)
        }
        this.#flightPathLayer.setVisibilityFilter(propertiesFilter)
    }

    setFlightPathMode(enable=true)
    //============================
    {
        this.#flightPathLayer.enable(enable)
        for (const mapLayer of this.#featureLayers.values()) {
            mapLayer.setFlatPathMode(!enable)
        }
    }

    zoomEvent()
    //=========
    {
//        this.#modelLayer.zoomEvent()
    }

    enableSckanPaths(sckanState, enable=true)
    //=======================================
    {
        const currentState = this.#layerOptions.sckan;
        const validEnabled = ['valid', 'all'].includes(currentState);
        const invalidEnabled = ['invalid', 'all'].includes(currentState);
        let newState = sckanState.toLowerCase();
        if (newState === 'valid') {
            if (enable && !validEnabled) {
                newState = invalidEnabled ? 'all' : 'valid';
            } else if (!enable && validEnabled) {
                newState = invalidEnabled ? 'invalid' : 'none';
            }
        } else if (newState === 'invalid') {
            if (enable && !invalidEnabled) {
                newState = validEnabled ? 'all' : 'invalid';
            } else if (!enable && invalidEnabled) {
                newState = validEnabled ? 'valid' : 'none';
            }
        }
        if (newState !== this.#layerOptions.sckan) {
            this.setFilter({sckan: newState});
        }
    }
}

//==============================================================================
