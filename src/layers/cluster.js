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

import {SvgManager, SvgTemplateManager} from '../../thirdParty/maplibre-gl-svg/src'

//==============================================================================

const markerLargeCircle = `<svg xmlns="http://www.w3.org/2000/svg" width="calc(28 * {scale})" height="calc(39 * {scale})" viewBox="-1 -1 27 42">
    <ellipse style="fill: rgb(0, 0, 0); fill-opacity: 0.2;" cx="12" cy="36" rx="8" ry="4"/>
    <path d="M12.25.25a12.254 12.254 0 0 0-12 12.494c0 6.444 6.488 12.109 11.059 22.564.549 1.256 1.333 1.256 1.882 0
             C17.762 24.853 24.25 19.186 24.25 12.744A12.254 12.254 0 0 0 12.25.25Z"
          style="fill:{color};stroke:{secondaryColor};stroke-width:1"/>
    <circle cx="12.5" cy="12.5" r="9" fill="{secondaryColor}"/>
    <text x="12" y="17.5" style="font-size:14px;fill:#000;text-anchor:middle">{text}</text>
</svg>`

const markerSmallCircle = `<svg xmlns="http://www.w3.org/2000/svg" width="calc(28 * {scale})" height="calc(39 * {scale})" viewBox="-1 -1 27 42">
    <ellipse style="fill: rgb(0, 0, 0); fill-opacity: 0.2;" cx="12" cy="36" rx="8" ry="4"/>
    <path d="M12.25.25a12.254 12.254 0 0 0-12 12.494c0 6.444 6.488 12.109 11.059 22.564.549 1.256 1.333 1.256 1.882 0
             C17.762 24.853 24.25 19.186 24.25 12.744A12.254 12.254 0 0 0 12.25.25Z"
          style="fill:{color};stroke:{secondaryColor};stroke-width:1"/>
    <circle cx="12.5" cy="12.5" r="5" fill="{secondaryColor}"/>
</svg>`

//==============================================================================

export async function loadClusterIcons(map)
{
    SvgTemplateManager.addTemplate('marker-large-circle', markerLargeCircle, false)
    SvgTemplateManager.addTemplate('marker-small-circle', markerSmallCircle, false)

    const svgManager = new SvgManager(map)
    await svgManager.createFromTemplate('clustered-marker', 'marker-large-circle', '#EE5900', '#fff')
    await svgManager.createFromTemplate('unclustered-marker', 'marker-small-circle', '#005974', '#fff')
}

//==============================================================================

export class ClusteredMarkerLayer
{
    #flatmap
    #map
    #points = {
       type: 'FeatureCollection',
       features: []
    }
    #ui

    constructor(flatmap, ui)
    {
        this.#flatmap = flatmap
        this.#ui = ui
        this.#map = flatmap.map

        this.#map.addSource('markers', {
            type: 'geojson',
            data: this.#points,
            cluster: true,      // Adds the ``point_count`` property to source data
            clusterMaxZoom: 9,  // Max zoom to cluster points on
            clusterRadius: 50   // Radius of each cluster when clustering points (defaults to 50)
        })

        this.#map.addLayer({
            id: 'clustered-markers',
            type: 'symbol',
            source: 'markers',
            filter: ['has', 'point_count'],
            'layout': {
                'icon-image': 'clustered-marker',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-offset': [0, -17],
                'icon-size': 0.8,
                'text-field': '{point_count_abbreviated}',
                'text-size': 10,
                'text-offset': [0, -1.93]
            }
        })

        this.#map.addLayer({
            id: 'single-points',
            type: 'symbol',
            source: 'markers',
            filter: ['!', ['has', 'point_count']],
            'layout': {
                'icon-image': 'unclustered-marker',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-offset': [0, -17],
                'icon-size': 0.6
            }
        })

        // inspect a cluster on click
        this.#map.on('click', 'clustered-markers', async (e) => {
            const features = this.#map.queryRenderedFeatures(e.point, {
                layers: ['clustered-markers']
            })
            const clusterId = features[0].properties.cluster_id
            const zoom = await this.#map.getSource('markers').getClusterExpansionZoom(clusterId)
            this.#map.easeTo({
                center: features[0].geometry.coordinates,
                zoom
            })
        })

        this.#map.on('click', 'single-points', this.singleMarkerEvent.bind(this))
        this.#map.on('mouseenter', 'single-points', this.singleMarkerEvent.bind(this))
        this.#map.on('mousemove', 'single-points', this.singleMarkerEvent.bind(this))

        this.#map.on('mouseenter', 'clustered-markers', () => {
            this.#map.getCanvas().style.cursor = 'pointer'
        })

        this.#map.on('mouseleave', 'clustered-markers', () => {
            this.#map.getCanvas().style.cursor = ''
        })
    }

    singleMarkerEvent(event)
    //======================
    {
        const features = this.#map.queryRenderedFeatures(event.point, {
            layers: ['single-points']
        })
        for (const feature of features) {
            const properties = feature.properties
            const position = properties.markerPosition.slice(1, -1).split(',').map(p => +p)
            this.#ui.markerEvent_(event, feature.id, position, properties.models, properties)
        }
        event.originalEvent.stopPropagation()
    }

    addMarker(id, position, properties={})
    //====================================
    {
        this.#points.features.push({
            type: 'Feature',
            id,
            properties,
            geometry: {
                type: 'Point',
                coordinates: position
            }
        })
        this.#map.getSource('markers')
                 .setData(this.#points)
    }

    clearMarkers()
    //============
    {
        this.#points.features = []
        this.#map.getSource('markers')
                 .setData(this.#points)
    }
}

//==============================================================================

