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

import {PATHWAYS_LAYER} from '../pathways.js';
import * as utils from '../utils.js';

import {ANATOMICAL_MARKERS_LAYER, ClusteredAnatomicalMarkerLayer} from './acluster'

import * as style from './styling.js';

import {DeckGlOverlay} from './deckgl'
import {FlightPathLayer} from './flightpaths'
import {PropertiesFilter} from './filter'

const FEATURES_LAYER = 'features';
const RASTER_LAYERS_NAME = 'Background image layer';
const RASTER_LAYERS_ID = 'background-image-layer';

//==============================================================================

class MapStylingLayers
{
    constructor(flatmap, layer, options)
    {
        this.__map = flatmap.map;
        this.__id = layer.id;
        this.__description = layer.description;
        this.__active = true;
        this.__layers = [];
        this.__layerOptions = options;
        this.__separateLayers = flatmap.options.separateLayers;
    }

    get id()
    //======
    {
        return this.__id;
    }

    get description()
    //===============
    {
        return this.__description;
    }

    get active()
    //==========
    {
        return this.__active;
    }

    get map()
    //=======
    {
        return this.__map
    }

    addLayer(styleLayer, options)
    //===========================
    {
        this.__map.addLayer(styleLayer.style(options));
        this.__layers.push(styleLayer);
    }

    __showLayer(layer, visible=true)
    //===============================
    {
        this.__map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
    }

    activate(enable=true)
    //===================
    {
        for (const layer of this.__layers) {
            this.__showLayer(layer, enable);
        }
        this.__active = enable;
    }

    vectorSourceId(sourceLayer)
    //=========================
    {
        return (this.__separateLayers ? `${this.__id}_${sourceLayer}`
                                      : sourceLayer).replaceAll('/', '_');
    }

    setPaint(options)
    {
    }

    setFilter(options)
    {
    }
}

//==============================================================================

class MapFeatureLayers extends MapStylingLayers
{
    #pathLayers = []

    constructor(flatmap, layer, options)
    {
        super(flatmap, layer, options);
        const vectorTileSource = this.__map.getSource('vector-tiles');
        const haveVectorLayers = (typeof vectorTileSource !== 'undefined');

        // if no image layers then make feature borders (and lines?) more visible...??
        if (haveVectorLayers) {
            const featuresVectorSource = this.vectorSourceId(FEATURES_LAYER);
            const vectorFeatures = vectorTileSource.vectorLayerIds.includes(featuresVectorSource);
            if (vectorFeatures) {
                this.__addStyleLayer(style.FeatureFillLayer);
                this.__addStyleLayer(style.FeatureDashLineLayer);
                this.__addStyleLayer(style.FeatureLineLayer);
                this.__addStyleLayer(style.FeatureBorderLayer);
                this.__addStyleLayer(style.CentrelineNodeFillLayer);
            }
            this.__addPathwayStyleLayers();
            if (vectorFeatures) {
                this.__addStyleLayer(style.FeatureLargeSymbolLayer);
                if (!flatmap.options.tooltips) {
                    this.__addStyleLayer(style.FeatureSmallSymbolLayer);
                }
            }
        }

        // Make sure our paint options are set properly, in particular raster layer visibility

        this.setPaint(this.__layerOptions);
    }

    __addStyleLayer(styleClass, sourceLayer=FEATURES_LAYER, path2dLayer=false)
    //========================================================================
    {
        const styleLayer = new styleClass(`${this.__id}_${sourceLayer}`,
                                          this.vectorSourceId(sourceLayer))
        this.addLayer(styleLayer, this.__layerOptions)
        if (path2dLayer) {
            this.#pathLayers.push(styleLayer)
        }
    }

    __addPathwayStyleLayers()
    //=======================
    {
        const pathwaysVectorSource = this.vectorSourceId(PATHWAYS_LAYER)
        if (this.__map.getSource('vector-tiles')
                .vectorLayerIds
                .includes(pathwaysVectorSource)) {
            this.__addStyleLayer(style.AnnotatedPathLayer, PATHWAYS_LAYER, true)

            this.__addStyleLayer(style.CentrelineEdgeLayer, PATHWAYS_LAYER)
            this.__addStyleLayer(style.CentrelineTrackLayer, PATHWAYS_LAYER)

            this.__addStyleLayer(style.PathLineLayer, PATHWAYS_LAYER, true)
            this.__addStyleLayer(style.PathDashlineLayer, PATHWAYS_LAYER, true)

            this.__addStyleLayer(style.NervePolygonBorder, PATHWAYS_LAYER, true)
            this.__addStyleLayer(style.NervePolygonFill, PATHWAYS_LAYER, true)
            this.__addStyleLayer(style.FeatureNerveLayer, PATHWAYS_LAYER, true)

            this.__addStyleLayer(style.PathHighlightLayer, PATHWAYS_LAYER, true)
            this.__addStyleLayer(style.PathDashHighlightLayer, PATHWAYS_LAYER, true)
        }
    }

    setFlatPathMode(visible)
    //======================
    {
        for (const layer of this.#pathLayers) {
            this.map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none')
        }
    }

    setPaint(options)
    //===============
    {
        for (const layer of this.__layers) {
            const paintStyle = layer.paintStyle(options, true);
            for (const [property, value] of Object.entries(paintStyle)) {
                this.__map.setPaintProperty(layer.id, property, value, {validate: false});
            }
        }
    }

    setFilter(options)
    //================
    {
        for (const layer of this.__layers) {
            const filter = layer.makeFilter(options);
            if (filter !== null) {
                this.__map.setFilter(layer.id, filter, {validate: true});
            }
        }
    }

    clearVisibilityFilter()
    //=====================
    {
        for (const layer of this.__layers) {
            this.__map.setFilter(layer.id, layer.defaultFilter(), {validate: false})
        }
    }

    setVisibilityFilter(filter)
    //=========================
    {
        for (const layer of this.__layers) {
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
                this.__map.setFilter(layer.id, newFilter, {validate: true})
            }
        }
    }
}

//==============================================================================

class MapRasterLayers extends MapStylingLayers
{
    constructor(flatmap, options, bodyLayerId=null)
    {
        const rasterLayer = {
            id: RASTER_LAYERS_ID,
            description: RASTER_LAYERS_NAME
        };
        super(flatmap, rasterLayer, options);
        if (bodyLayerId !== null) {
            const layerId = `${bodyLayerId}_${FEATURES_LAYER}`;
            const source = flatmap.options.separateLayers ? layerId : FEATURES_LAYER;
            const styleLayer = new style.BodyLayer(layerId, source);
            this.__map.addLayer(styleLayer.style(this.__layerOptions));
            this.__layers.push(styleLayer);
        }
        // Make sure our paint options are set properly, in particular raster layer visibility
        this.setPaint(this.__layerOptions);
    }

    addLayer(layer)
    //=============
    {
        for (const layer_id of layer['image-layers']) {
            const rasterLayer = new style.RasterLayer(layer_id);
            this.__map.addLayer(rasterLayer.style(this.__layerOptions));
            this.__layers.push(rasterLayer);
        }
        // Make sure our paint options are set properly, in particular raster layer visibility
        this.setPaint(this.__layerOptions);
    }

    setPaint(options)
    //===============
    {
        const coloured = !('colour' in options) || options.colour;
        for (const layer of this.__layers) {
            // Check active status when resetting to visible....
            this.__map.setLayoutProperty(layer.id, 'visibility',
                                                   (coloured && this.active) ? 'visible' : 'none',
                                         {validate: false});
        }
    }
}

//==============================================================================

export class LayerManager
{
    #deckGlOverlay
    #featureLayers = new Map()
    #markerLayer = null
    #flightPathLayer = null
    #rasterLayer = null

    constructor(flatmap, ui)
    {
        this.__flatmap = flatmap;
        this.__map = flatmap.map;
        this.__layerOptions = utils.setDefaults(flatmap.options.layerOptions, {
            colour: true,
            outline: true,
            sckan: 'valid'
        });
        const backgroundLayer = new style.BackgroundLayer();
        if ('background' in flatmap.options) {
            this.__map.addLayer(backgroundLayer.style(flatmap.options.background));
        } else {
            this.__map.addLayer(backgroundLayer.style('white'));
        }

        // Add the map's layers
        if (flatmap.details['image-layers']) {
            this.__layerOptions.activeRasterLayer = true;

            // Image layers are below all feature layers
            const bodyLayer = flatmap.layers[0];
            this.#rasterLayer = new MapRasterLayers(this.__flatmap,
                                                     this.__layerOptions,
                                                     bodyLayer.id);  // body layer if not FC??
            for (const layer of flatmap.layers) {
                this.#rasterLayer.addLayer(layer);
            }
        } else {
            this.__layerOptions.activeRasterLayer = false;
        }
        for (const layer of flatmap.layers) {
            this.#featureLayers.set(layer.id, new MapFeatureLayers(this.__flatmap,
                                                                   layer,
                                                                   this.__layerOptions));
        }

        // Show anatomical clustered markers in a layer
        this.#markerLayer = new ClusteredAnatomicalMarkerLayer(flatmap, ui)

        // We use ``deck.gl`` for some layers
        this.#deckGlOverlay = new DeckGlOverlay(flatmap)

        // Support flight path view
        this.#flightPathLayer = new FlightPathLayer(this.#deckGlOverlay, flatmap, ui)
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
        return this.__layerOptions.sckan;
    }

    activate(layerId, enable=true)
    //============================
    {
        if (layerId === RASTER_LAYERS_ID) {
            if (this.#rasterLayer) {
                this.#rasterLayer.activate(enable)
                this.__layerOptions.activeRasterLayer = enable
                for (const mapLayer of this.#featureLayers.values()) {
                    mapLayer.setPaint(this.__layerOptions)
                }
            }
        } else {
            const layer = this.#featureLayers.get(layerId)
            if (layer) {
                layer.activate(enable)
            }
        }
    }

    addMarker(id, position, properties={})
    //====================================
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

    addDatasetMarkers(datasets)
    //=========================
    {
        this.#markerLayer.addDatasetMarkers(datasets)
    }

    clearDatasetMarkers()
    //===================
    {
        this.#markerLayer.clearMarkers()
    }

    removeDatasetMarker(datasetId)
    //============================
    {
        this.#markerLayer.removeDatasetMarker(datasetId)
    }

    featuresAtPoint(point)
    //====================
    {
        let features = []
        if (this.#flightPathLayer) {
            features = this.#flightPathLayer.queryFeaturesAtPoint(point)
        }
        if (features.length === 0) {
            features = this.__map.queryRenderedFeatures(point, {layers: [ANATOMICAL_MARKERS_LAYER]})
        }
        if (features.length === 0) {
            features = this.__map.queryRenderedFeatures(point)
        }
        return features
    }

    removeFeatureState(feature, key)
    //==============================
    {
        if (this.#flightPathLayer) {
            this.#flightPathLayer.removeFeatureState(feature.id, key)
        }
    }

    setFeatureState(feature, state)
    //=============================
    {
        if (this.#flightPathLayer) {
            this.#flightPathLayer.setFeatureState(feature.id, state)
        }
    }

    setPaint(options={})
    //==================
    {
        this.__layerOptions = utils.setDefaults(options, this.__layerOptions)
        if (this.#rasterLayer) {
            this.#rasterLayer.setPaint(this.__layerOptions)
        }
        for (const mapLayer of this.#featureLayers.values()) {
            mapLayer.setPaint(this.__layerOptions)
        }
        if (this.#flightPathLayer) {
            this.#flightPathLayer.setPaint(options)
        }
    }

    setFilter(options={})
    //===================
    {
        this.__layerOptions = utils.setDefaults(options, this.__layerOptions);
        for (const mapLayer of this.#featureLayers.values()) {
            mapLayer.setFilter(this.__layerOptions);
        }
        if (this.#flightPathLayer) {
            const sckanState = options.sckan || 'valid'
            const sckanFilter = (sckanState == 'none') ? {NOT: {HAS: 'sckan'}} :
                                (sckanState == 'valid') ? {sckan: true} :
                                (sckanState == 'invalid') ? {NOT: {sckan: true}} :
                                true
            const featureFilter = new PropertiesFilter(sckanFilter)
            if ('taxons' in options) {
                featureFilter.narrow({taxons: options.taxons})
            }
            this.#flightPathLayer.setVisibilityFilter(featureFilter)
        }
    }

    clearVisibilityFilter()
    //=====================
    {
        for (const mapLayer of this.#featureLayers.values()) {
            mapLayer.clearVisibilityFilter()
        }
        if (this.#flightPathLayer) {
            this.#flightPathLayer.clearVisibilityFilter()
        }
    }

    setVisibilityFilter(propertiesFilter)
    //===================================
    {
        const styleFilter = propertiesFilter.getStyleFilter()
        for (const mapLayer of this.#featureLayers.values()) {
            mapLayer.setVisibilityFilter(styleFilter)
        }
        if (this.#flightPathLayer) {
            this.#flightPathLayer.setVisibilityFilter(propertiesFilter)
        }
    }

    setFlightPathMode(enable=true)
    //============================
    {
        if (this.#flightPathLayer) {
            this.#flightPathLayer.enable(enable)
            for (const mapLayer of this.#featureLayers.values()) {
                mapLayer.setFlatPathMode(!enable)
            }
        }
    }

    enableSckanPaths(sckanState, enable=true)
    //=======================================
    {
        const currentState = this.__layerOptions.sckan;
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
        if (newState !== this.__layerOptions.sckan) {
            this.setFilter({sckan: newState});
        }
    }
}

//==============================================================================
