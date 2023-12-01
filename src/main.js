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

import { MapManager } from './flatmap-viewer';
export { MapManager };

//==============================================================================

export async function standaloneViewer(map_endpoint=null, options={})
{
    const requestUrl = new URL(window.location.href);
    if (map_endpoint == null) {
        const parts = requestUrl.pathname.split('/');
        map_endpoint = requestUrl.origin + (parts.slice(0, (parts[parts.length - 1] === '') ? -2 : -1)
                                            .concat([''])
                                            .join('/'));
    }

    const mapManager = new MapManager(map_endpoint, {
        images: [
            {
                id: 'label-background',
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAmCAIAAADbSlUzAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAJOgAACToAYJjBRwAAACVSURBVFhH7dixDoJAEIThfXqMBcYKrTQ+jkYSStDYkVhZINxyEshJcZXJtC7FfNlmur9eyXb7Vqf6+bI9HUKyWkt5e4RlOF9ycerjsqbqpfefuKzNJawBWIOxBmMNxhqMNRhrMNZgrMFYg7EGYw3GGow1GGuw5dU07y4ua22nUlb3uKxd80IOx1Pjxp+f4P/P+ZButl+YrbXnPs+YmAAAAABJRU5ErkJggg==',
                options: {
                    content: [21, 4, 28, 33],
                    stretchX: [[21, 28]],
                    stretchY: [[4, 33]]
                }
            }
        ]
    });

    let currentMap = null;
    let defaultBackground = localStorage.getItem('flatmap-background-colour') || 'black';

    const mapOptions = Object.assign({
        tooltips: true,
        background: defaultBackground,
        debug: false,
        minimap: false,
        showId: true,
        showPosition: false,
        standalone: true,
    }, options);

    function loadMap(id, taxon, sex)
    //==============================
    {
        if (currentMap !== null) {
            currentMap.close();
        }
        if (id !== null) {
            requestUrl.searchParams.set('id', id);
            requestUrl.searchParams.delete('taxon');
            requestUrl.searchParams.delete('sex');
        } else if (taxon !== null) {
            id = taxon;
            requestUrl.searchParams.set('taxon', taxon);
            if (sex !== null) {
                requestUrl.searchParams.set('sex', sex);
            }
            requestUrl.searchParams.delete('id');
        }

        // Update address bar URL to current map
        window.history.pushState('data', document.title, requestUrl);

        mapManager.loadMap(id, 'map-canvas', (eventType, ...args) => {
                if (args[0].type === 'control' && args[0].control === 'background') {
                    mapOptions.background = args[0].value;
                }
            }, mapOptions)
            .then(map => {
                map.addMarker('UBERON:0000948', {className: 'heart-marker'}); // Heart
                map.addMarker('UBERON:0002048'); // Lung
                map.addMarker('UBERON:0000945'); // Stomach
                map.addMarker('UBERON:0001155'); // Colon
                map.addMarker('UBERON:0001255'); // Bladder
                currentMap = map;
            })
            .catch(error => {
                console.log(error);
                alert(error);
            });
    }

    const viewMapId = requestUrl.searchParams.get('id');
    const viewMapTaxon = requestUrl.searchParams.get('taxon');
    const viewMapSex = requestUrl.searchParams.get('sex');

    const latestMaps = new Map();
    const maps = await mapManager.allMaps();
    for (const map of Object.values(maps)) {
        const text = [];
        if ('describes' in map) {
            text.push(map.describes);
        }
        if ('name' in map) {
            text.push(map.name);
        } else {
            text.push(map.id);
        }
        const mapName = text.join(' -- ')
        if (!latestMaps.has(mapName)) {
            latestMaps.set(mapName, map);
        } else if (latestMaps.get(mapName).created < map.created) {
            latestMaps.set(mapName, map);
        }
    }
    // Sort in created order with most recent first
    const sortedMaps = new Map([...latestMaps].sort((a, b) => (a[1].created < b[1].created) ? 1
                                                            : (a[1].created > b[1].created) ? -1
                                                            : 0));
    let mapId = null;
    let mapTaxon = null;
    let mapSex = null;
    const mapList = [];
    for (const [name, map] of sortedMaps.entries()) {
        const text = [ name, map.created ];
        let selected = '';
        const id = ('uuid' in map) ? map.uuid : map.id;
        if (mapId === null && id === viewMapId) {
            mapId = id;
            selected = 'selected';
        } else if (mapId === null
                && mapTaxon === null
                && map.taxon === viewMapTaxon
                && !('biologicalSex' in map || map.biologicalSex === viewMapSex)) {
            mapTaxon = viewMapTaxon;
            mapSex = viewMapSex;
            selected = 'selected';
        }
        mapList.push(`<option value="${id}" ${selected}>${text.join(' -- ')}</option>`);
    }
    mapList.splice(0, 0, '<option value="">Select flatmap...</option>');

    const selector = document.getElementById('map-selector');
    selector.innerHTML = mapList.join('');
    selector.onchange = (e) => {
        if (e.target.value !== '') {
            loadMap(e.target.value);
        }
    }

    if (mapId === null) {
        mapId = viewMapId;
    }
    if (mapTaxon === null) {
        mapTaxon = viewMapTaxon;
    }
    if (mapSex === null) {
        mapTaxon = viewMapSex;
    }
    if (mapId === null && mapTaxon == null) {
        mapId = selector.options[1].value;
        selector.options[1].selected = true;
    }

    loadMap(mapId, mapTaxon, mapSex);
}
