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

export class BackgroundLayer
{
    static style(backgroundColour)
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

export class BodyLayer
{
    static style(mapLayerId, sourceLayer)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_body`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
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

export class FeatureFillLayer
{
    static paintStyle(options)
    {
        const coloured = !('colour' in options) || options.colour;
        return {
            'fill-color': [
                'case',
                ['boolean', ['feature-state', 'active'], false], coloured ? '#D88' : '#CCC',
                ['boolean', ['feature-state', 'selected'], false], '#AAA',
                'white'
            ],
            'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'active'], false], 0.5,
                ['boolean', ['feature-state', 'selected'], false], 0.3,
                coloured ? 0.01 : 0.3
            ]
        };
    }

    static style(mapLayerId, sourceLayer, options)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_fill`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
            'type': 'fill',
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['!=', 'models', 'UBERON:0013702']
            ],
            'layout': {
                'fill-sort-key': ['get', 'scale']
            },
            'paint': FeatureFillLayer.paintStyle(options)
        };
    }
}

//==============================================================================

export class FeatureBorderLayer
{
    static paintStyle(options)
    {
        const coloured = !('colour' in options) || options.colour;
        const outlined = !('outline' in options) || options.outline;
        const lineColour = [ 'case' ];
        if (coloured && outlined) {
            lineColour.push(['boolean', ['feature-state', 'active'], false]);
            lineColour.push('blue');
        }
        lineColour.push(['boolean', ['feature-state', 'selected'], false]);
        lineColour.push('red');
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
        lineOpacity.push(outlined ? 0.3 : 0.01);

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

        return {
            'line-color': lineColour,
            'line-opacity': lineOpacity,
            'line-width': lineWidth
        };
    }

    static style(mapLayerId, sourceLayer, options)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_border`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
            'type': 'line',
            'filter': [
                '==', '$type', 'Polygon'
            ],
            'paint': FeatureBorderLayer.paintStyle(options)
        };
    }
}

//==============================================================================

export class FeatureLineLayer
{
    static style(mapLayerId, sourceLayer)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_divider-line`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
            'type': 'line',
            'filter': [
                 'all',
                 ['==', '$type', 'LineString']
            ],
            'paint': {
                'line-color': '#444',
                'line-opacity': 0.3,
                'line-width': 0.5
            }
        };
    }
}

//==============================================================================


function pathPaintStyle(dashed=false)
{
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
            'red'
        ],
        'line-opacity': [
            'case',
                ['==', ['get', 'type'], 'bezier'], 0.3,
                ['boolean', ['get', 'invisible'], false], 0.001,
                ['boolean', ['feature-state', 'active'], false], 1.0,
                ['boolean', ['feature-state', 'selected'], false], 0.9,
                ['boolean', ['feature-state', 'hidden'], false], 0.1,
            0.4
        ],
        'line-width': [
            'let',
            'width', [
                'case',
                    ['==', ['get', 'type'], 'bezier'], 0.2,
                    ['boolean', ['get', 'centreline'], false], 2,
                    ['boolean', ['get', 'invisible'], false], 1,
                    ['boolean', ['feature-state', 'active'], false], 0.8,
                    ['boolean', ['feature-state', 'selected'], false], 0.9,
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
    if (dashed) {
        paintStyle['line-dasharray'] = [3, 2];
    }
    return paintStyle;
}

//==============================================================================

export class PathLineLayer
{
    static style(mapLayerId, sourceLayer)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_line`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
            'type': 'line',
            'filter': [
                'all',
                ['==', '$type', 'LineString'],
                ['any',
                    ['==', 'type', 'bezier'],
                    ['==', 'type', 'line']  // this is where 'line-dash' type comes in...
                ]
            ],
            'paint': pathPaintStyle(false)
        };
    }
}

//==============================================================================

export class PathDashlineLayer
{
    static style(mapLayerId, sourceLayer)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_line-dash`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
            'type': 'line',
            'filter': [
                 'all',
                 ['==', '$type', 'LineString'],
                 ['==', 'type', 'line-dash']
            ],
            'paint': pathPaintStyle(true)
        };
    }
}

//==============================================================================

export class FeatureNerveLayer
{
    static style(mapLayerId, sourceLayer)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_nerve-path`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
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

export class NervePolygonBorder
{
    static style(mapLayerId, sourceLayer)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_nerve-border`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
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

export class NervePolygonFill
{
    static style(mapLayerId, sourceLayer)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_nerve-fill`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
            'type': 'fill',
            'filter': [
                'all',
                ['==', '$type', 'Polygon'],
                ['any',
                    ['==', 'type', 'bezier'],
                    ['==', 'type', 'nerve'],
                    ['==', 'type', 'nerve-section']
                ]
            ],
            'paint': {
                'fill-color': [
                    'case',
                    ['==', ['get', 'kind'], 'bezier-control'], 'red',
                    ['==', ['get', 'kind'], 'bezier-end'], 'green',
                    'white'
                ],
                'fill-opacity': [
                    'case',
                    ['==', ['get', 'type'], 'bezier'], 0.2,
                    0.01
                ]
            }
        };
    }
}

//==============================================================================

export class FeatureLargeSymbolLayer
{
    static style(mapLayerId, sourceLayer)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_large-symbol`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
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

export class FeatureSmallSymbolLayer
{
    static style(mapLayerId, sourceLayer)
    {
        return {
            'id': `${mapLayerId}_${sourceLayer}_small-symbol`,
            'source': VECTOR_TILES_SOURCE,
            'source-layer': sourceLayer,
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

export class RasterLayer
{
    static style(rasterLayerId, options)
    {
        const coloured = !('colour' in options) || options.colour;
        return {
            'id': rasterLayerId,
            'source': rasterLayerId,
            'type': 'raster',
            'visibility': coloured ? 'visible' : 'none'
        };
    }
}

//==============================================================================
