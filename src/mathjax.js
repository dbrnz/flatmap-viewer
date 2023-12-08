
/******************************************************************************

Flatmap viewer and annotation tool

Copyright (c) 2019-2023  David Brooks

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

/*************************************************************************
 *
 *  direct/tex2svg
 *
 *  Uses MathJax v3 to convert a TeX string to an SVG string.
 *
 * ----------------------------------------------------------------------
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

//==============================================================================

const EM_SIZE = 16;
const EX_SIZE = 8;

//==============================================================================

//  Load the packages needed for MathJax
import {mathjax} from 'mathjax-full/js/mathjax';
import {TeX} from 'mathjax-full/js/input/tex';
import {SVG} from 'mathjax-full/js/output/svg';
import {browserAdaptor} from 'mathjax-full/js/adaptors/browserAdaptor';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html';
import {AllPackages} from 'mathjax-full/js/input/tex/AllPackages';   // required to load `textmacros`

//==============================================================================

//  Minimal CSS needed for stand-alone image
export const LatexStyleRules = [
  'svg a{fill:blue;stroke:blue}',
  // Round the corners of filled background rectangles
  '[data-mml-node="mstyle"]>rect[data-bgcolor="true"]{rx: 8%; ry: 12%}',
  '[data-mml-node="merror"]>g{fill:red;stroke:red}',
  '[data-mml-node="merror"]>rect[data-background]{fill:yellow;stroke:none}',
  '[data-frame],[data-line]{stroke-width:70px;fill:none}',
  '.mjx-dashed{stroke-dasharray:140}',
  '.mjx-dotted{stroke-linecap:round;stroke-dasharray:0,140}',
  'use[data-c]{stroke-width:3px}'
].join('');

//==============================================================================

//  Create DOM adaptor and register it for HTML documents
const adaptor = browserAdaptor();
RegisterHTMLHandler(adaptor);

//==============================================================================

const tex = new TeX({packages: AllPackages}); // ['base', 'textmacros']});
const svg = new SVG({fontCache: 'local'});
const html = mathjax.document('', {InputJax: tex, OutputJax: svg});

//==============================================================================

export function latex2Svg(latex)
{
    const node = html.convert(latex, {
      display: false,    // process as inline math
      em: 2*EM_SIZE,
      ex: 2*EX_SIZE,
    });
    let result = adaptor.innerHTML(node);
    return result.replace(/<defs>/, `<defs><style>${LatexStyleRules}</style>`);
}

//==============================================================================
