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

******************************************************************************/

'use strict';

//==============================================================================

// We use Font Awesome icons
import '@fortawesome/fontawesome-free/css/all.css';
import escape from 'html-es6cape';
import { jsPanel } from 'jspanel4';
import 'jspanel4/dist/jspanel.css';

//==============================================================================

const FETCH_TIMEOUT = 3000;   //  3 seconds
const UPDATE_TIMEOUT = 3000;  //  5 seconds
const LOGIN_TIMEOUT = 30000;  // 30 seconds
const LOGOUT_TIMEOUT = 3000;  //  5 seconds

const STATUS_MESSAGE_TIMEOUT = 3000;

//==============================================================================

const FEATURE_DISPLAY_PROPERTIES = {
    'id': 'Feature',
    'label': 'Tooltip',
    'models': 'Models',
    'name': 'Name',
    'sckan': 'SCKAN valid',
    'fc-class': 'FC class',
    'fc-kind': 'FC kind',
    'layer': 'Map layer',
}

const ANNOTATION_FIELDS = [
    {
        prompt: 'Feature derived from',
        key: 'prov:wasDerivedFrom',
        update: true,
        kind: 'list',
        size: 6
    },
    {
        prompt: 'Comment',
        key: 'rdfs:comment',
        update: false,
        kind: 'textbox'
    },
];

//==============================================================================

function startSpinner(panel)
{
    panel.headerlogo.innerHTML = '<span class="fa fa-spinner fa-spin ml-2"></span>';
}

function stopSpinner(panel)
{
    panel.headerlogo.innerHTML = '';
}

//==============================================================================

export class Annotator
{
    constructor(flatmap, ui)
    {
        this.__flatmap = flatmap;
        this.__ui = ui;
        this.__haveAnnotation = false;
        this.__user = undefined;
        this.__savedStatusMessage = '';
        this.__authorised = false;
    }

    get user()
    {
        return this.__user;
    }

    __creatorName(creator)
    {
        return creator.name || creator.email || creator.login || creator.company || creator;
    }

    __setUser(creator)
    {
        this.__user = creator;
        this.__setStatusMessage(`Annotating as ${this.__creatorName(creator)}`, 0)
    }

    __clearUser()
    {
        this.__user = undefined;
        this.__setStatusMessage('', 0);
    }

    async __authorise(panel)
    //======================
    {
        const abortController = new AbortController();
        setTimeout((panel) => {
            if (this.user === 'undefined') {
                console.log("Aborting login...");
                abortController.abort();
                stopSpinner(panel);
                this.__setStatusMessage('Unable to login...');
                }
            },
            LOGIN_TIMEOUT, panel);

        const url = `${this.__flatmap._baseUrl}login`;
        startSpinner(panel);
        const response = await fetch(url, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            signal: abortController.signal
        });
        stopSpinner(panel);
        if (response.ok) {
            const user_data = await response.json();
            if ('error' in user_data) {
                return Promise.resolve({error: response.error});
            } else {
                this.__setUser(user_data);
                this.__authorised = true;
                return Promise.resolve(user_data);
            }
        } else {
            return Promise.resolve({error: `${response.status} ${response.statusText}`});
        }
    }

    async __unauthorise()
    //===================
    {
        const abortController = new AbortController();
        setTimeout(() => {
            if (this.__authorised) {
                console.log("Aborting logout...");
                abortController.abort();
                this.__setStatusMessage('Unable to logout...');
                }
            },
            LOGOUT_TIMEOUT);

        const url = `${this.__flatmap._baseUrl}logout`;
        const response = fetch(url, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            signal: abortController.signal
        });
        if (response.ok) {
            this.__authorised = false;
            return response.json();
        } else {
            return Promise.resolve({error: `${response.status} ${response.statusText}`});
        }
    }

    __setStatusMessage(message, timeout=STATUS_MESSAGE_TIMEOUT)
    //=========================================================
    {
        if (timeout == 0) {
            this.__savedStatusMessage = message;
        }
        this.__statusMessage.innerHTML = message;
        if (+timeout > 0) {
            setTimeout(() => {
                this.__statusMessage.innerHTML = this.__savedStatusMessage;
            }, +timeout);
        }
    }

    __featureHtml(featureProperties)
    //==============================
    {
        // Feature properties
        const html = [];
        for (const [key, prompt] of Object.entries(FEATURE_DISPLAY_PROPERTIES)) {
            const value = featureProperties[key];
            if (value !== undefined && value !== '') {
                const escapedValue = escape(value).replaceAll('\n', '<br/>');
                html.push(`<div><span class="flatmap-annotation-prompt">${prompt}:</span><span class="flatmap-annotation-value">${escapedValue}</span></div>`)
            }
        }
        return html;
    }

    __annotationHtml(annotations)
    //===========================
    {
        const html = [];
        let firstBlock = true;
        for (const annotation of annotations) {
            if (firstBlock) {
                firstBlock = false;
            } else {
                html.push('<hr/>')
            }
            if (annotation['rdf:type'] === 'prov:Entity') {
                const annotator = this.__creatorName(annotation['dct:creator']);
                html.push(`<div><span class="flatmap-annotation-prompt">${annotation['dct:created']}</span><span class="flatmap-annotation-value">${annotator}</span></div>`);
                for (const field of ANNOTATION_FIELDS) {
                    const value = annotation[field.key];
                    if (value !== undefined && value !== '') {
                        const escapedValue = (field.kind === 'list')
                                           ? value.filter(v => v.trim()).map(v => escape(v.trim())).join(', ')
                                           : escape(value).replaceAll('\n', '<br/>');
                        html.push(`<div><span class="flatmap-annotation-prompt">${field.prompt}:</span><span class="flatmap-annotation-value">${escapedValue}</span></div>`);
                    }
                }
            }
        }
        return html.join('\n');
    }

    __editFormHtml(provenanceData)
    //============================
    {
        const html = [];
        html.push('<div id="flatmap-annotation-formdata">');
        for (const field of ANNOTATION_FIELDS) {
            html.push('<div class="flatmap-annotation-entry">');
            html.push(`  <label for="${field.key}">${field.prompt}:</label>`);
            if (field.kind === 'textbox') {
                const value = field.update ? provenanceData[field.key] || '' : '';
                html.push(`  <textarea rows="5" cols="40" id="${field.key}" name="${field.key}">${value.trim()}</textarea>`)
            } else if (!('kind' in field) || field.kind !== 'list') {
                const value = field.update ? provenanceData[field.key] || '' : '';
                html.push(`  <input type="text" size="40" id="${field.key}" name="${field.key}" value="${value.trim()}"/>`)
            } else {   // field.kind === 'list'
                const listValues = field.update ? provenanceData[field.key] || [] : [];
                html.push('  <div class="multiple">')
                for (let n = 1; n <= field.size; n++) {
                    const fieldValue = (n <= listValues.length) ? listValues[n-1].trim() : '';
                    html.push(`    <input type="text" size="40" id="${field.key}_${n}" name="${field.key}" value="${fieldValue}"/>`)
                }
                html.push('  </div>')
            }
            html.push('</div>');
        }
        html.push('  <div><input id="annotation-save-button" type="button" value="Save"/></div>');
        html.push('</div>');
        return html.join('\n');
    }

    __provenanceData(annotations)
    //===========================
    {
        const provenanceData = {};
        for (const annotation of annotations) {   // In order of most recent to oldest
            if (annotation['rdf:type'] === 'prov:Entity') {
                for (const field of ANNOTATION_FIELDS) {
                    if (field.update) {
                        const value = annotation[field.key];
                        if (value !== undefined && !(field.key in provenanceData)) {
                            provenanceData[field.key] = value;
                        }
                    }
                }
            }
        }
        return provenanceData;
    }

    __changedAnnotation(provenanceData)
    //=================================
    {
        const newProperties = {};
        let propertiesChanged = false;
        for (const field of ANNOTATION_FIELDS) {
            if (!('kind' in field) || field.kind !== 'list') {
                const lastValue = field.update ? provenanceData[field.key] || '' : '';
                const inputField = document.getElementById(field.key);
                const newValue = inputField.value.trim();
                if (newValue !== lastValue.trim()) {
                    newProperties[field.key] = newValue;
                    propertiesChanged = true;
                }
            } else {   // field.kind === 'list'
                const listValues = [];
                for (let n = 1; n <= field.size; n++) {
                    const inputField = document.getElementById(`${field.key}_${n}`);
                    listValues.push(inputField.value.trim());
                }
                const lastValue = field.update ? provenanceData[field.key] || [] : [];
                const oldValues = lastValue.map(v => v.trim()).filter(v => (v !== '')).sort(Intl.Collator().compare);
                const newValues = listValues.map(v => v.trim()).filter(v => (v !== '')).sort(Intl.Collator().compare);
                if (oldValues.length !== newValues.length
                 || oldValues.filter(v => !newValues.includes(v)).length > 0) {
                    newProperties[field.key] = newValues;
                    propertiesChanged = true;
                }
            }
        }
        return {
            changed: propertiesChanged,
            properties: newProperties
        }
    }

    async __updateRemoteAnnotation(panel, annotation)
    //===============================================
    {
        const abortController = new AbortController();

        setTimeout((panel) => {
            if (panel.status !== 'closed') {
                console.log("Aborting remote update...");
                abortController.abort();
                stopSpinner(panel);
                this.__setStatusMessage('Cannot update annotation...');
            }
        }, UPDATE_TIMEOUT, panel);

        const url = this.__flatmap.makeServerUrl(this.__currentFeatureId, 'annotator/');
        const response = await fetch(url, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            method: 'POST',
            body: JSON.stringify(annotation),
            signal: abortController.signal
        });
        if (response.ok) {
            return response.json();
        } else {
            return Promise.resolve({error: `${response.status} ${response.statusText}`});
        }
    }

    async __saveAnnotation(panel, provenanceData)
    //===========================================
    {
        const changedProperties = this.__changedAnnotation(provenanceData);
        if (this.__currentFeatureId !== undefined && changedProperties.changed) {
            const annotation = {
                ...changedProperties.properties,
                'rdf:type': 'prov:Entity',
                'dct:subject': `flatmaps:${this.__flatmap.uuid}/${this.__currentFeatureId}`,
                'dct:creator': this.user
            }
            startSpinner(panel);
            const response = await this.__updateRemoteAnnotation(panel, annotation);
            stopSpinner(panel);
            if ('error' in response) {
                this.__setStatusMessage(response.error);
            } else {
                this.__flatmap.setFeatureAnnotated(this.__currentFeatureId);
                panel.close();
            }
        } else {
            this.__setStatusMessage('No changes to save...');
        }
    }

    __finishPanelContent(panel, response)
    //====================================
    {
        this.__haveAnnotation = true;
        const provenanceData = this.__provenanceData(response);
        this.__existingAnnotation.innerHTML = this.__annotationHtml(response);
        this.__annotationForm.innerHTML = this.__editFormHtml(provenanceData);

        // Lock focus to focusable elements within the panel
        const inputElements = panel.content.querySelectorAll('input, textarea, button');
        this.__firstInputField = inputElements[0];
        const lastInput = inputElements[inputElements.length - 1];
        const saveButton = document.getElementById('annotation-save-button');

        panel.addEventListener('keydown', function (e) {
            if (e.key === 'Tab') {
                if ( e.shiftKey ) /* shift + tab */ {
                    if (document.activeElement === this.__firstInputField) {
                        lastInput.focus();
                        e.preventDefault();
                    }
                } else /* tab */ {
                    if (document.activeElement === lastInput) {
                        this.__firstInputField.focus();
                        e.preventDefault();
                    }
                }
            } else if (e.key === 'Enter') {
                if (e.target === saveButton) {
                    this.__saveAnnotation(panel, provenanceData);
                }
            }
        }.bind(this));

        saveButton.addEventListener('mousedown', function (e) {
            this.__saveAnnotation(panel, provenanceData);
        }.bind(this));
    }

    __panelCallback(panel)
    //====================
    {
        this.__annotationForm = document.getElementById('flatmap-annotation-form');
        // Data entry only once authorised
        this.__annotationForm.hidden = true;

        // Populate once we have content from server
        this.__existingAnnotation = document.getElementById('flatmap-annotation-existing');
        this.__statusMessage = document.getElementById('flatmap-annotation-status');

        this.__authoriseLock = document.getElementById('flatmap-annotation-lock');
        this.__authoriseLock.addEventListener('click', (e) => {
            const lockClasses = this.__authoriseLock.classList;
            if (lockClasses.contains('fa-lock')) {
                this.__authorise(panel).then((response) => {
                    if ('error' in response) {
                        this.__setStatusMessage(response.error);
                    } else {
                        this.__annotationForm.hidden = false;
                        this.__firstInputField.focus();
                        lockClasses.remove('fa-lock');
                        lockClasses.add('fa-unlock');
                    }
                });
            } else {
                this.__unauthorise().then((response) => {
                    console.log(`Annotator logout: ${response}`);
                });
                this.__annotationForm.hidden = true;
                lockClasses.remove('fa-unlock');
                lockClasses.add('fa-lock');
            }
        });
    }

    __chooseFeatureProperties(features, callback)
    //===========================================
    {
        this.__ui.selectFeature(features[0].id);

        // Feature chooser is only for multiple selections
        if (features.length === 1
         || features[0].properties['cd-class'] !== 'celldl:Connection'
         || (features.length === 2
          && features[1].properties['cd-class'] !== 'celldl:Connection')) {
            callback(features[0].properties);
            return;
        }
        const featureList = [];
        const featureProperties = new Map();
        const featureSeen = new Set();
        let selected = 'selected';    // Select the first entry
        for (const feature of features) {
            if (feature.properties['cd-class'] !== 'celldl:Connection'
             || feature.properties['id'] == undefined
             || featureSeen.has(feature.properties['id'])) {
                continue;
            }
            const mapFeature = this.__ui.mapFeature(feature.id);
            const annotated = (mapFeature !== undefined)
                            ? this.__ui._map.getFeatureState(mapFeature)['annotated']
                            : false;
            let label = '';
            if (feature.properties.models) {
                label = ` -- ${feature.properties.label.split('\n')[0]} (${feature.properties.models})`;
            }
            featureList.push(`<option value="${feature.id}" ${selected}>${annotated ? '* ' : ''}${feature.properties.id} -- ${feature.properties.kind}${label}</option>`);
            featureProperties.set(+feature.id, feature.properties);
            featureSeen.add(feature.properties['id']);
            selected = '';
        }
        if (featureList.length == 0) {
            callback(undefined);
            return;
        } else if (featureList.length == 1) {
            callback(featureProperties.values().next().value);
            return;
        }
        const panelContent = `
<div id="flatmap-annotation-feature">
    <div>
        <label for="annotation-feature-selector">Select feature:</label>
        <select id="annotation-feature-selector" size="${Math.min(featureList.length, 7)}">
            ${featureList.join('\n')}
        </select>
    </div>
    <div>
        <input id="annotation-feature-cancel" type="button" value="Cancel"/>
        <input id="annotation-feature-annotate" type="button" value="Annotate"/>
    </div>
</div>`;
        this.__panel = jsPanel.create({
            theme: 'light',
            border: '2px solid #080',
            borderRadius: '.5rem',
            panelSize: 'auto auto',
            position: 'left-top',
            content: panelContent,
            data: features[0].properties,
            closeOnEscape: true,
            closeOnBackdrop: false,
            headerTitle: 'Select feature to annotate',
            headerControls: 'closeonly xs',
            callback: ((panel) => {
                const selector = document.getElementById('annotation-feature-selector');
                selector.onchange = (e) => {
                    if (e.target.value !== '') {
                        this.__ui.unselectFeatures();
                        this.__ui.selectFeature(e.target.value);
                        this.__panel.options.data = featureProperties.get(+e.target.value);
                    }
                };
                selector.ondblclick = (e) => {
                    if (e.target.value !== '') {
                        const properties = this.__panel.options.data;
                        this.__panel.close();
                        callback(properties);
                    }
                }
                selector.focus();
                document.getElementById('annotation-feature-cancel')
                        .onclick = (e) => {
                            this.__panel.close();
                            callback(undefined);
                        };
                document.getElementById('annotation-feature-annotate')
                        .onclick = (e) => {
                            const properties = this.__panel.options.data;
                            this.__panel.close();
                            callback(properties);
                        };
            }).bind(this)
        });
        document.addEventListener('jspanelcloseduser', (e) => { callback(undefined) }, false);
    }

    annotate(features, closedCallback)
    //================================
    {
        // provide a list of features so dialog needs to first provide selection list
        // and highlight current one as user scrolls...

        this.__chooseFeatureProperties(features, (featureProperties) => {
            if (featureProperties) {
                this.__annotateFeature(featureProperties, closedCallback);
            } else {
                closedCallback();
            }
        });
    }

    __annotateFeature(featureProperties, callback)
    //============================================
    {
        this.__currentFeatureId = featureProperties['id'];
        if (this.__currentFeatureId === undefined) {
            callback();
            return;
        }
        const panelContent = [];
        panelContent.push('<div id="flatmap-annotation-panel">');
        panelContent.push('  <div id="flatmap-annotation-feature">');
        panelContent.push(...this.__featureHtml(featureProperties));
        panelContent.push('  </div>');
        panelContent.push('  <form id="flatmap-annotation-form"></form>');
        panelContent.push('  <div id="flatmap-annotation-existing"></div>');
        panelContent.push('</div>');

        const annotator = this;             // To use in panel creation code
        const flatmap = this.__flatmap;     // To use in panel creation code
        const contentFetchAbort = new AbortController();
        this.__panel = jsPanel.create({
            theme: 'light',
            border: '2px solid #080',
            borderRadius: '.5rem',
            panelSize: '725px auto',
            position: 'left-top',
            data: {
                flatmap: this.__flatmap
            },
            content: panelContent.join('\n'),
            closeOnEscape: true,
            closeOnBackdrop: false,
            headerTitle: 'Feature annotations',
            headerControls: 'closeonly xs',
            footerToolbar: [
                '<span id="flatmap-annotation-status" class="flex-auto"></span>',
                '<span id="flatmap-annotation-lock" class="jsPanel-ftr-btn fa fa-lock"></span>',
            ],
            contentFetch: {
                resource: flatmap.makeServerUrl(this.__currentFeatureId, 'annotator/'),
                fetchInit: {
                    method: 'GET',
                    mode: 'cors',
                    headers: {
                        "Accept": "application/json; charset=utf-8",
                        "Cache-Control": "no-store"
                    },
                    signal: contentFetchAbort.signal
                },
                bodyMethod: 'json',
                beforeSend: (fetchConfig, panel) => {
                    startSpinner(panel);
                    setTimeout((panel) => {
                        if (!annotator.__haveAnnotation) {
                            console.log("Aborting content fetch...");
                            contentFetchAbort.abort();
                            stopSpinner(panel);
                            annotator.__setStatusMessage('Cannot fetch annotation...');
                            annotator.__authoriseLock.className = '';
                        }
                    }, FETCH_TIMEOUT, panel);
                },
                done: (response, panel) => {
                    annotator.__finishPanelContent(panel, response);
                    stopSpinner(panel);
                }
            },
            callback: annotator.__panelCallback.bind(annotator)
        });

        // should we warn if unsaved changes when closing??
        document.addEventListener('jspanelclosed', callback, false);
    }

    async annotated_features()
    //========================
    {
        const url = this.__flatmap.makeServerUrl('', 'annotator/');
        const response = await fetch(url, {
            headers: {
                "Accept": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            }
        });
        if (response.ok) {
            return response.json();
        } else {
            console.error(`Annotated features: ${response.status} ${response.statusText}`);
            return Promise.resolve([]);
        }
    }

}

//==============================================================================
