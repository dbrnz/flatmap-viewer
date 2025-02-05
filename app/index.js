/******************************************************************************

Flatmap viewer and annotation tool

Copyright (c) 2019 - 2025 David Brooks

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

import { MapManager } from '../src/flatmap-viewer';

//==============================================================================

const DEBUG = false;
const MINIMAP = true; // { width: '10%', background: '#FCC' };

const MAP_ENDPOINTS = {
    local: 'http://localhost:8000',
    curation: 'https://mapcore-demo.org/curation/flatmap/',
    devel: 'https://mapcore-demo.org/devel/flatmap/v4/',
    fccb: 'https://mapcore-demo.org/fccb/flatmap/',
    production: 'https://mapcore-demo.org/current/flatmap/v3/',
    staging: 'https://mapcore-demo.org/staging/flatmap/v1/',
}

const DEFAULT_OPTIONS = {
    tooltips: true,
    debug: false,
    minimap: false,
    showId: true,
    showPosition: false,
    showLngLat: false,
    standalone: true,
    flightPaths: false,
    maxZoom: 10
}

window.onload = standaloneViewer(MAP_ENDPOINTS, {
    debug: DEBUG,
    minimap: MINIMAP
})

//==============================================================================

const keyPrompts = [
    ['id', 'Map Id'],
    ['uuid', 'Map UUID'],
    ['name', 'Name'],
    ['describes', 'Describes'],
    ['taxon', 'Taxon Id'],
    ['biological-sex', 'Biological sex'],
    ['created', 'Created'],
    ['creator', 'Created by'],
    ['source', 'Map source'],
    ['git-status', 'Git'],
    ['server', 'Map server'],
    ['sckan', 'SCKAN release'],
    ['connectivity', 'SCKAN connectivity']
]

function fieldAsHtml(dict, level, sckan=false)
//============================================
{
    const html = []
    for (const key of Object.keys(dict)) {
        let value = dict[key]
        if (value instanceof Object && value.constructor === Object) {
            value = fieldAsHtml(value, level + 1, sckan)
        }
        const prompt = (sckan && key==='date') ? 'Version' : key.at(0).toUpperCase() + key.slice(1)
        html.push(`<div class="info"><span class="prompt">${'<span class="spacer">&nbsp;</span>'.repeat(level)}${prompt}:</span> ${value}</div>`)
    }
    return html.join('\n')
}

function provenanceAsHtml(dict)
//=============================
{
    const mapServer = dict.server || null
    const mapID = dict.uuid || dict.id || null

    const html = []
    for (const [key, prompt] of keyPrompts) {
        if (key in dict) {
            let value = dict[key]
            if (value instanceof Object && value.constructor === Object) {
                value = fieldAsHtml(value, 1, (key==='connectivity'))
            } else if (key == 'created') {
                if (mapServer && mapID) {
                    value = `${value}&nbsp;&nbsp;<a target="_blank" href="${mapServer}/flatmap/${mapID}/log">Log file</a>`
                }
            }
            html.push(`<div class='info outermost'><span class="prompt">${prompt}:</span>&nbsp;${value}</div>`)
        }
    }
    return html.join('\n')
}

//==============================================================================

class DrawControl
{
    constructor(flatmap)
    {
        this._flatmap = flatmap
        this._lastEvent = null
        this._idField = document.getElementById('drawing-id')

        this._okBtn = document.getElementById('drawing-ok')
        if (this._okBtn) {
            this._okBtn.addEventListener('click', e => {
                if (this._lastEvent) {
                    const feature = this._flatmap.refreshAnnotationFeatureGeometry(this._lastEvent.feature)
                    this._flatmap.commitAnnotationEvent(this._lastEvent)
                    this._idField.innerText = ''
                    this._lastEvent = null
                    // Send `feature`, along with user comments, to the annotation service
                }
            })
        }

        this._cancelBtn = document.getElementById('drawing-cancel')
        if (this._cancelBtn) {
            this._cancelBtn.addEventListener('click', e => {
                if (this._lastEvent) {
                    this._flatmap.rollbackAnnotationEvent(this._lastEvent)
                    this._idField.innerText = ''
                    this._lastEvent = null
                }
            })
        }
    }

    handleEvent(event)
    //================
    {
        console.log(event)
        if (this._idField && event.type !== 'modeChanged' && event.type !== 'selectionChanged') {
            this._idField.innerText = `Annotation ${event.type}, Id: ${event.feature.id}`
            this._lastEvent = event
        }
    }
}

//==============================================================================

export async function standaloneViewer(mapEndpoints={}, options={})
{
    const requestUrl = new URL(window.location.href)
    const requestPathParts = requestUrl.pathname.split('/')
    const requestEndpoint = requestUrl.origin + (requestPathParts.slice(0, (requestPathParts[requestPathParts.length - 1] === '') ? -2 : -1)
                                                                 .concat([''])
                                                                 .join('/'))
    let currentServer = requestUrl.searchParams.get('server') || null
    if (currentServer && !mapEndpoints[currentServer]) {
        currentServer = null
    }
    if (currentServer === null) {
        if (requestEndpoint.includes('localhost')) {
            if ('local' in mapEndpoints) {
                // localhost is a special case since viewer might be separate
                currentServer = 'local'
            }
        } else {
            // Running remotely so don't confuse the user...
            if ('local' in mapEndpoints) {
                delete mapEndpoints['local']
            }
            for (const [server, endpoint] of Object.entries(mapEndpoints)) {
                if (endpoint === requestEndpoint) {
                    currentServer = server
                    break
                }
            }
            if (currentServer === null) {
                currentServer = 'default'
                mapEndpoints[currentServer] = requestEndpoint
            }
        }
    }
    if (Object.keys(mapEndpoints).length <= 1) {
        // Don't allow server selection if there's just a single server
        document.getElementById('server-selection').hidden = true
    } else {
        const mapServerList = []
        for (const [server, endpoint] of Object.entries(mapEndpoints)) {
            const selected = (server === currentServer) ? 'selected' : ''
            mapServerList.push(`<option value="${server}" ${selected}>${server} -- ${endpoint}</option>`)
        }
        mapServerList.splice(0, 0, '<option value="">Select flatmap server...</option>')
        const serverSelector = document.getElementById('server-selector')
        serverSelector.innerHTML = mapServerList.join('')
        serverSelector.onchange = (e) => {
            if (e.target.value !== '') {
                changeManager(e.target.value)
            }
        }
    }

    let currentManager = null
    let currentMap = null

    let drawControl = null

    let mapId = null
    let mapTaxon = null
    let mapSex = null
    let viewMapId = requestUrl.searchParams.get('id')
    let viewMapTaxon = requestUrl.searchParams.get('taxon')
    let viewMapSex = requestUrl.searchParams.get('sex')

    const mapSelector = document.getElementById('map-selector')
    const mapGeneration = document.getElementById('map-generation')
    const mapProvenance = document.getElementById('provenance-display')

    const mapIdToName = new Map()
    const mapGenerations = new Map()

    let defaultBackground = localStorage.getItem('flatmap-background-colour') || 'black'
    const mapOptions = Object.assign({}, DEFAULT_OPTIONS, {background: defaultBackground}, options)

    // Everything setup so start by getting a map manager

    await changeManager(currentServer)

    async function changeManager(server)
    //==================================
    {
        if (currentMap) {
            currentMap.close()
        }
        currentManager = new MapManager(mapEndpoints[server], {
            container: 'flatmap-viewer-canvas',
            panes: 3,
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
        })
        currentServer = server

        mapId = null
        mapTaxon = null
        mapSex = null
        await setMapList(currentManager)
    }

    async function setMapList(manager)
    //================================
    {
        mapIdToName.clear()
        mapGenerations.clear()
        const latestMaps = new Map()
        const maps = await manager.allMaps()
        for (const map of Object.values(maps)) {
            const text = [];
            if ('describes' in map) {
                text.push(map.describes)
            }
            if ('name' in map) {
                text.push(map.name)
            } else {
                text.push(map.id)
            }
            const mapName = text.join(' -- ')
            if (!latestMaps.has(mapName)) {
                latestMaps.set(mapName, map)
            } else if (latestMaps.get(mapName).created < map.created) {
                latestMaps.set(mapName, map)
            }
            const id = ('uuid' in map) ? map.uuid : map.id
            mapIdToName.set(id, mapName)
            if (!mapGenerations.has(mapName)) {
                mapGenerations.set(mapName, [map])
            } else {
                mapGenerations.get(mapName).push(map)
            }
        }

        // The name of the map being viewed
        const viewName = mapIdToName.get(viewMapId)

        // Sort maps into name order
        const sortedMaps = new Map([...latestMaps]
                                .sort((a, b) => Intl.Collator().compare(a[0], b[0])))
        const mapList = []
        for (const [name, map] of sortedMaps.entries()) {
            // Sort generations into created order with most recent first
            const reverseDateOrder = mapGenerations.get(name)
                                            .sort((a, b) => (a.created < b.created) ? 1
                                                          : (a.created > b.created) ? -1
                                                          : 0)
            mapGenerations.set(name, reverseDateOrder)
            const id = ('uuid' in map) ? map.uuid : map.id
            if (mapId === null && id === viewMapId) {
                mapId = id
            } else if (mapId === null
                    && mapTaxon === null
                    && map.taxon === viewMapTaxon
                    && !('biologicalSex' in map || map.biologicalSex === viewMapSex)) {
                mapTaxon = viewMapTaxon
                mapSex = viewMapSex
            }
            const selected = (name === viewName) ? 'selected' : ''
            mapList.push(`<option value="${id}" ${selected}>${name}</option>`)
        }
        mapList.splice(0, 0, '<option value="">Select flatmap...</option>')

        mapSelector.innerHTML = mapList.join('')
        mapSelector.onchange = (e) => {
            if (e.target.value !== '') {
                setGenerationSelector(e.target.value)
                loadMap(currentManager, e.target.value)
            }
        }
        mapGeneration.onchange = (e) => {
            if (e.target.value !== '') {
                loadMap(currentManager, e.target.value)
            }
        }

        mapId ||= viewMapId
        mapTaxon ||= viewMapTaxon
        mapSex ||= viewMapSex
        if (!(mapId || mapTaxon)) {
            mapId = mapSelector.options[1].value
            mapSelector.options[1].selected = true
        }

        setGenerationSelector(mapId)
        loadMap(currentManager, mapId, mapTaxon, mapSex)
    }

    function setGenerationSelector(mapId)
    //===================================
    {
        const generationList = []
        const mapName = mapIdToName.get(mapId)
        if (mapName) {
            for (const map of mapGenerations.get(mapName)) {
                const id = ('uuid' in map) ? map.uuid : map.id
                const selected = (mapId === id) ? 'selected' : ''
                generationList.push(`<option value="${id}" ${selected}>${map.created}</option>`)
            }
        }
        mapGeneration.innerHTML = generationList.join('')
    }

    async function loadMap(manager, id, taxon=null, sex=null)
    //=======================================================
    {
        manager.closeMaps()

        mapProvenance.innerHTML = ''
        if (id !== null) {
            requestUrl.searchParams.set('id', id)
            requestUrl.searchParams.delete('taxon')
            requestUrl.searchParams.delete('sex')
        } else if (taxon !== null) {
            id = taxon
            requestUrl.searchParams.set('taxon', taxon)
            if (sex !== null) {
                requestUrl.searchParams.set('sex', sex)
            }
            requestUrl.searchParams.delete('id')
        }
        requestUrl.searchParams.set('server', currentServer)

        // Update address bar URL to current map
        window.history.pushState('data', document.title, requestUrl)

        await manager.loadMap(id, async (eventType, ...args) => {
                if (args[0].type === 'control' && args[0].control === 'background') {
                    mapOptions.background = args[0].value
                } else if (eventType === 'annotation') {
                    drawControl.handleEvent(...args)
                } else if (args[0].type === 'marker') {
                    console.log(eventType, ...args)
                } else if (eventType === 'click') {
                    console.log(eventType, ...args)
                }
            }, mapOptions)
        .then(async map => {
            currentMap = map
            mapProvenance.innerHTML = provenanceAsHtml(Object.assign({server: mapEndpoints[currentServer]},
                                                                 map.provenance))
            drawControl = new DrawControl(map)

            const vagus = await map.queryKnowledge('UBERON:0001759')

            console.log(vagus)
        })
        .catch(error => {
            console.log(error)
            alert(error)
        });
    }
}

//==============================================================================
