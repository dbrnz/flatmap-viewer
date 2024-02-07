/******************************************************************************

Flatmap viewer and annotation tool

Copyright (c) 2019 - 2023  David Brooks

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

**/

/*
 *   Annotation drawing mode is enabled/disabled by:
 *
 *   1. A call to ``Flatmap.enableAnnotation()``
 *   2. An on-map control button calls this when in standalone viewing mode.
 *
 *   Drawn features include a GeoJSON geometry. Existing geometries of annotated
 *   features are added to the MapboxDraw control when the map is loaded. These
 *   should only be visible on the map when the draw control is active.
 *
 *   We listen for drawn features being created, updated and deleted, and notify
 *   the external annotator, first assigning new features and ID wrt the flatmap.
 *   The external annotator may reject a new feature (the user's cancelled the
 *   resulting dialog) which results in the newly drawn feature being removed from
 *   the control.
 *
 *   The external annotator is responsible for saving/obtaining drawn geometries
 *   from an annotation service.
 *
 */

//==============================================================================

import MapboxDraw from "@mapbox/mapbox-gl-draw"
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'

// NB: https://github.com/bemky/mapbox-gl-draw-freehand-mode/issues/25
import FreehandMode from 'mapbox-gl-draw-freehand-mode'

//==============================================================================

const drawStyles = [
    {
      'id': 'highlight-active-points',
      'type': 'circle',
      'filter': ['all',
        ['==', '$type', 'Point'],
        ['==', 'meta', 'feature'],
        ['==', 'active', 'true']],
      'paint': {
        'circle-radius': 7,
        'circle-color': '#080'
      }
    },
    {
      'id': 'points-are-red',
      'type': 'circle',
      'filter': ['all',
        ['==', '$type', 'Point'],
        ['==', 'meta', 'feature'],
        ['==', 'active', 'false']],
      'paint': {
        'circle-radius': 5,
        'circle-color': '#800'
      }
    },
    // ACTIVE (being drawn)
    // line stroke
    {
        "id": "gl-draw-line",
        "type": "line",
        "filter": ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"]],
        "layout": {
          "line-cap": "round",
          "line-join": "round"
        },
        "paint": {
          "line-color": "#D20C0C",
          "line-dasharray": [0.2, 2],
          "line-width": 2
        }
    },
    // polygon fill
    {
      "id": "gl-draw-polygon-fill",
      "type": "fill",
      "filter": ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
      "paint": {
        'fill-color': [
            'case',
            ['boolean', ['feature-state', 'active'], false], '#D88',
            '#020C0C'
        ],
        "fill-outline-color": "#D20C0C",
        "fill-opacity": 0.1
      }
    },
    // polygon mid points
    {
      'id': 'gl-draw-polygon-midpoint',
      'type': 'circle',
      'filter': ['all',
        ['==', '$type', 'Point'],
        ['==', 'meta', 'midpoint']],
      'paint': {
        'circle-radius': 3,
        'circle-color': '#fbb03b'
      }
    },
    // polygon outline stroke
    // This doesn't style the first edge of the polygon, which uses the line stroke styling instead
    {
      "id": "gl-draw-polygon-stroke-active",
      "type": "line",
      "filter": ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#D20C0C",
        "line-dasharray": [0.2, 2],
        "line-width": 2
      }
    },
    // vertex point halos
    {
      "id": "gl-draw-polygon-and-line-vertex-halo-active",
      "type": "circle",
      "filter": ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
      "paint": {
        "circle-radius": 5,
        "circle-color": "#FFF"
      }
    },
    // vertex points
    {
      "id": "gl-draw-polygon-and-line-vertex-active",
      "type": "circle",
      "filter": ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
      "paint": {
        "circle-radius": 3,
        "circle-color": "#D20C0C",
      }
    },

    // INACTIVE (static, already drawn)
    // line stroke
    {
        "id": "gl-draw-line-static",
        "type": "line",
        "filter": ["all", ["==", "$type", "LineString"], ["==", "mode", "static"]],
        "layout": {
          "line-cap": "round",
          "line-join": "round"
        },
        "paint": {
          "line-color": "#000",
          "line-width": 3
        }
    },
    // polygon fill
    {
      "id": "gl-draw-polygon-fill-static",
      "type": "fill",
      "filter": ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
      "paint": {
        "fill-color": "#000",
        "fill-outline-color": "#000",
        "fill-opacity": 0.1
      }
    },
    // polygon outline
    {
      "id": "gl-draw-polygon-stroke-static",
      "type": "line",
      "filter": ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#000",
        "line-width": 3
      }
    }
]

//==============================================================================

const drawStyleIds = drawStyles.map(s => s.id)

export const DRAW_ANNOTATION_LAYERS = [...drawStyleIds.map(id => `${id}.cold`),
                                       ...drawStyleIds.map(id => `${id}.hot`)]

//==============================================================================

export class AnnotationDrawControl
{
    #visible

    constructor(flatmap, visible=false)
    {
        MapboxDraw.constants.classes.CONTROL_BASE  = 'maplibregl-ctrl'
        MapboxDraw.constants.classes.CONTROL_PREFIX = 'maplibregl-ctrl-'
        MapboxDraw.constants.classes.CONTROL_GROUP = 'maplibregl-ctrl-group'

        this.__flatmap = flatmap
        this.#visible = visible
        this.__draw = new MapboxDraw({
            displayControlsDefault: false,
            controls: {
                point: true,
                line_string: true,
                polygon: true,
                trash: true
            },
            userProperties: true,
            keybindings: true,
            modes: {
                ...MapboxDraw.modes,
                draw_polygon: FreehandMode
            },
            styles: drawStyles
        })
        this.__map = null
    }

    onAdd(map)
    //========
    {
        this.__map = map
        this.__container = this.__draw.onAdd(map)

        // Fix to allow deletion with Del Key when default trash icon is not shown.
        // See https://github.com/mapbox/mapbox-gl-draw/issues/989
        this.__draw.options.controls.trash = true

        // Prevent firefox menu from appearing on Alt key up
        window.addEventListener('keyup', function (e) {
            if (e.key === "Alt") {
                e.preventDefault();
            }
        }, false)
        map.on('draw.create', this.createdFeature.bind(this))
        map.on('draw.delete', this.deletedFeature.bind(this))
        map.on('draw.update', this.updatedFeature.bind(this))
        this.show(this.#visible)
        return this.__container
    }

    onRemove()
    //========
    {
        this.__container.parentNode.removeChild(this.__container)
        this.__container = null
        this.__map = null
    }

    show(visible=true)
    //================
    {
        if (this.__container) {
            this.__container.style.display = visible ? 'block' : 'none'
            if (visible && !this.#visible) {
                for (const layerId of DRAW_ANNOTATION_LAYERS) {
                    this.__map.setLayoutProperty(layerId, 'visibility', 'visible')
                }
            } else if (!visible && this.#visible) {
                for (const layerId of DRAW_ANNOTATION_LAYERS) {
                    this.__map.setLayoutProperty(layerId, 'visibility', 'none')
                }
            }
        }
        this.#visible = visible
    }

    #cleanFeature(event)
    //==================
    {
        const features = event.features.filter(f => f.type === 'Feature')
                                       .map(f => {
                                            return {
                                                id: f.id,
                                                geometry: f.geometry
                                                // properties
                                            }
                                        })
        return features.length ? features[0] : null
    }

    createdFeature(event)
    //===================
    {
        const feature = this.#cleanFeature(event)
        if (feature) {
            // Set properties to indicate that this is a drawn annotation
            this.__draw.setFeatureProperty(feature.id, 'drawn', true)
            this.__draw.setFeatureProperty(feature.id, 'label', 'Drawn annotation')
            // They also need to be on the feature passed to the annotator
            // for storage
            feature.properties = {
                user_drawn: true,
                user_label: 'Drawn annotation'
            }
            this.__flatmap.annotationDrawEvent('created', feature)
        }
    }

    deletedFeature(event)
    //===================
    {
        const feature = this.#cleanFeature(event)
        if (feature) {
            this.__flatmap.annotationDrawEvent('deleted', feature.id)
        }
    }

    updatedFeature(event)
    //===================
    {
        const feature = this.#cleanFeature(event)
        if (feature) {
            this.__flatmap.annotationDrawEvent('updated', feature)
        }
    }

    addFeature(feature)
    //=================
    {
        this.__draw.add(feature)
    }

    removeFeature(feature)
    //====================
    {
        this.__draw.delete(feature.id)
    }
}

//==============================================================================
