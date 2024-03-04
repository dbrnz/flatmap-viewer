/******************************************************************************

Flatmap viewer and annotation tool

Copyright (c) 2019 - 2024  David Brooks

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

import {ObjectRecord} from '../types'

//==============================================================================

export const VECTOR_TILES_SOURCE = 'vector-tiles'

//==============================================================================

import {UNCLASSIFIED_TAXON_ID} from '../flatmap-viewer'
import {PATH_STYLE_RULES} from '../pathways'

//==============================================================================

const COLOUR_ACTIVE    = 'blue'
const COLOUR_ANNOTATED = '#C8F'
const COLOUR_SELECTED  = '#0F0'
const COLOUR_HIDDEN    = '#D8D8D8'

const CENTRELINE_ACTIVE = '#888'
const CENTRELINE_COLOUR = '#CCC'

const FEATURE_SELECTED_BORDER = 'black'

const NERVE_ACTIVE = '#222'
const NERVE_SELECTED = 'red'

//==============================================================================

const STROKE_INTERPOLATION = [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
     2, ["*", ['var', 'width'], ["^", 2, -0.5]],
     7, ["*", ['var', 'width'], ["^", 2,  2.5]],
     9, ["*", ['var', 'width'], ["^", 2,  3.0]]
]

//==============================================================================

type MaplibreStyleLayerType = 'fill' | 'line' | 'symbol' | 'raster' | 'background'

export type StylingLayer = VectorStyleLayer | RasterLayer

//==============================================================================

class StyleLayer
{
    constructor(readonly id: string, readonly source: string, readonly type: MaplibreStyleLayerType)
    {
    }

    style(_: ObjectRecord): maplibregl.LayerSpecification
    //===================================================
    {
        return {
            id: this.id,
            source: this.source,
            type: this.type
        }
    }
}

//==============================================================================

export class VectorStyleLayer extends StyleLayer
{
    __lastPaintStyle: ObjectRecord
    __sourceLayer: string

    constructor(id: string, suffix: string, sourceLayer: string, type: MaplibreStyleLayerType)
    {
        super(`${id}_${suffix}`, VECTOR_TILES_SOURCE, type)
        this.__sourceLayer = sourceLayer
        this.__lastPaintStyle = {}
    }

    makeFilter(_: ObjectRecord): maplibregl.FilterSpecification
    //=========================================================
    {
        return true
    }

    paintStyle(_: ObjectRecord, __: boolean=false): ObjectRecord
    //==========================================================
    {
        return {}
    }

    __paintChanges(newPaintStyle: ObjectRecord)
    {
        const paintChanges: ObjectRecord = {}
        for (const [property, value] of Object.entries(newPaintStyle)) {
            if (!(property in this.__lastPaintStyle)
             || JSON.stringify(value) !== JSON.stringify(this.__lastPaintStyle[property])) {
                paintChanges[property] = value
            }
        }
        return paintChanges
    }

    changedPaintStyle(newPaintStyle: ObjectRecord, changes: boolean=false): ObjectRecord
    //==================================================================================
    {
        const paintStyle = changes ? this.__paintChanges(newPaintStyle) : newPaintStyle
        this.__lastPaintStyle = newPaintStyle
        return paintStyle
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'source-layer': this.__sourceLayer
        } as maplibregl.LayerSpecification
    }
}

//==============================================================================

export class BodyLayer extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'body', sourceLayer, 'fill')
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['==', 'models', 'UBERON:0013702']
            ],
            'paint': {
                'fill-color': '#CCC',
                'fill-opacity': 0.1
            }
        } as maplibregl.FillLayerSpecification
    }
}

//==============================================================================

export class FeatureFillLayer extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'fill', sourceLayer, 'fill')
    }

    paintStyle(options: ObjectRecord, changes: boolean=false)
    //=======================================================
    {
        const coloured = !('colour' in options) || options.colour
        const dimmed = 'dimmed' in options && options.dimmed
        const paintStyle = {
            'fill-color': [
                'case',
                ['boolean', ['feature-state', 'selected'], false], COLOUR_SELECTED,
                ['boolean', ['feature-state', 'hidden'], false], COLOUR_HIDDEN,
                ['has', 'colour'], ['get', 'colour'],
                ['boolean', ['feature-state', 'active'], false], coloured ? '#D88' : '#CCC',
                'white'    // background colour? body colour ??
            ],
            'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hidden'], false], 0.1,
                ['boolean', ['feature-state', 'selected'], false], 0.2,
                ['has', 'opacity'], ['get', 'opacity'],
                ['has', 'colour'], 1.0,
                ['boolean', ['feature-state', 'active'], false], 0.7,
                (coloured && !dimmed) ? 0.01 : 0.1
            ]
        }
        return super.changedPaintStyle(paintStyle, changes)
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['!=', 'models', 'UBERON:0013702'],
                ['!has', 'node']
            ],
            'layout': {
                'fill-sort-key': ['get', 'scale']
            },
            'paint': this.paintStyle(options)
        } as maplibregl.FillLayerSpecification
    }
}

//==============================================================================

export class FeatureBorderLayer extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'border', sourceLayer, 'line')
    }

    paintStyle(options: ObjectRecord, changes=false)
    //==============================================
    {
        const coloured = !('colour' in options) || options.colour
        const outlined = !('outline' in options) || options.outline
        const dimmed = 'dimmed' in options && options.dimmed
        const activeRasterLayer = 'activeRasterLayer' in options && options.activeRasterLayer
        const lineColour: Array<any> = ['case']
        lineColour.push(['boolean', ['feature-state', 'hidden'], false], COLOUR_HIDDEN)
        lineColour.push(['boolean', ['feature-state', 'selected'], false], FEATURE_SELECTED_BORDER)
        if (coloured && outlined) {
            lineColour.push(['boolean', ['feature-state', 'active'], false], COLOUR_ACTIVE)
        }
        lineColour.push(['boolean', ['feature-state', 'annotated'], false], COLOUR_ANNOTATED)
        lineColour.push(['has', 'colour'], ['get', 'colour'])
        lineColour.push('#444')

        const lineOpacity: Array<any> = ['case']
        lineOpacity.push(['boolean', ['feature-state', 'hidden'], false], 0.05)
        if (coloured && outlined) {
            lineOpacity.push(['boolean', ['feature-state', 'active'], false], 0.9)
        }
        lineOpacity.push(['boolean', ['feature-state', 'selected'], false], 0.9)
        lineOpacity.push(['boolean', ['feature-state', 'annotated'], false], 0.9)
        if (activeRasterLayer) {
            lineOpacity.push((outlined && !dimmed) ? 0.3 : 0.1)
        } else {
            lineOpacity.push(0.5)
        }

        const lineWidth: Array<any> = ['case']
        lineWidth.push(['boolean', ['get', 'invisible'], false], 0.2)
        lineWidth.push(['boolean', ['feature-state', 'selected'], false], 1.5)
        if (coloured && outlined) {
            lineWidth.push(['boolean', ['feature-state', 'active'], false], 1.5)
        }
        lineWidth.push(['boolean', ['feature-state', 'annotated'], false], 3.5)
        lineWidth.push(['has', 'colour'], 0.7)
        lineWidth.push((coloured && outlined) ? 0.5 : 0.1)

        return super.changedPaintStyle({
            'line-color': lineColour,
            'line-opacity': lineOpacity,
            'line-width': lineWidth
        }, changes)
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['!has', 'node']
            ],
            'paint': this.paintStyle(options)
        } as maplibregl.LineLayerSpecification
    }
}

//==============================================================================

export class FeatureLineLayer extends VectorStyleLayer
{
    __dashed: boolean

    constructor(id: string, sourceLayer: string, options: ObjectRecord={})
    {
        const dashed = ('dashed' in options && options.dashed)
        super(id, `feature-${dashed ? 'line-dash' : 'line'}`, sourceLayer, 'line')
        this.__dashed = dashed
    }

    makeFilter(_: ObjectRecord={})
    //============================
    {
        return (this.__dashed ? [
            'all',
            ['==', '$type', 'LineString'],
            ['==', 'type', 'line-dash']
        ] : [
            'all',
            ['==', '$type', 'LineString'],
            [
                'any',
                ['==', 'type', 'bezier'],
                ['==', 'type', 'line']
            ]
        ]) as maplibregl.FilterSpecification
    }

    paintStyle(options: ObjectRecord, changes=false)
    //==============================================
    {
        const coloured = !('colour' in options) || options.colour
        const paintStyle: ObjectRecord = {
            'line-color': [
                'case',
                ['boolean', ['feature-state', 'hidden'], false], COLOUR_HIDDEN,
                ['boolean', ['feature-state', 'selected'], false], COLOUR_SELECTED,
                ['boolean', ['feature-state', 'active'], false], coloured ? '#888' : '#CCC',
                ['has', 'colour'], ['get', 'colour'],
                ['==', ['get', 'type'], 'network'], '#AFA202',
                options.authoring ? '#C44' : '#444'
            ],
            'line-opacity': [
                'case',
                    ['boolean', ['feature-state', 'hidden'], false], 0.01,
                    ['boolean', ['feature-state', 'selected'], false], 1.0,
                    ['has', 'colour'], 1.0,
                    ['boolean', ['feature-state', 'active'], false], 1.0,
                    0.3
                ],
            'line-width': [
                'let',
                'width',  [
                    '*',
                        ['case',
                            ['has', 'stroke-width'], ['get', 'stroke-width'],
                            1.0
                        ],
                        ['case',
                            ['boolean', ['feature-state', 'selected'], false], 1.2,
                            ['boolean', ['feature-state', 'active'], false], 1.2,
                            options.authoring ? 0.7 : 0.5
                        ]
                    ],
                    STROKE_INTERPOLATION
            ]
            // Need to vary width based on zoom??
            // Or opacity??
        }
        if (this.__dashed) {
            paintStyle['line-dasharray'] = [3, 2]
        }
        return super.changedPaintStyle(paintStyle, changes)
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'filter': this.makeFilter(options),
            'paint': this.paintStyle(options)
        } as maplibregl.LineLayerSpecification
    }
}

//==============================================================================

export class FeatureDashLineLayer extends FeatureLineLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, sourceLayer, {dashed: true})
    }
}

//==============================================================================

function sckanFilter(options: ObjectRecord)
{
    const sckanState = !('sckan' in options) ? 'all'
                     : options.sckan.toLowerCase()
    const sckanFilter =
        sckanState == 'none' ? [
            ['!', ['has', 'sckan']]
        ] :
        sckanState == 'valid' ? [[
            'any',
            ['!', ['has', 'sckan']],
            [
                'all',
                ['has', 'sckan'],
                ['==', ['get', 'sckan'], true]
            ]
        ]] :
        sckanState == 'invalid' ? [[
            'any',
            ['!', ['has', 'sckan']],
            [
                'all',
                ['has', 'sckan'],
                ['!=', ['get', 'sckan'], true]
            ]
        ]] :
        [true]
    return sckanFilter
}

//==============================================================================

export class AnnotatedPathLayer extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'annotated-path', sourceLayer, 'line')
    }

    makeFilter(options: ObjectRecord={})
    //==================================
    {
        return sckanFilter(options)[0] as maplibregl.FilterSpecification
    }

    paintStyle(options: ObjectRecord={}, changes=false)
    //=================================================
    {
        const dimmed = 'dimmed' in options && options.dimmed
        const exclude = 'excludeAnnotated' in options && options.excludeAnnotated
        const paintStyle = {
            'line-color': COLOUR_ANNOTATED,
            'line-dasharray': [5, 0.5, 3, 0.5],
            'line-opacity': [
                'case',
                    ['boolean', ['feature-state', 'active'], false], 0.8,
                    ['boolean', ['feature-state', 'selected'], false], 0.8,
                    ['boolean', ['feature-state', 'hidden'], false], 0.05,
                    ['boolean', ['feature-state', 'annotated'], false],
                        ((exclude || dimmed) ? 0.05 : 0.8),
                    0.6
                ],
            'line-width': [
                'let',
                'width',
                    ['case',
                    ['boolean', ['feature-state', 'hidden'], false], 0.0,
                    ['boolean', ['feature-state', 'annotated'], false],
                        exclude ? 0.0 : (['*', 1.1, ['case',
                            ['has', 'stroke-width'], ['get', 'stroke-width'],
                            ['boolean', ['feature-state', 'active'], false], 1.1,
                            ['boolean', ['feature-state', 'active'], false], 1.1,
                            1.0]]),
                        0.0
                    ],
                STROKE_INTERPOLATION
            ]
        }
        return super.changedPaintStyle(paintStyle, changes)
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'filter': this.makeFilter(options),
            'paint': this.paintStyle(options),
            'layout': {
                'line-cap': 'square'
            }
        } as maplibregl.LineLayerSpecification
    }
}

//==============================================================================

export class PathLineLayer extends VectorStyleLayer
{
    __dashed: boolean
    __highlight: boolean

    constructor(id: string, sourceLayer: string, options={})
    {
        const dashed = !!('dashed' in options && options.dashed)
        const highlight = !!('highlight' in options && options.highlight)
        super(id, `path${highlight ? '-highlight' : ''}-${dashed ? 'line-dash' : 'line'}`, sourceLayer, 'line')
        this.__dashed = dashed
        this.__highlight = highlight
    }

    makeFilter(options: ObjectRecord={})
    //==================================
    {
        const sckan_filter = sckanFilter(options)
        let taxonFilter: Array<any> = []
        if ('taxons' in options) {
            if (options.taxons.length) {
                taxonFilter.push('any')
                for (const taxon of options.taxons) {
                    if (taxon !== UNCLASSIFIED_TAXON_ID) {
                        taxonFilter.push(['in', taxon, ['get', 'taxons']])
                    } else {
                        taxonFilter.push(['case', ['has', 'taxons'], false, true])
                    }
                }
                taxonFilter = [taxonFilter]
            } else {
                taxonFilter.push(false)
            }
        }

        return (this.__dashed ? [
            'all',
            ['==', ['get', 'type'], 'line-dash'],
            ...sckan_filter,
            ...taxonFilter
        ] : [
            'all',
            [
                'any',
                ['==', ['get', 'type'], 'bezier'],
                [
                    'all',
                    ['==', ['get', 'type'], 'line'],
                    ...sckan_filter,
                    ...taxonFilter
                ]
            ]
        ]) as maplibregl.FilterSpecification
    }

    paintStyle(options: ObjectRecord={}, changes=false)
    //=================================================
    {
        const dimmed = 'dimmed' in options && options.dimmed
        const exclude = 'excludeAnnotated' in options && options.excludeAnnotated
        const paintStyle: ObjectRecord = {
            'line-color': [
                'let', 'active', ['to-number', ['feature-state', 'active'], 0],
                [ 'case',
                    ['boolean', ['feature-state', 'hidden'], false], COLOUR_HIDDEN,
                    ['==', ['get', 'type'], 'bezier'], 'red',
                    ...PATH_STYLE_RULES,
                    '#888'
                ]
            ],
            'line-opacity': this.__highlight ? [
                'case',
                    ['boolean', ['feature-state', 'hidden'], false], 0.0,
                    ['boolean', ['get', 'invisible'], false], 0.0,
                    ['boolean', ['feature-state', 'selected'], false], 1.0,
                    ['boolean', ['feature-state', 'active'], false], 1.0,
                0.0
            ] : [
                'case',
                    ['boolean', ['feature-state', 'hidden'], false], 0.01,
                    ['==', ['get', 'type'], 'bezier'], 1.0,
                    ['==', ['get', 'kind'], 'error'], 1.0,
                    ['boolean', ['get', 'invisible'], false], 0.001,
                    ['boolean', ['feature-state', 'selected'], false], 0.0,
                    ['boolean', ['feature-state', 'active'], false], 0.0,
                dimmed ? 0.1 : 0.8
            ],
            'line-width': [
                'let',
                'width', [
                    "*",
                    this.__highlight ? ['case',
                        ['boolean', ['get', 'invisible'], false], 0.1,
                        ['boolean', ['feature-state', 'selected'], false], [
                            'case', ['boolean', ['feature-state', 'active'], false], 1.2,
                                0.9],
                        ['boolean', ['feature-state', 'active'], false], 0.9,
                        0.0
                    ] : [
                     'case',
                        ['==', ['get', 'type'], 'bezier'], 0.1,
                        ['==', ['get', 'kind'], 'error'], 1,
                        ['==', ['get', 'kind'], 'unknown'], 1,
                        ['boolean', ['get', 'invisible'], false], 0.1,
                        ['boolean', ['feature-state', 'selected'], false], 0.0,
                        ['boolean', ['feature-state', 'active'], false], 0.0,
                        0.6
                    ],
                    ['case', ['boolean', ['feature-state', 'annotated'], false], (exclude ? 0.0 : 1.0), 1.0],
                    ['case', ['has', 'stroke-width'], ['get', 'stroke-width'], 1.0]
                ],
                STROKE_INTERPOLATION
            ]
        }
        if (this.__dashed) {
            paintStyle['line-dasharray'] = [1, 1]
        }
        return super.changedPaintStyle(paintStyle, changes)
    }

    style(options: ObjectRecord={})
    //=============================
    {
        return {
            ...super.style(options),
            'filter': this.makeFilter(options),
            'layout': {
                'line-cap': 'butt'
            },
            'paint': this.paintStyle(options)
        } as maplibregl.LineLayerSpecification
    }
}

//==============================================================================

export class PathDashlineLayer extends PathLineLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, sourceLayer, {dashed: true})
    }
}

//==============================================================================

export class PathHighlightLayer extends PathLineLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, sourceLayer, {highlight: true})
    }
}

//==============================================================================

export class PathDashHighlightLayer extends PathLineLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, sourceLayer, {dashed: true, highlight: true})
    }
}

//==============================================================================

class CentrelineLayer extends VectorStyleLayer
{
    __type: string

    constructor(id: string, type: string, sourceLayer: string)
    {
        super(id, `centreline-${type}`, sourceLayer, 'line')
        this.__type = type
    }

    paintStyle(_: ObjectRecord, changes=false)
    //========================================
    {
        const paintStyle = {
            'line-color': (this.__type == 'edge') ? '#000' : [
                'case',
                ['boolean', ['feature-state', 'selected'], false], COLOUR_SELECTED,
                ['boolean', ['feature-state', 'active'], false], CENTRELINE_ACTIVE,
                CENTRELINE_COLOUR
            ],
            'line-opacity': [
                'case',
                    ['boolean', ['feature-state', 'hidden'], false], 0,
                    ['boolean', ['feature-state', 'selected'], false], 1.0,
                    ['boolean', ['feature-state', 'active'], false], 1.0,
                (this.__type == 'edge') ? 0.4 : 0.8
            ],
            'line-width': [
                'let',
                'width',
                    (this.__type == 'edge') ? 1.6 : 1.2,
                    STROKE_INTERPOLATION
            ]
            // Need to vary width based on zoom??
            // Or opacity??
        }
        return super.changedPaintStyle(paintStyle, changes)
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'filter': [
                'all',
                ['==', '$type', 'LineString'],
                ['==', 'kind', 'centreline'],
                ['has', 'label']
            ],
            'paint': this.paintStyle(options),
            'layout': {
                'line-cap': 'round',
                'line-join': 'bevel'
            }
        } as maplibregl.LineLayerSpecification
    }
}

//==============================================================================

export class CentrelineEdgeLayer extends CentrelineLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'edge', sourceLayer)
    }
}

//==============================================================================

export class CentrelineTrackLayer extends CentrelineLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'track', sourceLayer)
    }
}

//==============================================================================

export class CentrelineNodeFillLayer extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'node-fill', sourceLayer, 'fill')
    }

    paintStyle(options: ObjectRecord={}, changes=false)
    //=================================================
    {
        const showNodes = ('showCentrelines' in options) && options.showCentrelines
        const paintStyle = {
                'fill-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], COLOUR_SELECTED,
                    ['boolean', ['feature-state', 'active'], false], CENTRELINE_ACTIVE,
                    CENTRELINE_COLOUR
                ],
                'fill-opacity': showNodes ? 0.8 : 0.01
            }
        return super.changedPaintStyle(paintStyle, changes)
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['has', 'node']
            ],
            'layout': {
                'fill-sort-key': ['get', 'scale']
            },
            'paint': this.paintStyle(options)
        } as maplibregl.FillLayerSpecification
    }
}

//==============================================================================

export class CentrelineNodeBorderLayer extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'node-border', sourceLayer, 'line')
    }

    paintStyle(options: ObjectRecord={}, changes=false)
    //=================================================
    {
        const showNodes = options.showCentrelines || false
        const paintStyle = {
                'line-color': '#000',
                'line-opacity': showNodes ? 0.1 : 0.01,
                'line-width': [
                    'let',
                    'width',
                        0.2,
                        STROKE_INTERPOLATION
                ]
            }
        return super.changedPaintStyle(paintStyle, changes)
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['has', 'node']
            ],
            'paint':  this.paintStyle(options)
        } as maplibregl.LineLayerSpecification
    }
}

//==============================================================================

export class FeatureNerveLayer extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'nerve-path', sourceLayer, 'line')
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'filter': [
                 'all',
                 ['==', '$type', 'LineString'],
                 ['!=', 'kind', 'centreline'],
                 ['==', 'type', 'nerve']
            ],
            'paint': {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'hidden'], false], COLOUR_HIDDEN,
                    ['boolean', ['feature-state', 'selected'], false], NERVE_SELECTED,
                    ['boolean', ['feature-state', 'active'], false], NERVE_ACTIVE,
                    '#888'
                ],
                'line-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hidden'], false], 0.3,
                    ['boolean', ['get', 'invisible'], false], 0.001,
                    ['boolean', ['feature-state', 'active'], false], 0.9,
                    ['boolean', ['feature-state', 'selected'], false], 0.9,
                    0.9
                ],
                'line-dasharray': [2, 1],
                'line-width': [
                    'let', 'width', ['case',
                        ['boolean', ['feature-state', 'active'], false], 0.8,
                        ['boolean', ['feature-state', 'selected'], false], 1.2,
                        0.6],
                    [ 'interpolate',
                        ['exponential', 2],
                        ['zoom'],
                         2, ["*", ['var', 'width'], ["^", 2, -1]],
                        10, ["*", ['var', 'width'], ["^", 2,  6]]
                    ]
                ]
            }
        } as maplibregl.LineLayerSpecification
    }
}

//==============================================================================

export class NervePolygonBorder extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'nerve-border', sourceLayer, 'line')
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['==', 'type', 'nerve-section']
            ],
            'paint': {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'active'], false], COLOUR_ACTIVE,
                    ['boolean', ['feature-state', 'selected'], false], 'red',
                    '#444'
                ],
                'line-opacity': [
                    'case',
                    ['boolean', ['get', 'invisible'], false], 0.05,
                    ['boolean', ['feature-state', 'active'], false], 0.9,
                    ['boolean', ['feature-state', 'selected'], false], 0.9,
                    0.3
                ],
                'line-width': [
                    'case',
                    ['boolean', ['get', 'invisible'], false], 0.5,
                    ['boolean', ['feature-state', 'selected'], false], 6,
                    2
                ]
            }
        } as maplibregl.LineLayerSpecification
    }
}

//==============================================================================

export class NervePolygonFill extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'nerve-fill', sourceLayer, 'fill')
    }

    paintStyle(options: ObjectRecord={}, changes=false)
    //=================================================
    {
        const dimmed = 'dimmed' in options && options.dimmed
        const paintStyle = {
            'fill-color': [
                'let', 'active', ['to-number', ['feature-state', 'active'], 0],
                [ 'case',
                    ['all',
                        ['==', ['var', 'active'], 0],
                        ['==', ['get', 'type'], 'arrow'],
                        ['boolean', ['feature-state', 'selected'], false]
                    ], COLOUR_SELECTED,
                    ['==', ['get', 'kind'], 'bezier-end'], 'red',
                    ['==', ['get', 'kind'], 'bezier-control'], 'green',
                    ...PATH_STYLE_RULES,
                    'white'
                ]
            ],
            'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hidden'], false], 0.01,
                ['boolean', ['feature-state', 'selected'], false], 0.8,
                ['boolean', ['feature-state', 'active'], false], 0.9,
                ['==', ['get', 'type'], 'bezier'], 0.9,
                ['any',
                    ['==', ['get', 'type'], 'arrow'],
                    ['==', ['get', 'type'], 'junction']
                ], dimmed ? 0.1 : 0.5,
                0.01
            ]
        }
        return super.changedPaintStyle(paintStyle, changes)
    }

    style(options: ObjectRecord={})
    //=============================
    {
        return {
            ...super.style(options),
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['any',
                    ['==', 'type', 'arrow'],
                    ['==', 'type', 'bezier'],
                    ['==', 'type', 'junction'],
                    ['==', 'type', 'nerve'],
                    ['==', 'type', 'nerve-section']
                ]
            ],
            'paint': this.paintStyle(options)
        } as maplibregl.FillLayerSpecification
    }
}

//==============================================================================

export class FeatureLargeSymbolLayer extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'large-symbol', sourceLayer, 'symbol')
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'minzoom': 3,
            //'maxzoom': 7,
            'filter': [
                'all',
                ['has', 'labelled'],
                ['has', 'label']
            ],
            'layout': {
                'visibility': 'visible',
                'icon-allow-overlap': true,
                'icon-image': 'label-background',
                'text-allow-overlap': true,
                'text-field': '{label}',
                'text-font': ['Open Sans Regular'],
                'text-line-height': 1,
                'text-max-width': 5,
                'text-size': 16,
                'icon-text-fit': 'both'
            },
            'paint': {
                'text-color': [
                    'case',
                    ['boolean', ['feature-state', 'active'], false], '#8300bf',
                    '#000'
                ]
            }
        } as maplibregl.SymbolLayerSpecification
    }
}

//==============================================================================

export class FeatureSmallSymbolLayer extends VectorStyleLayer
{
    constructor(id: string, sourceLayer: string)
    {
        super(id, 'small-symbol', sourceLayer, 'symbol')
    }

    style(options: ObjectRecord)
    //==========================
    {
        return {
            ...super.style(options),
            'minzoom': 6,
            'filter': [
                'all',
                ['has', 'label'],
                ['>', 'scale', 5]
            ],
            'layout': {
                'visibility': 'visible',
                'icon-allow-overlap': true,
                'icon-image': 'label-background',
                'text-allow-overlap': true,
                'text-field': '{label}',
                'text-font': ['Open Sans Regular'],
                'text-line-height': 1,
                'text-max-width': 5,
                'text-size': ['interpolate', ['linear'], ['zoom'], 5, 8, 7, 12, 9, 20],
                'icon-text-fit': 'both'
            },
            'paint': {
                'text-color': [
                    'case',
                    ['boolean', ['feature-state', 'active'], false], '#8300bf',
                    '#000'
                ]
            }
        } as maplibregl.SymbolLayerSpecification
    }
}

//==============================================================================

export class BackgroundLayer extends StyleLayer
{
    static defaultSettings = {
        colour: 'white',
        opacity: 1.0
    }
    constructor()
    {
        super('background', 'background', 'background')
    }

    style(options: ObjectRecord={})
    //=============================
    {
        const settings = Object.assign({}, BackgroundLayer.defaultSettings, options)
        return {
            ...super.style(options),
            'paint': {
                'background-color': settings.colour,
                'background-opacity': settings.opacity
            }
        } as maplibregl.BackgroundLayerSpecification
    }
}

//==============================================================================

export class RasterLayer extends StyleLayer
{
    constructor(id: string)
    {
        super(id, id, 'raster')
    }

    style(options: ObjectRecord)
    //==========================
    {
        const coloured = !('colour' in options) || options.colour
        return {
            ...super.style(options),
            'layout': {
                'visibility': coloured ? 'visible' : 'none'
            }
        } as maplibregl.RasterLayerSpecification
    }
}

//==============================================================================
