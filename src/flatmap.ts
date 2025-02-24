/*==============================================================================

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

==============================================================================*/

import Set from 'core-js/actual/set'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import * as turf from '@turf/helpers'
import * as turfLength from "@turf/length"

//==============================================================================

// Load our stylesheet last so we can overide styling rules

import '../static/css/flatmap-viewer.css'

//==============================================================================

import {
    FlatMapAnnotations,
    FlatMapCallback,
    FlatMapFeatureAnnotation,
    FlatMapIndex,
    FlatMapLayer,
    FlatMapLayerOptions,
    FlatMapMetadata,
    FlatMapOptions,
    FlatMapPathways,
    FlatMapMarkerOptions,
    FlatMapPopUpOptions
} from './flatmap-types'

import {KNOWLEDGE_SOURCE_SCHEMA, FlatMapServer} from './mapserver'

import {SearchIndex} from './search'
import {UserInteractions} from './interactions'
import {MapTermGraph, SparcTermGraph} from './knowledge'

import {APINATOMY_PATH_PREFIX} from './pathways'
import {MapViewer} from './viewer'

import {loadClusterIcons} from './layers/acluster'

import * as images from './images'
import * as utils from './utils'

//==============================================================================

/**
 * The taxon identifier used when none has been given.
 *
 * @type       {string}
 */
export const UNCLASSIFIED_TAXON_ID = 'NCBITaxon:2787823';   // unclassified entries

//==============================================================================

const MAP_MAKER_FLIGHTPATHS_VERSION = 1.6

//==============================================================================

const EXCLUDED_FEATURE_FILTER_PROPERTIES = [
    'bounds',
    'class',
    'coordinates',
    'featureId',
    'geometry',
    'geom-type',
    'id',
    'label',
    'layer',
    'markerPosition',
    'name',
    'nerveId',
    'nodeId',
    'pathStartPosition',
    'pathEndPosition',
    'source',
    'tile-layer',
]

const EXPORTED_FEATURE_PROPERTIES = [
    'id',
    'featureId',
    'connectivity',
    'dataset',
    'dataset-ids',
    'kind',
    'label',
    'models',
    'source',
    'taxons',
    'hyperlinks',
    'completeness',
    'missing-nodes',
    'alert',
    'biological-sex',
    'location'
]

const ENCODED_FEATURE_PROPERTIES = [
    'dataset-ids',
    'hyperlinks',
]

//==============================================================================

export class FLATMAP_STYLE
{
    static FUNCTIONAL = 'functional'
    static ANATOMICAL = 'anatomical'
    static CENTRELINE = 'centreline'
    static GENERIC = 'flatmap'
}

//==============================================================================

interface CentrelineDetails
{
    models: string
    label: string
}

//==============================================================================

type FlatMapSourceSpecification = maplibregl.VectorSourceSpecification
                                | maplibregl.RasterSourceSpecification

export type FlatMapStyleSpecification = maplibregl.StyleSpecification & {
    "sources": {
        [_: string]: FlatMapSourceSpecification;
    }
}

//==============================================================================

export type MapDescriptionOptions = FlatMapOptions & {
    addCloseControl: boolean
    allControls: boolean
    bounds: [number, number, number, number]
    images?: {
        id: string
        url: string
        options: object
    }[]
    layerOptions?: FlatMapLayerOptions & {
        authoring?: boolean
        flatmapStyle?: string
    }
    separateLayers: boolean
    style: string
}

type MapDescription = {
    id: string
    uuid: string
    details: FlatMapIndex
    taxon: string
    biologicalSex: string
    style: FlatMapStyleSpecification
    options: MapDescriptionOptions
    layers: FlatMapLayer[]
    number: number
    sparcTermGraph: SparcTermGraph
    annotations: FlatMapAnnotations
    callback: FlatMapCallback
    pathways: FlatMapPathways
    provenance: FlatMapMetadata
}

//==============================================================================

type FeatureIdMap = Map<string, number[]>


/**
* Maps are not created directly but instead are created and loaded by
* :meth:`LoadMap` of :class:`MapViewer`.
*/
export class FlatMap
{
    #annIdToFeatureId: Map<string, number> = new Map()
    #baseUrl: string
    #biologicalSex: string
    #bounds: maplibregl.LngLatBounds
    #callbacks: FlatMapCallback[] = []
    #created: string
    #datasetToFeatureIds: FeatureIdMap = new Map()
    #details: FlatMapIndex
    #featurePropertyValues = new Map()
    #id: string
    #initialState = null
    #layers
    #idToAnnotation: Map<number, FlatMapFeatureAnnotation> = new Map()
    #knowledgeSource = ''
    #viewer: MapViewer
    #map: maplibregl.Map|null = null
    #mapNumber: number
    #mapServer: FlatMapServer
    #mapSourceToFeatureIds: FeatureIdMap = new Map()
    #mapTermGraph: MapTermGraph
    #modelToFeatureIds: FeatureIdMap = new Map()
    #normalisedOrigin: [number, number]
    #normalised_size: [number, number]
    #options: MapDescriptionOptions
    #pathways: FlatMapPathways
    #provenance: FlatMapMetadata
    #searchIndex: SearchIndex = new SearchIndex()
    #startupState = -1
    #taxon: string
    #taxonNames = new Map()
    #taxonToFeatureIds: FeatureIdMap = new Map()
    #userInteractions: UserInteractions|null = null
    #uuid: string

    constructor(viewer: MapViewer, container: string, mapServer: FlatMapServer, mapDescription: MapDescription)
    {
        this.#viewer = viewer
        this.#mapServer = mapServer
        this.#baseUrl = mapServer.url()
        this.#id = mapDescription.id
        this.#uuid = mapDescription.uuid
        this.#details = mapDescription.details
        this.#provenance = mapDescription.provenance
        this.#created = mapDescription.provenance.created
        this.#taxon = mapDescription.taxon
        this.#biologicalSex = mapDescription.biologicalSex
        this.#mapNumber = mapDescription.number
        this.#callbacks.push(mapDescription.callback)
        this.#layers = mapDescription.layers
        this.#options = mapDescription.options
        this.#pathways = mapDescription.pathways
        this.#mapTermGraph = new MapTermGraph(mapDescription.sparcTermGraph)

        const sckanProvenance = mapDescription.details.connectivity
        if (!sckanProvenance) {
            this.#knowledgeSource = this.#mapServer.latestSource
        } else if ('knowledge-source' in sckanProvenance) {
            this.#knowledgeSource = sckanProvenance['knowledge-source']
        } else if ('npo' in sckanProvenance) {
            this.#knowledgeSource = `${sckanProvenance.npo.release}-npo`
        } else {
            this.#knowledgeSource = this.#mapServer.latestSource
        }

        for (const [featureId, annotation] of Object.entries(mapDescription.annotations)) {
            this.#saveAnnotation(+featureId, annotation)
            this.#searchIndex.indexMetadata(featureId, annotation)
        }

        // Set base of source URLs in map's style

        for (const [_, source] of Object.entries(mapDescription.style.sources)) {
            if (source.url) {
                source.url = this.makeServerUrl(source.url)
            }
            if (source.tiles) {
                const tiles = []
                for (const tileUrl of source.tiles) {
                    tiles.push(this.makeServerUrl(tileUrl))
                }
                source.tiles = tiles
            }
        }

        // Ensure rounded background images (for feature labels) are loaded

        if (!('images' in mapDescription.options)) {
            mapDescription.options.images = []
        }
        for (const image of images.LABEL_BACKGROUNDS) {
            let found = false
            for (const im of mapDescription.options.images) {
                if (image.id === im.id) {
                    found = true
                    break
                }
            }
            if (!found) {
                mapDescription.options.images.push(image)
            }
        }

        // Set options for the map

        const mapOptions: maplibregl.MapOptions = {
            style: mapDescription.style,
            container: container,
            attributionControl: false
        }

        if ('maxZoom' in mapDescription.options) {
            mapOptions.maxZoom = mapDescription.options.maxZoom - 0.001
        }
        if ('minZoom' in mapDescription.options) {
            mapOptions.minZoom = mapDescription.options.minZoom
        }

        // Only show location in address bar when debugging

        //mapOptions.hash = (mapDescription.options.debug === true)

        // Set bounds if it is set in the map's options

        if ('bounds' in mapDescription.options) {
            mapOptions.bounds = mapDescription.options.bounds
        }

        // Create the map

        this.#map = new maplibregl.Map(mapOptions)

        // Show extra information if debugging

        if (mapDescription.options.debug === true) {
            this.#map.showTileBoundaries = true
            this.#map.showCollisionBoxes = true
        }

        // Don't wrap around at +/-180 degrees

        this.#map.setRenderWorldCopies(false)

        // Disable map rotation
        // REMOVE old code...
        //this.#map.dragRotate.disable()
        //this.#map.touchZoomRotate.disableRotation()

        // Finish initialisation when all sources have loaded
        // and map has rendered

        const idleSubscription = this.#map.on('idle', async() => {
            if (this.#startupState === -1) {
                this.#startupState = 0
                await this.#setupUserInteractions()
            } else if (this.#startupState === 1) {
                this.#startupState = 2
                this.#map.setRenderWorldCopies(true)
                this.#bounds = this.#map.getBounds()
                const bounds = this.#bounds.toArray()
                const sw = maplibregl.MercatorCoordinate.fromLngLat(bounds[0])
                const ne = maplibregl.MercatorCoordinate.fromLngLat(bounds[1])
                this.#normalisedOrigin = [sw.x, ne.y]
                this.#normalised_size = [ne.x - sw.x, sw.y - ne.y]
                if ('state' in this.#options) {
                    this.#userInteractions.setState(this.#options.state)
                }
                this.#initialState = this.getState()
                if (this.#userInteractions.minimap) {
                    this.#userInteractions.minimap.initialise()
                }
                this.#map.setMaxBounds(this.#bounds)
                this.#map.fitBounds(this.#bounds, {animate: false})
                this.#startupState = 3

                idleSubscription.unsubscribe()
            }
        })
    }


    async mapLoaded()
    //===============
    {
        while (this.#startupState < 3) {
            await utils.wait(10)
        }
    }

    async #setupUserInteractions()
    //============================
    {
        // Get names of the taxons we have
        await this.#setTaxonName(this.#taxon)
        for (const taxon of this.taxonIdentifiers) {
            await this.#setTaxonName(taxon)
        }

        // Load any images required by the map
        for (const image of this.#options.images) {
            await this.#addImage(image.id, image.url, '', image.options)
        }

        // Load icons used for clustered markers
        await loadClusterIcons(this.#map)

        // Load anatomical term hierarchy for the flatmap
        const termGraph = await this.#mapServer.mapTermGraph(this.#uuid)
        this.#mapTermGraph.load(termGraph)

        // Layers have now loaded so finish setting up
        this.#userInteractions = new UserInteractions(this)

        // Continue initialising when next idle
        this.#startupState = 1
    }

    /**
     * The flatmap's bounds.
     */
    get bounds(): maplibregl.LngLatBoundsLike
    //=======================================
    {
        return this.#bounds
    }

    /**
     * Does the flatmap contain flightpath information?
     *
     * @return boolean
     */
    get has_flightpaths()
    //===================
    {
        return 'version' in this.#details
            && this.#details.version >= MAP_MAKER_FLIGHTPATHS_VERSION
    }

    get mapTermGraph()
    //================
    {
        return this.#mapTermGraph
    }

    /**
     * Get valid keys and their value ranges to use when filtering feature
     * and path visibility.
     *
     * @return {Object}  Value ranges are string arrays
     */
    featureFilterRanges()
    //===================
    {
        const filterRanges = {}
        for (const [key, value] of this.#featurePropertyValues.entries()) {
            filterRanges[key] = [...value.values()]
        }
        return filterRanges
    }

    /**
     * Clear any visibility filter on features and paths.
     */
    clearVisibilityFilter()
    //=====================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.clearVisibilityFilter()
        }
    }

    /**
     * Sets a visibility filter for features and paths
     *
     * @param {PropertiesFilterExpression}  [filterExpression=true]  The filter specification
     */
    setVisibilityFilter(filterExpression=true)
    //========================================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.setVisibilityFilter(filterExpression)
        }
    }

    // Map control methods

    /**
     * Reset a map to its initial state.
     */
    resetMap()
    //========
    {
        if (this.#initialState !== null) {
            this.setState(this.#initialState)
        }
        if (this.#userInteractions !== null) {
            this.#userInteractions.reset()
        }
    }

    /**
     * Zoom the map in.
     */
    zoomIn()
    //======
    {
        this.#map.zoomIn()
    }

    /**
     * Zoom the map out.
     */
    zoomOut()
    //=======
    {
        this.#map.zoomOut()
    }

    /**
     * @returns {Array.<{type: string, label: string, colour: string}>} an array of objects giving the path types
     *                                                                  present in the map along with their
     *                                                                  descriptions and colours
     */
    pathTypes()
    //=========
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.pathManager.pathTypes()
        }
    }

    /**
     * Hide or show paths of a given type.
     *
     * @param {string[]|string}  pathType The path type(s) to hide or show
     * @param {boolean}          enable   Show or hide paths of that type. Defaults to
     *                                    ``true`` (show)
     */
    enablePath(pathType, enable=true)
    //===============================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.enablePathsByType(pathType, enable)
        }
    }

    /**
     * Hide or show all paths valid in SCKAN.
     *
     * @param {string}   sckanState  Either ``valid`` or ``invalid``
     * @param {boolean}  enable  Show or hide paths with that SCKAN state.
     *                           Defaults to ``true`` (show)
     */
    enableSckanPath(sckanState, enable=true)
    //======================================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.enableSckanPaths(sckanState, enable)
        }
    }

    /**
     * Show or hide connectivity features observed in particular species.
     *
     * @param {string | Array.<string>}   taxonId(s)  A single taxon identifier
     *                                                or an array of identifiers.
     * @param {boolean}  enable  Show or hide connectivity paths and features.
     *                           Defaults to ``true`` (show)
     */
    enableConnectivityByTaxonIds(taxonIds: string|string[], enable=true)
    //==================================================================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.enableConnectivityByTaxonIds(taxonIds, enable)
        }
    }

    /**
     * Load images and patterns/textures referenced in style rules.
     *
     * @private
     */
    async #loadImage(url: string)
    //===========================
    {

        const response = await this.#map.loadImage(url)
        return response.data
    }

    #loadEncodedImage(encodedImageUrl)
    //================================
    {
        return new Promise((resolve, _) => {
            const image = new Image()
            image.src = encodedImageUrl
            image.onload = (e) => resolve(e.target)
        })
    }

    async #addImage(id, path, baseUrl, options={})
    //============================================
    {
        if (!this.#map.hasImage(id)) {
            const image = await (path.startsWith('data:image') ? this.#loadEncodedImage(path)
                                                               : this.#loadImage(path.startsWith('/') ? this.makeServerUrl(path)
                                                                                                      : new URL(path, baseUrl)))
            this.#map.addImage(id, <ImageBitmap>image, options)
        }
    }

    makeServerUrl(url, resource='flatmap/')
    //=====================================
    {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url
        } else if (url.startsWith('/')) {
            // We don't want embedded `{` and `}` characters escaped
            return `${this.#baseUrl}${resource}${this.#uuid}${url}`
        } else {
            return `${this.#baseUrl}${resource}${this.#uuid}/${url}`
        }
    }

    /**
     * The taxon identifier of the species described by the map.
     *
     * @type string
     */
    get taxon()
    //=========
    {
        return this.#taxon
    }

    /**
     * The biological sex identifier of the species described by the map.
     *
     * @type string
     */
    get biologicalSex()
    //=================
    {
        return this.#biologicalSex
    }

    /**
     * The map's creation time.
     *
     * @type string
     */
    get created()
    //===========
    {
        return this.#created
    }

    /**
     * The map's id as specified at generation time.
     *
     * @type string
     */
    get id()
    //======
    {
        return this.#id
    }

    /**
     * The map's unique universal identifier.
     *
     * For published maps this is different to the map's ``id``
     * it might be the same as ``id`` for unpublished maps.
     *
     * @type string
     */
    get uuid()
    //========
    {
        return this.#uuid
    }

    /**
     * The map's URL on the map server.
     *
     * @type string
     */
    get url()
    //========
    {
        const url = this.makeServerUrl('')
        if (url.endsWith('/')) {
            return url.substring(0, url.length - 1)
        }
        return url
    }

    /**
     * The map's ``index.json`` as returned from the map server.
     *
     * @type Object
     */
    get details()
    //===========
    {
        return this.#details
    }

    /**
     * The map's provenance as returned from the map server.
     *
     * @type Object
     */
    get provenance()
    //==============
    {
        return this.#provenance
    }

    /**
     * A unique identifier for the map within the viewer.
     *
     * @type string
     */
    get uniqueId()
    //============
    {
        return `${this.#uuid}-${this.#mapNumber}`
    }

    get annotations(): Map<number, FlatMapFeatureAnnotation>
    //======================================================
    {
        return this.#idToAnnotation
    }

    /**
     * Get a feature's annotations given its GeoJSON id.
     *
     * @param      {string}  geojsonId  The features's GeoJSON identifier
     * @return     {FlatMapFeatureAnnotation}                    The feature's annotations
     */
    annotation(geojsonId: number): FlatMapFeatureAnnotation
    //=====================================================
    {
        return this.#idToAnnotation.get(+geojsonId)
    }

    /**
     * Get a feature's annotations given its external id.
     *
     * @param      {string}  annotationId  The features's external identifier
     * @return     {Object}                The feature's annotations
     */
    annotationById(annotationId: string): FlatMapFeatureAnnotation
    //============================================================
    {
        if (this.#annIdToFeatureId.has(annotationId)) {
            const geojsonId = this.#annIdToFeatureId.get(annotationId)
            return this.#idToAnnotation.get(geojsonId)
        }
    }

    /**
     * Flag the feature as having external annotation.
     *
     * @param      {string}  featureId  The feature's external identifier
     */
    setFeatureAnnotated(featureId: string)
    //====================================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.setFeatureAnnotated(featureId)
        }
    }

    #updateFeatureIdMapEntry(propertyId: string, featureIdMap: FeatureIdMap, featureId: number)
    //=========================================================================================
    {
        const id = utils.normaliseId(propertyId)
        const featureIds = featureIdMap.get(id)
        if (featureIds) {
            featureIds.push(featureId)
        } else {
            featureIdMap.set(id, [featureId])
        }
    }

    #updateFeatureIdMap(property: string, featureIdMap: FeatureIdMap, annotation: FlatMapFeatureAnnotation, missingId=null)
    //===================================================================================
    {
        // Exclude centrelines from our set of annotated features
        if (this.options.style !== FLATMAP_STYLE.CENTRELINE && annotation.centreline) {
            return
        }
        if (property in annotation && annotation[property].length) {
            const propertyId = annotation[property]
            if (Array.isArray(propertyId)) {
                for (const id of propertyId) {
                    this.#updateFeatureIdMapEntry(id, featureIdMap, annotation.featureId)
                }
            } else {
                this.#updateFeatureIdMapEntry(propertyId, featureIdMap, annotation.featureId)
            }
        } else if (missingId !== null
               && 'models' in annotation
               && annotation.models.startsWith(APINATOMY_PATH_PREFIX)) {
            this.#updateFeatureIdMapEntry(missingId, featureIdMap, annotation.featureId)
        }
    }

    #saveAnnotation(featureId: number, ann: FlatMapFeatureAnnotation)
    //===============================================================
    {
        ann.featureId = featureId
        this.#idToAnnotation.set(featureId, ann)
        this.#updateFeatureIdMap('dataset', this.#datasetToFeatureIds, ann)
        this.#updateFeatureIdMap('models', this.#modelToFeatureIds, ann)
        this.#updateFeatureIdMap('source', this.#mapSourceToFeatureIds, ann)
        this.#updateFeatureIdMap('taxons', this.#taxonToFeatureIds, ann, UNCLASSIFIED_TAXON_ID)

        // Annotations contain all of a feature's properties so note them
        // for the user to know what can be used for feature filtering

        for (const [key, value] of Object.entries(ann)) {
            if (!EXCLUDED_FEATURE_FILTER_PROPERTIES.includes(key)) {
                if (!this.#featurePropertyValues.has(key)) {
                    this.#featurePropertyValues.set(key, new Set())
                }
                const valueSet = this.#featurePropertyValues.get(key)
                if (Array.isArray(value)) {
                    this.#featurePropertyValues.set(key, valueSet.union(new Set(value.map(v => `${v}`))))
                } else {
                    valueSet.add(`${value}`)
                }
            }
        }
        this.#annIdToFeatureId.set(ann.id, featureId)

        // Pre-compute LineStrings of centrelines in centreline maps
        if (this.options.style === FLATMAP_STYLE.CENTRELINE && ann.centreline) {
            ann['lineString'] = turf.lineString(ann.coordinates)
            ann['lineLength'] = turfLength.length(ann.lineString)
        }
    }

    modelFeatureIds(anatomicalId: string): number[]
    //=============================================
    {
        const normalisedId = utils.normaliseId(anatomicalId)
        return this.#modelToFeatureIds.get(normalisedId) || []
    }

    modelFeatureIdList(anatomicalIds: string[]): number[]
    //===================================================
    {
        const featureIds = new utils.List<number>()
        if (Array.isArray(anatomicalIds)) {
            for (const id of anatomicalIds) {
                featureIds.extend(this.modelFeatureIds(id))
            }
        } else {
            featureIds.extend(this.modelFeatureIds(anatomicalIds))
        }
        if (featureIds.length == 0) {
            // We couldn't find a feature by anatomical id, so check dataset and source
            if (Array.isArray(anatomicalIds)) {
                for (const id of anatomicalIds) {
                    featureIds.extend(this.#datasetToFeatureIds.get(id))
                    featureIds.extend(this.#mapSourceToFeatureIds.get(id))
                }
            } else {
                featureIds.extend(this.#datasetToFeatureIds.get(anatomicalIds))
                featureIds.extend(this.#mapSourceToFeatureIds.get(anatomicalIds))
            }
        }
        if (featureIds.length == 0 && this.#userInteractions !== null) {
            // We still haven't found a feature, so check connectivity
            featureIds.extend(this.#userInteractions.pathFeatureIds(anatomicalIds))
        }
        return featureIds
    }

    modelForFeature(featureId: number): string|null
    //=============================================
    {
        const ann = this.#idToAnnotation.get(featureId)
        return (ann && 'models' in ann) ? utils.normaliseId(ann.models) : null
    }

    /**
     * Get model terms of all paths connected to a node.
     *
     * @param      {number}  pathId  The local (GeoJSON) identifier of a node
     * @return     {set<string>}  Model terms of all paths connected to the node
     */
    nodePathModels(nodeId: number): Set<string>
    //=========================================
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.nodePathModels(nodeId)
        }
    }

    /**
     * Get GeoJSON feature ids of all nodes of a path model.
     *
     * @param      {string}  modelId  The path's model identifier
     * @return     {Array<number>}   GeoJSON identifiers of features on the path
     */
    pathModelNodes(modelId: string): number[]
    //=======================================
    {
        if (this.#userInteractions !== null) {
            return [...this.#userInteractions.pathModelNodes(modelId)]
        }
    }

    /**
     * Get GeoJSON feature ids of all features identified with a taxon.
     *
     * @param      {string}  taxonId  The taxon identifier
     * @return     {Array<number>}    GeoJSON identifiers of features on the path
     */
    taxonFeatureIds(taxonId: string): number[]
    //========================================
    {
        const featureIds = this.#taxonToFeatureIds.get(utils.normaliseId(taxonId))
        return [...new Set(featureIds ? featureIds : [])]
    }

    taxonName(taxonId: string): string
    //================================
    {
        if (this.#taxonNames.has(taxonId)) {
            return this.#taxonNames.get(taxonId)
        }
        return taxonId
    }

    async #setTaxonName(taxonId: string)
    //==================================
    {
        if (taxonId && !this.#taxonNames.has(taxonId)) {
            const result = await this.queryLabels(taxonId)
            if (result.length && 'label' in result[0]) {
                return this.#taxonNames.set(taxonId, result[0]['label'])
            }
        }
    }

    get layers()
    //==========
    {
        return this.#layers
    }

    get map(): maplibregl.Map
    //=======================
    {
        return this.#map
    }

    /**
     * The anatomical identifiers of features in the map.
     *
     * @type {Array.<string>}
     */
    get anatomicalIdentifiers(): string[]
    //===================================
    {
        return [...this.#modelToFeatureIds.keys()]
    }

    /**
     * The taxon identifiers of species which the map's connectivity has been observed in.
     *
     * @type {Array.<string>}
     */
    get taxonIdentifiers(): string[]
    //==============================
    {
        return [...this.#taxonToFeatureIds.keys()]
    }

    /**
     * Datasets associated with the map.
     *
     * @type {Array.<string>}
     */
    get datasets(): string[]
    //======================
    {
        return [...this.#datasetToFeatureIds.keys()]
    }

    get options()
    //===========
    {
        return this.#options
    }

    get pathways(): FlatMapPathways
    //=============================
    {
        return this.#pathways
    }

    /**
     * Get the map's zoom settings.
     *
     * @return {Object.<{minZoom: number, zoom: number, maxZoom: number}>}  The map's minimum, current, and maximum zoom levels.
     */
    getZoom()
    //=======
    {
        return {
            mapUUID: this.#uuid,
            minZoom: this.#map.getMinZoom(),
            zoom:    this.#map.getZoom(),
            maxZoom: this.#map.getMaxZoom()
        }
    }

    addCallback(callback: FlatMapCallback)
    //====================================
    {
        this.#callbacks.unshift(callback)
    }

    callback(type: string, data, ...args)
    //===================================
    {
        data.mapUUID = this.#uuid
        for (const callback of this.#callbacks) {
            if (callback(type, data, ...args)) {
                break
            }
        }
    }

    close()
    //=====
    {
        if (this.#map) {
            this.#map.remove()
            this.#map = null
        }
    }

    closePane()
    //=========
    {
        this.#viewer.closePane(this.#mapNumber)
    }

    resize()
    //======
    {
        // Resize our map

        this.#map.resize()
    }

    getIdentifier()
    //=============
    {
        // Return identifiers for reloading the map

        return {
            taxon: this.#taxon,
            biologicalSex: this.#biologicalSex,
            uuid: this.#uuid
        }
    }

    getState()
    //========
    {
        return (this.#userInteractions !== null) ? this.#userInteractions.getState() : {}
    }

    setState(state)
    //=============
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.setState(state)
        }
    }

    showPopup(featureId, content, options: FlatMapPopUpOptions={})
    //============================================================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.showPopup(featureId, content, options)
        }
    }

    /**
     * Remove the currently active popup from the map.
     */
    removePopup()
    //===========
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.removePopup()
        }
    }

    setPaint(options=null)
    //====================
    {
        options = utils.setDefaults(options, {
            colour: true,
            outline: true
        })
        if (this.#userInteractions !== null) {
            this.#userInteractions.setPaint(options)
        }
    }

    setColour(options=null)
    //=====================
    {
        console.log('`setColour()` is deprecated; please use `setPaint()` instead.')
        this.setPaint(options)
    }

    //==========================================================================

    /**
     * Get the map's current background colour.
     *
     * @return     {string}  The background colour.
     */
    getBackgroundColour(): string
    //===========================
    {
        return this.#map.getPaintProperty('background', 'background-color') as string
    }

    /**
     * Get the map's current background opacity.
     *
     * @return     {number}  The background opacity.
     */
    getBackgroundOpacity(): number
    //============================
    {
        return this.#map.getPaintProperty('background', 'background-opacity') as number
    }

    /**
     * Sets the map's background colour.
     *
     * @param      {string}  colour  The colour
     */
    setBackgroundColour(colour: string)
    //=================================
    {
        localStorage.setItem('flatmap-background-colour', colour)

        this.#map.setPaintProperty('background', 'background-color', colour)

        if (this.#userInteractions.minimap) {
            this.#userInteractions.minimap.setBackgroundColour(colour)
        }
    }

    /**
     * Sets the map's background opacity.
     *
     * @param      {number}  opacity  The opacity
     */
    setBackgroundOpacity(opacity: number)
    //===================================
    {
        this.#map.setPaintProperty('background', 'background-opacity', opacity)

        if (this.#userInteractions.minimap) {
            this.#userInteractions.minimap.setBackgroundOpacity(opacity)
        }
    }

    /**
     * Show and hide the minimap.
     *
     * @param {boolean}  show  Set false to hide minimap
     */
    showMinimap(show: boolean)
    //========================
    {
        if (this.#userInteractions.minimap) {
            this.#userInteractions.minimap.show(show)
        }

    }

    //==========================================================================

    /**
     * Get a list of the flatmap's layers.
     *
     * @return {Array.<{id: string, description: string, enabled: boolean}>}  An array with layer details
     */
    getLayers()
    //=========
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.getLayers()
        }
    }

    /**
     * @param {string}  layerId  The layer identifier to enable
     * @param {boolean}  enable  Show or hide the layer. Defaults to ``true`` (show)
     *
     */
    enableLayer(layerId: string, enable=true)
    //=======================================
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.enableLayer(layerId, enable)
        }
    }

    /**
     * Show/hide flight path view.
     *
     * @param      {boolean}  [enable=true]
     */
    enableFlightPaths(enable=true)
    //============================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.enableFlightPaths(enable)
        }
    }

    //==========================================================================

    /**
     * Get a list of a FC flatmap's systems.
     *
     * @return {Array.<{id: string, name: string, colour: string, enabled: boolean}>}  An array with system details
     */
    getSystems()
    //==========
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.getSystems()
        }
    }

    /**
     * @param {string}  systemId  The identifier of the system to enable
     * @param {boolean}  enable  Show or hide the system. Defaults to ``true`` (show)
     *
     */
    enableSystem(systemId: string, enable=true)
    //================================= ========
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.enableSystem(systemId, enable)
        }
    }

    //==========================================================================

    /**
     * Add a marker to the map.
     *
     * @param {string}  anatomicalId  The anatomical identifier of the feature on which
     *                                to place the marker.
     * @arg {Object} options          Configurable options for the marker.
     * @arg {string} options.className Space-separated CSS class names to add to marker element.
     * @arg {string} options.colour   Colour of the marker. Defaults to ``'#005974'``
     *                                (dark cyan).
     * @arg {string} options.element  The DOM element to use as a marker. The default is
     *                                a dark blue droplet-shaped SVG marker.
     * @arg {string} options.location The relative location (0.0 to 1.0) of the marker along a centreline
     *                                in a centreline map.
     * @return     {integer}          The identifier for the resulting marker. -1 is returned if the
     *                                map doesn't contain a feature with the given anatomical identifier
     */
    addMarker(anatomicalId,  options: FlatMapMarkerOptions={})
    //========================================================
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.addMarker(anatomicalId, options)
        }
        return -1
    }

    /**
     * Add a list of markers to the map.
     *
     * @param {Array.<string>}  anatomicalId  Anatomical identifiers of features on which
     *                                to place markers.
     * @arg {Object} options          Configurable options for the markers.
     * @arg {string} options.className Space-separated CSS class names to add to marker elemens.
     * @arg {boolean} options.cluster  The markers will be clustered together with other geographically
     *                                close markers. Defaults to ``true``.
     * @arg {string} options.colour   Colour of the markers. Defaults to ``'#005974'``
     *                                (dark cyan).
     * @arg {string} options.element  The DOM element to use as a marker. The default is
     *                                a dark blue droplet-shaped SVG marker.
     * @return     {array.<integer>}  The identifiers of the resulting markers. -1 is returned if the
     *                                map doesn't contain a feature with the given anatomical identifier
     */
    addMarkers(anatomicalIds,  options={})
    //====================================
    {
        options = Object.assign({cluster: true}, options)
        const markerIds = []
        for (const anatomicalId of anatomicalIds) {
            if (this.#userInteractions !== null) {
                markerIds.push(this.#userInteractions.addMarker(anatomicalId, options))
            } else {
                markerIds.push(-1)
            }
        }
        return markerIds
    }

    /**
     * Remove a marker from the map.
     *
     * @param      {integer}  markerId  The identifier of the marker, as returned
     *                                  by ``addMarker()``
     */
    removeMarker(markerId)
    //====================
    {
        if (markerId > -1 && this.#userInteractions !== null) {
            this.#userInteractions.removeMarker(markerId)
        }
    }

    /**
     * Remove all markers from the map.
     */
    clearMarkers()
    //============
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.clearMarkers()
        }
    }

    /**
     * Add dataset markers to the map.
     *
     * @param {Array.<{id: string, terms: string[]}>} datasets  An array with an object for each dataset,
     *                                                          specifying its identifier and an array of
     *                                                          associated anatomical terms
     */
    addDatasetMarkers(datasets)
    //=========================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.addDatasetMarkers(datasets)
        }
    }

    /**
     * Remove all dataset markers from the map.
     */
    clearDatasetMarkers()
    //===================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.clearDatasetMarkers()
        }
    }

    /**
     * Remove markers for a dataset from the map.
     *
     * @param {integer}  datasetId  The a dataset marker identifier as passed
     *                              to ``addDatasetMarkers()``
     */
    removeDatasetMarker(datasetId)
    //===========================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.removeDatasetMarker(datasetId)
        }
    }

    /**
     * Return the set of anatomical identifiers visible in the current map view.
     *
     * @return {Array.<string>} A list of identifiers
     */
    visibleMarkerAnatomicalIds()
    //==========================
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.visibleMarkerAnatomicalIds()
        }
    }

    /**
     * Shows a popup at a marker.
     *
     * This method should only be called in response to a ``mouseenter`` event
     * passed to the map's ``callback`` function otherwise a popup won't be shown.
     *
     * @param      {integer}  markerId  The identifier of the marker
     * @param      {string | DOMElement}  content  The popup's content
     * @param      {Object}  options
     * @returns    {boolean} Return true if the popup is shown
     *
     * The resulting popup is given a class name of ``flatmap-tooltip-popup``.
     */
    showMarkerPopup(markerId, content, options={})
    //============================================
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.showMarkerPopup(markerId, content, options)
        }
        return false
    }

    #exportedProperties(properties)
    //=============================
    {
        const data = {}
        for (const property of EXPORTED_FEATURE_PROPERTIES) {
            if (property in properties) {
                const value = properties[property]
                if (value) {
                    if ((Array.isArray(value) && value.length)
                     || (value.constructor === Object && Object.keys(value).length)) {
                        data[property] = value
                    } else if (property === 'featureId') {
                        data[property] = +value;  // Ensure numeric
                    } else if (ENCODED_FEATURE_PROPERTIES.includes(property)) {
                        data[property] = JSON.parse(value)
                    } else {
                        data[property] = value
                    }
                }
            }
        }
        if (Object.keys(data).length > 0) {
            data['type'] = 'feature'
        }
        return data
    }

    /**
     * Show or hide a tool for drawing regions to annotate on the map.
     *
     * @param  {boolean}  [visible=true]
     */
    showAnnotator(visible=true)
    //=========================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.showAnnotator(visible)
        }
    }

    /**
     * Generate an ``annotation`` callback event when a drawn annotation has been created
     * a modified.
     *
     * @param eventType {string}   Either ``created``, ``updated`` or ``deleted``
     * @param feature   {Object}   A feature object with ``id``, ``type``, and ``geometry``
     *                             fields of a feature that has been created, updated or
     *                             deleted.
     */
    annotationEvent(eventType, feature)
    //=================================
    {
        this.callback('annotation', {
            type: eventType,
            feature: feature
        })
    }

    /**
     * Mark a drawn/changed annotation as having been accepted by the user.
     *
     * @param event      {Object}     The object as received in an annotation callback
     * @param event.type {string}     Either ``created``, ``updated`` or ``deleted``
     * @param event.feature {Object}  A feature object.
     */
    commitAnnotationEvent(event)
    //==========================
    {
        if (this.#userInteractions) {
            this.#userInteractions.commitAnnotationEvent(event)
        }
    }

    /**
     * Mark a drawn/changed annotation as having been rejected by the user.
     *
     * @param event      {Object}     The object as received in an annotation callback
     * @param event.type {string}     Either ``created``, ``updated`` or ``deleted``
     * @param event.feature {Object}  A feature object.
     */
    rollbackAnnotationEvent(event)
    //============================
    {
        if (this.#userInteractions) {
            this.#userInteractions.rollbackAnnotationEvent(event)
        }
    }

    /**
     * Clear all drawn annotations from current annotation layer.
     */
    clearAnnotationFeature()
    //======================
    {
        if (this.#userInteractions) {
            this.#userInteractions.clearAnnotationFeatures()
        }
    }

    /**
     * Delete the selected drawn feature
     */
    removeAnnotationFeature()
    //=======================
    {
        if (this.#userInteractions) {
            this.#userInteractions.removeAnnotationFeature()
        }
    }

    /**
     * Add a drawn feature to the annotation drawing tool.
     *
     * @param feature    {Object}        The feature to add
     * @param feature.id {string}        The feature's id
     * @param feature.geometry {Object}  The feature's geometry as GeoJSON
     */
    addAnnotationFeature(feature)
    //===========================
    {
        if (this.#userInteractions) {
            this.#userInteractions.addAnnotationFeature(feature)
        }
    }

    /**
     * Return the feature as it is currently drawn. This is so
     * the correct geometry can be saved with a feature should
     * a user make changes before submitting dialog provided
     * by an external annotator.
     *
     * @param feature    {Object}  The drawn feature to refresh.
     * @returns {Object|null}  The feature with currently geometry or ``null``
     *                         if the feature has been deleted.
     */
    refreshAnnotationFeatureGeometry(feature)
    //=======================================
    {
        if (this.#userInteractions) {
            return this.#userInteractions.refreshAnnotationFeatureGeometry(feature)
        }
    }

    /**
     * Changes draw to another mode. The mode argument must be one of the following:
     * `simple_select`, `direct_select`, `draw_line_string`,
     * `draw_polygon` or `draw_point`. Options is accepted in first three modes.
     * More details in mapbox-gl-draw github repository.
     *
     * @param type      {Object}     The object
     * @param type.mode {string}     Either ``simple_select``, ``direct_select``, etc
     * @param type.options {Object}  Feature id(s) object.
     */
    changeAnnotationDrawMode(type)
    //============================
    {
        if (this.#userInteractions) {
            this.#userInteractions.changeAnnotationDrawMode(type)
        }
    }

    /**
     * Generate a callback as a result of some event with a flatmap feature.
     *
     * @param      {string}  eventType     The event type
     * @param      {Object}  properties    Properties associated with the feature
     */
    featureEvent(eventType, properties)
    //=================================
    {
        const data = this.#exportedProperties(properties)

        if (Object.keys(data).length > 0) {
            this.callback(eventType, data)
            return true
        }
        return false
    }

    /**
     * Return properties associated with a feature.
     *
     * @param      {number}  featureId  The feature's internal (GeoJSON) id
     * @returns    {Object}             Properties associated with the feature
     */
    featureProperties(featureId: number): object
    //==========================================
    {
        const properties = this.annotation(featureId)
        return properties ? this.#exportedProperties(properties) : {}
    }

    /**
     * Generate a callback as a result of some event with a marker.
     *
     * @param      {string}  eventType   The event type
     * @param      {integer}  markerId   The marker identifier
     * @param      {Object}  properties  Properties associated with the marker
     */
    markerEvent(eventType, markerId, properties)
    //==========================================
    {

        const data = Object.assign({}, this.#exportedProperties(properties), {
            type: 'marker',
            id: markerId
        })
        this.callback(eventType, data)
    }

    /**
     * Generate a callback as a result of some event in a control.
     *
     * @param      {string}  eventType     The event type
     * @param      {string}  control       The name of the control
     * @param      {string}  value         The value of the control
     */
    controlEvent(eventType, control, value)
    //=====================================
    {
        this.callback(eventType, {
            type: 'control',
            control: control,
            value: value
        })
    }

    /**
     * Generate callbacks as a result of panning/zooming the map.
     *
     * @param {boolean}   enabled  Generate callbacks when ``true``,
     *                             otherwise disable them.
     */
    enablePanZoomEvents(enabled=true)
    //===============================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.enablePanZoomEvents(enabled)
        }
    }

    /**
     * Generate a callback as a result of panning/zooming the map.
     *
     * @param {string}         type    The event type, ``pan`` or ``zoom``.
     * @param {Array.<float>}  origin  The map's normalised top-left corner
     * @param {Array.<float>}  size    The map's normalised size
     */
    panZoomEvent(type)
    //================
    {
        const bounds = this.#map.getBounds()
        if (this.#normalisedOrigin) {
            const sw = maplibregl.MercatorCoordinate.fromLngLat(bounds.toArray()[0])
            const ne = maplibregl.MercatorCoordinate.fromLngLat(bounds.toArray()[1])
            const top_left = [(sw.x - this.#normalisedOrigin[0])/this.#normalised_size[0],
                              (ne.y - this.#normalisedOrigin[1])/this.#normalised_size[1]]
            const size = [(ne.x - sw.x)/this.#normalised_size[0],
                          (sw.y - ne.y)/this.#normalised_size[1]]
            this.callback('pan-zoom', {
                type: type,
                origin: top_left,
                size: size
            })
        }
    }

    /**
     * Pan/zoom the map to a new view
     *
     * @param {Array.<float>}  origin  The map's normalised top-left corner
     * @param {Array.<float>}  size    The map's normalised size
     */
    panZoomTo(origin, size)
    //=====================
    {
        if (this.#normalisedOrigin) {
            const sw_x = origin[0]*this.#normalised_size[0] + this.#normalisedOrigin[0]
            const ne_y = origin[1]*this.#normalised_size[1] + this.#normalisedOrigin[1]
            const ne_x = sw_x + size[0]*this.#normalised_size[0]
            const sw_y = ne_y + size[1]*this.#normalised_size[1]
            const sw = (new maplibregl.MercatorCoordinate(sw_x, sw_y, 0)).toLngLat()
            const ne = (new maplibregl.MercatorCoordinate(ne_x, ne_y, 0)).toLngLat()
            this.#map.fitBounds([sw, ne], {animate: false})
        }
    }

    //==========================================================================

    /**
     * Find features with labels or terms matching ``text``.
     *
     * @param      {string}   text          The text to search
     * @param      {boolean}  [auto=false]  If ``true`` return suggestions of text to search for.
     * @return     Either a ``Searchresults`` object with fields of ``featureIds`` and ``results``,
     *             where ``results`` has ``featureId``, ``score``, ``terms`` and ``text`` fields,
     *             or a ``Suggestion`` object containing suggested matches
     *             (see https://lucaong.github.io/minisearch/modules/_minisearch_.html#suggestion).
     */
    search(text, auto=false)
    //======================
    {
        if (auto) {
            return this.#searchIndex.auto_suggest(text)
        } else {
            return this.#searchIndex.search(text)
        }
    }

    clearSearchResults()
    //==================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.clearSearchResults()
        }
    }

    showSearchResults(searchResults)
    //==============================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.showSearchResults(searchResults.featureIds)
        }
    }

    //==========================================================================

    /**
     * Select features on the map.
     *
     * @param {Array.<string>}  externalIds  An array of anaotomical terms identifing features to select
     */
    selectFeatures(externalIds: string[])
    //====================================
    {
        if (this.#userInteractions !== null) {
            const featureIds = this.modelFeatureIdList(externalIds)
            this.#userInteractions.selectFeatures(featureIds)
        }
    }

    /**
     * Select features and zoom the map to them.
     *
     * @param      {Array.<string>}  featureIds   An array of feature identifiers
     * @param      {Object}  [options]
     * @param      {boolean} [options.zoomIn=false]  Zoom in the map (always zoom out as necessary)
     */
    zoomToFeatures(externalIds: string[], options=null)
    //=================================================
    {
        options = utils.setDefaults(options, {
            select: true,
            highlight: false,
            padding:100
        })
        if (this.#userInteractions !== null) {
            const featureIds = this.modelFeatureIdList(externalIds)
            this.#userInteractions.zoomToFeatures(featureIds, options)
        }
    }

    /**
     * Select features on the map.
     *
     * @param {string | Array.<string>}  geojsonIds  A single GeoJSON feature identifiers
     *                                               or an array of identifiers.
     */
    selectGeoJSONFeatures(geojsonIds)
    //===============================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.selectFeatures(geojsonIds)
        }
    }

    /**
     * Unselect all features on the map.
     */
    unselectGeoJSONFeatures()
    //=======================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.unselectFeatures()
        }
    }

    /**
     * Select features and zoom the map to them.
     *
     * @param  geojsonIds  An array of  GeoJSON feature identifiers
     * @param {boolean} [options.zoomIn=false]  Zoom in the map (always zoom out as necessary)
     */
    zoomToGeoJSONFeatures(geojsonIds: number[], options: { zoomIn?: boolean }=null)
    //=============================================================================
    {
        options = utils.setDefaults(options, {
            select: true,
            highlight: false,
            padding:100
        })
        if (this.#userInteractions !== null) {
            this.#userInteractions.zoomToFeatures(geojsonIds, options)
        }
    }

    //==========================================================================

    /**
     * Display an image on a given anatomical feature.
     *
     * @param   {string}   anatomicalId     The anatomical identifier of the feature on which
     *                                      to place the image. The image is scaled to fit within
     *                                      the feature's bounding box.
     * @param   {string}   imageUrl         The URL of the image to display.
     * @return  {string|null}               A identifying the image(s) added to the map. A map may
     *                                      have several features corresponding to a particular
     *                                      anatomical identifier, which will result in an image
     *                                      being placed on each feature. ``null`` is returned if
     *                                      there are no features with the given ``anatomicalId``.
     */
    addImage(anatomicalId: string, imageUrl: string, options={}): string|null
    //=======================================================================
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.addImage(anatomicalId, imageUrl, options)
        }
        return null
    }

    /**
     * Remove images for an anatomical features.
     *
     * @param   {string}   mapImageId       An image identifier previously returned by ``addImage()``.
     */
    removeImage(mapImageId: string)
    //=============================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.removeImage(mapImageId)
        }
    }

    //==========================================================================

    /**
     * Get a details of the nerve centrelines in the map.
     */
    getNerveDetails(): CentrelineDetails[]
    //====================================
    {
        if (this.#userInteractions !== null) {
            return this.#userInteractions.getNerveDetails()
        }
        return []
    }

    /**
     * Enable/disable the neuron paths associated with a nerve centreline.
     *
     * @param   {string[]|string}   nerveModels   Anatomical identifiers of nerve centrelines
     * @param   {boolean}  [enable=true]
     */
    enableNeuronPathsByNerve(nerveModels: string|string[], enable=true)
    //=================================================================
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.enableNeuronPathsByNerve(nerveModels, enable)
        }
    }

    //==========================================================================

    get knowledgeSource()
    //===================
    {
        return this.#knowledgeSource
    }

    /**
     * @typedef {Object} EntityLabel
     * @property {string} entity
     * @property {string} label
     */

    /**
     * Get labels for entities from the flatmap's server's knowledge store.
     *
     * @param   {string[]|string}  entities  Anatomical identifiers of entities.
     * @return  {EntityLabel[]}              An ``EntityLabel`` array.
     */
    async queryLabels(entities)
    //=========================
    {
        const entityLabels = []
        const entityArray = Array.isArray(entities) ? entities
                          : entities ? [entities]
                          : []
        if (entityArray.length > 0) {
            if (this.#mapServer.knowledgeSchema >= KNOWLEDGE_SOURCE_SCHEMA) {
                const rows = await this.#mapServer.queryKnowledge(
                                    `select source, entity, knowledge from knowledge
                                        where (source=? or source is null)
                                           and entity in (?${', ?'.repeat(entityArray.length-1)})
                                        order by entity, source desc`,
                                    [this.#knowledgeSource, ...entityArray])
                let last_entity = null
                for (const row of rows) {
                    // In entity, source[desc] order; we use the most recent label
                    if (row[1] !== last_entity) {
                        const knowledge = JSON.parse(row[2])
                        entityLabels.push({
                            entity: row[1],
                            label: knowledge['label'] || row[1]
                        })
                        last_entity = row[1]
                    }
                }
            } else {
                const rows = await this.#mapServer.queryKnowledge(
                                    `select entity, label from labels
                                        where entity in (?${', ?'.repeat(entityArray.length-1)})`,
                                    entityArray)
                return rows.map(entityLabel => {
                    return {
                        entity: entityLabel[0],
                        label: entityLabel[1]
                    }
                })
            }
        }
        return entityLabels
    }

    /**
     * Get knowledge about an entity from the flatmap's server's knowledge store.
     *
     * @param   {string}  entity  The URI of an entity.
     * @return  {Object}          JSON describing the entity.
     */
    async queryKnowledge(entity)
    //==========================
    {
        const rows = (this.#mapServer.knowledgeSchema >= KNOWLEDGE_SOURCE_SCHEMA)
                   ? await this.#mapServer.queryKnowledge(
                             'select knowledge from knowledge where (source=? or source is null) and entity=? order by source desc',
                             [this.#knowledgeSource, entity])
                   : await this.#mapServer.queryKnowledge(
                             'select knowledge from knowledge where entity=?',
                             [entity])
        // Rows are in source[desc] order; we use the most recent
        return rows.length ? JSON.parse(rows[0]) : {}
    }

    /**
     * Get all paths associated with a set of features.
     *
     * @param      {string|string[]}    entities  Anatomical terms of features
     * @return     {Promise<string[]>}  A Promise resolving to an array of path identifiers
     */
    async queryPathsForFeatures(entities)
    //===================================
    {
        const featureEntities = Array.isArray(entities) ? entities
                              : entities ? [entities]
                              : []
        const featureIds = []
        for (const anatomicalId of featureEntities) {
            featureIds.push(...this.modelFeatureIds(anatomicalId))
        }
        const featurePaths = await this.queryPathsForGeoJsonFeatures(featureIds)
        return featurePaths
    }

    /**
     * Get all paths associated with a set of features.
     *
     * @param      {number|number[]}    geojsonIds  GeoJSON ids of features
     * @return     {Promise<string[]>}  A Promise resolving to an array of path identifiers
     */
    async queryPathsForGeoJsonFeatures(geojsonIds)
    //============================================
    {
        if (this.#mapServer.knowledgeSchema < KNOWLEDGE_SOURCE_SCHEMA) {
            return []
        }
        const featureIds = Array.isArray(geojsonIds) ? geojsonIds
                              : geojsonIds ? [geojsonIds]
                              : []
        const uniqueIds = new Set(featureIds)
        const connectivityNodes: Set<string> = new Set()
        for (const featureId of uniqueIds) {
            const annotation = this.#idToAnnotation.get(featureId)
            if ('anatomical-nodes' in annotation) {
                for (const node of annotation['anatomical-nodes']) {
                    connectivityNodes.add(node)
                }
            }
        }
        if (connectivityNodes.size > 0) {
            const rows = await this.#mapServer.queryKnowledge(
                                `select path from connectivity_nodes
                                    where source=? and node in (?${', ?'.repeat(connectivityNodes.size-1)})
                                    order by node, path, source desc`,
                                [this.#knowledgeSource, ...connectivityNodes.values()])
            const featurePaths = new Set(rows.map(row => row[0]))
            return [...featurePaths.values()]
        }
        return []
    }

    //==========================================================================

    addCloseControl()
    //===============
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.addCloseControl()
        }
    }

    removeCloseControl()
    //===============
    {
        if (this.#userInteractions !== null) {
            this.#userInteractions.removeCloseControl()
        }
    }

    //==========================================================================

}   // End of FlatMap class

//==============================================================================
