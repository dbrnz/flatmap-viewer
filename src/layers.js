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

//==============================================================================

class MapFeatureLayer
{
    constructor(flatmap, layer, background_layers=true)
    {
        this.__map = flatmap.map;
        this.__separateLayers = flatmap.options.separateLayers;
        this.__id = layer.id;
        this.__rasterLayers = [];
        this.__styleLayers = [];
        this.__active = true;

        const layerOptions = flatmap.options.layerOptions;
        const vectorTileSource = this.__map.getSource('vector-tiles');
        const haveVectorLayers = (typeof vectorTileSource !== 'undefined');
        const featuresVectorLayerId = this.__separateLayers
                                    ? `${this.__id}_${FEATURES_LAYER}`
                                    : FEATURES_LAYER;
        const vectorFeatures = haveVectorLayers
                             && vectorTileSource.vectorLayerIds.indexOf(featuresVectorLayerId) >= 0;
        if (background_layers) {
            if (vectorFeatures) {
                this.__addStyleLayer(style.BodyLayer, layerOptions);
            }
            if (flatmap.details['image-layers']) {
                for (const raster_layer_id of layer['image-layers']) {
                    this.__addRasterLayer(raster_layer_id, layerOptions);
                }
            }
        }
        // if no image layers then make feature borders (and lines?) more visible...??
        if (haveVectorLayers) {
            if (vectorFeatures) {
                this.__addStyleLayer(style.FeatureFillLayer, layerOptions);
                this.__addStyleLayer(style.FeatureDashLineLayer, layerOptions);
                this.__addStyleLayer(style.FeatureLineLayer, layerOptions);
                this.__addStyleLayer(style.FeatureBorderLayer, layerOptions);
            }
            this.__addPathwayStyleLayers(layerOptions);
            if (vectorFeatures) {
                this.__addStyleLayer(style.FeatureLargeSymbolLayer, layerOptions);
                if (!flatmap.options.tooltips) {
                    this.__addStyleLayer(style.FeatureSmallSymbolLayer, layerOptions);
                }
            }
        }

        // Make sure our colour options are set properly, in particular raster layer visibility

        this.setColour(layerOptions);
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

    __show_layer(layer, visible=true)
    //===============================
    {
        this.__map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
    }

    activate(enable=true)
    //===================
    {
        for (const layer of this.__rasterLayers) {
            this.__show_layer(layer, enable);
        }
        for (const layer of this.__styleLayers) {
            this.__show_layer(layer, enable);
        }
        this.__active = enable;
    }

    __addRasterLayer(raster_layer_id, options)
    //========================================
    {
        const rasterLayer = new style.RasterLayer(raster_layer_id);
        this.__map.addLayer(rasterLayer.style(options));
        this.__rasterLayers.push(rasterLayer);
    }

    __addPathwayStyleLayers(options)
    //==============================
    {
        const pathwaysVectorLayerId = this.__separateLayers
                                    ? `${this.__id}_${PATHWAYS_LAYER}`
                                    : PATHWAYS_LAYER;
        if (this.__map.getSource('vector-tiles')
                .vectorLayerIds
                .indexOf(pathwaysVectorLayerId) >= 0) {
            this.__addStyleLayer(style.PathLineLayer, options, PATHWAYS_LAYER);
            this.__addStyleLayer(style.PathDashlineLayer, options, PATHWAYS_LAYER);
            this.__addStyleLayer(style.NervePolygonBorder, options, PATHWAYS_LAYER);
            this.__addStyleLayer(style.NervePolygonFill, options, PATHWAYS_LAYER);
            this.__addStyleLayer(style.FeatureNerveLayer, options, PATHWAYS_LAYER);
        }
    }

    __addStyleLayer(styleClass, options, sourceLayer=FEATURES_LAYER)
    //==============================================================
    {
        const layerId = `${this.__id}_${sourceLayer}`;
        const source = this.__separateLayers ? layerId : sourceLayer;
        const styleLayer = new styleClass(layerId, source);
        this.__map.addLayer(styleLayer.style(options));
        this.__styleLayers.push(styleLayer);
    }

    setColour(options)
    //================
    {
        const coloured = !('colour' in options) || options.colour;
        for (const rasterLayer of this.__rasterLayers) {
            this.__map.setLayoutProperty(rasterLayer.id, 'visibility', coloured ? 'visible' : 'none',
                 {validate: false});
        }
        for (const styleLayer of this.__styleLayers) {
            const paintStyle = styleLayer.paintStyle(options, true);
            for (const [property, value] of Object.entries(paintStyle)) {
                this.__map.setPaintProperty(styleLayer.id, property, value, {validate: false});
            }
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
        this.__rasterLayers = [];
        const layerOptions = flatmap.options.layerOptions;
        const fcDiagram = ('style' in layerOptions && layerOptions.style == 'fcdiagram');
        const backgroundLayer = new style.BackgroundLayer();
        if (fcDiagram) {
            this.__map.addLayer(backgroundLayer.style('black', 1));
        }
        else if ('background' in flatmap.options) {
            this.__map.addLayer(backgroundLayer.style(flatmap.options.background));
        } else {
            this.__map.addLayer(backgroundLayer.style('white'));
        }
        // Add the map's layers
        if (fcDiagram && flatmap.details['image-layers']) {
            for (const layer of flatmap.layers) {
                for (const raster_layer_id of layer['image-layers']) {
                    const rasterLayer = new style.RasterLayer(raster_layer_id);
                    this.__map.addLayer(rasterLayer.style(layerOptions));
                    this.__rasterLayers.push(rasterLayer);
                }
            }
        }
        for (const layer of flatmap.layers) {
            this.__addLayer(layer, !fcDiagram);
        }
    }

    get activeLayerNames()
    //====================
    {
        const activeNames = [];
        for (const layer of this.__layers.values()) {
            if (layer.active) {
                activeNames.push(layer.id);
            }
        }
        return activeNames;
    }

    __addLayer(layer, background_layers=true)
    //=======================================
    {
        this.__layers.set(layer.id, layer);
        this.__mapLayers.set(layer.id, new MapFeatureLayer(this.__flatmap, layer, background_layers));
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
        for (const layer of this.__layers.values()) {
            layer.setColour(options)
        }
    }
}

//==============================================================================
