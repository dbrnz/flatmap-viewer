/******************************************************************************

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

******************************************************************************/

class FeatureFilter
{
    #filter

    constructor(filter)
    {
        this.#filter = filter
    }

    makeStyleFilter()
    //===============
    {
        return this.#makeStyleFilter(this.#filter)
    }

    #makeStyleFilter(filter)
    //======================
    {
        // We expect an object, so check and warn...
        if (!filter || filter.constructor !== Object) {
            console.warn(`makeFilter: Invalid filter expression: ${filter}`)
            return []
        }

        const styleFilter = []
        for (const [key, expr] of Object.entries(filter)) {
            if (key === 'AND' || key === 'OR') {
                if (Array.isArray(expr) && expr.length >= 2) {
                    styleFilter.push((key === 'AND') ? 'all' : 'any',
                                      ...expr.map(e => this.#makeStyleFilter(e)))
                } else {
                    console.warn(`makeFilter: Invalid ${key} operands: ${expr}`)
                }
            } else if (key === 'HAS') {
                styleFilter.push('has', expr)
            } else if (key === 'NOT') {
                const filterExpr = this.#makeStyleFilter(expr)
                if (filterExpr.length === 2 && ['has', '!has'].includes(filterExpr[0])) {
                    if (filterExpr[0] === 'has') {
                        styleFilter.push('!has', filterExpr[1])
                    } else {
                        styleFilter.push('has', filterExpr[1])
                    }
                } else if (filterExpr.length === 3 && ['==', '!='].includes(filterExpr[0])) {
                    if (filterExpr[0] === '==') {
                        styleFilter.push('!=', filterExpr[1], filterExpr[2])
                    } else {
                        styleFilter.push('==', filterExpr[1], filterExpr[2])
                    }
                } else {
                    styleFilter.push('!', filterExpr)
                }
            } else if (!!expr && expr.constructor === Object) {
                styleFilter.push(this.#makeStyleFilter(value))
            } else {
                if (Array.isArray(expr)) {
                    styleFilter.push('any', ...expr.map(e => ['==', key, e]))
                } else {
                    styleFilter.push('==', key, expr)
                }
            }
        }
        return styleFilter
    }

}

//==============================================================================

function testFilter(f)
//====================
{
    const featureFilter = new FeatureFilter(f)
    console.log(f, '--->', featureFilter.makeStyleFilter())
}

function testFilters()
//====================
{
    /*
        { HAS: 'prop' } ---> [ 'has', 'prop' ]
        { prop: 1 } ---> [ '==', 'prop', 1 ]
        { NOT: { prop: 1 } } ---> [ '!=', 'prop', 1 ]
        { NOT: { prop: [ 1, 2 ] } } ---> [ '!', [ 'any', [ '==', 'prop', 1 ], [ '==', 'prop', 2 ] ] ]
        { OR: [ { prop1: 10 }, { prop2: 11 } ] } ---> [ 'any', [ '==', 'prop1', 10 ], [ '==', 'prop2', 11 ] ]
        { AND: [ { prop1: 10 }, { prop2: 11 } ] } ---> [ 'all', [ '==', 'prop1', 10 ], [ '==', 'prop2', 11 ] ]
        { OR: [ { AND: [Array] }, { AND: [Array] } ] } ---> [
          'any',
          [ 'all', [ '!=', 'prop1', 10 ], [ '==', 'prop2', 11 ] ],
          [ 'all', [ '==', 'prop3', 10 ], [ '==', 'prop4', 11 ] ]
        ]
        { NOT: { OR: [ [Object], [Object] ] } } ---> [
          '!',
          [ 'any', [ 'all', [Array], [Array] ], [ 'all', [Array], [Array] ] ]
        ]
    */

    testFilter({
        "HAS": "prop"
    })

    testFilter({
        "prop": 1
    })

    testFilter({
        "NOT": {
            "prop": 1
        }
    })

    testFilter({
        "NOT": {
            "prop": [1, 2]
        }
    })

    testFilter({
        "OR": [
            {"prop1": 10},
            {"prop2": 11}
        ]
    })

    testFilter({
        "AND": [
            {"prop1": 10},
            {"prop2": 11}
        ]
    })

    testFilter({
        "OR": [{
            "AND": [
                { "NOT": {"prop1": 10}},
                {"prop2": 11}
            ]}, {
            "AND": [
                {"prop3": 10},
                {"prop4": 11}
            ]}
        ]
    })

    testFilter({
        "NOT": {
            "OR": [{
                "AND": [
                    {"prop1": 10},
                    {"prop2": 11}
                ]}, {
                "AND": [
                    {"prop3": 10},
                    {"prop4": 11}
                ]}
            ]
        }
    })
}

//==============================================================================
