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

import {PATHWAYS_LAYER} from './pathways.js';

import * as style from './styling.js';
import * as utils from './utils.js';

const FEATURES_LAYER = 'features'
const RASTER_LAYERS_NAME = 'Background image layer'

//==============================================================================

class MapStylingLayers
{
    constructor(flatmap, layerId)
    {
        this.__map = flatmap.map;
        this.__id = layerId;
        this.__layers = [];
        this.__active = true;
        this.__layerOptions = flatmap.options.layerOptions;
        this.__separateLayers = flatmap.options.separateLayers;
    }

    get id()
    //======
    {
        return this.__id;
    }

    get active()
    //==========
    {
        return this.__active;
    }

    addLayer(styleLayer, options)
    //==========================
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
        return this.__separateLayers ? `${this.__id}_${sourceLayer}`
                                     : sourceLayer;
    }
}

//==============================================================================

class MapFeatureLayers extends MapStylingLayers
{
    constructor(flatmap, layer)
    {
        super(flatmap, layer.id);
        const vectorTileSource = this.__map.getSource('vector-tiles');
        const haveVectorLayers = (typeof vectorTileSource !== 'undefined');

        // if no image layers then make feature borders (and lines?) more visible...??
        if (haveVectorLayers) {
            const featuresVectorSource = this.vectorSourceId(FEATURES_LAYER);
            const vectorFeatures = vectorTileSource.vectorLayerIds
                                                   .indexOf(featuresVectorSource) >= 0;
            if (vectorFeatures) {
                this.__addStyleLayer(style.FeatureFillLayer);
                this.__addStyleLayer(style.FeatureDashLineLayer);
                this.__addStyleLayer(style.FeatureLineLayer);
                this.__addStyleLayer(style.FeatureBorderLayer);
            }
            this.__addPathwayStyleLayers(this.__layerOptions);
            if (vectorFeatures) {
                this.__addStyleLayer(style.FeatureLargeSymbolLayer);
                if (!flatmap.options.tooltips) {
                    this.__addStyleLayer(style.FeatureSmallSymbolLayer);
                }
            }
        }

        // Make sure our colour options are set properly, in particular raster layer visibility

        this.setColour(this.__layerOptions);
    }

    __addStyleLayer(styleClass, sourceLayer=FEATURES_LAYER)
    //=====================================================
    {
        const styleLayer = new styleClass(`${this.__id}_${sourceLayer}`,
                                          this.vectorSourceId(sourceLayer));
        this.__map.addLayer(styleLayer.style(this.__layerOptions));
        this.__layers.push(styleLayer);
    }

    __addPathwayStyleLayers()
    //=======================
    {
        const pathwaysVectorSource = this.vectorSourceId(PATHWAYS_LAYER);
        if (this.__map.getSource('vector-tiles')
                .vectorLayerIds
                .indexOf(pathwaysVectorSource) >= 0) {
            this.__addStyleLayer(style.PathLineLayer, PATHWAYS_LAYER);
            this.__addStyleLayer(style.PathDashlineLayer, PATHWAYS_LAYER);
            this.__addStyleLayer(style.NervePolygonBorder, PATHWAYS_LAYER);
            this.__addStyleLayer(style.NervePolygonFill, PATHWAYS_LAYER);
            this.__addStyleLayer(style.FeatureNerveLayer, PATHWAYS_LAYER);
        }
    }

    setColour(options)
    //================
    {
        for (const layer of this.__layers) {
            const paintStyle = layer.paintStyle(options, true);
            for (const [property, value] of Object.entries(paintStyle)) {
                this.__map.setPaintProperty(layer.id, property, value, {validate: false});
            }
        }
    }
}

//==============================================================================

class MapRasterLayers extends MapStylingLayers
{
    constructor(flatmap, bodyLayerId=null)
    {
        super(flatmap, 'background-image-layer');
        if (bodyLayerId !== null) {
            const layerId = `${bodyLayerId}_${FEATURES_LAYER}`;
            const source = flatmap.options.separateLayers ? layerId : FEATURES_LAYER;
            const styleLayer = new style.BodyLayer(layerId, source);
            this.__map.addLayer(styleLayer.style(this.__layerOptions));
            this.__layers.push(styleLayer);
        }
        // Make sure our colour options are set properly, in particular raster layer visibility
        this.setColour(this.__layerOptions);
    }

    addLayer(layer)
    //=============
    {
        for (const layer_id of layer['image-layers']) {
            const rasterLayer = new style.RasterLayer(layer_id);
            this.__map.addLayer(rasterLayer.style(this.__layerOptions));
            this.__layers.push(rasterLayer);
        }
        // Make sure our colour options are set properly, in particular raster layer visibility
        this.setColour(this.__layerOptions);
    }

    setColour(options)
    //================
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
    constructor(flatmap)
    {
        this.__flatmap = flatmap;
        this.__map = flatmap.map;
        this.__layers = new Map;
        this.__mapLayers = new Map;
        const layerOptions = flatmap.options.layerOptions;
        const backgroundLayer = new style.BackgroundLayer();
        if ('background' in flatmap.options) {
            this.__map.addLayer(backgroundLayer.style(flatmap.options.background));
        } else {
            this.__map.addLayer(backgroundLayer.style('white'));
        }

        // Add the map's layers
        if (flatmap.details['image-layers']) {
            // Image layers are below all feature layers

            const bodyLayer = flatmap.layers[0];

            const rasterLayers = new MapRasterLayers(this.__flatmap, bodyLayer.id);  // body layer if not FC??

            for (const layer of flatmap.layers) {
                rasterLayers.addLayer(layer);
            }
            this.__layers.set(RASTER_LAYERS_NAME, {
                id: RASTER_LAYERS_NAME,
                description: RASTER_LAYERS_NAME
            });
            this.__mapLayers.set(RASTER_LAYERS_NAME, rasterLayers);
        }
        for (const layer of flatmap.layers) {
           this.__addFeatureLayer(layer);
        }
    }

    get activeLayerNames()
    //====================
    {
        const activeNames = [];
        for (const mapLayer of this.__mapLayers.values()) {
            if (mapLayer.active) {
                activeNames.push(mapLayer.id);
            }
        }
        return activeNames;
    }

    __addFeatureLayer(layer)
    //======================
    {
        this.__layers.set(layer.id, layer);
        this.__mapLayers.set(layer.id, new MapFeatureLayers(this.__flatmap, layer));
    }

    get layers()
    //==========
    {
        return Array.from(this.__layers.values());
    }

    activate(layerId, enable=true)
    //============================
    {
        const mapLayer = this.__mapLayers.get(layerId);
        if (mapLayer !== undefined) {
            mapLayer.activate(enable);
        }
    }

    setColour(options=null)
    //=====================
    {
        options = utils.setDefaultOptions(options, {colour: true, outline: true});
        for (const mapLayer of this.__mapLayers.values()) {
            mapLayer.setColour(options)
        }
    }
}

//==============================================================================
