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

export const VECTOR_TILES_SOURCE = 'vector-tiles';

//==============================================================================

class VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer, idPrefix)
    {
        this.__id = `${mapLayerId}_${sourceLayer}_${idPrefix}`;
        this.__sourceLayer = sourceLayer;
        this.__lastPaintStyle = {};
    }

    get id()
    {
        return this.__id;
    }

    paintStyle(options, changes=false)
    {
        return {};
    }

    __paintChanges(newPaintStyle)
    {
        const paintChanges = {};
        for (const [property, value] of Object.entries(newPaintStyle)) {
            if (!(property in this.__lastPaintStyle)
             || JSON.stringify(value) !== JSON.stringify(this.__lastPaintStyle[property])) {
                paintChanges[property] = value;
            }
        }
        return paintChanges;
    }

    changedPaintStyle(newPaintStyle, changes=false)
    {
        const paintStyle = changes ? this.__paintChanges(newPaintStyle) : newPaintStyle;
        this.__lastPaintStyle = newPaintStyle;
        return paintStyle;
    }

    style()
    {
        return {
            'id': this.__id,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': this.__sourceLayer
        };
    }
}

//==============================================================================

export class BodyLayer extends VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer)
    {
        super(mapLayerId, sourceLayer, 'body');
    }

    style(options)
    {
        return {
            ...super.style(),
            'type': 'fill',
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['==', 'models', 'UBERON:0013702']
            ],
            'paint': {
                'fill-color': '#CCC',
                'fill-opacity': 0.1
            }
        };
    }
}

//==============================================================================

export class FeatureFillLayer extends VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer)
    {
        super(mapLayerId, sourceLayer, 'fill');
    }

    paintStyle(options, changes=false)
    {
        const coloured = !('colour' in options) || options.colour;
        const dimmed = 'dimmed' in options && options.dimmed;
        const paintStyle = {
            'fill-color': [
                'case',
                ['boolean', ['feature-state', 'active'], false], coloured ? '#D88' : '#CCC',
                ['boolean', ['feature-state', 'selected'], false], '#0F0',
                ['any',
                      ['==', ['get', 'kind'], 'scaffold']
                ], 'white',
                ['has', 'colour'], ['get', 'colour'],
                ['has', 'node'], '#AFA202',
                'white'    // background colour? body colour ??
            ],
            'fill-opacity': [
                'case',
                ['any',
                      ['==', ['get', 'kind'], 'scaffold'],
                      ['==', ['get', 'kind'], 'tissue'],
                      ['==', ['get', 'kind'], 'cell-type'],
                ], 0.1,
                ['has', 'colour'], 0.8,
                ['has', 'node'], 0.3,
                ['boolean', ['feature-state', 'selected'], false], 1.0,
                ['boolean', ['feature-state', 'active'], false], 0.8,
                (coloured && !dimmed) ? 0.01 : 0.5
            ]
        };
        return super.changedPaintStyle(paintStyle, changes);
    }

    style(options)
    {
        return {
            ...super.style(),
            'type': 'fill',
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['!=', 'models', 'UBERON:0013702']
            ],
            'layout': {
                'fill-sort-key': ['get', 'scale']
            },
            'paint': this.paintStyle(options)
        };
    }
}

//==============================================================================

export class FeatureBorderLayer extends VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer)
    {
        super(mapLayerId, sourceLayer, 'border');
    }

    paintStyle(options, changes=false)
    {
        const coloured = !('colour' in options) || options.colour;
        const outlined = !('outline' in options) || options.outline;
        const dimmed = 'dimmed' in options && options.dimmed;
        const lineColour = [ 'case' ];
        lineColour.push(['boolean', ['feature-state', 'selected'], false]);
        lineColour.push('red');
        if (coloured && outlined) {
            lineColour.push(['boolean', ['feature-state', 'active'], false]);
            lineColour.push('blue');
        }
        lineColour.push(['has', 'colour']);
        lineColour.push(['get', 'colour']);
        lineColour.push(['has', 'node']);
        lineColour.push('#AFA202');
        lineColour.push('#444');

        const lineOpacity = [
            'case',
            ['boolean', ['get', 'invisible'], false], 0.05,
            ];
        if (coloured && outlined) {
            lineOpacity.push(['boolean', ['feature-state', 'active'], false]);
            lineOpacity.push(0.9);
        }
        lineOpacity.push(['boolean', ['feature-state', 'selected'], false]);
        lineOpacity.push(0.9);
        lineOpacity.push((outlined && !dimmed) ? 0.3 : 0.01);

        const lineWidth = [
            'case',
            ['boolean', ['get', 'invisible'], false], 0.2,
            ];
        if (coloured && outlined) {
            lineWidth.push(['boolean', ['feature-state', 'active'], false]);
            lineWidth.push(1);
        }
        lineWidth.push(['boolean', ['feature-state', 'selected'], false]);
        lineWidth.push(1.5);
        lineWidth.push((coloured && outlined) ? 0.5 : 0.1);

        return super.changedPaintStyle({
            'line-color': lineColour,
            'line-opacity': lineOpacity,
            'line-width': lineWidth
        }, changes);
    }

    style(options)
    {
        return {
            ...super.style(),
            'type': 'line',
            'filter': [
                '==', '$type', 'Polygon'
            ],
            'paint': this.paintStyle(options)
        };
    }
}

//==============================================================================

export class FeatureLineLayer extends VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer)
    {
        super(mapLayerId, sourceLayer, 'divider-line');
    }

    style(options)
    {
        const coloured = !('colour' in options) || options.colour;
        return {
            ...super.style(),
            'type': 'line',
            'filter': [
                 'all',
                 ['==', '$type', 'LineString']
                 // not for paths...
            ],
            'paint': {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'active'], false], coloured ? '#D88' : '#CCC',
                    ['boolean', ['feature-state', 'selected'], false], '#0F0',
                    ['==', ['get', 'type'], 'network'], '#AFA202',
                    ['has', 'centreline'], '#888',
                    ('authoring' in options && options.authoring) ? '#F44' : '#444'
                ],
                'line-opacity': 0.3,
                'line-width': [
                    'let',
                    'width', [
                        'case',
                            ['has', 'centreline'], 1.2,
                            ['==', ['get', 'type'], 'network'], 1.2,
                        ('authoring' in options && options.authoring) ? 0.4 : 0.1
                        ], [
                        'interpolate',
                            ['exponential', 2],
                            ['zoom'],
                             2, ["*", ['var', 'width'], ["^", 2, -0.5]],
                             7, ["*", ['var', 'width'], ["^", 2,  2.5]],
                             9, ["*", ['var', 'width'], ["^", 2,  4.0]]
                        ]
                ]
                // Need to vary width based on zoom??
                // Or opacity??
            }
        };
    }
}

//==============================================================================

export class PathLineLayer extends VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer, dashed=false)
    {
        const filterType = dashed ? 'line-dash' : 'line';
        super(mapLayerId, sourceLayer, filterType);
        this.__filter = dashed ?
            [
                'any',
                ['==', 'type', `line-dash`]
            ]
        :
            [
                'any',
                ['==', 'type', 'bezier'],
                ['==', 'type', `line`]
            ];
        this.__dashed = dashed;
    }

    paintStyle(options, changes=false)
    {
        const dimmed = 'dimmed' in options && options.dimmed;
        const paintStyle = {
            'line-color': [
                'case',
                ['boolean', ['feature-state', 'hidden'], false], '#CCC',
                ['==', ['get', 'type'], 'bezier'], 'red',
                ['==', ['get', 'kind'], 'cns'], '#9B1FC1',
                ['==', ['get', 'kind'], 'lcn'], '#F19E38',
                ['==', ['get', 'kind'], 'para-post'], '#3F8F4A',
                ['==', ['get', 'kind'], 'para-pre'], '#3F8F4A',
                ['==', ['get', 'kind'], 'somatic'], '#98561D',
                ['==', ['get', 'kind'], 'sensory'], '#2A62F6',
                ['==', ['get', 'kind'], 'symp-post'], '#EA3423',
                ['==', ['get', 'kind'], 'symp-pre'], '#EA3423',
                '#888'
            ],
            'line-opacity': [
                'case',
                    ['==', ['get', 'type'], 'bezier'], 1.0,
                    ['boolean', ['get', 'invisible'], false], 0.001,
                    ['boolean', ['feature-state', 'selected'], false], 1.0,
                    ['boolean', ['feature-state', 'active'], false], 0.8,
                    ['boolean', ['feature-state', 'hidden'], false], 0.1,
                dimmed ? 0.1 : 0.4
            ],
            'line-width': [
                'let',
                'width', [
                    'case',
                        ['==', ['get', 'type'], 'bezier'], 0.1,
                        ['boolean', ['get', 'invisible'], false], 0.1,
                        ['boolean', ['feature-state', 'selected'], false], 1.2,
                        ['boolean', ['feature-state', 'active'], false], 0.9,
                    0.8
                    ], [
                    'interpolate',
                        ['exponential', 2],
                        ['zoom'],
                         2, ["*", ['var', 'width'], ["^", 2, -0.5]],
                         7, ["*", ['var', 'width'], ["^", 2,  2.5]],
                         9, ["*", ['var', 'width'], ["^", 2,  4.0]]
                    ]
            ]
        };
        if (this.__dashed) {
            paintStyle['line-dasharray'] = [3, 2];
        }
        return super.changedPaintStyle(paintStyle, changes);
    }

    style(options)
    {
        return {
            ...super.style(),
            'type': 'line',
            'filter': [
                'all',
                ['==', '$type', 'LineString'],
                this.__filter
            ],
            'layout': {
                'line-cap': 'butt'
            },
            'paint': this.paintStyle(options)
        };
    }
}

//==============================================================================

export class PathDashlineLayer extends PathLineLayer
{
    constructor(mapLayerId, sourceLayer)
    {
        super(mapLayerId, sourceLayer, true);
    }
}

//==============================================================================

export class FeatureNerveLayer extends VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer)
    {
        super(mapLayerId, sourceLayer, 'nerve-path');
    }

    style(options)
    {
        return {
            ...super.style(),
            'type': 'line',
            'filter': [
                 'all',
                 ['==', '$type', 'LineString'],
                 ['==', 'type', 'nerve']
            ],
            'paint': {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'active'], false], '#222',
                    ['boolean', ['feature-state', 'selected'], false], 'red',
                    ['boolean', ['feature-state', 'hidden'], false], '#CCC',
                    '#888'
                ],
                'line-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'active'], false], 0.9,
                    ['boolean', ['feature-state', 'selected'], false], 0.9,
                    ['boolean', ['feature-state', 'hidden'], false], 0.3,
                    ['boolean', ['get', 'invisible'], false], 0.001,
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
        };
    }
}

//==============================================================================

export class NervePolygonBorder extends VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer)
    {
        super(mapLayerId, sourceLayer, 'nerve-border');
    }

    style(options)
    {
        return {
            ...super.style(),
            'type': 'line',
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['==', 'type', 'nerve-section']
            ],
            'paint': {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'active'], false], 'blue',
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
        };
    }
}

//==============================================================================

export class NervePolygonFill extends VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer)
    {
        super(mapLayerId, sourceLayer, 'nerve-fill');
    }

    style(options)
    {
        return {
            ...super.style(),
            'type': 'fill',
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['any',
                    ['==', 'type', 'bezier'],
                    ['==', 'type', 'junction'],
                    ['==', 'type', 'nerve'],
                    ['==', 'type', 'nerve-section']
                ]
            ],
            'paint': {
                'fill-color': [
                    'case',
                    ['==', ['get', 'kind'], 'bezier-end'], 'red',
                    ['==', ['get', 'kind'], 'bezier-control'], 'green',
                    ['==', ['get', 'kind'], 'cns'], '#9B1FC1',
                    ['==', ['get', 'kind'], 'lcn'], '#F19E38',
                    ['==', ['get', 'kind'], 'para-post'], '#3F8F4A',
                    ['==', ['get', 'kind'], 'para-pre'], '#3F8F4A',
                    ['==', ['get', 'kind'], 'somatic'], '#98561D',
                    ['==', ['get', 'kind'], 'sensory'], '#2A62F6',
                    ['==', ['get', 'kind'], 'symp-post'], '#EA3423',
                    ['==', ['get', 'kind'], 'symp-pre'], '#EA3423',
                    'white'
                ],
                'fill-opacity': [
                    'case',
                    ['==', ['get', 'type'], 'bezier'], 0.9,
                    ['==', ['get', 'type'], 'junction'], 0.4,
                    0.01
                ]
            }
        };
    }
}

//==============================================================================

export class FeatureLargeSymbolLayer extends VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer)
    {
        super(mapLayerId, sourceLayer, 'large-symbol');
    }

    style(options)
    {
        return {
            ...super.style(),
            'type': 'symbol',
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
        };
    }
}

//==============================================================================

export class FeatureSmallSymbolLayer extends VectorStyleLayer
{
    constructor(mapLayerId, sourceLayer)
    {
        super(mapLayerId, sourceLayer, 'small-symbol');
    }

    style(options)
    {
        return {
            ...super.style(),
            'type': 'symbol',
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
                'text-size': {'stops': [[5, 8], [7, 12], [9, 20]]},
                'icon-text-fit': 'both'
            },
            'paint': {
                'text-color': [
                    'case',
                    ['boolean', ['feature-state', 'active'], false], '#8300bf',
                    '#000'
                ]
            }
        };
    }
}

//==============================================================================

export class BackgroundLayer
{
    constructor(rasterLayerId)
    {
        this.__id = 'background';
    }

    get id()
    {
        return this.__id;
    }

    style(backgroundColour)
    {
        return {
            'id': 'background',
            'type': 'background',
            'paint': {
                'background-color': backgroundColour,
                'background-opacity': 0.1
            }
        };
    }
}

//==============================================================================

export class RasterLayer
{
    constructor(rasterLayerId)
    {
        this.__id = rasterLayerId;
    }

    get id()
    {
        return this.__id;
    }

    style(options)
    {
        const coloured = !('colour' in options) || options.colour;
        return {
            'id': this.__id,
            'source': this.__id,
            'type': 'raster',
            'visibility': coloured ? 'visible' : 'none'
        };
    }
}

//==============================================================================
