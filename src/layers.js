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

import {PATHWAY_LAYERS} from './pathways.js';

import * as style from './styling.js';
import * as utils from './utils.js';

//==============================================================================

class MapFeatureLayer
{
    constructor(flatmap, layer, options)
    {
        this.__map = flatmap.map;
        this.__id = layer.id;
        this.__rasterLayers = [];
        this.__styleLayers = [];

        const haveVectorLayers = (typeof this.__map.getSource('vector-tiles') !== 'undefined');
        if (haveVectorLayers) {
            this.__addStyleLayer(style.BodyLayer, options);
        }
        if (flatmap.details['image_layer']) {
            for (const raster_layer_id of layer['image-layers']) {
                const layerId = this.__addRasterLayer(raster_layer_id, options);
            }
        }
        // if no image layers then make feature borders (and lines?) more visible...??
        if (haveVectorLayers) {
            this.__addStyleLayer(style.FeatureFillLayer, options);
            this.__addStyleLayer(style.FeatureLineLayer, options);
            this.__addStyleLayer(style.FeatureBorderLayer, options);
            this.__addPathwayStyleLayers(options);
            this.__addStyleLayer(style.FeatureLargeSymbolLayer, options);
            if (!flatmap.options.tooltips) {
                this.__addStyleLayer(style.FeatureSmallSymbolLayer, options);
            }
        }

        // Make sure our colpur options are set properly, in particular raster layer visibility

        this.setColour(options);
    }

    get id()
    //======
    {
        return this.__id;
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
        for (const pathLayer of PATHWAY_LAYERS) {
            if (this.__map.getSource('vector-tiles')
                    .vectorLayerIds
                    .indexOf(pathLayer) >= 0) {
                this.__addStyleLayer(style.PathLineLayer, options, pathLayer);
                this.__addStyleLayer(style.PathDashlineLayer, options, pathLayer);
                this.__addStyleLayer(style.NervePolygonBorder, options, pathLayer);
                this.__addStyleLayer(style.NervePolygonFill, options, pathLayer);
                this.__addStyleLayer(style.FeatureNerveLayer, options, pathLayer);
            }
        }
    }

    __addStyleLayer(styleClass, options, sourceLayer='features')
    //==========================================================
    {
        const styleLayer = new styleClass(this.__id, sourceLayer);
        this.__map.addLayer(styleLayer.style(options));
        this.__styleLayers.push(styleLayer);
    }

    setColour(options)
    //================
    {
        const coloured = !('colour' in options) || options.colour;
        for (const rasterLayer of this.__rasterLayers) {
            this.__map.setLayoutProperty(rasterLayer.id, 'visibility', coloured ? 'visible' : 'none');
        }
        for (const styleLayer of this.__styleLayers) {
            const paintStyle = styleLayer.paintStyle(options, true);
            for (const [property, value] of Object.entries(paintStyle)) {
                this.__map.setPaintProperty(styleLayer.id, property, value);
            }
        }
    }
}

//==============================================================================

export class LayerManager
{
    constructor(flatmap, switcher=false)
    {
        this.__flatmap = flatmap;
        this.__map = flatmap.map;
        this.__layers = new Map;
        this.__mapLayers = new Map;
        this.__activeLayers = [];
        this.__activeLayerNames = [];
        const backgroundLayer = new style.BackgroundLayer();
        if ('background' in flatmap.options) {
            this.__map.addLayer(backgroundLayer.style(flatmap.options.background));
        } else {
            this.__map.addLayer(backgroundLayer.style('white'));
        }
    }

    get activeLayerNames()
    //====================
    {
        return this.__activeLayerNames;
    }

    addLayer(layer, options)
    //======================
    {
        this.__mapLayers.set(layer.id, layer);

        const layers = new MapFeatureLayer(this.__flatmap, layer, options);
        const layerId = this.__flatmap.mapLayerId(layer.id);
        this.__layers.set(layerId, layers);
    }

    get layers()
    //==========
    {
        return this.__layers;
    }

    activate(layerId)
    //===============
    {
        const layer = this.__layers.get(layerId);
        if (layer !== undefined) {
            layer.activate();
            if (this.__activeLayers.indexOf(layer) < 0) {
                this.__activeLayers.push(layer);
                this.__activeLayerNames.push(layer.id);
            }
        }
    }

    deactivate(layerId)
    //=================
    {
        const layer = this.__layers.get(layerId);
        if (layer !== undefined) {
            layer.deactivate();
            const index = this.__activeLayers.indexOf(layer);
            if (index >= 0) {
                delete this.__activeLayers[index];
                this.__activeLayers.splice(index, 1);
                delete this.__activeLayerNames[index];
                this.__activeLayerNames.splice(index, 1);
            }
        }
    }

    setColour(options={colour: true, outline: true})
    //===============================================
    {
        for (const layer of this.__layers.values()) {
            layer.setColour(options)
        }
    }

    makeUppermost(layerId)
    //====================
    {
        // position before top layer
    }

    makeLowest(layerId)
    //=================
    {
        // position after bottom layer (before == undefined)
    }


    lower(layerId)
    //============
    {
        // position before second layer underneath...
    }

    raise(layerId)
    //============
    {
        // position before layer above...
    }
}

//==============================================================================
