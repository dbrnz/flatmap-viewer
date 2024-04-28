/*==============================================================================

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

==============================================================================*/

import MiniSearch from 'minisearch';

//==============================================================================

// The properties of a feature we index and show

export const indexedProperties = [
    'label',
    'models',
    'source'
];

//==============================================================================

export class SearchIndex
{
    constructor()
    {
        this._searchEngine =  new MiniSearch({
            fields: ['text'],
            storeFields: ['text'],
            tokenize: (string, _fieldName) => string.split(' ')
        });
        this._featureIds = [];
    }

    indexMetadata(featureId, metadata)
    //================================
    {
        const textSeen = [];
        for (const prop of indexedProperties) {
            if (prop in metadata) {
                const text = metadata[prop];
                if (!textSeen.includes(text)) {
                    this.indexText(featureId, text);
                    textSeen.push(text);
                }
            }
        }
    }

    indexText(featureId, text)
    //========================
    {
        text = text.replace(new RegExp('<br/>', 'g'), ' ')
                   .replace(new RegExp('\n', 'g'), ' ')
                   ;
        if (text) {
            this._searchEngine.add({
                id: this._featureIds.length,
                text: text
            });
            this._featureIds.push(featureId);
        }
    }

    clearResults()
    //============
    {
        this._;
    }

    auto_suggest(text)
    //================
    {
        return this._searchEngine.autoSuggest(text, {prefix: true});
    }

    search(text)
    //==========
    {
        const options = {};
        let results = [];
        text = text.trim()
        if (text.length > 2 && ["'", '"'].includes(text.slice(0, 1))) {
            text = text.replaceAll(text.slice(0, 1), '');
            results = this._searchEngine.search(text, {prefix: true, combineWith: 'AND'});
        } else if (text.length > 1) {
            results = this._searchEngine.search(text, {prefix: true});
        }
        const featureResults = results.map(r => {
            return {
                featureId: this._featureIds[r.id],
                score: r.score,
                terms: r.terms,
                text: r.text
            }});
        return new SearchResults(featureResults);
    }
}

//==============================================================================

export class SearchResults
{
    constructor(results)
    {
        this.__results = results.sort((a, b) => (b.score - a.score));
        this.__featureIds = results.map(r => r.featureId);
    }

    get featureIds()
    {
        return this.__featureIds;
    }

    get results()
    {
        return this.__results;
    }
}

//==============================================================================
