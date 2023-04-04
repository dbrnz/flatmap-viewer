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
const UPDATE_TIMEOUT = 5000;  //  5 seconds
const LOGIN_TIMEOUT = 30000;  // 30 seconds
const LOGOUT_TIMEOUT = 5000;  //  5 seconds

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

export class Annotator
{
    constructor(flatmap)
    {
        this.__flatmap = flatmap;
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

    __authorise(panel, callback)
    //==========================
    {
        const abortController = new AbortController();
        const url = `${this.__flatmap._baseUrl}login`;
        panel.headerlogo.innerHTML = '<span class="fa fa-spinner fa-spin ml-2"></span>';
        fetch(url, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            signal: abortController.signal
        }).then((response) => {
            panel.headerlogo.innerHTML = '';
            if (response.ok) {
                const creator = response.json();
                if ('error' in creator) {
                    callback({error: creator.error});
                } else {
                    this.__setUser(creator);
                    this.__authorised = true;
                    callback(creator);
                }
            } else {
                callback({error: `${response.status} ${response.statusText}`});
            }
        });
        setTimeout((panel) => {
            if (this.user === 'undefined') {
                console.log("Aborting login...");
                abortController.abort();
                panel.headerlogo.innerHTML = '';
                this.__setStatusMessage('Unable to login...');
                }
            },
            LOGIN_TIMEOUT, panel);
    }

    __unauthorise()
    //=============
    {
        this.__clearUser();
        const abortController = new AbortController();
        const url = `${this.__flatmap._baseUrl}logout`;
        fetch(url, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            signal: abortController.signal
        }).then((response) => {
            if (response.ok) {
                this.__authorised = false;
                console.log('Annotator logout:', response.json());
            } else {
                console.log('Annotator logout:', `${response.status} ${response.statusText}`);
            }
        });
        setTimeout(() => {
            if (this.__authorised) {
                console.log("Aborting logout...");
                abortController.abort();
                this.__setStatusMessage('Unable to logout...');
                }
            },
            LOGOUT_TIMEOUT);
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

    __editFormHtml(annotation)
    //========================
    {
        const html = [];
        html.push('<div id="flatmap-annotation-formdata">');
        for (const field of ANNOTATION_FIELDS) {
            html.push('<div class="flatmap-annotation-entry">');
            html.push(`  <label for="${field.key}">${field.prompt}:</label>`);
            const value = field.update ? annotation[field.key] || '' : '';
            if (field.kind === 'textbox') {
                html.push(`  <textarea rows="5" cols="40" id="${field.key}" name="${field.key}">${value.trim()}</textarea>`)
            } else if (!('kind' in field) || field.kind !== 'list') {
                html.push(`  <input type="text" size="40" id="${field.key}" name="${field.key}" value="${value.trim()}"/>`)
            } else {   // field.kind === 'list'
                html.push('  <div class="multiple">')
                for (let n = 1; n <= field.size; n++) {
                    const fieldValue = (n <= value.length) ? value[n-1].trim() : '';
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

    __changedAnnotation(lastAnnotation)
    //=================================
    {
        const newProperties = {};
        let propertiesChanged = false;
        for (const field of ANNOTATION_FIELDS) {
            const lastValue = field.update ? lastAnnotation[field.key] || '' : '';
            if (!('kind' in field) || field.kind !== 'list') {
                const inputField = document.getElementById(field.key);
                newProperties[field.key] = inputField.value.trim();
                if (!propertiesChanged && newProperties[field.key] !== lastValue.trim()) {
                    propertiesChanged = true;
                }
            } else {   // field.kind === 'list'
                newProperties[field.key] = [];
                const changedList = false;
                for (let n = 1; n <= field.size; n++) {
                    const lastListValue = (n <= lastValue.length) ? lastValue[n-1].trim() : '';
                    const inputField = document.getElementById(`${field.key}_${n}`);
                    const newListValue = inputField.value.trim();
                    newProperties[field.key].push(newListValue);
                    if (!propertiesChanged && newListValue !== lastListValue) {
                        propertiesChanged = true;
                    }
                }
            }
        }
        return {
            changed: propertiesChanged,
            properties: newProperties
        }
    }

    __updateRemoteAnnotation(annotation, callback)
    //============================================
    {
        const abortController = new AbortController();
        const url = this.__flatmap.addBaseUrl_(`/annotations/${this.__currentFeatureId}`);
        fetch(url, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            method: 'POST',
            body: JSON.stringify(annotation),
            signal: abortController.signal
        }).then((response) => {
            if (response.ok) {
                callback(response.json());
            } else {
                callback({error: `${response.status} ${response.statusText}`});
            }
        });
        return abortController;
    }

    __saveAnnotation(panel, lastAnnotation)
    //=====================================
    {
        const changedProperties = this.__changedAnnotation(lastAnnotation);
        if (this.__currentFeatureId !== undefined && changedProperties.changed) {
            const annotation = {
                ...changedProperties.properties,
                'rdf:type': 'prov:Entity',
                'dct:subject': `flatmaps:${this.__flatmap.uuid}/${this.__currentFeatureId}`,
                'dct:creator': this.user
            }
            panel.headerlogo.innerHTML = '<span class="fa fa-spinner fa-spin ml-2"></span>';
            const remoteUpdate = this.__updateRemoteAnnotation(annotation,
                (response) => {
                    if ('error' in response) {
                        panel.headerlogo.innerHTML = response.error;
                    } else {
                        panel.headerlogo.innerHTML = '';
                        panel.close();
                    }
                });
            setTimeout((panel) => {
                if (panel.status !== 'closed') {
                    console.log("Aborting remote update...");
                    remoteUpdate.abort();
                    panel.headerlogo.innerHTML = '';
                    this.__setStatusMessage('Cannot update annotation...');
                }
            }, UPDATE_TIMEOUT, panel);
        } else {
            this.__
            this.__setStatusMessage('No changes to save...');
        }
    }

    __finishPanelContent(panel, response)
    //====================================
    {
        this.__haveAnnotation = true;
        this.__existingAnnotation.innerHTML = this.__annotationHtml(response);
        const lastAnnotation = response.length ? response[0] : {};
        this.__annotationForm.innerHTML = this.__editFormHtml(lastAnnotation);

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
                    this.__saveAnnotation(panel, lastAnnotation);
                }
            }
        }.bind(this));

        saveButton.addEventListener('mousedown', function (e) {
            this.__saveAnnotation(panel, lastAnnotation);
        }.bind(this));
    }

    annotate(feature, closedCallback)
    //===============================
    {
        this.__currentFeatureId = feature.properties['id']

        if (this.__currentFeatureId === undefined) {
            closedCallback();
            return;
        }

        const panelContent = [];
        panelContent.push('<div id="flatmap-annotation-panel">');
        panelContent.push('  <div id="flatmap-annotation-feature">');
        panelContent.push(...this.__featureHtml(feature.properties));
        panelContent.push('  </div>');
        panelContent.push('  <form id="flatmap-annotation-form"></form>');
        panelContent.push('  <div id="flatmap-annotation-existing"></div>');
        panelContent.push('</div>');

        const annotator = this;             // To use in panel code
        const flatmap = this.__flatmap;     // To use in panel code
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
                resource: flatmap.addBaseUrl_(`/annotations/${this.__currentFeatureId}`),
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
                    panel.headerlogo.innerHTML = '<span class="fa fa-spinner fa-spin ml-2"></span>';
                    setTimeout((panel) => {
                        if (!annotator.__haveAnnotation) {
                            console.log("Aborting content fetch...");
                            contentFetchAbort.abort();
                            panel.headerlogo.innerHTML = '';
                            annotator.__setStatusMessage('Cannot fetch annotation...');
                            annotator.__authoriseLock.className = '';
                        }
                    }, FETCH_TIMEOUT, panel);
                },
                done: (response, panel) => {
                    annotator.__finishPanelContent(panel, response);
                    panel.headerlogo.innerHTML = '';
                }
            },
            callback: (panel) => {
                annotator.__annotationForm = document.getElementById('flatmap-annotation-form');
                // Data entry only once authorised
                annotator.__annotationForm.hidden = true;

                // Populate once we have content from server
                annotator.__existingAnnotation = document.getElementById('flatmap-annotation-existing');
                annotator.__statusMessage = document.getElementById('flatmap-annotation-status');

                annotator.__authoriseLock = document.getElementById('flatmap-annotation-lock');
                annotator.__authoriseLock.addEventListener('click', (e) => {
                    const lockClasses = annotator.__authoriseLock.classList;
                    if (lockClasses.contains('fa-lock')) {
                        annotator.__authorise(panel, (response) => {
                            if ('error' in response) {
                                annotator.__setStatusMessage(response.error);
                            } else {
                                annotator.__annotationForm.hidden = false;
                                annotator.__firstInputField.focus();
                                lockClasses.remove('fa-lock');
                                lockClasses.add('fa-unlock');
                            }
                        });
                    } else {
                        annotator.__unauthorise();
                        annotator.__annotationForm.hidden = true;
                        lockClasses.remove('fa-unlock');
                        lockClasses.add('fa-lock');
                    }
                });

                // should we warn if unsaved changes when closing??
                document.addEventListener('jspanelclosed', closedCallback, false);
            }
        });

    }

}

//==============================================================================
