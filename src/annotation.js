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
import '../static/css/font-awesome.min.css';


import escape from 'html-es6cape';

import { jsPanel } from 'jspanel4';
import 'jspanel4/dist/jspanel.css';

//==============================================================================


/**
 * Based on ~/Flatmaps/ol-viewer/src/annotation.js
 */

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
		kind: 'list',
		size: 6
	},
	{
		prompt: 'Comment',
		key: 'rdfs:comment',
		kind: 'textbox'
	},
];

//==============================================================================

export class Annotator
{
	constructor(flatmap)
	{
		this.__flatmap = flatmap;
	}

    async saveExternalAnnotation(featureId, properties)
    //=================================================
    {
        const url = this.__flatmap.addBaseUrl_(`/annotations/${featureId}`);
        fetch(url, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            method: 'POST',
            body: JSON.stringify(properties)
        }).then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP error ${url}, Status: ${response.status}`);
            }
            return response.text();
        });
    }

    __featureHtml(feature)
    //====================
    {
    	// Feature properties
    	const html = [];
    	for (const [key, prompt] of Object.entries(FEATURE_DISPLAY_PROPERTIES)) {
    		const value = feature.properties[key];
    		if (value !== undefined && value !== '') {
    			const escapedValue = escape(value).replaceAll('\n', '<br/>');
    			html.push(`<div><span class="flatmap-annotation-prompt">${prompt}:</span><span class="flatmap-annotation-value">${escapedValue}</span></div>`)
    		}
    	}
		return html;
    }

    __editFormHtml(annotation)
    //========================
    {
    	const html = [];
		html.push('<div id="flatmap-annotation-formdata">');
		for (const field of ANNOTATION_FIELDS) {
			html.push('<div class="flatmap-annotation-entry">');
			html.push(`  <label for="${field.key}">${field.prompt}:</label>`);
			const value = annotation.properties[field.key] || '';
			if (field.kind === 'textbox') {
				html.push(`  <textarea rows="5" cols="40" id="${field.key}" name="${field.key}">${value.trim()}</textarea>`)
			} else if (!('size' in field) || field.size === 1) {
				html.push(`  <input type="text" size="40" id="${field.key}" name="${field.key}" value=${value.trim()}/>`)
			} else {
				html.push('  <div class="multiple">')
				for (let n = 1; n <= field.size; n++) {
					const fieldValue = (n <= value.length) ? value[n-1].trim() : '';
					html.push(`    <input type="text" size="40" id="${field.key}_${n}" name="${field.key}" value=${fieldValue}/>`)
				}
				html.push('  </div>')
			}
			html.push('</div>');
		}
		html.push('  <div><input id="annotation-save-button" type="button" value="Save"/></div>');
    	html.push('</div>');
		return html.join('\n');
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
    		const creator = annotation.creator;
    		const annotator = creator.name || creator.email || creator.login || creator.company || creator;
    		html.push(`<div><span class="flatmap-annotation-prompt">${annotation.created}</span><span class="flatmap-annotation-value">${annotator}</span></div>`);
			for (const field of ANNOTATION_FIELDS) {
				const value = annotation.properties[field.key];
				// field.kind === 'list'
    			if (value !== undefined && value !== '') {
    				const escapedValue = escape(value).replaceAll('\n', '<br/>');
    				html.push(`<div><span class="flatmap-annotation-prompt">${field.prompt}:</span><span class="flatmap-annotation-value">${escapedValue}</span></div>`);
	    		}
    		}
    	}
		return html.join('\n');
    }

	__setupEditForm(panel, response)
	//==============================
	{
		console.log('Fetch done', response);

		this.__existingAnnotation.innerHTML = this.__annotationHtml(response);

		this.__annotationForm.innerHTML = this.__editFormHtml({properties: {}});


        // only do this once we have an edit form....
        //
        // get all focusable elements within the panel content
        const inputElements = panel.content.querySelectorAll('input, textarea, button');
        this.__firstInputField = inputElements[0];
        const lastInput = inputElements[inputElements.length - 1];

        const saveButton = document.getElementById('annotation-save-button');

        // Lock focus within the panel
        panel.addEventListener('keydown', function (e) {
            if (e.key === 'Tab') {
                if ( e.shiftKey ) /* shift + tab */ {
                    if (document.activeElement === firstInput) {
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
	            	// validate/save input and close dialog
            		panel.close();
            	}
            }
        });

        saveButton.addEventListener('mousedown', function (e) {
        	// validate/save input and close dialog
        	// save only if changes...
    		panel.close();
        });

	}

	annotate(feature, closedCallback)
	//===============================
	{
		const featureId = feature.properties['id']

        if (featureId === undefined) {
        	closedCallback();
        	return;
        }

    	const panelContent = [];
    	panelContent.push('<div id="flatmap-annotation-panel">');
		panelContent.push('  <div id="flatmap-annotation-feature">');
    	panelContent.push(...this.__featureHtml(feature));
		panelContent.push('  </div>');
		panelContent.push('  <form id="flatmap-annotation-form"></form>');
    	panelContent.push('  <div id="flatmap-annotation-existing"></div>');
    	panelContent.push('</div>');

    	const annotator = this;         	// To use in panel code
    	const flatmap = this.__flatmap; 	// To use in panel code
		jsPanel.create({
		    theme: 'light',
		    border: '2px solid #0C0',
		    borderRadius: '.5rem',
		    panelSize: '725px auto',
		    data: {
		    	flatmap: this.__flatmap
		    },
		    content: panelContent.join('\n'),
 			closeOnEscape: true,
		    closeOnBackdrop: false,
			headerTitle: 'Feature annotations',
			headerControls: 'closeonly xs',
		    footerToolbar: [
		        '<span id="flatmap-annotation-user" class="flex-auto">Logged out</span>',
		        '<span id="flatmap-annotation-lock" class="jsPanel-ftr-btn fa fa-lock"></span>',
		    ],
		    contentFetch: {
		        resource: flatmap.addBaseUrl_(`/annotations/${featureId}`),
		        fetchInit: {
		            method: 'GET',
		            headers: {
		                "Accept": "application/json; charset=utf-8",
		                "Cache-Control": "no-store"
		            }
		        },
		        bodyMethod: 'json',
		        beforeSend: (fetchConfig, panel) => {
		            panel.headerlogo.innerHTML = '<span class="fa fa-spinner fa-spin ml-2"></span>'
		        },
		        done: (response, panel) => {
		            panel.headerlogo.innerHTML = '';
					annotator.__setupEditForm(panel, response);
		        }
		    },
		    callback: (panel) => {
    			annotator.__annotationForm = document.getElementById('flatmap-annotation-form');
		        // Data entry only once authorised
    			annotator.__annotationForm.hidden = true;

    			// Populate once we have content from server
		    	annotator.__existingAnnotation = document.getElementById('flatmap-annotation-existing');

		        const authoriseLock = document.getElementById('flatmap-annotation-lock');
		        const authorisedUser = document.getElementById('flatmap-annotation-user');
		        const lockClasses = authoriseLock.classList
		        authoriseLock.addEventListener('click', (e) => {
		        	if (lockClasses.contains('fa-lock')) {
		        		lockClasses.remove('fa-lock');
		        		lockClasses.add('fa-unlock');
		        		// '/login`
		        		authorisedUser.innerHTML = 'Annotating as ...';
		        		annotator.__annotationForm.hidden = false;
				        annotator.__firstInputField.focus();
		        	} else {
				        // should we warn if unsaved changes??
		        		lockClasses.remove('fa-unlock');
		        		lockClasses.add('fa-lock');
		        		authorisedUser.innerHTML = '';
		        		annotator.__annotationForm.hidden = true;
		        	}
		        });

		        document.addEventListener('jspanelclosed', closedCallback, false);
		    }
		});

    /// *******await this.__flatmp.saveExternalAnnotation(featureId, properties);

	}


}

//==============================================================================
